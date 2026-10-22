const crypto = require('crypto');

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

module.exports = {
  validateTwilioSignature,
  twilioWebhookValidator,
  generateVoiceTwiML,
  generateHoldTwiML,
};
