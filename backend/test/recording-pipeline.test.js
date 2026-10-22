const test = require('node:test');
const assert = require('node:assert');
const {
  downloadTwilioRecordingAudio,
  getTwilioRecordingStream,
} = require('../src/twilio');
const {
  updateCallRecording,
  getIncident,
  initCallData,
  processCallTranscript,
} = require('../src/firebase');

test('Recording Security: downloadTwilioRecordingAudio requires credentials', async () => {
  const originalSid = process.env.TWILIO_ACCOUNT_SID;
  const originalToken = process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;

  await assert.rejects(
    async () => {
      await downloadTwilioRecordingAudio('https://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE123');
    },
    /Twilio credentials/,
    'Should throw error when credentials are not configured'
  );

  if (originalSid) process.env.TWILIO_ACCOUNT_SID = originalSid;
  if (originalToken) process.env.TWILIO_AUTH_TOKEN = originalToken;
});

test('Recording Security: getTwilioRecordingStream requires credentials', async () => {
  const originalSid = process.env.TWILIO_ACCOUNT_SID;
  const originalToken = process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;

  await assert.rejects(
    async () => {
      await getTwilioRecordingStream('https://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE123');
    },
    /Twilio credentials/,
    'Should throw error when credentials are not configured'
  );

  if (originalSid) process.env.TWILIO_ACCOUNT_SID = originalSid;
  if (originalToken) process.env.TWILIO_AUTH_TOKEN = originalToken;
});

test('Recording Flow: updateCallRecording stores local proxy route and prevents direct Twilio URL exposure', async () => {
  const callSid = 'CA_unit_test_' + Date.now();
  await initCallData(callSid, { CallSid: callSid, From: '+919810111222' }, 'twilio');

  const proxyUrl = `/api/calls/${callSid}/recording`;
  const rawTwilioUrl = 'https://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE999.mp3';

  await updateCallRecording(callSid, {
    recordingUrl: proxyUrl,
    recordingSid: 'RE999',
    rawRecordingUrl: rawTwilioUrl,
    recordingDuration: 25,
  });

  const incident = getIncident(callSid);
  assert.ok(incident, 'Incident must exist in store');
  assert.strictEqual(incident.recordingUrl, proxyUrl, 'recordingUrl must be the local proxy route');
  assert.strictEqual(incident.recordingSid, 'RE999', 'recordingSid must be preserved');
  assert.strictEqual(incident.rawRecordingUrl, rawTwilioUrl, 'rawRecordingUrl must be preserved server-side');
});

test('Triage Pipeline: Multilingual Indian language transcript creates complete dashboard fields', async () => {
  const callSid = 'CA_hindi_test_' + Date.now();
  await initCallData(callSid, { CallSid: callSid, From: '+919811234567' }, 'twilio');

  const hindiTranscript =
    'कृपया मदद कीजिए, मेरा नाम सुनीता वर्मा है। अट्टा मार्केट, सेक्टर 18 नोएडा में एक दुकान में आग लग गई है। जल्दी दमकल भेजो!';

  const result = await processCallTranscript(callSid, hindiTranscript, 'Sunita Verma');

  assert.ok(result, 'Result should not be null');
  assert.strictEqual(result.detected_language, 'hi', 'Detected language should be Hindi (hi)');
  assert.ok(result.original_transcript.includes('सुनीता वर्मा'), 'Must preserve original Indic transcript');
  assert.ok(result.english_translation.length > 10, 'Must produce English translation');
  assert.strictEqual(result.emergency, 'Fire Emergency', 'Must classify as Fire Emergency');
  assert.strictEqual(result.priority, 'HIGH', 'Must classify as HIGH priority');
  assert.ok(result.location, 'Must extract spoken location');
  assert.ok(result.geocode?.lat && result.geocode?.lng, 'Must geocode coordinates');
});
