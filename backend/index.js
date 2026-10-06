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

const {
  initCallData,
  updateTranscript,
  updateOnDisconnect,
  processCallTranscript,
  updateCallerLocation,
  deactivateCallerLocation,
  createLocationSession,
  getLocationSession,
  deactivateLocationSession,
  getAllIncidents,
  updateIncidentStatus,
  updateCallRecording,
  incidentEvents,
  db,
} = require('./src/firebase');
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

// -----------------------------------------------------------------------------
// Demo / Test Pipeline Endpoint
// Allows testing the full NLP pipeline with a text transcript (no audio needed)
// -----------------------------------------------------------------------------

app.post(
  ['/api/calls/demo-test', '/api/calls/simulate', '/api/incidents/simulate'],
  async (req, res) => {
    try {
      const { transcript, callerName, phone, callerPhone } = req.body;

      if (!transcript || typeof transcript !== 'string' || transcript.trim().length < 10) {
        return res.status(400).json({
          error: 'Please provide a "transcript" field with at least 10 characters.',
        });
      }

      const callSid = 'demo_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

      await initCallData(
        callSid,
        {
          CallerName: callerName || 'Demo Test Caller',
          From: phone || callerPhone || 'Demo Pipeline Test',
          transcript: transcript.trim(),
        },
        'demo'
      );

      const triageResult = await processCallTranscript(callSid, transcript.trim(), callerName);

      const incidentData = {
        ...triageResult,
        callSid,
        incident_id: triageResult?.incident_id || callSid,
      };

      return res.status(201).json({
        success: true,
        callSid,
        incident_id: incidentData.incident_id,
        message: 'Demo test transcript processed through full NLP pipeline.',
        triage: triageResult,
        incident: incidentData,
        ...incidentData,
      });
    } catch (err) {
      console.error('Error in demo test pipeline:', err);
      return res.status(500).json({ error: 'Internal server error processing demo test.' });
    }
  }
);

// -----------------------------------------------------------------------------
// Incident Management & Real-Time Sync Endpoints
// -----------------------------------------------------------------------------

// GET /api/incidents - Fetch all incidents
app.get(['/api/incidents', '/api/calls'], async (req, res) => {
  try {
    const incidents = await getAllIncidents();
    if (req.path === '/api/calls' || req.query.format === 'array') {
      return res.json(incidents);
    }
    return res.json({ success: true, count: incidents.length, incidents });
  } catch (err) {
    console.error('Error fetching incidents:', err);
    return res.status(500).json({ error: 'Failed to fetch incidents.' });
  }
});

// GET /api/incidents/stats - Operational statistics summary
app.get('/api/incidents/stats', async (req, res) => {
  try {
    const incidents = await getAllIncidents();
    const open = incidents.filter((i) => i.status === 'OPEN').length;
    const dispatched = incidents.filter((i) => i.status === 'DISPATCHED').length;
    const resolved = incidents.filter((i) => i.status === 'RESOLVED').length;
    const high = incidents.filter((i) => i.priority === 'HIGH' && i.status !== 'RESOLVED').length;
    return res.json({
      success: true,
      total: incidents.length,
      open,
      dispatched,
      resolved,
      highPriority: high,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to compute stats.' });
  }
});

// GET /api/incidents/stream - Server-Sent Events (SSE) for real-time dashboard updates
app.get('/api/incidents/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders?.();

  // Send initial snapshot
  const incidents = await getAllIncidents();
  res.write(`event: snapshot\ndata: ${JSON.stringify(incidents)}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'SNAPSHOT', incidents })}\n\n`);

  const onCreated = (incident) => {
    res.write(`event: incident_created\ndata: ${JSON.stringify(incident)}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'INCIDENT_CREATED', incident })}\n\n`);
  };

  const onUpdated = (incident) => {
    res.write(`event: incident_updated\ndata: ${JSON.stringify(incident)}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'INCIDENT_UPDATED', incident })}\n\n`);
  };

  incidentEvents.on('incident_created', onCreated);
  incidentEvents.on('incident_updated', onUpdated);

  const pingInterval = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(pingInterval);
    incidentEvents.off('incident_created', onCreated);
    incidentEvents.off('incident_updated', onUpdated);
    res.end();
  });
});

// GET /api/incidents/:callSid - Fetch single incident
app.get(['/api/incidents/:callSid', '/api/calls/:callSid'], async (req, res) => {
  try {
    const incidents = await getAllIncidents();
    const incident = incidents.find((c) => c.callSid === req.params.callSid || c.key === req.params.callSid);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found.' });
    }
    return res.json({ success: true, incident });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch incident.' });
  }
});

// PATCH & POST /api/incidents/:callSid/status - Update incident status and/or priority
const handleStatusUpdate = async (req, res) => {
  try {
    const { status, priority } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'Status is required (OPEN, DISPATCHED, RESOLVED).' });
    }
    const updated = await updateIncidentStatus(req.params.callSid, status, priority);
    if (!updated) {
      return res.status(404).json({ error: 'Incident not found.' });
    }
    return res.json({ success: true, incident: updated });
  } catch (err) {
    console.error('Error updating incident status:', err);
    return res.status(500).json({ error: 'Failed to update incident status.' });
  }
};
app.patch(['/api/incidents/:callSid/status', '/api/calls/:callSid/status'], handleStatusUpdate);
app.post(['/api/incidents/:callSid/status', '/api/calls/:callSid/status'], handleStatusUpdate);

// POST /api/incidents/seed - Process realistic evaluation scenarios through full AI pipeline
app.post('/api/incidents/seed', async (req, res) => {
  try {
    const seedScenarios = [
      {
        id: 'INC-1001',
        callerName: 'Rajesh Sharma',
        phone: '+91 98101 23456',
        transcript: 'Hello, my name is Rajesh Sharma. I am calling from Connaught Place in New Delhi. My colleague suddenly collapsed and is complaining of severe chest pain and breathlessness. We need an ambulance immediately!',
      },
      {
        id: 'INC-1002',
        callerName: 'Sunita Verma',
        phone: '+91 98112 34567',
        transcript: 'Please help, this is Sunita Verma at Atta Market, Sector 18 Noida. A commercial LPG gas cylinder caught fire in a restaurant kitchen and thick black smoke is spreading rapidly. Send fire engines!',
      },
      {
        id: 'INC-1003',
        callerName: 'Amit Patel',
        phone: '+91 98450 12345',
        transcript: 'My name is Amit Patel. There has been a major traffic accident on MG Road near Trinity Circle in Bengaluru. A two-wheeler collided with a car, and two people are injured on the road.',
      },
      {
        id: 'INC-1004',
        callerName: 'Vikram Singh',
        phone: '+91 98200 54321',
        transcript: 'This is Vikram Singh reporting from Marine Drive near Churchgate station in Mumbai. Two armed individuals just broke into a jewelry shop with weapons and are attempting a robbery. We need police right now!',
      },
      {
        id: 'INC-1005',
        callerName: 'Karthik Subramanian',
        phone: '+91 94440 67890',
        transcript: 'There has been a serious accident near Chennai Central. Two people are injured.',
      },
      {
        id: 'INC-1006',
        callerName: 'Priya Narayanan',
        phone: '+91 98410 45678',
        transcript: 'There is a fire at 24 Gandhi Road, Tambaram. Send fire brigade immediately.',
      },
      {
        id: 'INC-1007',
        callerName: 'Venkatesh Rao',
        phone: '+91 94432 11223',
        transcript: 'We are near the railway station in Katpadi. An elderly passenger collapsed and is unconscious.',
      },
    ];

    const results = [];
    for (const s of seedScenarios) {
      await initCallData(
        s.id,
        {
          incident_id: s.id,
          CallerName: s.callerName,
          From: s.phone,
          transcript: s.transcript,
        },
        'seed_demo'
      );
      const triage = await processCallTranscript(s.id, s.transcript, s.callerName);
      results.push({ id: s.id, triage });
    }

    return res.status(201).json({
      success: true,
      message: `Processed ${results.length} emergency scenarios through full AI pipeline.`,
      incidents: results,
    });
  } catch (err) {
    console.error('Error seeding incidents:', err);
    return res.status(500).json({ error: 'Failed to seed incidents.' });
  }
});

// -----------------------------------------------------------------------------
// Location Sharing Endpoints
// -----------------------------------------------------------------------------

/**
 * POST /api/location/session
 * Create a location-sharing session for an incident.
 * Body: { callSid: string }
 * Returns: { token: string, shareUrl: string }
 */
app.post('/api/location/session', (req, res) => {
  try {
    const { callSid } = req.body;

    if (!callSid) {
      return res.status(400).json({ error: 'callSid is required.' });
    }

    const token = createLocationSession(callSid);
    if (!token) {
      return res.status(500).json({ error: 'Failed to create location session.' });
    }

    // Build the share URL — the caller opens this on their phone
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const shareUrl = `${protocol}://${host}/share-location.html?token=${token}`;

    return res.json({
      success: true,
      token,
      callSid,
      shareUrl,
    });
  } catch (err) {
    console.error('Error creating location session:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/location/update
 * Receive GPS coordinates from the caller's browser.
 * Body: { token: string, latitude: number, longitude: number, accuracy?: number }
 */
app.post('/api/location/update', async (req, res) => {
  try {
    const { token, latitude, longitude, accuracy } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Location session token is required.' });
    }

    const session = getLocationSession(token);
    if (!session) {
      return res.status(404).json({ error: 'Invalid or expired location session.' });
    }

    if (!session.active) {
      return res.status(410).json({ error: 'Location session has been deactivated.' });
    }

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ error: 'Valid latitude and longitude are required.' });
    }

    // Validate coordinate ranges
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'Coordinates out of valid range.' });
    }

    await updateCallerLocation(session.callSid, {
      latitude,
      longitude,
      accuracy: accuracy || null,
      timestamp: new Date().toISOString(),
    });

    return res.json({ success: true, callSid: session.callSid });
  } catch (err) {
    console.error('Error updating caller location:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/location/stop
 * Caller stops sharing location.
 * Body: { token: string }
 */
app.post('/api/location/stop', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required.' });
    }

    const session = getLocationSession(token);
    if (!session) {
      return res.status(404).json({ error: 'Invalid or expired location session.' });
    }

    await deactivateCallerLocation(session.callSid);
    deactivateLocationSession(token);

    return res.json({ success: true, message: 'Location sharing stopped.' });
  } catch (err) {
    console.error('Error stopping location sharing:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/location/session/:token
 * Validate a location session token (used by the caller's location page).
 */
app.get('/api/location/session/:token', (req, res) => {
  const session = getLocationSession(req.params.token);
  if (!session) {
    return res.status(404).json({ error: 'Invalid or expired location session.' });
  }

  return res.json({
    valid: true,
    active: session.active,
    callSid: session.callSid,
    createdAt: session.createdAt,
  });
});

// Serve the location-sharing static page
app.use('/share-location.html', express.static(path.join(__dirname, 'public', 'share-location.html')));

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
// Real-Time WebSocket Infrastructure (Dashboard Sync + Twilio Voice Streaming)
// -----------------------------------------------------------------------------

const dashboardClients = new Set();

// Broadcast incident lifecycle events to all connected operator dashboards
incidentEvents.on('incident_created', (incident) => {
  const payload = JSON.stringify({ type: 'INCIDENT_CREATED', incident });
  for (const client of dashboardClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
});

incidentEvents.on('incident_updated', (incident) => {
  const payload = JSON.stringify({ type: 'INCIDENT_UPDATED', incident });
  for (const client of dashboardClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
});

// Active Twilio call sessions (keyed by callSid)
const activeTwilioSessions = new Map();
// Mapping from Twilio streamSid to callSid
const streamToCallMap = new Map();

/**
 * Retrieves or initializes an in-memory session for a live Twilio voice call.
 */
function getOrCreateCallSession(callSid, streamSid = null) {
  if (!callSid) return null;
  let session = activeTwilioSessions.get(callSid);
  if (!session) {
    session = {
      callSid,
      streamSid: streamSid || null,
      assemblyWs: null,
      assemblyConnected: false,
      completedTranscripts: [],
      currentPartialTranscript: '',
      audioQueue: [], // audio buffers queued before assemblyWs is ready
      pcmBufferList: [], // 16-bit linear PCM chunks (flush at >= 5 chunks = 100ms)
      lastTriageTime: 0,
      triageRunning: false,
    };
    activeTwilioSessions.set(callSid, session);
  }
  if (streamSid) {
    session.streamSid = streamSid;
    streamToCallMap.set(streamSid, callSid);
  }
  return session;
}

/**
 * Establishes an AssemblyAI v3 streaming WebSocket connection for real-time STT.
 * Protocol: wss://streaming.assemblyai.com/v3/ws?sample_rate=8000
 */
function connectAssemblyAIForSession(session) {
  if (
    session.assemblyWs &&
    (session.assemblyWs.readyState === WebSocket.OPEN || session.assemblyWs.readyState === WebSocket.CONNECTING)
  ) {
    return session.assemblyWs;
  }

  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    console.warn(`[AssemblyAI] Warning: ASSEMBLYAI_API_KEY not configured. Live STT disabled for call: ${session.callSid}`);
    return null;
  }

  console.log(`[AssemblyAI] Connecting to v3 streaming WebSocket for call: ${session.callSid}...`);

  const ws = new WebSocket('wss://streaming.assemblyai.com/v3/ws?sample_rate=8000', {
    headers: { authorization: apiKey },
  });

  session.assemblyWs = ws;
  session.assemblyConnected = false;

  ws.on('open', () => {
    console.log(`[AssemblyAI] Streaming connection opened successfully for call: ${session.callSid}`);
    session.assemblyConnected = true;

    // Flush any buffered audio chunks queued while connecting
    if (session.audioQueue.length > 0) {
      console.log(`[AssemblyAI] Flushing ${session.audioQueue.length} queued audio chunks for call: ${session.callSid}`);
      while (session.audioQueue.length > 0) {
        const chunk = session.audioQueue.shift();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(chunk);
        }
      }
    }
  });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'Begin') {
        console.log(`[AssemblyAI] Session initialized (ID: ${msg.id}) for call: ${session.callSid}`);
      } else if (msg.type === 'Turn') {
        const text = (msg.transcript || '').trim();
        if (!text) return;

        if (msg.end_of_turn) {
          console.log(`[AssemblyAI][Turn Final] "${text}" (call: ${session.callSid})`);
          session.completedTranscripts.push(text);
          session.currentPartialTranscript = '';
        } else {
          session.currentPartialTranscript = text;
        }

        const fullTranscript = [...session.completedTranscripts, session.currentPartialTranscript]
          .filter(Boolean)
          .join(' ')
          .trim();

        if (fullTranscript) {
          const priority = analyzePriority(fullTranscript);
          updateTranscript(session.callSid, session.streamSid, fullTranscript, priority);

          // Run NLP entity extraction & emergency classification when a turn completes
          const now = Date.now();
          if (
            msg.end_of_turn &&
            fullTranscript.length >= 10 &&
            !session.triageRunning &&
            now - session.lastTriageTime > 2500
          ) {
            session.triageRunning = true;
            session.lastTriageTime = now;
            processCallTranscript(session.callSid, fullTranscript)
              .catch((err) => console.error('[Triage Pipeline] Error during live call turn:', err))
              .finally(() => {
                session.triageRunning = false;
              });
          }
        }
      } else if (msg.type === 'Error') {
        console.error(`[AssemblyAI Error] (call: ${session.callSid}):`, msg.error || msg);
      }
    } catch (e) {
      console.error('[AssemblyAI] Error processing message:', e);
    }
  });

  ws.on('error', (err) => {
    console.error(`[AssemblyAI] WebSocket error for call ${session.callSid}:`, err.message);
  });

  ws.on('close', (code, reason) => {
    console.log(`[AssemblyAI] WebSocket closed for call ${session.callSid}: code=${code}, reason=${reason.toString()}`);
    session.assemblyConnected = false;
  });

  return ws;
}

wss.on('connection', (ws, req) => {
  // Identify if connection is from the frontend operator dashboard
  const isDashboard = req?.url?.includes('/dashboard') || req?.url?.includes('role=dashboard');
  if (isDashboard) {
    dashboardClients.add(ws);
    console.info(`[WebSocket] Operator dashboard connected. Total active: ${dashboardClients.size}`);

    // Send initial snapshot of open incidents upon connection
    getAllIncidents().then((incidents) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'SNAPSHOT', incidents }));
      }
    });

    ws.on('close', () => {
      dashboardClients.delete(ws);
      console.info(`[WebSocket] Operator dashboard disconnected. Remaining: ${dashboardClients.size}`);
    });
    return;
  }

  console.info(`[Twilio Stream] Incoming Twilio Voice WebSocket connection established from ${req.socket.remoteAddress}`);

  ws.on('message', async (message) => {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch (e) {
      return;
    }

    // Allow frontend client to register dynamically via message
    if (msg.type === 'subscribe_dashboard') {
      dashboardClients.add(ws);
      console.info(`[WebSocket] Client subscribed to dashboard events. Total active: ${dashboardClients.size}`);
      const incidents = await getAllIncidents();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'SNAPSHOT', incidents }));
      }
      return;
    }

    const streamSid = msg.streamSid || msg.start?.streamSid;
    const callSid = msg.start?.callSid || (streamSid ? streamToCallMap.get(streamSid) : null);

    switch (msg.event) {
      case 'connected':
        console.info('[Twilio Stream] Connected protocol event received from Twilio.');
        break;

      case 'start': {
        const incomingCallSid = msg.start?.callSid;
        const incomingStreamSid = msg.start?.streamSid;
        console.info(`[Twilio Stream] Media stream starting: callSid=${incomingCallSid}, streamSid=${incomingStreamSid}`);

        if (incomingCallSid) {
          const session = getOrCreateCallSession(incomingCallSid, incomingStreamSid);
          connectAssemblyAIForSession(session);
        }
        break;
      }

      case 'media': {
        const twilioPayload = msg.media?.payload;
        if (!twilioPayload || !callSid) break;

        const session = activeTwilioSessions.get(callSid);
        if (!session) break;

        // Ensure AssemblyAI WebSocket is alive
        if (!session.assemblyWs || session.assemblyWs.readyState === WebSocket.CLOSED) {
          connectAssemblyAIForSession(session);
        }

        try {
          // Twilio sends 8kHz mu-law audio (20ms / 160 bytes per packet)
          // Decode to 16-bit linear PCM (320 bytes per packet)
          const wav = new WaveFile();
          wav.fromScratch(1, 8000, '8m', Buffer.from(twilioPayload, 'base64'));
          wav.fromMuLaw();
          const pcmChunk = Buffer.from(wav.data.samples.buffer, wav.data.samples.byteOffset, wav.data.samples.byteLength);

          session.pcmBufferList.push(pcmChunk);

          // AssemblyAI v3 requires audio chunks between 50ms and 1000ms.
          // 5 Twilio chunks = 100ms (1600 bytes at 8000Hz 16-bit mono PCM).
          if (session.pcmBufferList.length >= 5) {
            const combinedBuffer = Buffer.concat(session.pcmBufferList);
            session.pcmBufferList = [];

            if (session.assemblyWs && session.assemblyWs.readyState === WebSocket.OPEN) {
              session.assemblyWs.send(combinedBuffer);
            } else {
              // Queue up to 5 seconds of audio if AssemblyAI is still handshaking
              if (session.audioQueue.length < 50) {
                session.audioQueue.push(combinedBuffer);
              }
            }
          }
        } catch (decodeErr) {
          console.error('[Twilio Media] Error decoding audio chunk:', decodeErr.message);
        }
        break;
      }

      case 'stop': {
        console.info(`[Twilio Stream] Call stream stopped (callSid: ${callSid})`);
        const session = activeTwilioSessions.get(callSid);
        if (session) {
          // Flush remaining PCM buffers if any
          if (session.pcmBufferList.length > 0 && session.assemblyWs && session.assemblyWs.readyState === WebSocket.OPEN) {
            try {
              session.assemblyWs.send(Buffer.concat(session.pcmBufferList));
            } catch (e) {}
            session.pcmBufferList = [];
          }

          // Terminate AssemblyAI session cleanly
          if (session.assemblyWs && session.assemblyWs.readyState === WebSocket.OPEN) {
            try {
              session.assemblyWs.send(JSON.stringify({ type: 'Terminate' }));
            } catch (e) {}
          }

          setTimeout(() => {
            if (session.assemblyWs) {
              try {
                session.assemblyWs.close();
              } catch (e) {}
            }
            activeTwilioSessions.delete(callSid);
            if (session.streamSid) {
              streamToCallMap.delete(session.streamSid);
            }
          }, 500);
        }

        if (callSid) {
          updateOnDisconnect(callSid);
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    dashboardClients.delete(ws);
  });
});

// -----------------------------------------------------------------------------
// Twilio Telephony Webhook Endpoints
// -----------------------------------------------------------------------------

/**
 * Primary Incoming Voice Webhook for Twilio Calls
 * Handled by: POST /api/calls/incoming, POST /, POST /incoming-call, POST /voice
 */
const handleIncomingCall = async (req, res) => {
  const callSid = req.body?.CallSid || req.query?.CallSid || `tw_${Date.now()}`;
  const callerNumber = req.body?.From || req.query?.From || 'Unknown Phone';
  const calledNumber = req.body?.To || req.query?.To || '+18065414030';
  const callerCity = req.body?.CallerCity || req.body?.FromCity || '';
  const callerState = req.body?.CallerState || req.body?.FromState || '';
  const callerCountry = req.body?.CallerCountry || req.body?.FromCountry || '';

  console.log(`\n====================================================`);
  console.log(`[Twilio Webhook] INCOMING VOICE CALL DETECTED!`);
  console.log(`  CallSid:        ${callSid}`);
  console.log(`  From (Caller):  ${callerNumber}`);
  console.log(`  To (Twilio):    ${calledNumber}`);
  if (callerCity || callerState) {
    console.log(`  Telecom Origin: ${[callerCity, callerState, callerCountry].filter(Boolean).join(', ')}`);
  }
  console.log(`====================================================\n`);

  // Initialize call session and pre-connect to AssemblyAI v3
  const session = getOrCreateCallSession(callSid);
  connectAssemblyAIForSession(session);

  // Initialize incident record in database and notify dashboard
  await initCallData(
    callSid,
    {
      CallSid: callSid,
      From: callerNumber,
      To: calledNumber,
      CallerCity: callerCity,
      CallerState: callerState,
      CallerCountry: callerCountry,
    },
    'twilio'
  );

  // Dynamically resolve public hostname for WebSocket and callbacks
  const rawProto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:8080';
  const isHttps = rawProto === 'https' || host.includes('ngrok') || host.includes('loca.lt');
  const wsProtocol = isHttps ? 'wss' : 'ws';
  const httpProtocol = isHttps ? 'https' : 'http';

  const recordingCallbackUrl = `${httpProtocol}://${host}/api/calls/recording-status`;
  const streamUrl = `${wsProtocol}://${host}/media`;
  const holdUrl = `${httpProtocol}://${host}/api/calls/twiml-hold`;

  console.log(`[Twilio Webhook] Returning TwiML configuration:`);
  console.log(`  Stream WebSocket:     ${streamUrl}`);
  console.log(`  Recording Callback:   ${recordingCallbackUrl}`);
  console.log(`  Hold Loop URL:        ${holdUrl}`);

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Recording recordingStatusCallback="${recordingCallbackUrl}" recordingStatusCallbackMethod="POST" />
    <Stream url="${streamUrl}" />
  </Start>
  <Say voice="Polly.Aditi" language="en-IN">
    Thank you for calling RAKSHA 1 1 2 Emergency Response. All operators are currently on active calls.
    Your call is being handled by our emergency AI assistant.
    Please speak clearly and state your name, your location, and describe your emergency.
  </Say>
  <Pause length="40" />
  <Say voice="Polly.Aditi" language="en-IN">
    We are processing your emergency details. Please remain on the line.
  </Say>
  <Pause length="40" />
  <Redirect method="POST">${holdUrl}</Redirect>
</Response>`;

  res.set('Content-Type', 'text/xml');
  return res.send(twiml);
};

// Bind incoming voice webhook to multiple standard paths for maximum resilience
app.post(['/', '/api/calls/incoming', '/incoming-call', '/voice'], handleIncomingCall);
app.get(['/api/calls/incoming', '/incoming-call', '/voice'], handleIncomingCall);

/**
 * Hold loop endpoint to keep incoming phone call active indefinitely until caller hangs up
 */
app.post(['/api/calls/twiml-hold', '/twiml-hold'], (req, res) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:8080';
  const rawProto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const isHttps = rawProto === 'https' || host.includes('ngrok') || host.includes('loca.lt');
  const httpProtocol = isHttps ? 'https' : 'http';
  const holdUrl = `${httpProtocol}://${host}/api/calls/twiml-hold`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="en-IN">
    Please continue to remain on the line. An emergency operator is reviewing your case.
  </Say>
  <Pause length="40" />
  <Redirect method="POST">${holdUrl}</Redirect>
</Response>`;

  res.set('Content-Type', 'text/xml');
  return res.send(twiml);
});

/**
 * Twilio Call Recording Status Callback
 * Invoked by Twilio when the audio recording finishes processing
 */
app.post(['/api/calls/recording-status', '/api/recording-status'], async (req, res) => {
  try {
    const callSid = req.body?.CallSid;
    const recordingSid = req.body?.RecordingSid;
    const recordingUrl = req.body?.RecordingUrl;
    const recordingDuration = req.body?.RecordingDuration;
    const recordingStatus = req.body?.RecordingStatus;

    console.log(`\n[Twilio Recording] Callback received for call ${callSid}:`);
    console.log(`  Status:    ${recordingStatus}`);
    console.log(`  Duration:  ${recordingDuration}s`);
    console.log(`  Audio URL: ${recordingUrl ? `${recordingUrl}.mp3` : 'N/A'}`);

    if (callSid && recordingUrl) {
      const audioUrl = `${recordingUrl}.mp3`;
      const durationNum = parseInt(recordingDuration, 10) || undefined;
      await updateCallRecording(callSid, {
        recordingUrl: audioUrl,
        recordingSid,
        ...(durationNum ? { recordingDuration: durationNum, audioDuration: durationNum } : {}),
      });
    }

    res.set('Content-Type', 'text/xml');
    return res.send('<Response/>');
  } catch (err) {
    console.error('[Twilio Recording] Error handling recording status:', err);
    res.set('Content-Type', 'text/xml');
    return res.send('<Response/>');
  }
});

/**
 * Twilio Call Status Callback (e.g. completed, busy, failed, canceled)
 */
app.post(['/api/calls/status', '/api/call-status'], async (req, res) => {
  const callSid = req.body?.CallSid;
  const callStatus = req.body?.CallStatus;
  const duration = req.body?.CallDuration;
  console.log(`[Twilio Status] Callback for CallSid=${callSid}, Status=${callStatus}, Duration=${duration}s`);

  if (
    callSid &&
    (callStatus === 'completed' || callStatus === 'canceled' || callStatus === 'failed' || callStatus === 'busy')
  ) {
    await updateOnDisconnect(callSid);
  }

  res.set('Content-Type', 'text/xml');
  return res.send('<Response/>');
});

app.get('/', (_, res) => res.send('RAKSHA112 - Indian Emergency Response AI Simulation Backend'));

server.listen(8080, () => console.log('Listening on Port 8080'));

const exitHandler = (exitCode = 0) =>
  function () {
    console.log('Gracefully terminating AssemblyAI connections...');
    for (const session of activeTwilioSessions.values()) {
      if (session.assemblyWs && session.assemblyWs.readyState === WebSocket.OPEN) {
        try {
          session.assemblyWs.send(JSON.stringify({ type: 'Terminate' }));
          session.assemblyWs.close();
        } catch (e) {}
      }
    }
    process.exit(exitCode);
  };

process.on('uncaughtException', exitHandler(1));
process.on('unhandledRejection', exitHandler(1));
process.on('SIGTERM', exitHandler(0));
process.on('SIGINT', exitHandler(0));
