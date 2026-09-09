const { initializeApp } = require('firebase/app');
const { getDatabase, ref, set, update, get } = require('firebase/database');
const { getCoordinates, analyzeTranscript, getNamedEntities, analyzePriority } = require('./utils');

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyCvco7fC8XnCjXGir_bY_QKXVrn7qdZglU',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'assemblyai-hackathon.firebaseapp.com',
  databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://assemblyai-hackathon-default-rtdb.firebaseio.com',
  projectId: process.env.FIREBASE_PROJECT_ID || 'assemblyai-hackathon',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'assemblyai-hackathon.appspot.com',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '675472088767',
  appId: process.env.FIREBASE_APP_ID || '1:675472088767:web:07f34df7eb2a635ebb300a',
};

const app = initializeApp(firebaseConfig);

const db = getDatabase(app);

module.exports.initCallData = (callSid, payload = {}, source = 'twilio') => {
  if (!callSid) {
    return;
  }

  const isUpload = source === 'upload';

  return set(ref(db, `/calls/${callSid}`), {
    callSid,
    source: source || 'twilio',
    dateCreated: new Date().toISOString(),
    emergency: '',
    // geocode: undefined,
    // location: undefined,
    live: !isUpload,
    name: payload.CallerName || payload.name || (isUpload ? 'Recorded Demo Intake' : 'Unknown Caller'),
    phone: payload.From || payload.phone || (isUpload ? 'Recorded Audio Fallback' : 'Unknown Number'),
    priority: payload.priority || 'TBD', // HIGH | MEDIUM | LOW | TBD
    status: 'OPEN', // 'OPEN' | 'DISPATCHED' | 'RESOLVED'
    transcript: payload.transcript || '',
    ...(payload.audioDuration ? { audioDuration: payload.audioDuration } : {}),
  });
};

const updateNamedEntitiesWithExpensiveModel = (transcript, callSid) =>
  getNamedEntities(transcript, true).then(async ({ name, location }) => {
    const updates = {};
    if (name) {
      console.log('[Expensive Model] Found name:\t', name);
      updates.name = name;
    }

    if (location) {
      console.log('[Expensive Model] Found location:\t', location);
      updates.location = location;

      const coordinates = await getCoordinates(location);
      if (coordinates?.lat && coordinates?.lng) {
        updates.geocode = coordinates;
      }
    }

    if (Object.keys(updates).length > 0) {
      return update(ref(db, `/calls/${callSid}`), updates);
    }
  }).catch((err) => {
    console.error('Error running secondary NER model:', err);
  });

/**
 * Shared triage processing function used by both Twilio live-call disconnect
 * and recorded-audio fallback intake.
 * Extracts named entities, emergency category, geocodes Indian location,
 * calculates priority rating, and writes updates to Firebase RTDB.
 */
const processCallTranscript = async (callSid, transcript, callerLabel = null) => {
  if (!callSid || !transcript) {
    return null;
  }

  const updates = {
    transcript,
  };

  const priority = analyzePriority(transcript);
  if (priority) {
    updates.priority = priority;
  }

  console.log(`[Triage Pipeline] Processing callSid: ${callSid} | Priority: ${priority}`);

  const { name, location, emergencyType } = await analyzeTranscript(transcript);

  if (location) {
    console.log('[Triage Pipeline] Found location:\t', location);
    updates.location = location;

    const coordinates = await getCoordinates(location);
    if (coordinates?.lat && coordinates?.lng) {
      console.log('[Triage Pipeline] Geocoded coordinates:\t', coordinates);
      updates.geocode = coordinates;
    }
  }

  // Priority to extracted caller name, then to callerLabel if provided
  if (name) {
    console.log('[Triage Pipeline] Found name:\t', name);
    updates.name = name;
  } else if (callerLabel && callerLabel.trim()) {
    updates.name = callerLabel.trim();
  }

  if (emergencyType) {
    console.log('[Triage Pipeline] Found emergencyType:\t', emergencyType);
    updates.emergency = emergencyType;
  }

  await update(ref(db, `/calls/${callSid}`), updates);

  // Trigger fallback / secondary NER refinement in background
  updateNamedEntitiesWithExpensiveModel(transcript, callSid);

  return updates;
};

module.exports.processCallTranscript = processCallTranscript;

module.exports.updateOnDisconnect = async (callSid) => {
  if (!callSid) {
    return;
  }

  const updates = {
    live: false,
    dateDisconnected: new Date().toISOString(),
  };

  await update(ref(db, `/calls/${callSid}`), updates);

  const snapshot = await get(ref(db, `/calls/${callSid}/transcript`));

  if (snapshot.exists()) {
    const transcript = snapshot.val();

    if (!transcript) {
      console.warn('Transcript is empty, will not analyze');
      return;
    }

    console.log('Final transcript:\t', transcript);
    await processCallTranscript(callSid, transcript);
  }
};

module.exports.updateTranscript = (callSid, streamSid, transcript, priority) => {
  if (!callSid) {
    return;
  }

  return update(ref(db, `/calls/${callSid}`), {
    callSid,
    streamSid,
    transcript,
    priority,
  });
};
