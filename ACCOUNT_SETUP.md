# API & Service Account Setup Guide

This guide walks you through setting up all required third-party services and obtaining the necessary API keys to run **RAKSHA112** locally or in production.

---

## 1. AssemblyAI (Speech-to-Text)

Used for real-time WebSocket streaming audio transcription and asynchronous recorded audio batch transcription.

1. Create a free account at [assemblyai.com](https://www.assemblyai.com/).
2. Navigate to your [AssemblyAI Dashboard](https://www.assemblyai.com/app).
3. Copy your **API Token** from the dashboard.
4. Set in `backend/.env`:
   ```env
   ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here
   ```

---

## 2. Google Maps Platform (Geocoding & Maps)

Used for geocoding Indian locations from transcripts and displaying the dispatcher incident map.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new Google Cloud Project (or select an existing one).
3. Under **APIs & Services > Library**, enable the following APIs:
   - **Geocoding API**
   - **Maps JavaScript API**
   - **Maps Static API**
4. Navigate to **APIs & Services > Credentials** and click **Create Credentials > API key**.
5. (Recommended) Restrict the API key by API and HTTP referrer for production security.
6. Set in `backend/.env` and `frontend/.env`:
   ```env
   # backend/.env
   MAPS_API_KEY=your_google_maps_api_key_here

   # frontend/.env
   VITE_GOOGLE_API_KEY=your_google_maps_api_key_here
   ```

---

## 3. Hugging Face (Indic NER & Emergency Classification)

Used for `ai4bharat/IndicNER` (Indian entity extraction) and `mDeBERTa-v3` (zero-shot classification).

1. Create a free account at [huggingface.co](https://huggingface.co/).
2. Go to **Settings > Access Tokens** (`https://huggingface.co/settings/tokens`).
3. Click **New token**, name it (e.g. `raksha112`), and select the **Read** role.
4. Set in `backend/.env`:
   ```env
   HUGGINGFACE_API_KEY=your_huggingface_read_token_here
   ```

---

## 4. Firebase (Realtime Database & Authentication)

Used for storing call queue records, live synchronization, and operator authentication.

1. Go to the [Firebase Console](https://console.firebase.google.com/) and click **Add Project**.
2. Enable **Authentication** and activate the **Email/Password** sign-in method under Sign-in providers.
3. Add an initial dispatcher user under **Authentication > Users > Add user**.
4. Enable **Realtime Database** (choose a region such as `asia-southeast1` or `us-central1`).
5. Set Database Rules from `firebase.rules.json`:
   ```json
   {
     "rules": {
       "calls": {
         ".read": "auth != null",
         ".write": true
       }
     }
   }
   ```
6. Go to **Project Settings > General > Your apps** and register a Web app to get your Firebase configuration object.
7. (Optional) Set custom Firebase parameters in `backend/.env` and `frontend/.env` if not using default configurations.

---

## 5. Twilio (Live Voice Streaming — Optional for Phone Demos)

Used for live phone calls via Twilio Media Streams (8kHz μ-law WebSocket audio).

1. Sign up for a [Twilio](https://www.twilio.com/) account and obtain a trial phone number.
2. In the Twilio Console under **Phone Numbers > Manage > Active Numbers**:
   - Set **A Call Comes In** webhook to: `https://<YOUR-NGROK-SUBDOMAIN>.ngrok-free.app/` (HTTP POST).
3. Set the demo phone number in `frontend/.env`:
   ```env
   VITE_DEMO_PHONE_NUMBER=+1 (Your Twilio Demo Number)
   ```
4. Start your backend and run `ngrok http 8080` to bridge incoming calls.

> **Note:** If you do not wish to set up Twilio or ngrok, you can use the built-in **Recorded Audio Fallback Intake** in the Web UI to upload `.wav` or `.mp3` scenario recordings directly.
