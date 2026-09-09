# RAKSHA112 — AI-Powered Emergency Response Support System (ERSS-112) Simulation

> [!WARNING]
> ### ⚠️ ACADEMIC PROJECT DEMO DISCLAIMER — NOT FOR REAL EMERGENCY USE
> **RAKSHA112 is strictly an academic college demonstration and proof-of-concept simulation.**
> It is **NOT** connected to India's real Emergency Response Support System (ERSS-112), state police control rooms, fire services, or ambulance networks. 
> 
> **In a real emergency in India, always dial 112 directly from your phone (or legacy numbers 100 for Police, 101 for Fire, 108/102 for Ambulance).**

---

## 📌 Project Overview

In high-stress emergency situations, dispatch centers often face temporary caller spikes, line congestion, or operator unavailability. 

**RAKSHA112** demonstrates an intelligent triage and transcription pipeline designed around the conceptual framework of India's **112 ERSS**. When dispatchers are occupied:
1. An automated AI voice assistant answers the inbound call on a dedicated demo line.
2. The caller's voice is streamed over WebSockets and transcribed in real time.
3. Natural Language Processing (NLP) models specialized for Indian contexts extract the caller's **name** and **Indian location** (`ai4bharat/IndicNER`).
4. A multilingual zero-shot classifier (`MoritzLaurer/mDeBERTa-v3-base-mnli-xnli`) categorizes the incident into emergency categories (*Medical*, *Fire*, *Traffic Accident*, *Crime in Progress*, *Other*).
5. The caller's Indian address is geocoded onto an interactive dispatcher map (`region=in`), while the live transcript and severity rating (*HIGH*, *MEDIUM*, *LOW*) are synchronized instantly with the dispatcher dashboard via Firebase Realtime Database.

---

## 🇮🇳 ERSS-112 Context & Framing

* **Unified Emergency Line (112):** India's nationwide single emergency number launched under the Emergency Response Support System (ERSS) initiative to integrate police, fire, health, and disaster management services.
* **Legacy Numbers:** Traditional numbers (**100** - Police, **101** - Fire, **108** - Ambulance) automatically route into the ERSS ecosystem.
* **Demo Line Notice:** For this academic demonstration, callers dial a dedicated **Twilio Trial Simulation Number** (never the real 112).

---

## 🏗️ System Architecture & Access Flow

```
                                  +----------------------------+
                                  |  Caller (Mobile Phone)     |
                                  +--------------+-------------+
                                                 | (Voice Call)
                                                 v
                                  +----------------------------+
                                  | Twilio Voice Webhook       |
                                  +--------------+-------------+
                                                 | (TwiML Stream / MuLaw 8kHz)
                                                 v
                                  +----------------------------+
                                  | RAKSHA112 Backend (Node.js)|
                                  +-------+--------------+-----+
                                          |              |
                    (WebSocket Audio)     |              | (HTTP Inference API)
                                          v              v
               +-----------------------------+   +-------------------------------------+
               | AssemblyAI Real-Time STT    |   | Hugging Face Models:                |
               | (8000Hz Speech-to-Text)     |   | • ai4bharat/IndicNER (Entity Extr.) |
               +-----------------------------+   | • mDeBERTa-v3 (Classification)      |
                                                 +------------------+------------------+
                                                                    |
                                                                    v
                                                 +-------------------------------------+
                                                 | Google Maps Geocoding API (India)   |
                                                 +------------------+------------------+
                                                                    |
                                                                    v
                                                 +-------------------------------------+
                                                 | Firebase Realtime Database (/calls) |
                                                 | (Protected: auth != null for read)  |
                                                 +------------------+------------------+
                                                                    |
                                                                    v
                             +-------------------------------------------------------------+
                             | Frontend Routing & Access Control Flow:                     |
                             |                                                             |
                             |  [ Public Landing ]  ──>  [ Operator Login ] ──>  [ Dashboard ]
                             |        (/)                    (/login)              (/dashboard)
                             |  (System Overview)       (Firebase Auth)         (Protected Feed)
                             +-------------------------------------------------------------+
```

---

## 🗣️ Sample Test Scripts for Live Demos

When demonstrating RAKSHA112 by calling the simulation line, use these realistic Indian test scenarios to show the automated extraction of Indian names, landmarks, addresses, and emergency classifications:

### Scenario 1: Medical Emergency (Priority: HIGH)
* **Caller Name:** Rajesh Sharma
* **Location:** Connaught Place, Inner Circle, New Delhi 110001
* **Spoken Script:** 
  > *"Hello, my name is Rajesh Sharma. I am calling from Connaught Place, Inner Circle in New Delhi. My colleague suddenly collapsed and is complaining of severe chest pain and breathlessness. We need an ambulance immediately!"*
* **Expected Extraction:** 
  * Name: `Rajesh Sharma`
  * Location: `Connaught Place, New Delhi`
  * Emergency: `Medical Emergency` | Priority: `HIGH`

### Scenario 2: Fire Emergency (Priority: HIGH)
* **Caller Name:** Sunita Verma
* **Location:** Sector 18, Atta Market, Noida, Uttar Pradesh 201301
* **Spoken Script:** 
  > *"Please help, this is Sunita Verma at Atta Market, Sector 18 Noida. A commercial LPG gas cylinder caught fire in a restaurant kitchen and thick black smoke is spreading rapidly. Send fire engines!"*
* **Expected Extraction:** 
  * Name: `Sunita Verma`
  * Location: `Sector 18 Noida`
  * Emergency: `Fire Emergency` | Priority: `HIGH`

### Scenario 3: Traffic Accident (Priority: MEDIUM / HIGH)
* **Caller Name:** Amit Patel
* **Location:** MG Road near Trinity Circle, Bengaluru, Karnataka 560001
* **Spoken Script:** 
  > *"My name is Amit Patel. There has been a major traffic accident on MG Road near Trinity Circle in Bengaluru. A two-wheeler collided with a car, and one rider has leg injuries on the road."*
* **Expected Extraction:** 
  * Name: `Amit Patel`
  * Location: `MG Road, Bengaluru`
  * Emergency: `Traffic Accident` | Priority: `MEDIUM`

### Scenario 4: Crime in Progress / Theft (Priority: HIGH)
* **Caller Name:** Vikram Singh
* **Location:** Marine Drive near Churchgate Station, Mumbai, Maharashtra 400020
* **Spoken Script:** 
  > *"This is Vikram Singh reporting from Marine Drive near Churchgate station in Mumbai. Two armed individuals just broke into a jewelry shop with weapons and are attempting a robbery. We need police right now!"*
* **Expected Extraction:** 
  * Name: `Vikram Singh`
  * Location: `Marine Drive, Mumbai`
  * Emergency: `Crime In Progress` | Priority: `HIGH`

### Scenario 5: Public Hazard / Other (Priority: LOW / MEDIUM)
* **Caller Name:** Ananya Roy
* **Location:** Park Street near Camac Street, Kolkata, West Bengal 700016
* **Spoken Script:** 
  > *"Hello, my name is Ananya Roy calling from Park Street Kolkata. A heavy tree branch fell and snapped a high voltage power cable onto the road, blocking traffic."*
* **Expected Extraction:** 
  * Name: `Ananya Roy`
  * Location: `Park Street, Kolkata`
  * Emergency: `Other Emergency` | Priority: `LOW`

---

## ⚙️ Quickstart & Local Setup

For complete step-by-step instructions on creating API accounts (AssemblyAI, Hugging Face, Google Maps, Firebase, and Twilio), refer to [ACCOUNT_SETUP.md](ACCOUNT_SETUP.md).

### 1. Backend Setup
```bash
cd backend
cp .env.example .env
# Fill in your API keys in backend/.env:
# ASSEMBLYAI_API_KEY, MAPS_API_KEY, HUGGINGFACE_API_KEY

npm install
npm start
```
*Backend runs on port `8080`.*

### 2. Frontend Setup
```bash
cd frontend
cp .env.example .env
# Fill in your variables in frontend/.env:
# VITE_DEMO_PHONE_NUMBER, VITE_GOOGLE_API_KEY

npm install
npm run dev
```
*Frontend runs on `http://localhost:5173`.*

> [!NOTE]
> **Three-Stage Operator Flow:**
> * Visiting `http://localhost:5173` lands on the **Public Landing Page (`/`)**.
> * Click **"Operator Sign In"** to reach the **Authentication Gate (`/login`)**.
> * The **Dispatcher Dashboard (`/dashboard`)** is protected by Firebase Authentication and requires valid operator credentials.

### 3. Operator Access & Authentication
* Operator accounts are provisioned via the [Firebase Console](https://console.firebase.google.com/) under **Authentication > Users > Add user**.
* For evaluation/demo access, contact the repository administrator or refer to private evaluation credentials. Real credentials are never committed to source control.
* **Database Security Rules:** Read access on `/calls` requires active authentication (`auth != null`), as specified in `firebase.rules.json`.

### 4. Exposing Webhook for Twilio (For Live Phone Calls)
Twilio requires a public HTTPS/WSS URL to route phone calls to your local development machine. Use **ngrok** or **localtunnel**:
```bash
ngrok http 8080
```
In the **Twilio Console** (Phone Numbers > Manage > Active Numbers):
* Set **A Call Comes In** webhook to: `https://<YOUR-NGROK-SUBDOMAIN>.ngrok-free.app/` (HTTP POST).

---

## 🎙️ Recorded-Audio Fallback Intake (Demo Mode)

For situations where dialing a live phone number or setting up an ngrok tunnel is inconvenient (e.g. hackathon judging, evaluator demos, Twilio trial number restrictions), RAKSHA112 provides an **asynchronous recorded audio fallback pipeline**.

### Features:
* **Formats Supported:** `.wav`, `.mp3`, `.m4a`, `.ogg` (Max size: 15MB, Max duration: 5 minutes).
* **Early Duration & Format Guard:** Validated instantly on buffer via `music-metadata` before calling external APIs.
* **Async Job Architecture:** Returns `202 Accepted` immediately with a `jobId`, allowing non-blocking polling via `GET /api/calls/upload-status/:jobId`.
* **Identical NLP Pipeline:** Uses AssemblyAI async transcription (`/v2/upload` + `/v2/transcript`), followed by `ai4bharat/IndicNER` name/location extraction, `mDeBERTa` zero-shot emergency classification, Google Maps India geocoding, and Firebase RTDB synchronization tagged with `source: "upload"`.

### API Usage Example (cURL):

```bash
# 1. Upload audio file and start async triage job
curl -X POST http://localhost:8080/api/calls/upload-audio \
  -F "audio=@scenario1_medical_emergency.wav" \
  -F "callerLabel=Rajesh Sharma (Connaught Place)"

# Response (202 Accepted):
# {
#   "success": true,
#   "jobId": "job_1788174606627_o8tn95",
#   "callSid": "upload_1788174606627_24vte8",
#   "status": "queued",
#   "message": "Recorded audio accepted and queued for transcription and triage."
# }

# 2. Check processing status
curl http://localhost:8080/api/calls/upload-status/job_1788174606627_o8tn95
```

### Web UI Fallback:
1. Open the dispatcher dashboard at `http://localhost:5173`.
2. Click **"Upload Recorded Call (Demo Fallback)"** in the top navigation or dashboard header.
3. Select an audio file, review the sample scenario script if desired, and click **"Upload & Triage"**.
4. Watch the live multi-stage progress indicator (*Uploading → Transcribing → AI Triage & Geocoding → Synchronized*). The call will instantly appear in the live feed marked with a `Recorded Demo` badge.

