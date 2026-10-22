const { initializeApp } = require('firebase/app');
const { getDatabase, ref, set, update, get } = require('firebase/database');
const EventEmitter = require('events');
const { getCoordinates, analyzeTranscript, getNamedEntities, analyzePriority } = require('./utils');
const { processMultilingualTranscript } = require('./multilingual');

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

// Event emitter for real-time incident updates
const incidentEvents = new EventEmitter();
module.exports.incidentEvents = incidentEvents;
module.exports.db = db;

// In-memory incidents cache for ultra-fast queries and offline resilience
const incidentsStore = new Map();

function generateIncidentId(callSid) {
  if (!callSid) return 'INC-' + Math.floor(1000 + Math.random() * 9000);
  if (callSid.startsWith('INC-')) return callSid;
  const hash = callSid.replace(/^(demo_|upload_|CA)/, '').substring(0, 6).toUpperCase();
  return `INC-${hash || Math.floor(1000 + Math.random() * 9000)}`;
}

// Pre-load existing incidents from Firebase RTDB on startup
(async () => {
  try {
    const snapshot = await get(ref(db, '/calls'));
    if (snapshot.exists()) {
      const data = snapshot.val();
      for (const [key, val] of Object.entries(data)) {
        if (val) {
          incidentsStore.set(key, { ...val, key, callSid: val.callSid || key });
        }
      }
      console.log(`[Firebase Cache] Hydrated ${incidentsStore.size} existing incidents from database.`);
    }
  } catch (err) {
    console.warn('[Firebase Cache] Could not pre-fetch incidents on startup:', err.message);
  }
})();

module.exports.initCallData = async (callSid, payload = {}, source = 'twilio') => {
  if (!callSid) return;

  const isUpload = source === 'upload';
  const incident_id = payload.incident_id || generateIncidentId(callSid);
  const now = new Date().toISOString();

  const record = {
    key: callSid,
    callSid,
    incident_id,
    source: source || 'twilio',
    dateCreated: now,
    timestamp: now,
    emergency: '',
    emergency_type: '',
    live: !isUpload,
    name: payload.CallerName || payload.name || (isUpload ? 'Recorded Demo Intake' : 'Unknown Caller'),
    phone: payload.From || payload.phone || (isUpload ? 'Recorded Audio Fallback' : 'Unknown Number'),
    priority: payload.priority || 'TBD', // HIGH | MEDIUM | LOW | TBD
    status: 'OPEN', // 'OPEN' | 'DISPATCHED' | 'RESOLVED'
    transcript: payload.transcript || '',
    language: payload.language || 'English',
    detected_language: payload.detected_language || 'en',
    original_transcript: payload.original_transcript || payload.transcript || '',
    english_translation: payload.english_translation || '',
    processingStatus: isUpload ? 'processing' : 'streaming',
    location_source: 'caller_statement',
    location_precision: 'unavailable',
    ...(payload.audioDuration ? { audioDuration: payload.audioDuration } : {}),
  };

  incidentsStore.set(callSid, record);

  try {
    await set(ref(db, `/calls/${callSid}`), record);
  } catch (err) {
    console.warn('[Firebase] set call error:', err.message);
  }

  incidentEvents.emit('incident_created', record);
  return record;
};

const updateNamedEntitiesWithExpensiveModel = (transcript, callSid) =>
  getNamedEntities(transcript, true)
    .then(async ({ name, location }) => {
      const updates = {};
      if (name) {
        console.log('[Expensive Model] Found name:\t', name);
        updates.name = name;
      }

      if (location) {
        console.log('[Expensive Model] Found location:\t', location);
        updates.location = location;
        updates.location_text = location;

        const coordinates = await getCoordinates(location);
        if (coordinates?.lat && coordinates?.lng) {
          updates.geocode = { lat: coordinates.lat, lng: coordinates.lng };
          updates.latitude = coordinates.lat;
          updates.longitude = coordinates.lng;
          updates.accuracy = coordinates.accuracy === 'exact' ? 25 : 500;
          updates.location_precision = coordinates.accuracy || 'exact';
          updates.location_source = 'caller_statement';
          if (coordinates.formattedAddress) {
            updates.formattedAddress = coordinates.formattedAddress;
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        const existing = incidentsStore.get(callSid) || {};
        const merged = { ...existing, ...updates };
        incidentsStore.set(callSid, merged);
        incidentEvents.emit('incident_updated', merged);

        try {
          return update(ref(db, `/calls/${callSid}`), updates);
        } catch (e) {}
      }
    })
    .catch((err) => {
      console.error('Error running secondary NER model:', err);
    });

/**
 * Shared triage processing function used by both Twilio live-call disconnect,
 * recorded-audio fallback intake, and demo tests.
 * Extracts named entities, emergency category, geocodes Indian location from caller statement,
 * calculates priority rating, and writes updates to Firebase RTDB & local cache.
 */
const processCallTranscript = async (callSid, transcript, callerLabel = null) => {
  if (!callSid || !transcript) {
    return null;
  }

  const multiRes = await processMultilingualTranscript(transcript);

  const updates = {
    transcript,
    original_transcript: multiRes.originalTranscript,
    english_translation: multiRes.englishTranslation,
    detected_language: multiRes.detectedLanguage,
    language: multiRes.languageName,
    is_code_mixed: multiRes.isCodeMixed,
    processingStatus: 'analyzing',
    incident_id: generateIncidentId(callSid),
  };

  const analysisText = multiRes.englishTranslation || transcript;

  const priority = analyzePriority(analysisText);
  if (priority) {
    updates.priority = priority;
  }

  console.log(`[Triage Pipeline] Processing callSid: ${callSid} | Lang: ${multiRes.languageName} | Priority: ${priority}`);

  const result = await analyzeTranscript(analysisText);
  const { name, location, emergencyType, confidence, allScores, structuredEntities } = result || {};

  // Location from caller statement
  if (location) {
    console.log('[Triage Pipeline] Spoken location extracted:\t', location);
    updates.location = location;
    updates.location_text = location;
    updates.location_source = 'caller_statement';

    const coordinates = await getCoordinates(location);
    if (coordinates?.lat && coordinates?.lng) {
      console.log('[Triage Pipeline] Geocoded coordinates:\t', coordinates);
      updates.geocode = { lat: coordinates.lat, lng: coordinates.lng };
      updates.latitude = coordinates.lat;
      updates.longitude = coordinates.lng;
      updates.accuracy = coordinates.accuracy === 'exact' ? 25 : 500;
      updates.location_precision = coordinates.accuracy || 'exact';
      if (coordinates.formattedAddress) {
        updates.formattedAddress = coordinates.formattedAddress;
      }
    } else {
      updates.location_precision = 'approximate';
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
    updates.emergency_type = emergencyType;
  }

  // Store classification confidence scores
  if (confidence !== undefined && confidence !== null) {
    updates.confidence = confidence;
  }
  if (allScores) {
    updates.classificationScores = allScores;
  }

  // Store structured entities extracted from transcript
  if (structuredEntities && Object.keys(structuredEntities).length > 0) {
    updates.entities = structuredEntities;
    console.log('[Triage Pipeline] Extracted entities:\t', JSON.stringify(structuredEntities));
  }

  // Mark processing as complete
  updates.processingStatus = 'completed';
  updates.dateProcessed = new Date().toISOString();

  if (process.env.DEBUG) {
    console.log(
      `[DEBUG][NER] Output for call ${callSid}: emergency="${updates.emergency || ''}", location="${
        updates.location || ''
      }", priority="${updates.priority || ''}", entities=${JSON.stringify(updates.entities || {})}`
    );
  }

  // Update in-memory cache
  const existing = incidentsStore.get(callSid) || {};
  const fullRecord = { ...existing, ...updates, callSid, key: callSid };
  incidentsStore.set(callSid, fullRecord);

  // Write to Firebase Realtime Database
  try {
    await update(ref(db, `/calls/${callSid}`), updates);
    if (process.env.DEBUG) {
      console.log(
        `[DEBUG][DB] Stored incident record to database for call ${callSid}: processingStatus="${updates.processingStatus}", priority="${updates.priority || 'TBD'}"`
      );
    }
  } catch (err) {
    console.warn('[Firebase] update call error:', err.message);
  }

  // Notify connected dashboard clients via real-time event
  incidentEvents.emit('incident_updated', fullRecord);

  // Trigger fallback / secondary NER refinement in background
  updateNamedEntitiesWithExpensiveModel(transcript, callSid);

  return fullRecord;
};

module.exports.processCallTranscript = processCallTranscript;

module.exports.updateOnDisconnect = async (callSid) => {
  if (!callSid) return;

  const updates = {
    live: false,
    dateDisconnected: new Date().toISOString(),
  };

  const existing = incidentsStore.get(callSid) || {};
  const merged = { ...existing, ...updates };
  incidentsStore.set(callSid, merged);
  incidentEvents.emit('incident_updated', merged);

  try {
    await update(ref(db, `/calls/${callSid}`), updates);
    let transcript = existing.transcript || '';
    if (!transcript) {
      const snapshot = await get(ref(db, `/calls/${callSid}/transcript`));
      if (snapshot.exists()) {
        transcript = snapshot.val() || '';
      }
    }
    if (transcript) {
      console.log('Final transcript:\t', transcript);
      await processCallTranscript(callSid, transcript);
    }
  } catch (err) {
    console.error('[Firebase] updateOnDisconnect error:', err.message);
  }
};

module.exports.updateTranscript = (callSid, streamSid, transcript, priority) => {
  if (!callSid) return;

  const updates = {
    callSid,
    streamSid,
    transcript,
    priority,
  };

  const existing = incidentsStore.get(callSid) || {};
  const merged = { ...existing, ...updates };
  incidentsStore.set(callSid, merged);
  incidentEvents.emit('incident_updated', merged);

  try {
    return update(ref(db, `/calls/${callSid}`), updates);
  } catch (err) {
    if (process.env.DEBUG) console.warn('[Firebase] updateTranscript error:', err.message);
  }
};

/**
 * Retrieve all incidents from in-memory cache, supplemented by Firebase RTDB
 */
module.exports.getAllIncidents = async () => {
  try {
    const snapshot = await get(ref(db, '/calls'));
    if (snapshot.exists()) {
      const data = snapshot.val();
      for (const [key, val] of Object.entries(data)) {
        if (val) {
          incidentsStore.set(key, { ...val, key, callSid: val.callSid || key });
        }
      }
    }
  } catch (err) {
    // If Firebase read is unavailable, cache provides graceful fallback
  }

  return Array.from(incidentsStore.values()).sort(
    (a, b) => new Date(b.dateCreated || 0).getTime() - new Date(a.dateCreated || 0).getTime()
  );
};

module.exports.getIncident = (callSid) => incidentsStore.get(callSid) || null;
module.exports.incidentsStore = incidentsStore;

/**
 * Update incident status (OPEN -> DISPATCHED -> RESOLVED) or priority
 */
module.exports.updateIncidentStatus = async (callSid, newStatus, newPriority = null) => {
  if (!callSid || !newStatus) return null;

  const updates = { status: newStatus };
  if (newPriority) updates.priority = newPriority;
  if (newStatus === 'RESOLVED') {
    updates.dateResolved = new Date().toISOString();
  }

  const existing = incidentsStore.get(callSid) || {};
  const merged = { ...existing, ...updates, callSid, key: callSid };
  incidentsStore.set(callSid, merged);

  try {
    await update(ref(db, `/calls/${callSid}`), updates);
  } catch (e) {}

  incidentEvents.emit('incident_updated', merged);
  return merged;
};

// Location-sharing token stubs (preserved for backward compatibility)
const locationSessions = new Map();
module.exports.createLocationSession = (callSid) => {
  if (!callSid) return null;
  const token = 'loc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
  locationSessions.set(token, { callSid, createdAt: Date.now(), active: true });
  return token;
};
module.exports.getLocationSession = (token) => locationSessions.get(token) || null;
module.exports.deactivateLocationSession = (token) => {
  const session = locationSessions.get(token);
  if (session) session.active = false;
};
module.exports.updateCallerLocation = async (callSid, locationData) => {
  if (!callSid || !locationData) return;
  const updates = { callerLocation: { ...locationData, active: true } };
  try {
    await update(ref(db, `/calls/${callSid}`), updates);
  } catch (e) {}
  return updates;
};
module.exports.deactivateCallerLocation = async (callSid) => {
  if (!callSid) return;
  try {
    await update(ref(db, `/calls/${callSid}/callerLocation`), { active: false, stoppedAt: new Date().toISOString() });
  } catch (e) {}
};

module.exports.updateCallRecording = async (callSid, recordingData) => {
  if (!callSid || !recordingData) return null;
  const existing = incidentsStore.get(callSid) || {};
  const merged = { ...existing, ...recordingData, callSid, key: callSid };
  incidentsStore.set(callSid, merged);
  incidentEvents.emit('incident_updated', merged);

  try {
    await update(ref(db, `/calls/${callSid}`), recordingData);
  } catch (e) {
    console.warn('[Firebase] Could not update recording data:', e.message);
  }
  return merged;
};


