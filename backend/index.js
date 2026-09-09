require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const mm = require('music-metadata');
const rateLimit = require('express-rate-limit');

const WebSocket = require('ws');
const WaveFile = require('wavefile').WaveFile;

const app = express();

// Middlewares
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

const { initCallData, updateTranscript, updateOnDisconnect, processCallTranscript } = require('./src/firebase');
const { analyzePriority } = require('./src/utils');
const { uploadAudioToAssemblyAI, startTranscription, pollTranscription } = require('./src/assembly');

// Rate limiting for upload endpoint
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // limit each IP to 30 upload requests per windowMs
  message: { error: 'Too many audio uploads from this IP, please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Multer audio file upload configuration
const maxUploadMb = parseInt(process.env.MAX_UPLOAD_AUDIO_MB, 10) || 15;
const maxUploadSeconds = parseInt(process.env.MAX_UPLOAD_AUDIO_SECONDS, 10) || 300;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxUploadMb * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.wav', '.mp3', '.m4a', '.ogg', '.aac', '.flac', '.webm'];
    const ext = path.extname(file.originalname).toLowerCase();
    const isAudioMime =
      file.mimetype.startsWith('audio/') || file.mimetype === 'application/ogg' || file.mimetype === 'video/ogg';

    if (isAudioMime || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Unsupported file format '${file.mimetype}'. Please upload a valid .wav, .mp3, .m4a, or .ogg audio file.`
        )
      );
    }
  },
});

// In-memory job state tracker for async uploads
const jobs = new Map();

// Periodic cleanup of completed/expired jobs (retention: 30 mins)
setInterval(() => {
  const now = Date.now();
  for (const [jobId, job] of jobs.entries()) {
    if (now - job.createdAt > 30 * 60 * 1000) {
      jobs.delete(jobId);
    }
  }
}, 15 * 60 * 1000);

/**
 * Background processor for uploaded audio files
 */
async function processAudioJob(jobId, audioBuffer, callerLabel, initialDuration) {
  const job = jobs.get(jobId);
  if (!job) return;

  try {
    // 1. Upload to AssemblyAI
    job.status = 'processing';
    job.step = 'uploading';
    console.log(`[Job ${jobId}] Uploading audio to AssemblyAI async API...`);
    const uploadUrl = await uploadAudioToAssemblyAI(audioBuffer);

    // 2. Start async transcription job
    job.step = 'transcribing';
    console.log(`[Job ${jobId}] Starting AssemblyAI transcription job...`);
    const transcriptId = await startTranscription(uploadUrl);
    job.transcriptId = transcriptId;

    // 3. Poll for transcription completion
    const { text, audio_duration } = await pollTranscription(transcriptId);
    const finalDuration = audio_duration || initialDuration || 0;
    job.duration = finalDuration;

    // Post-hoc cost & duration safeguard
    if (finalDuration > maxUploadSeconds) {
      throw new Error(
        `AssemblyAI verified duration (${Math.round(finalDuration)}s) exceeds max limit of ${maxUploadSeconds}s.`
      );
    }

    // 4. Run through Indian NLP Triage Pipeline & sync with Firebase RTDB
    job.step = 'analyzing';
    console.log(`[Job ${jobId}] Transcribed text: "${text}". Running triage pipeline...`);

    const callSid = job.callSid;
    await initCallData(
      callSid,
      {
        CallerName: callerLabel || 'Recorded Demo Intake',
        From: 'Recorded Audio Fallback',
        audioDuration: finalDuration,
        transcript: text,
      },
      'upload'
    );

    const triageResult = await processCallTranscript(callSid, text, callerLabel);

    // 5. Mark job complete
    job.status = 'completed';
    job.step = 'completed';
    job.result = {
      callSid,
      transcript: text,
      duration: finalDuration,
      triage: triageResult,
    };
    console.log(`[Job ${jobId}] Processing completed successfully for callSid: ${callSid}`);
  } catch (error) {
    console.error(`[Job ${jobId}] Processing failed:`, error.message);
    job.status = 'error';
    job.error = error.message;
  }
}

// -----------------------------------------------------------------------------
// Fallback Audio Upload Endpoints
// -----------------------------------------------------------------------------

app.post('/api/calls/upload-audio', uploadLimiter, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No audio file provided. Please send a file in form-data key "audio".' });
    }

    // Fast local duration check and audio integrity verification before external API call
    let metadata;
    try {
      metadata = await mm.parseBuffer(req.file.buffer, { mimeType: req.file.mimetype });
      if (
        !metadata ||
        !metadata.format ||
        (!metadata.format.container &&
          !metadata.format.duration &&
          !metadata.format.codec &&
          metadata.format.hasAudio === false)
      ) {
        return res.status(400).json({
          error: 'Invalid or corrupt audio file. Could not detect valid audio content.',
        });
      }
    } catch (parseErr) {
      return res.status(400).json({
        error: 'Invalid or corrupt audio file. Could not determine audio format.',
      });
    }

    const duration = metadata?.format?.duration;
    if (duration && duration > maxUploadSeconds) {
      return res.status(400).json({
        error: `Audio duration (${Math.round(
          duration
        )}s) exceeds maximum allowed limit of ${maxUploadSeconds}s (5 minutes).`,
      });
    }

    const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const callSid = 'upload_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const callerLabel = req.body.callerLabel ? req.body.callerLabel.trim() : null;

    jobs.set(jobId, {
      jobId,
      callSid,
      status: 'queued',
      step: 'queued',
      callerLabel,
      duration: duration || null,
      createdAt: Date.now(),
      error: null,
      result: null,
    });

    // Start asynchronous non-blocking background job
    processAudioJob(jobId, req.file.buffer, callerLabel, duration).catch((err) => {
      console.error(`Unhandled error in background job ${jobId}:`, err);
    });

    // Immediate 202 Accepted response with job ID
    return res.status(202).json({
      success: true,
      jobId,
      callSid,
      status: 'queued',
      message: 'Recorded audio accepted and queued for transcription and triage.',
    });
  } catch (err) {
    console.error('Error handling audio upload:', err);
    return res.status(500).json({ error: 'Internal server error processing audio upload.' });
  }
});

app.get('/api/calls/upload-status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found or expired.' });
  }

  return res.json({
    jobId: job.jobId,
    callSid: job.callSid,
    status: job.status,
    step: job.step,
    duration: job.duration,
    error: job.error,
    result: job.result,
  });
});

// Multer and general error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `File exceeds maximum allowed size of ${maxUploadMb}MB.` });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

// -----------------------------------------------------------------------------
// Twilio Real-Time Live Streaming (Preserved Unchanged)
// -----------------------------------------------------------------------------

let chunks = [];
let callerMap = {}; //[msg.streamSid] = msg.callSid;
let assemblyAIWSMap = {}; //[msg.callSid]: assemblyAIWSConnection

wss.on('connection', (ws) => {
  console.info('New Connection Initiated');

  ws.on('message', async (message) => {
    const msg = JSON.parse(message);
    const callSid = msg.start?.callSid ?? callerMap[msg.streamSid];

    const assembly = assemblyAIWSMap[callSid];

    switch (msg.event) {
      case 'connected':
        console.info('A new call has been connected.');
        break;

      case 'start':
        console.info('Starting media stream...');
        console.info(`callSid: ${msg.start.callSid}`);

        callerMap[msg.streamSid] = msg.start.callSid;

        const texts = {};

        assembly.onmessage = (assemblyMsg) => {
          let transcript = '';
          const res = JSON.parse(assemblyMsg.data);
          texts[res.audio_start] = res.text;
          const keys = Object.keys(texts);
          keys.sort((a, b) => a - b);
          for (const key of keys) {
            if (texts[key]) {
              transcript += ` ${texts[key]}`;
            }
          }

          const priority = analyzePriority(transcript);
          updateTranscript(callSid, msg.streamSid, transcript, priority);
        };
        break;

      case 'media':
        const twilioData = msg.media.payload;

        let wav = new WaveFile();
        wav.fromScratch(1, 8000, '8m', Buffer.from(twilioData, 'base64'));
        wav.fromMuLaw();

        const twilio64Encoded = wav.toDataURI().split('base64,')[1];
        const twilioAudioBuffer = Buffer.from(twilio64Encoded, 'base64');

        chunks.push(twilioAudioBuffer.slice(44));

        if (chunks.length >= 5) {
          const audioBuffer = Buffer.concat(chunks);
          const encodedAudio = audioBuffer.toString('base64');

          assembly.send(JSON.stringify({ audio_data: encodedAudio }));
          chunks = [];
        }
        break;

      case 'stop':
        console.info('Call has ended');
        assembly.send(JSON.stringify({ terminate_session: true }));
        updateOnDisconnect(callerMap[msg.streamSid]);
        setTimeout(() => {
          assembly.close();
          delete assemblyAIWSMap[callSid];
        }, 100);
        break;
    }
  });
});

app.get('/', (_, res) => res.send('RAKSHA112 - Indian Emergency Response AI Simulation Backend'));

app.post('/', async (req, res) => {
  const callSid = req.body.CallSid;

  console.log('Webhook received');

  assemblyAIWSMap[callSid] = new WebSocket('wss://api.assemblyai.com/v2/realtime/ws?sample_rate=8000', {
    headers: { authorization: process.env.ASSEMBLYAI_API_KEY },
  });
  assemblyAIWSMap[callSid].onerror = console.error;

  initCallData(callSid, req.body, 'twilio');

  res.set('Content-Type', 'text/xml');
  res.send(
    `<Response>
       <Start>
         <Stream url='wss://${req.headers.host}' />
       </Start>
       <Say>
        Thank you for calling the RAKSHA 1 1 2 emergency response demo simulation. All operators are currently busy.
        Your call is being answered by an AI assistant designed for India's 112 Emergency Response Support System simulation.
        Please remain on the line and state your name, your location in India, and the nature of your emergency so we can assist and prioritize your call.
       </Say>
       <Pause length='60' />
     </Response>`
  );
});

server.listen(8080, () => console.log('Listening on Port 8080'));

const exitHandler = (exitCode = 0) =>
  function () {
    console.log('Gracefully terminating assemblyai connection', arguments);

    for (const assembly of Object.values(assemblyAIWSMap)) {
      if (assembly) {
        assembly.send(JSON.stringify({ terminate_session: true }));
        assembly.close();
      }
    }
    process.exit(exitCode);
  };

process.on('uncaughtException', exitHandler(1));
process.on('unhandledRejection', exitHandler(1));
process.on('SIGTERM', exitHandler(0));
process.on('SIGINT', exitHandler(0));
