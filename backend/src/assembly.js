const axios = require('axios');

/**
 * Uploads raw audio buffer to AssemblyAI's /v2/upload endpoint
 * @param {Buffer} audioBuffer
 * @returns {Promise<string>} upload_url
 */
async function uploadAudioToAssemblyAI(audioBuffer) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error('ASSEMBLYAI_API_KEY is not configured in backend environment variables.');
  }

  const response = await axios.post('https://api.assemblyai.com/v2/upload', audioBuffer, {
    headers: {
      authorization: apiKey,
      'content-type': 'application/octet-stream',
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  if (!response.data?.upload_url) {
    throw new Error('Failed to retrieve upload_url from AssemblyAI.');
  }

  return response.data.upload_url;
}

/**
 * Initiates an async transcription job on AssemblyAI
 * @param {string} audioUrl
 * @returns {Promise<string>} transcriptId
 */
async function startTranscription(audioUrl) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error('ASSEMBLYAI_API_KEY is not configured in backend environment variables.');
  }

  const response = await axios.post(
    'https://api.assemblyai.com/v2/transcript',
    {
      audio_url: audioUrl,
      language_detection: true,
      punctuate: true,
      format_text: true,
    },
    {
      headers: {
        authorization: apiKey,
        'content-type': 'application/json',
      },
    }
  );

  if (!response.data?.id) {
    throw new Error('Failed to create transcription job with AssemblyAI.');
  }

  return response.data.id;
}

/**
 * Polls AssemblyAI transcript status until completed or failed
 * @param {string} transcriptId
 * @param {number} maxWaitMs (default 60000ms)
 * @returns {Promise<{text: string, audio_duration: number}>}
 */
async function pollTranscription(transcriptId, maxWaitMs = 60000) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const response = await axios.get(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
      headers: {
        authorization: apiKey,
      },
    });

    const { status, text, audio_duration, language_code, error } = response.data;

    if (status === 'completed') {
      return {
        text: text || '',
        audio_duration: audio_duration || 0,
        language_code: language_code || 'en',
      };
    }

    if (status === 'error') {
      throw new Error(`AssemblyAI transcription failed: ${error || 'Unknown error'}`);
    }

    // Wait 1.5 seconds before next polling request
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error(`AssemblyAI transcription timed out after ${maxWaitMs / 1000} seconds.`);
}

module.exports = {
  uploadAudioToAssemblyAI,
  startTranscription,
  pollTranscription,
};
