# HANA: Functional Health Assessment and Intervention Platform

Human Augmentation Neural Analytics (HANA) Functional Health Assessment & Intervention is a full-stack platform for conducting and managing functional health assessments, comprising of *chair stand*, *back scratch*, and *sit-and-reach* tests, scored from live computer vision pose estimation.

---

## Contents

- [Operating Context and Assumptions](#operating-context-and-assumptions)
- [Platform Overview](#platform-overview)
- [Client Verification Workflow](#client-verification-workflow)
- [Requirements](#requirements)
- [Setup](#setup)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. MongoDB Atlas](#2-mongodb-atlas)
  - [3. Configure Environment Variables](#3-configure-environment-variables)
  - [4. Run Backend](#4-run-backend)
  - [5. Run Frontend](#5-run-frontend)
  - [6. Run Computer Vision (CV) Service](#6-run-computer-vision-cv-service)
- [Creating User Accounts](#creating-user-accounts)
- [Running the Tests](#running-the-tests)
- [Project Layout](#project-layout)
- [System Architecture](#system-architecture)
- [Troubleshooting](#troubleshooting)
- [Known Limitations](#known-limitations)
- [Future Enhancements](#future-enhancements)

---

## Operating Context and Assumptions

### Deployment Setting

The platform is designed on the assumption that it is deployed within a physical care setting, specifically a physiotherapy clinic conducting functional health assessments, or an Active Ageing Centre (AAC) to enforce ***security*** of clinical data and in compliance with ***Human-in-the-Loop*** AI supervision.

Every client account is hence assumed to correspond to an individual who attends the premises in person. Assessment results are clinical records: they are attributed to a named individual, released to the clinician responsible for that individual's care, and used to inform intervention planning. The workflow implemented throughout the application follows from this assumption.

### Mandatory In-Person Identity Verification

Registration through the public sign-up page does not, by itself, grant access to the assessment functionality. A newly registered client is created with the status `unverified` and may sign in, but the computer vision assessment features remain *locked* until the account has been verified.

To complete verification, the client is required to attend the clinic or Active Ageing Centre in person and present their physical NRIC or FIN card. A member of staff sights the card and performs the identity check on the premises. An administrator then reviews the outcome and issues the final approval. Only at that point are the assessment features released to the account.

This requirement exists for the following reasons:

| Consideration | Rationale |
|---|---|
| Record Integrity | An assessment result is retained as a clinical record and attributed to a named individual. An unverified identity would place the accuracy of that attribution in question. |
| Clinical Accountability | Results are disclosed to the clinician responsible for the client's care and are used to inform intervention planning. The clinician must be able to rely on the identity of the subject. |
| Safety | The assessments involve physical exertion by older adults. Presentation at the premises establishes that the individual is known to the service before any assessment is undertaken. |
| Data Protection | The platform is designed around Singapore's Personal Data Protection Act (PDPA). Verifying identity in person, rather than accepting self-asserted identity online, limits the risk of health data being associated with the wrong individual. |

The full NRIC or FIN of the client is never retained in readable form. At registration it is stored solely as a bcrypt hash, together with the final four characters for masked display. The in-person check is performed by comparing the number sighted on the physical card against that hash.

### NRIC and FIN Checksum Validation

A Singapore NRIC or FIN is validated: its final letter is a check character derived from the seven digits before it. The platform verifies this at registration, so a mistyped or invented number is refused at the point of entry rather than surviving until the client presents themselves at the clinic and the in-person check fails for reasons nobody can explain.

The number must first match the shape `^[STFGM]\d{7}[A-Z]$`. Input is trimmed and upper-cased before checking, so spacing and lower-case entry are accepted.

The check character is then derived in three steps:

1. Multiply each of the seven digits by its positional weight: **9, 4, 5, 6, 7, 8, 9**.
2. Sum the products and take the remainder modulo 11. The result is a checksum from 0 to 10.
3. Look up that checksum in the row for the number's series letter. The letter found is the only valid suffix.

![Checksum to suffix table for the S, T, F and G NRIC and FIN series](assets/nric-suffix-table.png)

The implementation stores these rows verbatim, exactly as the reference table is printed, rather than the equivalent formulation that adds a per-series offset to a single alphabet. Each row already carries its own offset, so the table is applied directly and can be checked against the source by eye.

The table above covers the four original series. A fifth row is implemented for FINs issued from 2022 onwards, which follow the same scheme:

```
Checksum   0   1   2   3   4   5   6   7   8   9  10
M          T   U   W   X   K   L   J   N   P   Q   R
```

### Scope of This Implementation

The accompanying requirements document (`HANA CRM.docx`) specifies three functions: functional health assessment and intervention, tokenised incentives, and tokenised health records. **This repository implements and establishes the first function as a *core foundation*.** The consent event log and audit trail implemented here correspond to the governance principles described for the third function, with no blockchain, wallet, or tokenisation component currently present in this codebase yet.

---

## Platform Overview

The platform comprises three services, which are run together:

| Service | Responsibility |
|---|---|
| `frontend/` | User-facing application for all five roles |
| `backend/` | REST API, authentication, authorisation, persistence, audit |
| `cv-service/` | Real-time pose and hand landmark detection, test scoring |

### Tech Stack

| Layer | Technology | Intent |
|---|---|---|
| Frontend | React 18, TypeScript 5.5, Vite 5, Tailwind CSS 3.4 | One codebase serving five role dashboards. Build type-checks before it bundles (`tsc -b && vite build`), so if the API changes and the frontend is not updated to match, the build stops with an error instead of the mismatch reaching the screen. |
| Backend | Node.js 18+, Express 4, Mongoose 8 | Authorisation, persistence and audit are decided. The clinical verdict is re-derived here from the stored profile against the Rikli and Jones norm tables, never accepted from the browser. |
| Computer Vision | Python 3.11, FastAPI, Uvicorn, Pydantic, MediaPipe, OpenCV, NumPy | Landmark detection and per-test scoring run outside the browser, so a score cannot be produced or altered there. Frames travel over a WebSocket, which carries the continuing exchange that request and response cannot. |
| Database | MongoDB Atlas, accessed through the Mongoose ODM | One store for users, assessment sessions, intervention plans, consent events, schedule entries, measurements, questionnaires and the audit trail. Hosted, so no local database installation is required. |
| Security | JWT, bcrypt, HMAC-SHA256 grant and outcome tokens, Helmet, CORS, `express-rate-limit` | Token carries role, while verification and suspension are read from the database on every request, so a status change takes effect at once rather than when the token expires. Passwords and the full NRIC are kept only as bcrypt hashes, and the signed CV tokens prevent a subject or a score being edited in developer tools. No CSRF token is carried or required: session is sent as an `Authorization` header rather than a cookie, so a browser never attaches it to a cross-site request. |
| Container | Docker multi-stage build (`runtime` and `test` targets), Docker Compose | CV service's native dependencies are pinned into an image, so it behaves the same on any machine. |

Versions are the minimums declared in `frontend/package.json`, `backend/package.json` and `cv-service/pyproject.toml`.

### Roles

Access control is role-based, and is further restricted at user level by client assignment, in accordance with the access matrix in `HANA CRM.docx`.

| Role | Responsibilities |
|---|---|
| Client | Completes self-reported questionnaires and assessments, views own results in simplified form, manages consent |
| Staff | Views the daily schedule, performs in-person NRIC identity checks, records attendance. Holds no access to clinical data |
| Clinician | Manages assessments, intervention plans and scheduling for assigned clients only |
| Developer | Views system health and redacted operational logs, runs sandbox assessments. Holds no access to identifiable client data |
| Administrator | Manages all users, approves verification, holds full access and governance authority |

Two principles from the requirements document are enforced in code rather than by convention:

- **Least Privilege and User-Level Restriction.** A clinician can reach only the clients assigned to them. Staff are returned the outcome of an identity check and never the client record itself.
- **Auditability.** Sensitive actions are written to an append-only audit log with an actor, a timestamp and a reason. Score overrides and record deletions require a documented justification.

---

## Client Verification Workflow

A client account occupies one of four states. The state determines what the account may do.

| State | Definition | Permissions for Client |
|---|---|---|
| `unverified` | Registered, identity not yet checked | Sign in; view Home, Account and Help only |
| `pending` | Staff have performed the in-person check; awaiting administrator decision | As above |
| `verified` | Administrator has approved the account | Full client functionality, including CV assessments |
| `suspended` | Access withdrawn | Nothing. Sign-in is refused and existing sessions are terminated |

### Sequence

1. **Registration.** The client registers through the public sign-up page, supplying their NRIC or FIN. Self-registration always creates a client account; no other role can be obtained this way. The account begins as `unverified`.
2. **Attendance In Person.** The client attends the clinic or Active Ageing Centre with their physical National Registration Identity Card (NRIC) or FIN card.
3. **Staff Identity Check.** A member of staff enters the number sighted on the card. Backend compares it against the stored hash and records the outcome as a recommendation. The account moves to `pending`. **Staff cannot set an account to `verified`.** The separation of duties is deliberate.
4. **Administrator Approval.** An administrator reviews the recommendation and sets the final status. Approval moves the account to `verified`.
5. **Clinician Assignment.** Only a `verified` client may be assigned to a clinician. If a client later loses verified status, existing clinician assignments are removed automatically.

### What Verification Gates

Enforcement is applied on the server and is not merely a matter of interface presentation. The frontend hides the locked tabs, and backend independently rejects the underlying requests with HTTP 403 and the code `ACCOUNT_UNVERIFIED`:

| Endpoint | Purpose |
|---|---|
| `POST /api/sessions/cv-grant` | Requests the signed grant required to begin a CV assessment |
| `POST /api/sessions` | Saves an assessment result |
| `POST /api/questionnaires` | Submits a self-reported questionnaire |

---

## Requirements

| Tool | Purpose | Source |
|---|---|---|
| Node.js 18 or later | Runs Frontend and Backend | [nodejs.org](https://nodejs.org), LTS build |
| npm | Installs dependencies | Bundled with Node.js |
| Git | Clones the repository | [git-scm.com](https://git-scm.com/downloads) |
| MongoDB Atlas account (free tier) | Cloud database for Backend | [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas/register) |
| Docker Desktop | Runs the CV service | [docker.com](https://www.docker.com/products/docker-desktop/), required for camera assessments only |

**Installing Node.js**

1. Download the **LTS** release from [nodejs.org](https://nodejs.org).
2. Run the installer, leaving "Add to PATH" enabled (the default).
3. Close and Reopen VSCode completely so that it picks up the updated PATH.
4. Confirm the installation:
   ```powershell
   node --version
   ```
   The expected output resembles `v20.11.0`. If the response is `'node' is not recognized`, close VS Code entirely and reopen it, or restart the computer.

### Ports

| Port | Service | Configured In |
|---|---|---|
| 4500 | Frontend dev server | `frontend/vite.config.ts` |
| 4501 | CV service (mapped to container port 8000) | `docker-compose.yml` |
| 4502 | Backend API | `PORT` in `backend/.env` |

`strictPort` is disabled for the frontend, so Vite will select the next free port if 4500 is occupied. Always use the URL printed in the terminal.

---

## Setup

### 1. Clone the Repository

```powershell
git clone <repo-url>
cd <repo-folder>
```

The repository contains three service folders: `frontend/`, `backend/`, and `cv-service/`.

### 2. MongoDB Atlas

The backend requires a database in which to store users, assessments, plans, consent events and audit records. MongoDB Atlas provides a free, cloud-hosted instance requiring no local installation.

| Step | Action |
|---|---|
| 1 | Create a Free Account at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas/register) |
| 2 | Create a Project, then a free M0 cluster within it |
| 3 | Under **Security > Database Access**, add a database user with a username and password, granting read and write access to any database |
| 4 | Under **Security > Network Access**, add the IP address `0.0.0.0/0` (access from anywhere). This is suitable for development only |
| 5 | Under **Database > Connect > Drivers**, copy the connection string |
| 6 | Substitute the username, password and database name (for example `hana`) into the string |

The completed connection string takes the following form:

```
mongodb+srv://<username>:<password>@yourcluster.xxxxx.mongodb.net/hana?appName=yourcluster
```

Retain this value for the next step.

**Note**: Atlas accepts connections only from whitelisted IP addresses. If the backend loses its connection after a change of network (for example, from home to campus WiFi), add the new address under Network Access, or leave `0.0.0.0/0` enabled during development. **Note from UAT Testing**: Mobile hotspots may *block* MongoDB's connection ports at times.

### 3. Configure Environment Variables

Environment files hold credentials and must never be committed. Every `.env` file is listed in `.gitignore`. Copy each `.env.example` to `.env` and supply the values.

#### Repository Root `.env`

Located in the same directory as `docker-compose.yml`.

```powershell
copy .env.example .env
```

```dotenv
CV_SIGNING_SECRET=<generated value>
```

This file holds only the values shared by more than one service. It is read twice: Docker Compose loads it automatically because it sits beside `docker-compose.yml`, and `backend/src/server.js` loads it in addition to `backend/.env`.

**`CV_SIGNING_SECRET` belongs in this file only. Do not copy it into `backend/.env`.** Holding it in a single location removes any possibility of the two services disagreeing on its value.

Generate a value:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Each developer may use their own value. It must match between your own backend and your own CV service, and is not shared between machines.

#### `backend/.env`

```powershell
cd backend
copy .env.example .env
```

```dotenv
MONGO_URI=<Atlas connection string from step 2>
JWT_SECRET=<long random string, at least 32 characters>
PORT=4502
CLIENT_URL=http://localhost:4500
```

Generate `JWT_SECRET` with the command given above. The backend refuses to start if either `JWT_SECRET` or `CV_SIGNING_SECRET` is absent, on the grounds that a token signed with an empty secret would be forgeable.

#### `frontend/.env`

```powershell
cd ../frontend
copy .env.example .env
```

```dotenv
VITE_API_URL=http://localhost:4502
VITE_CV_WS_URL=ws://localhost:4501
```

Both variables fall back to these same defaults if unset, so the file is required only when a service runs on a non-default address. Vite reads environment variables at startup only: restart the dev server after any change.

### 4. Run Backend

```powershell
cd backend
npm install
npm run dev
```

The expected output is:

```
HANA backend running on http://localhost:4502
MongoDB connected
```

Should a `MongoDB connection error` appear, refer to [Troubleshooting](#troubleshooting). Leave this terminal running and open a new one for the following step.

### 5. Run Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite, ordinarily `http://localhost:4500`.

Frontend communicates with backend at all times; there is no offline or mock mode. If the backend is not running, sign-in reports that the server cannot be reached.

Additional scripts:

```powershell
npm run typecheck    # TypeScript only, no build output
npm run build        # Type-checks, then produces a production build in dist/
```

`noUnusedLocals` is enabled, so an unused import or variable will fail the build rather than pass unnoticed.

### 6. Run Computer Vision (CV) Service

The Computer Vision (CV) service powers the live camera assessments. Every other feature functions without it.

With Docker Desktop running, execute the following from the repository root, not from `backend/` or `frontend/`:

```powershell
docker compose up cv-service
```

The initial build takes several minutes, during which the MediaPipe pose and hand landmark models are downloaded into the image. The service listens on `http://localhost:4501` and exposes `GET /health`.

The service refuses to start if `CV_SIGNING_SECRET` is absent, since without it no result could be distinguished from one fabricated in the browser.

**Running outside Docker is not supported on Windows.** The model paths resolve to the absolute location `/models/`, which is created inside the container image. Running the service directly would require both `.task` model files to be present at that path. Docker is the supported method.

---

## Creating User Accounts

**The repository contains no seed script and no pre-existing accounts.** The database begins empty, and accounts must be created as follows.

### The First Administrator

Self-registration always produces a client account, and the endpoint for creating other roles is itself restricted to administrators. The first administrator must therefore be created by promoting a registered account:

1. Register an account through the sign-up page in the usual way. This creates a client.
2. In MongoDB Atlas, open **Browse Collections**, locate the document in the `users` collection, and change the `role` field from `client` to `administrator`.
3. Sign out and sign in again so that a token carrying the new role is issued.

Create the account through the application rather than inserting a document directly into Atlas. Password hashing is performed by a Mongoose pre-save hook, so a document inserted by hand would store an unhashed password and sign-in would fail.

An administrator promoted in this way retains the status `unverified`. This has no effect, because the verification requirement applies to client accounts only.

### Subsequent Accounts

Once an administrator exists, all remaining accounts are created from the Users tab of the administrator dashboard, which permits any of the five roles to be assigned. Client accounts may also self-register and then proceed through the [verification workflow](#client-verification-workflow).

To exercise the full assessment flow, the following are required at minimum: one administrator, one member of staff (to perform the identity check), one clinician (to be assigned the client), and one client.

---

## Running the Tests

### CV Service

The scoring, geometry and norm logic is covered by pytest.

```powershell
cd cv-service
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
pytest
```

**A note for Windows hosts.** MediaPipe loads OpenCV, whose DLL is blocked on some managed Windows installations by Application Control policy. The failure occurs during collection, not while running a test:

```
ImportError: DLL load failed while importing cv2:
An Application Control policy has blocked this file.
```

Eight of the test modules import OpenCV. Because pytest treats a collection error as fatal by default, the run is abandoned before any test executes, reporting `Interrupted: 8 errors during collection`. The remaining tests are unaffected and can be run by allowing collection to continue past the failures:

```powershell
pytest --continue-on-collection-errors
```

That reports `74 passed, 8 errors`. The eight errors are the blocked modules, not failing assertions. Those modules hold 79 tests between them, so `74 passed` is under half of the 153 in the suite rather than nearly all of it.

Docker containers run on Linux architecture and depend on Linux kernel features such as namespaces and control groups (cgroups) for isolation. Developers on other operating systems therefore run the Docker platform on a Linux virtual machine, which on Windows is what Docker Desktop provides. The operating system inside the container is consequently Linux, whereas Application Control is a Windows policy, so it has no bearing on what may load in there. The OpenCV the container loads is the Linux build installed when the image was created, not the Windows DLL held on disk.

This is the wider purpose of packaging the service as an image. Docker packages the application code together with its environment into a container that runs anywhere, and that environment is set up once, in the image, rather than reproduced by hand on each machine. The affected tests therefore run normally there:

```powershell
docker compose build cv-tests
docker compose run --rm cv-tests
```

This reports `153 passed`, which is the entire suite.

The build step is required the first time, and again after any change to `cv-service/pyproject.toml` or the `Dockerfile`. Dependencies are installed into the image at build time. The application code itself is bind-mounted, so ordinary source edits need no rebuild.

### Where the Test Output Appears

`cv-tests` is a separate, short-lived container from `hana-cv`, and this catches people out:

| Container | Runs | Logging |
|---|---|---|
| `hana-cv` | `uvicorn app.main:app` | Service output only: model loading, startup, HTTP requests. **Never any test result.** It has neither pytest nor Node installed. |
| `iwl-t8-cv-tests-run-<hash>` | `pytest` | The test output, including the `153 passed` summary |

Test results therefore never appear in the `hana-cv` logs in Docker Desktop, no matter how far back you scroll. They belong to the test container.

With `--rm`, that container is deleted the moment pytest exits, so the output exists only in the terminal where the command was run. To keep it for review in Docker Desktop, omit the flag:

```powershell
docker compose run cv-tests
```

The container then remains in the Containers list as `iwl-t8-cv-tests-run-<hash>`. Stopped containers are hidden by default, so the list filter has to be showing them. Its status is also the result in shorthand: `Exited (0)` means every test passed, and `Exited (1)` means at least one failed. To capture the output as a file instead:

```powershell
docker compose run --rm cv-tests > test-results.txt
```

### Why a Separate Test Service

`cv-tests` exists as its own service rather than a command run against `cv-service`, because the suite needs two things the running service must not carry:

| Requirement | Reason |
|---|---|
| Node | Two tests execute the backend's own JavaScript and compare it against the Python implementation. Without Node they are skipped rather than failed, so the check silently does not happen. |
| The backend source, mounted read-only at `/backend` | Those same tests locate the JavaScript two directories above the test file. On a developer machine that resolves to the repository root; inside the container it resolves to `/backend`. |

The `Dockerfile` builds in two stages accordingly. `runtime` is what the service ships as and contains neither Node nor pytest. `test` adds both on top of it. The `cv-service` entry pins `target: runtime`, because Docker otherwise builds the last stage in the file, which would hand the running service the test image. `cv-tests` sits behind a Compose profile, so `docker compose up` ignores it.

Keeping the backend's source out of the CV container also preserves the separation described under [System Architecture](#system-architecture): the two services are designed to trust each other only through a signed token.

The two cross-language tests are worth knowing by name, since they guard the points where the Python and JavaScript implementations must agree exactly:

- `test_backend_norm_parity.py` checks that the norm tables duplicated in the backend's JavaScript agree with the Python originals. It guards against the two copies drifting apart and a client being classified against different reference bands depending on which service answered.
- `test_token_interop.py` checks that a token signed by Node verifies in Python and the reverse. That signature is what stops an assessment score being fabricated in the browser.

If either reports a skip rather than a pass, the guard is not running. Check that Node is present and that the backend source is reachable.

### Frontend

Type checker is the standing check:

```powershell
cd frontend
npm run typecheck
```

`npm run build` runs the same check before bundling, and `noUnusedLocals` is enabled, so an unused import or variable fails the build.

---

## Project Layout

```
frontend/               React application (TypeScript and Vite)
├── src/pages/             One folder per user role, plus public pages
├── src/components/        Components shared across roles
├── src/cv/                Camera capture and CV service client
└── src/utils/api.ts       Backend API client

backend/                Node.js and Express API
├── src/routes/            Endpoint definitions and route-level guards
├── src/controllers/       Request validation, delegates to services
├── src/services/          Business logic and database access
├── src/models/            Mongoose schemas
├── src/middleware/        Authentication, authorisation, rate limiting, headers
└── src/utils/             Validators, norm tables, token signing

cv-service/             Python and FastAPI pose detection
├── app/cv/                MediaPipe pose and hand landmark detection
├── app/tests/             Per-test scoring strategies
├── app/security/          Grant and outcome token verification
└── tests/                 Test suite (pytest)

docker-compose.yml      Runs the CV service in a container
.env.example            Shared secret, read by both Compose and Backend
```

---

## System Architecture

```
Browser (frontend, :4500)
        |
        |  REST API (authentication, results, plans, consent)
        v
Backend (Node.js, :4502)  <---------->  MongoDB Atlas (cloud)
        |
        |  signed grant token (age, sex, height)
        v
CV Service (Python, :4501)
        |
        |  signed outcome token (measurements)
        v
Backend verifies the signature, derives the clinical verdict, and persists it
```

The frontend never contacts the database, and never contacts the CV service for anything that affects stored data. Two properties follow from the signing arrangement:

- **The subject cannot be altered.** The backend issues a grant carrying the client's actual age, sex and height, signed with `CV_SIGNING_SECRET`. The CV service verifies that signature and takes the subject's attributes from inside the token, so editing a value in the browser's developer tools cannot obtain a more favourable norm band.
- **The result cannot be fabricated.** The CV service signs the measurements it produced. The backend verifies that signature before storing anything, and derives the clinical classification itself from the stored profile. A score invented in the browser fails verification.

This is why the same `CV_SIGNING_SECRET` must reach both services. Keeping it in the repository-root `.env` alone, rather than duplicating it, means there is no second copy to fall out of step.

---

## Troubleshooting

**`npm` or `node` is not recognised**

Node.js is absent from the PATH.

**Fix**: reinstall with "Add to PATH" enabled, then close and reopen VS Code completely. Restart the computer if the problem persists.

**MongoDB will not connect**

```
MongoDB connection error: querySrv ECONNREFUSED ...
```

**Fix**: check the following in order:

- The IP address is not whitelisted. In Atlas, go to Network Access and add the address, or allow access from anywhere.
- The network blocks MongoDB's ports. This is common on mobile hotspots; try another network.
- The cluster is paused. In Atlas, go to Database and select Resume.
- `MONGO_URI` is incorrect. Verify the username, password, cluster address and database name in `backend/.env`.

**Backend refuses to start**

```
FATAL: JWT_SECRET is not set - refusing to start.
FATAL: CV_SIGNING_SECRET is not set - refusing to start.
```

A required secret is missing.

**Fix**: `JWT_SECRET` belongs in `backend/.env`; `CV_SIGNING_SECRET` belongs in the repository-root `.env`, which the backend loads in addition to its own. Confirm that the root `.env` exists beside `docker-compose.yml`, then restart the backend.

**The client account cannot begin an assessment**

```
Your account must be verified before you can use this feature.
```

The account has not completed verification. This is intended behaviour, not a fault.

**Fix**: refer to the [verification workflow](#client-verification-workflow): the client must be checked in person by staff, and the account then approved by an administrator.

**Sign-in reports that the account is suspended**

Suspension blocks both sign-in and every authenticated request.

**Fix**: ask an administrator to restore the account. No other role can.

**The camera will not start, or the CV service reports errors**

**Fix**: work through the following:

- Docker Desktop must be running before `docker compose up cv-service` is issued.
- Close any other application holding the webcam, such as Zoom, Teams or OBS. Only one application may access the camera at a time. A `NotReadableError` in the browser almost always indicates that another application holds the device.
- Confirm that the container is running with `docker ps`.
- Confirm that `CV_SIGNING_SECRET` is present in the repository-root `.env`. Compose fails immediately with an explanatory message if it is absent.

**A port is already in use**

**Fix**: close the process occupying the port, or allow the tool to select the next available one. Always use the URL printed in the terminal.

**"Access Denied" or "403 Forbidden" while signed in**

Role held by the current account does not carry permission for the action attempted.

**Fix**: refer to [Roles](#roles). A clinician, in particular, can reach only those clients assigned to them by an administrator.

**A blank page, or data that appears out of date**

**Fix**: perform a *Hard Refresh* with `Ctrl+Shift+R`.

---

## Known Limitations

**Identity is Established by the In-Person Check, not just by the NRIC or FIN itself.**

The checksum validation applied at registration proves only that the number supplied is internally consistent. It cannot establish that the number has been issued, nor that it belongs to the person supplying it, as the validation used is an official / public algorithm, and a well-formed number can be generated trivially. It filters out poorly done and generated numbers or human errors from typing, not impersonation.

No automated check in this repository closes that gap. It is closed procedurally instead: where the client does a F2F verification with a member of staff who sights the physical NRIC card at the clinic or Active Ageing Centre, and an administrator then approves the account. That is why no assessment feature is reachable until both have happened.

The consequence worth stating plainly is that a registered but unverified account should not be treated as an identified person. See [NRIC and FIN Checksum Validation](#nric-and-fin-checksum-validation) and [Client Verification Workflow](#client-verification-workflow).

---

## Future Enhancements

This repository implements the first function as a core foundational base, as set under [Scope of This Implementation](#scope-of-this-implementation). The following remain to be integrated at present time.

1. **Tokenised Incentives**: rewarding assessment completion, intervention attendance, adherence milestones and self-monitoring. The document is specific about the governance this requires, and it constrains the design. Tokens should be non-transferable and non-financial, and should reward engagement and effort rather than clinical outcome alone, so that frailer or more complex clients are not penalised. High-value rewards should require administrator approval, manual adjustments and revocations should carry a recorded reason, and developers should exercise token logic in a sandbox rather than against live records.

2. **Tokenised Health Records**: digital identity, consent management, data provenance and verifiable assessment records. Identifiable clinical data should not be held on-chain. What belongs there is consent events, record hashes, verification proofs, metadata pointers, access permissions and audit trails, with the clinical record itself remaining in the off-chain database. Consent must be explicit, traceable and revocable, and the chain must supplement clinical documentation rather than replace it.

Both extend the existing consent log and audit trail, which already implement the governance principles those functions depend upon.
