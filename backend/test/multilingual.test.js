const test = require('node:test');
const assert = require('node:assert');
const {
  detectLanguage,
  translateToEnglish,
  processMultilingualTranscript,
} = require('../src/multilingual');
const { processCallTranscript } = require('../src/firebase');

test('Multilingual: Language detection accurately identifies major Indian languages and scripts', () => {
  // Hindi (Devanagari)
  const hi = detectLanguage('मेरा नाम राजेश शर्मा है। कनाट प्लेस में आग लग गई है।');
  assert.strictEqual(hi.code, 'hi');
  assert.ok(hi.name.includes('Hindi'));

  // Tamil
  const ta = detectLanguage('என் பெயர் கார்த்திக். சென்னை சென்ட்ரல் அருகில் விபத்து நடந்தது.');
  assert.strictEqual(ta.code, 'ta');
  assert.ok(ta.name.includes('Tamil'));

  // Bengali
  const bn = detectLanguage('আমার নাম অনন্যা রায়। পার্ক স্ট্রিটে আগুন লেগেছে।');
  assert.strictEqual(bn.code, 'bn');
  assert.ok(bn.name.includes('Bengali'));

  // Telugu
  const te = detectLanguage('నా పేరు రమేష్. హైదరాబాద్ లో కారు ప్రమాదం జరిగింది.');
  assert.strictEqual(te.code, 'te');
  assert.ok(te.name.includes('Telugu'));

  // Hinglish / Code-mixed
  const hinglish = detectLanguage('Mera naam Amit Patel hai, MG Road ke paas accident ho gaya hai, jaldi ambulance bhejo.');
  assert.strictEqual(hinglish.code, 'hinglish');
  assert.strictEqual(hinglish.isCodeMixed, true);

  // English
  const en = detectLanguage('Hello, this is Rajesh Sharma calling from Connaught Place in New Delhi.');
  assert.strictEqual(en.code, 'en');
  assert.strictEqual(en.isCodeMixed, false);
});

test('Multilingual Scenario 1: Hindi emergency transcript extraction', async () => {
  const hindiTranscript = 'मेरा नाम राजेश शर्मा है। कनाट प्लेस में एक बड़ा एक्सीडेंट हुआ है, दो लोग घायल हैं। तुरंत एम्बुलेंस भेजो!';
  
  const processed = await processMultilingualTranscript(hindiTranscript);
  assert.strictEqual(processed.detectedLanguage, 'hi');
  assert.ok(processed.wasTranslated);
  assert.strictEqual(processed.originalTranscript, hindiTranscript);
  assert.ok(processed.englishTranslation.length > 10);

  // Verify end-to-end extraction through triage pipeline
  const callSid = 'test_hi_' + Date.now();
  const triage = await processCallTranscript(callSid, hindiTranscript);

  assert.ok(triage, 'Triage result should exist');
  assert.strictEqual(triage.detected_language, 'hi');
  assert.strictEqual(triage.original_transcript, hindiTranscript);
  assert.ok(triage.english_translation);
  assert.strictEqual(triage.priority, 'HIGH');
  assert.ok(triage.emergency === 'Traffic Accident' || triage.emergency === 'Medical Emergency');
  assert.ok(triage.location || triage.entities?.location_text || triage.formattedAddress);
});

test('Multilingual Scenario 2: Tamil emergency transcript extraction', async () => {
  const tamilTranscript = 'என் பெயர் கார்த்திக். சென்னை சென்ட்ரல் அருகில் ஒரு விபத்து ஏற்பட்டது, இரண்டு பேர் காயமடைந்துள்ளனர். உடனடியாக ஆம்புலன்ஸ் தேவை!';

  const processed = await processMultilingualTranscript(tamilTranscript);
  assert.strictEqual(processed.detectedLanguage, 'ta');
  assert.ok(processed.wasTranslated);
  assert.strictEqual(processed.originalTranscript, tamilTranscript);

  const callSid = 'test_ta_' + Date.now();
  const triage = await processCallTranscript(callSid, tamilTranscript);

  assert.ok(triage);
  assert.strictEqual(triage.detected_language, 'ta');
  assert.strictEqual(triage.original_transcript, tamilTranscript);
  assert.ok(triage.english_translation);
  assert.strictEqual(triage.priority, 'HIGH');
  assert.ok(triage.emergency === 'Traffic Accident' || triage.emergency === 'Medical Emergency');
});

test('Multilingual Scenario 3: Bengali fire emergency transcript extraction', async () => {
  const bengaliTranscript = 'আমার নাম অনন্যা রায়। পার্ক স্ট্রিটে একটি বড় আগুন লেগেছে, কালো ধোঁয়া বের হচ্ছে। ফায়ার ইঞ্জিন পাঠান!';

  const processed = await processMultilingualTranscript(bengaliTranscript);
  assert.strictEqual(processed.detectedLanguage, 'bn');
  assert.ok(processed.wasTranslated);

  const callSid = 'test_bn_' + Date.now();
  const triage = await processCallTranscript(callSid, bengaliTranscript);

  assert.ok(triage);
  assert.strictEqual(triage.detected_language, 'bn');
  assert.strictEqual(triage.original_transcript, bengaliTranscript);
  assert.strictEqual(triage.priority, 'HIGH');
  assert.strictEqual(triage.emergency, 'Fire Emergency');
});

test('Multilingual Scenario 4: Code-mixed Hinglish emergency transcript extraction', async () => {
  const hinglishTranscript = 'Mera naam Amit Patel hai, MG Road Trinity Circle ke paas car accident hua hai, do log injured hain, jaldi ambulance bhejo!';

  const processed = await processMultilingualTranscript(hinglishTranscript);
  assert.strictEqual(processed.detectedLanguage, 'hinglish');
  assert.strictEqual(processed.isCodeMixed, true);

  const callSid = 'test_hinglish_' + Date.now();
  const triage = await processCallTranscript(callSid, hinglishTranscript);

  assert.ok(triage);
  assert.strictEqual(triage.detected_language, 'hinglish');
  assert.strictEqual(triage.original_transcript, hinglishTranscript);
  assert.strictEqual(triage.priority, 'HIGH');
  assert.strictEqual(triage.emergency, 'Traffic Accident');
  assert.ok(triage.entities?.victims === 2 || triage.entities?.injuries?.length > 0);
  assert.ok(triage.name.includes('Amit') || triage.name.includes('Patel'));
});
