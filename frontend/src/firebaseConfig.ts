import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCvco7fC8XnCjXGir_bY_QKXVrn7qdZglU',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'assemblyai-hackathon.firebaseapp.com',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://assemblyai-hackathon-default-rtdb.firebaseio.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'assemblyai-hackathon',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'assemblyai-hackathon.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '675472088767',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:675472088767:web:07f34df7eb2a635ebb300a',
};

export const app = initializeApp(firebaseConfig);

export const db = getDatabase(app);

export const auth = getAuth(app);
