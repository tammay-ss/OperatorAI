const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const {
  validateTwilioSignature,
  twilioWebhookValidator,
  generateVoiceTwiML,
  generateHoldTwiML,
} = require('../src/twilio');

test('Twilio Security: Computes valid HMAC-SHA1 signature conforming to Twilio spec', () => {
  const authToken = '12345secretToken';
  const url = 'https://operatorai-emergency.ngrok.app/api/calls/incoming';
  const params = {
    CallSid: 'CA1234567890abcdef',
    From: '+919810123456',
    To: '+18065414030',
  };

  // Expected computation:
  // url + CallSidCA... + From+91... + To+18...
  const sortedKeys = Object.keys(params).sort();
  let expectedData = url;
  for (const k of sortedKeys) {
    expectedData += k + params[k];
  }
  const hmac = crypto.createHmac('sha1', authToken);
  hmac.update(Buffer.from(expectedData, 'utf-8'));
  const validSignature = hmac.digest('base64');

  const result = validateTwilioSignature(authToken, validSignature, url, params);
  assert.strictEqual(result, true, 'Signature should be validated as authentic');
});

test('Twilio Security: Rejects forged or tampered signatures', () => {
  const authToken = '12345secretToken';
  const url = 'https://operatorai-emergency.ngrok.app/api/calls/incoming';
  const params = { CallSid: 'CA123' };

  const forgedSignature = 'forgedBase64Signature==';
  const result = validateTwilioSignature(authToken, forgedSignature, url, params);
  assert.strictEqual(result, false, 'Forged signature must be rejected');
});

test('Twilio Security: Rejects missing auth token or signature parameters', () => {
  assert.strictEqual(validateTwilioSignature(null, 'sig', 'http://url'), false);
  assert.strictEqual(validateTwilioSignature('token', null, 'http://url'), false);
  assert.strictEqual(validateTwilioSignature('token', 'sig', null), false);
});

test('Twilio Middleware: Bypasses validation in development mode when TWILIO_AUTH_TOKEN is unset', () => {
  const originalToken = process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_AUTH_TOKEN;

  let nextCalled = false;
  const req = { headers: {} };
  const res = {
    setHeader: (name, val) => {},
    status: () => res,
    set: () => res,
    send: () => {},
  };

  twilioWebhookValidator(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, true, 'Middleware should pass through in dev mode when token is not set');

  if (originalToken) {
    process.env.TWILIO_AUTH_TOKEN = originalToken;
  }
});

test('Twilio Middleware: Enforces signature check and blocks missing header when token is set', () => {
  const originalToken = process.env.TWILIO_AUTH_TOKEN;
  process.env.TWILIO_AUTH_TOKEN = 'testAuthToken12345';

  let nextCalled = false;
  let statusCode = 200;
  let sentBody = '';

  const req = {
    headers: {}, // No x-twilio-signature
    body: { CallSid: 'CA999' },
  };
  const res = {
    status: (code) => {
      statusCode = code;
      return res;
    },
    set: () => res,
    send: (body) => {
      sentBody = body;
    },
  };

  twilioWebhookValidator(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, false, 'Next should NOT be called when signature is missing');
  assert.strictEqual(statusCode, 403, 'Should respond with 403 Forbidden');
  assert.ok(sentBody.includes('<Reject'), 'Should return TwiML reject response');

  if (originalToken) {
    process.env.TWILIO_AUTH_TOKEN = originalToken;
  } else {
    delete process.env.TWILIO_AUTH_TOKEN;
  }
});

test('Twilio TwiML: Generates well-formed voice and hold TwiML XML', () => {
  const voiceTwiml = generateVoiceTwiML({
    streamUrl: 'wss://demo.ngrok.app/media',
    recordingCallbackUrl: 'https://demo.ngrok.app/api/calls/recording-status',
    holdUrl: 'https://demo.ngrok.app/api/calls/twiml-hold',
  });

  assert.ok(voiceTwiml.includes('<Response>'), 'Must have Response root');
  assert.ok(voiceTwiml.includes('<Stream url="wss://demo.ngrok.app/media" />'), 'Must contain WebSocket Stream');
  assert.ok(voiceTwiml.includes('<Recording recordingStatusCallback="https://demo.ngrok.app/api/calls/recording-status"'), 'Must contain Recording callback');
  assert.ok(voiceTwiml.includes('<Say voice="Polly.Aditi" language="en-IN">'), 'Must use Polly.Aditi voice');
  assert.ok(voiceTwiml.includes('<Redirect method="POST">https://demo.ngrok.app/api/calls/twiml-hold</Redirect>'), 'Must loop to hold endpoint');

  const holdTwiml = generateHoldTwiML('https://demo.ngrok.app/api/calls/twiml-hold');
  assert.ok(holdTwiml.includes('<Response>'));
  assert.ok(holdTwiml.includes('<Redirect method="POST">https://demo.ngrok.app/api/calls/twiml-hold</Redirect>'));
});
