🩺 HANA — Functional Health Assessment Platform

A full-stack platform for running and managing SPPB-style functional health assessments — chair stand, back scratch, and sit-and-reach — powered by real-time computer vision.

📋 Contents
Overview
Requirements
Quick Start — Frontend Only
Full Setup
1 · Clone the repo
2 · Set up MongoDB Atlas
3 · Configure environment variables
4 · Run the backend
5 · Run the frontend
6 · Run the CV service
Test Accounts
Project Layout
How the Services Talk to Each Other
Troubleshooting
🔎 Overview

HANA has three parts that run together:

Service	Tech	What it does
frontend/	React + TypeScript + Vite	The app everyone interacts with
backend/	Node.js + Express + MongoDB	The API, auth, and database
cv-service/	Python + FastAPI + MediaPipe	Live camera pose-detection for assessments

There are five user roles — Client, Staff, Clinician, Developer, Administrator — each with its own dashboard and permissions.

Just want to look around the UI? Jump to Quick Start — no database or Docker required.

Want the real thing — persistent data, live camera tests, proper roles? Follow Full Setup.

🛠 Requirements
Tool	Why	Get it from
Node.js 18+	Runs the frontend and backend	nodejs.org — LTS build
npm	Installs project dependencies	bundled with Node.js
Git	Clones the repository	git-scm.com
MongoDB Atlas account (free)	Cloud database for the backend	mongodb.com/cloud/atlas
Docker Desktop (optional)	Runs the CV service	docker.com — only needed for live camera assessments

Installing Node.js:

Go to nodejs.org and download the LTS version (not "Current").
Run the installer and click through it — leave "Add to PATH" ticked (it's on by default).
Fully close and reopen VS Code (not just the terminal) so it picks up the new PATH.
Confirm it worked:
powershell
   node --version

You should see something like v20.11.0. If you get 'node' is not recognized, close VS Code completely, reopen it, and try again. Still stuck? Restart your computer.

🚀 Quick Start — Frontend Only

Run the UI on its own using a built-in mock API — no backend, no database, no Docker.

powershell
git clone <repo-url>
cd <repo-folder>/frontend
npm install
npm run dev

Open the URL Vite prints (usually http://localhost:4500) and log in with a test account.

⚠️ This uses fake, hard-coded data. Nothing you do here is saved anywhere. For the real backend and database, continue to Full Setup below.

🏗 Full Setup

The complete setup — real database, enforced roles, and working live camera assessments.

1 · Clone the repo
powershell
git clone <repo-url>
cd <repo-folder>

You should now see three folders: frontend/, backend/, and cv-service/.

2 · Set up MongoDB Atlas

The backend needs a database to store users and assessment results. We use MongoDB Atlas — free, cloud-hosted, no local install needed.

Step	What to do
1	Create a free account at mongodb.com/cloud/atlas
2	Create a new Project, then a free M0 Cluster inside it
3	Sidebar → Security → Database Access → Add New Database User. Set a username & password (write these down) and grant Read and write to any database
4	Sidebar → Security → Network Access → Add IP Address → Allow Access From Anywhere (0.0.0.0/0) — fine for development, never for production
5	Database → Connect → Drivers → copy the connection string
6	Swap in your username, password, and a database name (e.g. hana) before the ?

Your final connection string should look like:

mongodb+srv://<username>:<password>@yourcluster.xxxxx.mongodb.net/hana?appName=yourcluster

Keep this handy — you'll paste it into backend/.env next.

🌐 Switching networks? Atlas only accepts whitelisted IPs. If the backend suddenly can't connect after changing WiFi (home → school → hotspot), add the new IP under Network Access, or just leave 0.0.0.0/0 enabled while developing. Some mobile hotspots block MongoDB's ports entirely — try a different network before assuming something's broken.

3 · Configure environment variables

Environment variables hold secrets that should never be committed to Git. Copy each .env.example to a real .env and fill it in.

Root .env (same folder as docker-compose.yml)

powershell
copy .env.example .env
dotenv
CV_SIGNING_SECRET=<generate below — must match backend/.env exactly>

This secret is shared between the backend and CV service. It cryptographically signs assessment results so a browser can never fake or tamper with a score.

Generate a secure value:

powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

backend/.env

powershell
cd backend
copy .env.example .env
dotenv
MONGO_URI=<your Atlas connection string from step 2>
JWT_SECRET=<any long random string>
PORT=4502
CLIENT_URL=http://localhost:4500
CV_SIGNING_SECRET=<the SAME value as the root .env>

Generate JWT_SECRET the same way as above.

frontend/.env

powershell
cd ../frontend
copy .env.example .env
dotenv
VITE_API_URL=http://localhost:4502
VITE_USE_MOCK_API=false

⚠️ This is the step people forget. VITE_USE_MOCK_API=false tells the frontend to talk to your real backend instead of fake data. Leave it as true (or unset) and the app looks like it's working — but nothing is ever actually saved.

🔒 Every .env file is in .gitignore and should never be committed — they contain your database password and secret keys. If git status ever shows a .env file staged, do not commit it.

4 · Run the backend
powershell
cd backend
npm install
npm run dev

Expected output:

HANA backend running on http://localhost:4502
MongoDB connected

❌ Seeing MongoDB connection error instead? See Troubleshooting.

Keep this terminal running — open a new terminal window for the next step.

5 · Run the frontend
powershell
cd frontend
npm install
npm run dev

Open the URL Vite prints (usually http://localhost:4500) and log in with a test account. Port taken? Vite auto-picks the next free one — check the printed URL rather than assuming 4500.

🕵️ Sanity check: open the browser console (F12). If you see Using LOCAL MOCK backend, then VITE_USE_MOCK_API is still true — fix frontend/.env, save it, then fully restart the dev server (Ctrl+C → npm run dev).

6 · Run the CV service

Powers the live camera assessment. Everything else works without it.

Make sure Docker Desktop is open, then from the project root (not inside backend/ or frontend/):

powershell
docker compose up cv-service

The first build takes a few minutes while it downloads the pose-detection models. Once it's running, go back to the frontend, log in as a client or clinician, and start a live assessment.

No Docker? The CV service can also be run manually with Python — ask a teammate for the setup steps.

👤 Test Accounts
Role	What they can do
🧑 Client	View own results, complete self-assessments, manage data consent
🧑‍💼 Staff	View daily schedule, verify client identity, mark attendance — no clinical data
🩺 Clinician	Manage assigned clients' assessments, care plans, and schedules
💻 Developer	View system health, run sandbox assessments, view redacted logs
🛡 Administrator	Full access — manage all users, all data, system configuration

Passwords are shared separately in the group chat for security — not stored in this README.

📁 Project Layout
frontend/               React app (TypeScript + Vite)
├── src/pages/             one folder per role
├── src/cv/                camera capture + CV service client
└── src/utils/api.ts       talks to the backend

backend/                Node.js + Express API
├── src/routes/            API endpoint definitions
├── src/controllers/       validates input, calls services
├── src/services/          business logic + database queries
├── src/models/            MongoDB schemas (Mongoose)
└── src/middleware/        auth, rate limiting, security headers

cv-service/             Python + FastAPI pose-detection
├── app/cv/                MediaPipe pose & hand landmark detection
└── app/tests/             per-test scoring logic

docker-compose.yml      runs the CV service in a container
🔗 How the Services Talk to Each Other
   Browser (frontend, :4500)
            │
            │  REST API calls (login, fetch results, ...)
            ▼
   Backend (Node.js, :4502)  ────────────  MongoDB Atlas (cloud)
            │
            │  signed grant token (age / sex / height)
            ▼
   CV Service (Python, Docker)
            │
            │  signed outcome token (test results)
            ▼
   Backend verifies signature → saves to MongoDB

The frontend never talks to the database or CV service directly for anything that matters — the backend verifies every request and result before storing it. This is exactly why both CV_SIGNING_SECRET values must match: it's the shared key proving a result genuinely came from the CV service, not a faked value from the browser.

🩹 Troubleshooting

"npm is not recognized" / "node is not recognized"

Node.js isn't on your PATH. Reinstall with "Add to PATH" ticked, then fully close and reopen VS Code (not just the terminal). Still broken? Restart your computer.

MongoDB won't connect

MongoDB connection error: querySrv ECONNREFUSED ...

Check, in order:

IP not whitelisted → Atlas → Network Access → Add IP Address → Allow Access From Anywhere
Network blocks MongoDB's ports → common on mobile hotspots, try different WiFi
Cluster is paused → Atlas → Database → click Resume
MONGO_URI is wrong → double-check username, password, cluster address, and database name in backend/.env

Backend crashes immediately: "refusing to start"

FATAL: JWT_SECRET is not set - refusing to start.
FATAL: CV_SIGNING_SECRET is not set - refusing to start.

A required secret is missing from backend/.env. Revisit step 3, fill in both values, and restart the backend.

The app "works" but nothing I do is saved

Open the browser console (F12). If it says Using LOCAL MOCK backend, the frontend is in mock mode. Set VITE_USE_MOCK_API=false in frontend/.env, save, then fully restart the dev server — a hot reload isn't enough, env vars only load on startup.

Blank page or stale-looking data

Hard refresh with Ctrl+Shift+R.

Camera won't start / CV service errors

Docker Desktop must be open before running docker compose up cv-service
Close any other app using your webcam (Zoom, Teams, OBS) — only one app can access it at a time
Confirm the container is running: docker ps
Confirm CV_SIGNING_SECRET is identical in the root .env and backend/.env — a mismatch fails signature verification

Port already in use

Close whatever else is using it, or just let the tool auto-pick the next free port — check the terminal's actual printed URL.

"Access denied" / "403 Forbidden" while logged in

You're likely using the wrong role's account for the action you're trying. Check Test Accounts for what each role can do.
