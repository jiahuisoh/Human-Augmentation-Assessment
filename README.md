# T8-Project

Frontend and computer-vision service for the HANA functional health platform.
The app has five roles (client, staff, clinician, developer, administrator) and
each one gets its own dashboard.

For now the frontend runs on a mock backend, so you can click through everything
without setting up a database or a server. Backend TBC.

Live camera assessments (chair stand, back scratch, **sit & reach**) run through
the Python CV service over WebSocket.

## Requirements

- Node.js 18 or newer. Get the LTS build from https://nodejs.org and click through
  the installer, leaving the "add to PATH" box ticked. Restart VS Code afterwards so
  the terminal picks up the change.
- Docker Desktop, but only if you want the live camera assessment to work. Everything
  else runs fine without it.

To check Node is set up, open a terminal and run `node --version`. If it prints a
version number you are good to go. If you get "npm is not recognized", close VS Code
completely, reopen it, and try again.

## Running the frontend

Powershell:

```
git clone <repo-url>
cd <repo-folder>\frontend
npm install
npm run dev
```

You only need to run `npm install` once to download the libraries the project depends on.

Vite will print a local URL, usually http://localhost:4500. Open that in your browser
and log in with a mock account (password for all is `password`):

| Role | Email |
|------|-------|
| Client | `client@hana.sg` |
| Staff | `staff@hana.sg` |
| Clinician | `clinician@hana.sg` |
| Developer | `developer@hana.sg` |
| Administrator | `admin@hana.sg` |

If port 4500 happens to be busy, Vite picks the next free port, so check the URL it
prints rather than assuming 4500.

## Running the CV service (optional)

This is what powers the live camera assessment. Make sure **Docker Desktop is open**
first, then from the project root:

```
docker compose up --build cv-service
```

The first build takes a couple of minutes because it downloads the pose-detection
models. Once it is running it listens on **port 4501** (API docs:
http://localhost:4501/docs).

Without Docker / the CV service, everything except the live camera still works.

### Try a live Sit & Reach (developer)

1. Start frontend + CV service (above).
2. Log in as `developer@hana.sg` / `password`.
3. Open **CV Sandbox** → **sit reach**.
4. Choose **Chair** (one leg) or **Floor** (both legs), then **At home** or **At clinic**.
5. Sit sideways to the camera per the prompt. Reach toward your toes and hold
   ~3 seconds for an official score (− short of toes, 0 at toes, + past).

Official scores only count when leg form is valid.

Clinician / administrator assessment flows also launch the same Test Runner
(default environment: clinic).

## Offline validation (optional)

For MAE pilots and SynthDa / recorded clips (no live WebSocket), see:

- `cv-service/tools/README.md` — single-clip and batch validators
- `cv-service/validation/PROTOCOL.md` — ground-truth / MAE pilot protocol
- `cv-service/validation/videos/sit_reach/` — drop videos here (`.mp4` / `.webm` are gitignored)

Example (PowerShell, short clips may need shorter calib/countdown):

```
cd cv-service\tools
.\validate_one_clip.ps1 -Video "..\validation\videos\sit_reach\sr-p01.webm" -ExpectedReachCm 12.5
```

## Project layout

```
frontend/      the React app (TypeScript and Vite)
cv-service/    the Python pose-detection service + validation tools
backend/       placeholder, still to be decided
```

## If something breaks

- "npm not recognized": Node is not on your PATH. Reinstall Node with the PATH option
  ticked, then restart VS Code.
- Blank page or stale data: hard refresh with Ctrl+Shift+R.
- Camera will not start: close anything else using your webcam (Zoom, Teams, OBS) and
  make sure the CV service is running.
- `dockerDesktopLinuxEngine` / pipe error: Docker Desktop is not running yet — open it
  and wait until it says it is ready, then retry `docker compose up`.
- WebSocket / CV connection error: confirm http://localhost:4501/docs loads and that
  the frontend is still on port 4500 (CORS is set for that origin).
