const axios = require('axios');

/**
 * Language definitions and scripts for major Indian languages supported by ERSS-112
 */
const SUPPORTED_LANGUAGES = {
  hi: { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  bn: { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  ta: { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  te: { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  mr: { code: 'mr', name: 'Marathi', native: 'मराठी' },
  gu: { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
  kn: { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
  ml: { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
  pa: { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  or: { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ' },
  ur: { code: 'ur', name: 'Urdu', native: 'اردو' },
  hinglish: { code: 'hinglish', name: 'Hinglish', native: 'Code-Mixed Hindi-English' },
  en: { code: 'en', name: 'English', native: 'English' },
};

/**
 * Indic Unicode block ranges for script detection
 */
const SCRIPT_RANGES = [
  { lang: 'bn', regex: /[\u0980-\u09FF]/g }, // Bengali / Assamese
  { lang: 'ta', regex: /[\u0B80-\u0BFF]/g }, // Tamil
  { lang: 'te', regex: /[\u0C00-\u0C7F]/g }, // Telugu
  { lang: 'gu', regex: /[\u0A80-\u0AFF]/g }, // Gujarati
  { lang: 'kn', regex: /[\u0C80-\u0CFF]/g }, // Kannada
  { lang: 'ml', regex: /[\u0D00-\u0D7F]/g }, // Malayalam
  { lang: 'pa', regex: /[\u0A00-\u0A7F]/g }, // Gurmukhi (Punjabi)
  { lang: 'or', regex: /[\u0B00-\u0B7F]/g }, // Odia
  { lang: 'ur', regex: /[\u0600-\u06FF]/g }, // Arabic / Urdu
  { lang: 'devanagari', regex: /[\u0900-\u097F]/g }, // Devanagari (Hindi / Marathi)
];

/**
 * Common Hinglish / Code-mixed marker keywords in Latin script
 */
const HINGLISH_MARKERS = [
  /\bmera\b/i, /\bmeri\b/i, /\bmere\b/i, /\bnaam\b/i, /\bhai\b/i, /\bhain\b/i,
  /\bke\s+paas\b/i, /\bke\s+samne\b/i, /\bke\s+niche\b/i, /\bse\s+bol\s+raha\b/i,
  /\bbol\s+rahi\b/i, /\bmadad\b/i, /\bbachao\b/i, /\bchori\b/i, /\baag\b/i,
  /\bghayal\b/i, /\bjaldi\b/i, /\bkaro\b/i, /\bgadi\b/i, /\bgaadi\b/i, /\baccident\s+ho\s+gaya\b/i,
  /\bho\s+gaya\b/i, /\bho\s+gayi\b/i, /\bhua\b/i, /\bhue\b/i, /\bhuyee\b/i,
  /\blog\b/i, /\bdo\s+log\b/i, /\bteen\s+log\b/i, /\bchaar\s+log\b/i, /\bek\b/i,
  /\bbhejo\b/i, /\bbhej\s+do\b/i, /\bchahiye\b/i, /\bkripya\b/i, /\bkripa\b/i,
  /\bthana\b/i, /\bpolice\s+ko\b/i, /\bhospital\b/i,
];

/**
 * Detect script or language from text
 * @param {string} text
 * @returns {{ code: string, name: string, isCodeMixed: boolean, confidence: number }}
 */
function detectLanguage(text) {
  if (!text || typeof text !== 'string') {
    return { code: 'en', name: 'English', isCodeMixed: false, confidence: 1.0 };
  }

  const cleanText = text.trim();
  if (cleanText.length === 0) {
    return { code: 'en', name: 'English', isCodeMixed: false, confidence: 1.0 };
  }

  // 1. Check Indic scripts by Unicode range match count
  let maxMatches = 0;
  let detectedLang = null;

  for (const { lang, regex } of SCRIPT_RANGES) {
    const matches = cleanText.match(regex);
    if (matches && matches.length > maxMatches) {
      maxMatches = matches.length;
      detectedLang = lang;
    }
  }

  // If Devanagari detected, differentiate Marathi vs Hindi using Marathi lexical tokens
  if (detectedLang === 'devanagari') {
    const marathiTokens = [/आहे\b/, /झाला\b/, /झाली\b/, /झाले\b/, /माझे\b/, /नाव\b/, /अपघात\b/, /लवकर\b/, /पाठवा\b/];
    const isMarathi = marathiTokens.some((tok) => tok.test(cleanText));
    const langCode = isMarathi ? 'mr' : 'hi';
    const langObj = SUPPORTED_LANGUAGES[langCode];
    return {
      code: langCode,
      name: `${langObj.name} (${langObj.native})`,
      isCodeMixed: false,
      confidence: 0.95,
    };
  }

  if (detectedLang && SUPPORTED_LANGUAGES[detectedLang]) {
    const langObj = SUPPORTED_LANGUAGES[detectedLang];
    return {
      code: detectedLang,
      name: `${langObj.name} (${langObj.native})`,
      isCodeMixed: false,
      confidence: 0.95,
    };
  }

  // 2. Check Hinglish / Code-mixed patterns in Latin script
  let hinglishHits = 0;
  for (const pattern of HINGLISH_MARKERS) {
    if (pattern.test(cleanText)) {
      hinglishHits++;
    }
  }

  if (hinglishHits >= 2 || (hinglishHits === 1 && /(?:mera\s+naam|ho\s+gaya|jaldi|ambulance\s+bhejo|madad)/i.test(cleanText))) {
    return {
      code: 'hinglish',
      name: 'Hinglish (Code-Mixed)',
      isCodeMixed: true,
      confidence: 0.9,
    };
  }

  // Default to English
  return {
    code: 'en',
    name: 'English',
    isCodeMixed: false,
    confidence: 1.0,
  };
}

/**
 * Built-in dictionary fallback for offline / disconnected emergency translation.
 * Maps high-frequency emergency phrases and entities across Indian languages into English.
 */
const OFFLINE_EMERGENCY_DICTIONARY = [
  // Names & greetings
  { pattern: /(?:मेरा\s+नाम|माझे\s+नाव|என்\s+பெயர்|నా\s+పేరు|আমার\s+নাম|ਮੇਰਾ\s+ਨਾਮ|ਮੇਰਾ\s+ਨਾਂ|મારું\s+નામ|ನನ್ನ\s+ಹೆಸರು|എന്റെ\s+പേര്|ମୋର\s+ନାମ|میرا\s+نام)\s+([^\s,.!?]+(?:\s+[^\s,.!?]+)?)/u, replace: 'My name is $1. ' },
  { pattern: /\bmera\s+naam\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+hai\b/gi, replace: 'My name is $1. ' },
  
  // Accidents & Traffic
  { pattern: /(?:सड़क\s+दुर्घटना|दुर्घटना|एक्सीडेंट|अपघात|விபத்து|ప్రమాదం|দুর্ঘটনা|ਹਾਦਸਾ|અકસ્માત|ಅಪಘಾತ|അപകടം|ଦୁର୍ଘଟଣା|حادثہ)/gu, replace: ' accident ' },
  { pattern: /\baccident\s+ho\s+gaya\b/gi, replace: 'accident happened' },
  { pattern: /\bcollision\s+hua\b/gi, replace: 'collision happened' },

  // Fire & Blast
  { pattern: /(?:आग\s+लग\s+गई|आग|विस्फोट|आगीची|தீ\s+விபத்து|తీ|నిప్పు|మంటలు|আগুন|ਅੱਗ|આગ|ಬೆಂಕಿ|തീ|ନିଆଁ|آگ)/gu, replace: ' fire emergency ' },
  { pattern: /\baag\s+lag\s+gayi\b/gi, replace: 'fire broke out' },

  // Medical Emergencies
  { pattern: /(?:दिल\s+का\s+दौरा|सीने\s+में\s+दर्द|बेहोश|सांस\s+लेने\s+में\s+दिक्कत|छातीत\s+दुखणे|நெஞ்சு\s+வலி|மயக்கம்|గుండెపోటు|ছাতিতে\s+ব্যথা|ਦਿਲ\s+ਦਾ\s+ਦੌਰਾ|છાતીમાં\s+દુખાવો|ಎದೆ\s+ನೋವು|നെഞ്ചുവേദന|ଛାତିରେ\s+ଯନ୍ତ୍ରଣା|دل\s+کا\s+دورہ)/gu, replace: ' chest pain and heart attack collapsed unconscious ' },
  { pattern: /\bseene\s+mein\s+dard\b/gi, replace: 'chest pain' },
  { pattern: /\bbehosh\b/gi, replace: 'unconscious' },
  { pattern: /\bsaans\s+nahi\s+aa\s+rahi\b/gi, replace: 'breathlessness cannot breathe' },

  // Victims & Injuries
  { pattern: /(?:घायल|जख्मी|காயமடைந்துள்ளனர்|గాయపడ్డారు|আহত|ਜ਼ਖਮੀ|ઈજાગ્રસ્ત|ಗಾಯಗೊಂಡಿದ್ದಾರೆ|പരിക്കേറ്റു|କ୍ଷତାକ୍ତ|زخمی)/gu, replace: ' injured ' },
  { pattern: /\bghayal\b/gi, replace: 'injured' },
  { pattern: /\bdo\s+log\b/gi, replace: 'two people' },
  { pattern: /\bteen\s+log\b/gi, replace: 'three people' },
  { pattern: /\bchaar\s+log\b/gi, replace: 'four people' },
  { pattern: /(?:दो\s+लोग|दोन\s+लोक|இரண்டு\s+பேர்|ఇద్దరు|দুজন\s+মানুষ|ਦੋ\s+ਲੋਕ|બે\s+લોકો|ಇಬ್ಬರು|രണ്ടുപേർ|ଦୁଇ\s+ଜଣ|دو\s+افراد)/gu, replace: ' two people ' },
  { pattern: /(?:तीन\s+लोग|तीन\s+लोक|மூன்று\s+பேர்|ముగ్గురు|তিনজন|ਤਿੰਨ\s+ਲੋਕ|ત્રણ|ಮೂವರು|മൂന്ന്\s+പേർ|ତିନି\s+ଜଣ|تین\s+افراد)/gu, replace: ' three people ' },
  { pattern: /(?:चार\s+लोग|चार\s+लोक|நான்கு\s+பேர்|నలుగురు|চারজন|ਚਾਰ\s+ਲੋਕ|ચાર|ನಾಲ್ವರು|നാലുപേർ|ଚାରି\s+ଜଣ|چار\s+افراد)/gu, replace: ' four people ' },

  // Urgent Dispatch Request
  { pattern: /(?:एम्बुलेंस\s+भेजो|मदद\s+चाहिए|जलदी\s+भेजो|ஆம்புலன்ஸ்\s+அனுப்புங்கள்|ఆంబులెన్స్\s+పంపండి|অ্যাম্বুলেন্স\s+পাঠান|ਐਂਬੂਲੈਂਸ\s+ਭੇਜੋ|ಆಂಬ್ಯುಲೆನ್ಸ್\s+ಕಳುಹಿಸಿ|ആംബുലൻസ്\s+അയക്കുക|ایمبولینس\s+بھیجیں)/gu, replace: ' send ambulance immediately we need help ' },
  { pattern: /\bambulance\s+bhejo\b/gi, replace: 'send ambulance immediately' },
  { pattern: /\bpolice\s+bhejo\b/gi, replace: 'send police immediately' },
  { pattern: /\bjaldi\s+madad\b/gi, replace: 'help quickly' },

  // Locations / Prepositions
  { pattern: /\bke\s+paas\b/gi, replace: 'near' },
  { pattern: /\bke\s+samne\b/gi, replace: 'in front of' },
  { pattern: /(?:पास|जवळ|அருகில்|దగ్గర|কাছে|ਨੇੜੇ|નજીક|ಹತ್ತಿರ|സമീപം|ନିକଟରେ|قریب)/gu, replace: ' near ' },
];

/**
 * Translate native script or code-mixed text to English
 * @param {string} text
 * @param {string} [detectedCode]
 * @returns {Promise<{ englishText: string, translated: boolean, source: string, detectedCode: string }>}
 */
async function translateToEnglish(text, detectedCode = 'auto') {
  if (!text || typeof text !== 'string') {
    return { englishText: '', translated: false, source: 'identity', detectedCode: 'en' };
  }

  const clean = text.trim();
  const langInfo = detectLanguage(clean);

  // If already pure English, no translation needed
  if (langInfo.code === 'en' && !langInfo.isCodeMixed) {
    return {
      englishText: clean,
      translated: false,
      source: 'identity',
      detectedCode: 'en',
    };
  }

  // Attempt Tier 1: Google Translate GTX endpoint (Zero-auth, highly accurate for all Indic languages)
  try {
    const sl = langInfo.code === 'hinglish' ? 'auto' : (langInfo.code || 'auto');
    const response = await axios.get('https://translate.googleapis.com/translate_a/single', {
      params: {
        client: 'gtx',
        sl,
        tl: 'en',
        dt: 't',
        q: clean,
      },
      timeout: 3500,
    });

    if (response.data && Array.isArray(response.data[0])) {
      const translatedParts = response.data[0].map((seg) => seg[0]).filter(Boolean);
      const combined = translatedParts.join('').trim();
      const apiDetected = response.data[2] || langInfo.code;

      if (combined.length > 0) {
        return {
          englishText: combined,
          translated: true,
          source: 'gtx_api',
          detectedCode: langInfo.isCodeMixed ? 'hinglish' : apiDetected,
        };
      }
    }
  } catch (apiErr) {
    // Graceful fallback to offline dictionary
  }

  // Tier 2: Offline Emergency Transliterator & Normalizer
  let offlineTrans = clean;
  for (const { pattern, replace } of OFFLINE_EMERGENCY_DICTIONARY) {
    offlineTrans = offlineTrans.replace(pattern, replace);
  }

  return {
    englishText: offlineTrans.replace(/\s+/g, ' ').trim(),
    translated: true,
    source: 'offline_dictionary',
    detectedCode: langInfo.code,
  };
}

/**
 * High-level multilingual processing pipeline.
 * Ingests any transcript in Indian languages, Hinglish, or English,
 * detects language, translates to English if necessary, and returns complete metadata.
 *
 * @param {string} transcript
 * @returns {Promise<{
 *   originalTranscript: string,
 *   englishTranslation: string,
 *   detectedLanguage: string,
 *   languageName: string,
 *   isCodeMixed: boolean,
 *   wasTranslated: boolean,
 *   translationSource: string
 * }>}
 */
async function processMultilingualTranscript(transcript) {
  const originalTranscript = (transcript || '').trim();
  const detection = detectLanguage(originalTranscript);

  let englishTranslation = originalTranscript;
  let wasTranslated = false;
  let translationSource = 'none';

  if (detection.code !== 'en' || detection.isCodeMixed) {
    const transResult = await translateToEnglish(originalTranscript, detection.code);
    if (transResult.englishText && transResult.englishText !== originalTranscript) {
      englishTranslation = transResult.englishText;
      wasTranslated = true;
      translationSource = transResult.source;
    }
  }

  return {
    originalTranscript,
    englishTranslation,
    detectedLanguage: detection.code,
    languageName: detection.name,
    isCodeMixed: detection.isCodeMixed,
    wasTranslated,
    translationSource,
  };
}

module.exports = {
  SUPPORTED_LANGUAGES,
  detectLanguage,
  translateToEnglish,
  processMultilingualTranscript,
};
