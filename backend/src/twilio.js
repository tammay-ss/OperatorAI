const crypto = require('crypto');
const axios = require('axios');

/**
 * Validates Twilio's X-Twilio-Signature header using HMAC-SHA1.
 * Standard Twilio specification:
 * 1. Start with full request URL.
 * 2. If POST, sort all POST parameters alphabetically by key.
 * 3. Append each key-value pair to the URL without delimiters (e.g. key1value1key2value2).
 * 4. Sign the string using HMAC-SHA1 with the Twilio Auth Token as the secret key.
 * 5. Base64 encode the resulting hash and compare against X-Twilio-Signature.
 *
 * @param {string} authToken - Twilio Auth Token
 * @param {string} signature - Value of X-Twilio-Signature header
 * @param {string} url - The full incoming webhook URL
 * @param {Object} [params] - The request POST body parameters
 * @returns {boolean}
 */
function validateTwilioSignature(authToken, signature, url, params = {}) {
  if (!authToken || !signature || !url) {
    return false;
  }

  let data = url;
  if (params && typeof params === 'object') {
    const sortedKeys = Object.keys(params).sort();
    for (const key of sortedKeys) {
      data += key + (params[key] !== undefined && params[key] !== null ? params[key] : '');
    }
  }

  const hmac = crypto.createHmac('sha1', authToken);
  hmac.update(Buffer.from(data, 'utf-8'));
  const expectedSignature = hmac.digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'utf-8'),
      Buffer.from(expectedSignature, 'utf-8')
    );
  } catch (err) {
    return signature === expectedSignature;
  }
}

/**
 * Express middleware for verifying Twilio webhook authenticity.
 * If TWILIO_AUTH_TOKEN is configured in environment, requests with invalid or missing
 * signatures will be rejected with 403 Forbidden.
 * If TWILIO_AUTH_TOKEN is omitted (development mode), the middleware permits requests
 * to avoid blocking local simulations or test harnesses.
 */
function twilioWebhookValidator(req, res, next) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const validateEnabled = process.env.TWILIO_VALIDATE_SIGNATURE !== 'false';

  // If no auth token is provided or explicitly disabled, allow in development mode
  if (!authToken || !validateEnabled) {
    res.setHeader('X-Twilio-Validation', 'bypassed-dev-mode');
    return next();
  }

  const signature = req.headers['x-twilio-signature'];
  if (!signature) {
    console.warn('[Twilio Security] Webhook rejected: missing X-Twilio-Signature header.');
    res.status(403).set('Content-Type', 'text/xml');
    return res.send('<Response><Reject reason="rejected"/></Response>');
  }

  // Construct full request URL as received by proxy / host
  const rawProto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const originalUrl = req.originalUrl || req.url;
  const fullUrl = `${rawProto}://${host}${originalUrl}`;

  const isValid = validateTwilioSignature(authToken, signature, fullUrl, req.body);
  if (!isValid) {
    console.warn(`[Twilio Security] Webhook signature mismatch for URL: ${fullUrl}`);
    res.status(403).set('Content-Type', 'text/xml');
    return res.send('<Response><Reject reason="rejected"/></Response>');
  }

  next();
}

/**
 * Generates the TwiML XML response for initial inbound emergency calls
 */
function generateVoiceTwiML({ streamUrl, recordingCallbackUrl, holdUrl }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Recording recordingStatusCallback="${recordingCallbackUrl}" recordingStatusCallbackMethod="POST" />
    <Stream url="${streamUrl}" />
  </Start>
  <Say voice="Polly.Aditi" language="en-IN">
    Thank you for calling OperatorAI Emergency Response Support System. All operators are currently on active calls.
    Your call is being handled by our automated emergency AI assistant.
    Please speak clearly and state your name, your location, and describe your emergency.
  </Say>
  <Pause length="40" />
  <Say voice="Polly.Aditi" language="en-IN">
    We are processing your emergency details. Please remain on the line.
  </Say>
  <Pause length="40" />
  <Redirect method="POST">${holdUrl}</Redirect>
</Response>`;
}

/**
 * Generates the TwiML XML response for the active hold loop
 */
function generateHoldTwiML(holdUrl) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="en-IN">
    Please continue to remain on the line. An emergency operator is reviewing your case.
  </Say>
  <Pause length="40" />
  <Redirect method="POST">${holdUrl}</Redirect>
</Response>`;
}

/**
 * Downloads recording audio from Twilio using HTTP Basic Authentication.
 * Handles Twilio 302/307 redirects to AWS S3 presigned URLs without leaking
 * the Twilio Authorization header to S3 (which triggers S3 400 errors).
 *
 * @param {string} recordingUrl - Twilio recording URL (e.g. https://api.twilio.com/...)
 * @param {Object} [credentials] - Twilio credentials
 * @param {string} [credentials.accountSid]
 * @param {string} [credentials.authToken]
 * @returns {Promise<Buffer>} Audio file buffer
 */
async function downloadTwilioRecordingAudio(recordingUrl, credentials = {}) {
  const accountSid = credentials.accountSid || process.env.TWILIO_ACCOUNT_SID;
  const authToken = credentials.authToken || process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) are required to download recordings.');
  }

  let targetUrl = recordingUrl;
  if (!targetUrl.endsWith('.mp3') && !targetUrl.endsWith('.wav')) {
    targetUrl = `${targetUrl}.mp3`;
  }

  // Request from Twilio with Basic Auth, handling redirects manually so auth header is not sent to S3
  const response = await axios.get(targetUrl, {
    auth: { username: accountSid, password: authToken },
    maxRedirects: 0,
    validateStatus: (status) => (status >= 200 && status < 300) || (status >= 300 && status < 400),
    responseType: 'arraybuffer',
    timeout: 20000,
  });

  if (response.status >= 300 && response.status < 400 && response.headers.location) {
    // S3 presigned URL redirect - fetch without Auth header
    const s3Res = await axios.get(response.headers.location, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });
    return Buffer.from(s3Res.data);
  }

  return Buffer.from(response.data);
}

/**
 * Streams Twilio recording audio, supporting HTTP Range requests for audio scrubbing/seeking.
 *
 * @param {string} recordingUrl
 * @param {Object} options
 * @param {string} [options.accountSid]
 * @param {string} [options.authToken]
 * @param {string} [options.rangeHeader]
 * @returns {Promise<{ status: number, headers: Object, stream: ReadableStream }>}
 */
async function getTwilioRecordingStream(recordingUrl, options = {}) {
  const accountSid = options.accountSid || process.env.TWILIO_ACCOUNT_SID;
  const authToken = options.authToken || process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) are required to stream recordings.');
  }

  let targetUrl = recordingUrl;
  if (!targetUrl.endsWith('.mp3') && !targetUrl.endsWith('.wav')) {
    targetUrl = `${targetUrl}.mp3`;
  }

  // Follow redirect from Twilio without forwarding auth to S3
  const initialRes = await axios.get(targetUrl, {
    auth: { username: accountSid, password: authToken },
    maxRedirects: 0,
    validateStatus: (s) => (s >= 200 && s < 300) || (s >= 300 && s < 400),
    timeout: 15000,
  });

  const finalUrl =
    initialRes.status >= 300 && initialRes.status < 400 && initialRes.headers.location
      ? initialRes.headers.location
      : targetUrl;

  const forwardHeaders = {};
  if (options.rangeHeader) {
    forwardHeaders.Range = options.rangeHeader;
  }

  const audioRes = await axios.get(finalUrl, {
    headers: forwardHeaders,
    responseType: 'stream',
    validateStatus: (s) => (s >= 200 && s < 300) || s === 206 || s === 304,
    timeout: 30000,
  });

  return {
    status: audioRes.status,
    headers: {
      'Content-Type': audioRes.headers['content-type'] || 'audio/mpeg',
      'Content-Length': audioRes.headers['content-length'],
      'Content-Range': audioRes.headers['content-range'],
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    },
    stream: audioRes.data,
  };
}

module.exports = {
  validateTwilioSignature,
  twilioWebhookValidator,
  generateVoiceTwiML,
  generateHoldTwiML,
  downloadTwilioRecordingAudio,
  getTwilioRecordingStream,
};
