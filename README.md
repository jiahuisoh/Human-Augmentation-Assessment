# HANA — Functional Health Assessment Platform

A full-stack platform for running and managing SPPB-style functional health assessments — chair stand, back scratch, and sit-and-reach — powered by real-time computer vision.

---

## Contents

- [Overview](#overview)
- [Requirements](#requirements)
- [Quick Start (Frontend Only)](#quick-start-frontend-only)
- [Full Setup](#full-setup)
  - [1. Clone the repository](#1-clone-the-repository)
  - [2. Set up MongoDB Atlas](#2-set-up-mongodb-atlas)
  - [3. Configure environment variables](#3-configure-environment-variables)
  - [4. Run the backend](#4-run-the-backend)
  - [5. Run the frontend](#5-run-the-frontend)
  - [6. Run the CV service](#6-run-the-cv-service)
- [Test Accounts](#test-accounts)
- [Project Layout](#project-layout)
- [System Architecture](#system-architecture)
- [Troubleshooting](#troubleshooting)

---

## Overview

HANA consists of three services that run together:

| Service | Technology | Purpose |
|---|---|---|
| `frontend/` | React, TypeScript, Vite | User-facing application |
| `backend/` | Node.js, Express, MongoDB | API, authentication, and database |
| `cv-service/` | Python, FastAPI, MediaPipe | Live camera pose detection for assessments |

The platform supports five user roles — Client, Staff, Clinician, Developer, and Administrator — each with a dedicated dashboard and permission set.

The frontend can run on its own using a built-in mock API for UI review (see [Quick Start](#quick-start-frontend-only)), or the full stack can be run for persistent data, live camera assessments, and enforced roles (see [Full Setup](#full-setup)).

---

## Requirements

| Tool | Purpose | Source |
|---|---|---|
| Node.js 18+ | Runs the frontend and backend | [nodejs.org](https://nodejs.org) — LTS build |
| npm | Installs project dependencies | Bundled with Node.js |
| Git | Clones the repository | [git-scm.com](https://git-scm.com/downloads) |
| MongoDB Atlas account (free) | Cloud database for the backend | [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas/register) |
| Docker Desktop (optional) | Runs the CV service | [docker.com](https://www.docker.com/products/docker-desktop/) — only required for live camera assessments |

**Installing Node.js**

1. Download the **LTS** version from [nodejs.org](https://nodejs.org).
2. Run the installer, keeping "Add to PATH" enabled (default).
3. Fully close and reopen VS Code so it picks up the updated PATH.
4. Verify the installation:
   ```powershell
   node --version
   ```
   Expected output: something like `v20.11.0`. If you see `'node' is not recognized`, close VS Code completely and reopen it, or restart your computer.

---

## Quick Start (Frontend Only)

Runs the UI on its own using a built-in mock API — no backend, database, or Docker required.

```powershell
git clone <repo-url>
cd <repo-folder>/frontend
npm install
npm run dev
```

Open the URL printed by Vite (typically `http://localhost:4500`) and log in with a [test account](#test-accounts).

This mode uses hard-coded mock data — nothing entered here is saved. For persistent data and full functionality, continue to [Full Setup](#full-setup).

---

## Full Setup

### 1. Clone the repository

```powershell
git clone <repo-url>
cd <repo-folder>
```

The repository contains three folders: `frontend/`, `backend/`, and `cv-service/`.

### 2. Set up MongoDB Atlas

The backend requires a database to store users and assessment results. MongoDB Atlas provides a free, cloud-hosted option with no local installation.

| Step | Action |
|---|---|
| 1 | Create a free account at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas/register) |
| 2 | Create a new Project, then a free M0 Cluster inside it |
| 3 | Under **Security → Database Access**, add a new database user with a username and password, and grant read/write access to any database |
| 4 | Under **Security → Network Access**, add the IP address `0.0.0.0/0` (allow access from anywhere) — suitable for development only |
| 5 | Under **Database → Connect → Drivers**, copy the connection string |
| 6 | Replace the username, password, and database name (e.g. `hana`) in the connection string |

The final connection string should look like:

```
mongodb+srv://<username>:<password>@yourcluster.xxxxx.mongodb.net/hana?appName=yourcluster
```

Keep this for the next step.

**Note:** Atlas only accepts whitelisted IP addresses. If the backend loses connection after switching networks (e.g. home to school WiFi), add the new IP under Network Access, or leave `0.0.0.0/0` enabled during development. Some mobile hotspots block MongoDB's connection ports entirely.

### 3. Configure environment variables

Environment variables store secrets that should never be committed to Git. Copy each `.env.example` file to `.env` and fill in the values.

**Root `.env`** (same directory as `docker-compose.yml`)

```powershell
copy .env.example .env
```

```dotenv
CV_SIGNING_SECRET=<generated value — must match backend/.env exactly>
```

This secret is shared between the backend and CV service. It cryptographically signs assessment results so they cannot be faked or altered from the browser.

Generate a secure value:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**`backend/.env`**

```powershell
cd backend
copy .env.example .env
```

```dotenv
MONGO_URI=<Atlas connection string from step 2>
JWT_SECRET=<any long random string>
PORT=4502
CLIENT_URL=http://localhost:4500
CV_SIGNING_SECRET=<same value as the root .env>
```

Generate `JWT_SECRET` using the same command as above.

**`frontend/.env`**

```powershell
cd ../frontend
copy .env.example .env
```

```dotenv
VITE_API_URL=http://localhost:4502
VITE_USE_MOCK_API=false
```

`VITE_USE_MOCK_API` must be set to `false` for the frontend to use the real backend instead of mock data. If left as `true` or unset, the app will appear to function but nothing will be saved.

Every `.env` file is listed in `.gitignore` and must never be committed — they contain database credentials and secret keys.

### 4. Run the backend

```powershell
cd backend
npm install
npm run dev
```

Expected output:
```
HANA backend running on http://localhost:4502
MongoDB connected
```

If you see a `MongoDB connection error`, see [Troubleshooting](#troubleshooting).

Keep this terminal running, and open a new terminal window for the next step.

### 5. Run the frontend

```powershell
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite (typically `http://localhost:4500`) and log in with a [test account](#test-accounts). If port 4500 is in use, Vite will select the next available port — check the printed URL.

To confirm the frontend is connected to the real backend, open the browser console (`F12`). If it logs `Using LOCAL MOCK backend`, then `VITE_USE_MOCK_API` is still set to `true` — update `frontend/.env` and restart the dev server.

### 6. Run the CV service

Powers live camera assessments. All other functionality works without it.

With Docker Desktop open, run the following from the project root (not from `backend/` or `frontend/`):

```powershell
docker compose up cv-service
```

The first build will take a few minutes while it downloads the pose-detection models. Once running, log in as a client or clinician to start a live assessment.

The CV service can also be run manually with Python without Docker — see a teammate for setup steps.

---

## Test Accounts

| Role | Capabilities |
|---|---|
| Client | View own results, complete self-assessments, manage data consent |
| Staff | View daily schedule, verify client identity, mark attendance — no access to clinical data |
| Clinician | Manage assigned clients' assessments, care plans, and schedules |
| Developer | View system health, run sandbox assessments, view redacted logs |
| Administrator | Full access — manage all users, all data, and system configuration |

Account passwords are shared separately and are not stored in this README.

---

## Project Layout

```
frontend/               React application (TypeScript + Vite)
├── src/pages/             One folder per user role
├── src/cv/                Camera capture and CV service client
└── src/utils/api.ts       Backend API client

backend/                Node.js + Express API
├── src/routes/            API endpoint definitions
├── src/controllers/       Input validation, calls services
├── src/services/          Business logic and database queries
├── src/models/            MongoDB schemas (Mongoose)
└── src/middleware/        Authentication, rate limiting, security headers

cv-service/             Python + FastAPI pose detection
├── app/cv/                MediaPipe pose and hand landmark detection
└── app/tests/             Per-test scoring logic

docker-compose.yml      Runs the CV service in a container
```

---

## System Architecture

```
Browser (frontend, :4500)
        │
        │  REST API calls (login, fetch results, ...)
        ▼
Backend (Node.js, :4502)  ────────────  MongoDB Atlas (cloud)
        │
        │  signed grant token (age, sex, height)
        ▼
CV Service (Python, Docker)
        │
        │  signed outcome token (test results)
        ▼
Backend verifies signature → saves to MongoDB
```

The frontend never communicates directly with the database or CV service for anything that affects stored data — the backend verifies every request and result before persisting it. This is why the `CV_SIGNING_SECRET` values must match exactly: it is the shared key that proves a result genuinely came from the CV service, not a value fabricated in the browser.

---

## Troubleshooting

**`npm` or `node` is not recognized**

Node.js is not on your PATH. Reinstall with "Add to PATH" enabled, then fully close and reopen VS Code. If the issue persists, restart your computer.

**MongoDB will not connect**

```
MongoDB connection error: querySrv ECONNREFUSED ...
```

Check the following, in order:
- IP not whitelisted — Atlas → Network Access → Add IP Address → Allow Access From Anywhere
- Network blocks MongoDB's ports — common on mobile hotspots; try a different network
- Cluster is paused — Atlas → Database → click Resume
- `MONGO_URI` is incorrect — verify username, password, cluster address, and database name in `backend/.env`

**Backend fails to start**

```
FATAL: JWT_SECRET is not set - refusing to start.
FATAL: CV_SIGNING_SECRET is not set - refusing to start.
```

A required secret is missing from `backend/.env`. Revisit [step 3](#3-configure-environment-variables) and ensure both values are set, then restart the backend.

**The app runs but nothing is saved**

Open the browser console (`F12`). If it logs `Using LOCAL MOCK backend`, the frontend is in mock mode. Set `VITE_USE_MOCK_API=false` in `frontend/.env`, save, and fully restart the dev server — environment variables are only loaded on startup.

**Blank page or stale data**

Hard refresh with `Ctrl+Shift+R`.

**Camera will not start / CV service errors**

- Docker Desktop must be open before running `docker compose up cv-service`
- Close any other application using the webcam (Zoom, Teams, OBS) — only one application can access it at a time
- Confirm the container is running: `docker ps`
- Confirm `CV_SIGNING_SECRET` is identical in the root `.env` and `backend/.env` — a mismatch will fail signature verification

**Port already in use**

Close whatever else is using the port, or allow the tool to auto-select the next available port — check the terminal's printed URL.

**"Access denied" or "403 Forbidden" while logged in**

The current account's role does not have permission for this action. See [Test Accounts](#test-accounts) for role capabilities.

---

