type StatusesKeys = 'OPEN' | 'DISPATCHED' | 'RESOLVED';
export const STATUSES: Record<StatusesKeys, { key: StatusesKeys; display: string; color: string }> = {
  OPEN: {
    key: 'OPEN',
    display: 'Open',
    color: 'blue',
  },
  DISPATCHED: {
    key: 'DISPATCHED',
    display: 'Dispatched',
    color: 'orange',
  },
  RESOLVED: {
    key: 'RESOLVED',
    display: 'Resolved',
    color: 'green',
  },
};

type PrioritesKeys = 'HIGH' | 'MEDIUM' | 'LOW' | 'TBD';
export const PRIORITIES: Record<PrioritesKeys, { key: PrioritesKeys; display: string; color: string }> = {
  HIGH: { key: 'HIGH', display: 'High', color: 'red' },
  MEDIUM: { key: 'MEDIUM', display: 'Medium', color: 'orange' },
  LOW: { key: 'LOW', display: 'Low', color: 'yellow' },
  TBD: { key: 'TBD', display: 'TBD', color: 'blue' },
};

type EmergenciesKeys =
  | 'Medical Emergency'
  | 'Fire Emergency'
  | 'Traffic Accident'
  | 'Crime In Progress'
  | 'Other Emergency';
export const EMERGENCIES: Record<EmergenciesKeys, { key: EmergenciesKeys; display: string; icon: string }> = {
  'Medical Emergency': { key: 'Medical Emergency', display: 'Medical Emergency', icon: '🏥' },
  'Fire Emergency': { key: 'Fire Emergency', display: 'Fire Emergency', icon: '🔥' },
  'Traffic Accident': { key: 'Traffic Accident', display: 'Traffic Accident', icon: '🚗' },
  'Crime In Progress': { key: 'Crime In Progress', display: 'Crime In Progress', icon: '🚨' },
  'Other Emergency': { key: 'Other Emergency', display: 'Other Emergency', icon: '⚠️' },
};

export interface Geocode {
  lat: number;
  lng: number;
  formattedAddress?: string;
}

export interface CallerLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: string;
  active: boolean;
  stoppedAt?: string;
}

export interface StructuredEntities {
  location?: string;
  address?: string;
  victims?: number;
  injuries?: string[];
  medicalConditions?: string[];
  weapons?: string[];
  vehicles?: string[];
  licensePlate?: string;
  suspectInfo?: string;
  landmark?: string;
  callerPhone?: string;
  location_text?: string;
}

export type CallData = {
  key: string;
  callSid: string;
  incident_id?: string;
  streamSid?: string;
  name: string;
  emergency: string;
  emergency_type?: string;
  location?: string;
  location_text?: string;
  address?: string;
  victims?: number;
  latitude?: number;
  longitude?: number;
  location_source?: 'caller_statement' | 'network' | 'gps' | string;
  location_precision?: 'exact' | 'approximate' | 'unavailable' | string;
  accuracy?: number;
  geocode?: Geocode;
  formattedAddress?: string;
  phone: string;
  priority: PrioritesKeys;
  live: boolean;
  status: StatusesKeys;
  transcript?: string;
  dateCreated: string;
  timestamp?: string;
  dateDisconnected?: string;
  dateProcessed?: string;
  dateResolved?: string;
  source?: 'twilio' | 'upload' | 'demo' | 'seed_demo' | string;
  audioDuration?: number;
  recordingUrl?: string;
  recordingSid?: string;
  recordingDuration?: number;
  // AI Analysis fields
  confidence?: number;
  classificationScores?: Record<string, number>;
  entities?: StructuredEntities;
  processingStatus?: 'streaming' | 'processing' | 'analyzing' | 'completed' | string;
  // Caller location fields (legacy fallback)
  callerLocation?: CallerLocation;
};
