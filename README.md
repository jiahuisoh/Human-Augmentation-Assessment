# T8-Project

Frontend and computer-vision service for the HANA functional health platform.
The app has five roles (client, staff, clinician, developer, administrator) and
each one gets its own dashboard.

For now the frontend runs on a mock backend, so you can click through everything
without setting up a database or a server. Backend TBC

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

Powershell (works for me)

```
git clone <repo-url>
cd <repo-folder>\frontend
npm install
npm run dev
```

You only need to run `npm install` once to download the libraries the project depends on.

Vite will print a local URL, usually http://localhost:4500. Open that in your browser
and log in with the test account shared in the group chat. You will land on that
role's dashboard.

If port 4500 happens to be busy, Vite picks the next free port, so check the URL it
prints rather than assuming 4500.

## Running the CV service (optional)

This is what powers the live camera assessment. Make sure Docker Desktop is open first,
then from the project root:

```
docker compose up cv-service
```

The first build takes a couple of minutes because it downloads the pose-detection
models. Once it says it is running, go back to the frontend and try a video
assessment. Without it, everything except the live camera still works.

## Project layout

```
frontend/      the React app (TypeScript and Vite)
cv-service/    the Python pose-detection service
backend/       placeholder, still to be decided
```

## If something breaks

- "npm not recognized": Node is not on your PATH. Reinstall Node with the PATH option
  ticked, then restart VS Code.
- Blank page or stale data: hard refresh with Ctrl+Shift+R.
- Camera will not start: close anything else using your webcam (Zoom, Teams, OBS) and
  make sure the CV service is running.
