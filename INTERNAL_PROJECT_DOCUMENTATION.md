# NexusHR AI

## Internal Project Documentation

### 1. Purpose

NexusHR AI is an internal HR operations platform built to help the HR team:

- receive and review candidate applications
- manage employees and job postings
- shortlist and track candidates
- automate parts of CV screening and candidate communication
- move shortlisted candidate data into Google Drive and Google Sheets for operational follow-through

This is **not** a client product and is **not** intended for sale. It is an internal workflow tool for HR and supporting operations teams.

---

### 2. Project Goals

The system is intended to reduce manual HR effort in these areas:

- candidate intake
- screening support
- shortlist tracking
- centralized storage of candidate materials
- basic reporting and operational visibility
- internal coordination between UI actions and background automation

The success metric is not visual polish alone. The success metric is whether HR can reliably move from application intake to shortlist handling with less manual work and less ambiguity.

---

### 3. Current System Overview

The project currently has three main layers:

1. **Frontend application**
   - React + TypeScript
   - Vite-based source project
   - Tailwind CSS styling
   - main HR views: Dashboard, Employees, Recruitment, AI Assistant, HR AI Agent

2. **Backend API**
   - Express + TypeScript
   - JWT-based admin authentication
   - SQLite persistence
   - HR agent API routes
   - OAuth integration with Google services

3. **HR automation pipeline**
   - Gmail polling for unread PDF CVs
   - CV parsing and scoring
   - shortlist / review / reject decisioning
   - Drive upload for shortlisted candidates
   - Sheets logging for shortlisted candidates
   - automated candidate reply emails

---

### 4. High-Level Architecture

#### Frontend

- Entry point: [D:\nexus_HR_Ai\index.tsx](D:/nexus_HR_Ai/index.tsx:1)
- Main shell: [D:\nexus_HR_Ai\App.tsx](D:/nexus_HR_Ai/App.tsx:1)
- Shared API client: [D:\nexus_HR_Ai\services\apiClient.ts](D:/nexus_HR_Ai/services/apiClient.ts:1)
- Shared row mappers: [D:\nexus_HR_Ai\services\hrDataMappers.ts](D:/nexus_HR_Ai/services/hrDataMappers.ts:1)

Primary frontend screens:

- Login: [D:\nexus_HR_Ai\components\Login.tsx](D:/nexus_HR_Ai/components/Login.tsx:1)
- Dashboard: [D:\nexus_HR_Ai\components\Dashboard.tsx](D:/nexus_HR_Ai/components/Dashboard.tsx:1)
- Recruitment: [D:\nexus_HR_Ai\components\Recruitment.tsx](D:/nexus_HR_Ai/components/Recruitment.tsx:1)
- HR Agent: [D:\nexus_HR_Ai\components\HrAgentDashboard.tsx](D:/nexus_HR_Ai/components/HrAgentDashboard.tsx:1)
- Analytics: [D:\nexus_HR_Ai\components\CyberDashboard.tsx](D:/nexus_HR_Ai/components/CyberDashboard.tsx:1)

#### Backend

- Server bootstrap: [D:\nexus_HR_Ai\backend\src\server.ts](D:/nexus_HR_Ai/backend/src/server.ts:1)
- Auth route: [D:\nexus_HR_Ai\backend\src\routes\auth.ts](D:/nexus_HR_Ai/backend/src/routes/auth.ts:1)
- HR agent route: [D:\nexus_HR_Ai\backend\src\routes\hr_agent.ts](D:/nexus_HR_Ai/backend/src/routes/hr_agent.ts:1)
- Auth middleware: [D:\nexus_HR_Ai\backend\src\middleware\authMiddleware.ts](D:/nexus_HR_Ai/backend/src/middleware/authMiddleware.ts:1)
- Database setup: [D:\nexus_HR_Ai\backend\src\db.ts](D:/nexus_HR_Ai/backend/src/db.ts:1)

#### HR Agent Services

- Scheduler: [D:\nexus_HR_Ai\backend\src\services\hr_agent\scheduler.ts](D:/nexus_HR_Ai/backend/src/services/hr_agent/scheduler.ts:1)
- Gmail listener: [D:\nexus_HR_Ai\backend\src\services\hr_agent\gmail_listener.ts](D:/nexus_HR_Ai/backend/src/services/hr_agent/gmail_listener.ts:1)
- Drive uploader: [D:\nexus_HR_Ai\backend\src\services\hr_agent\drive_uploader.ts](D:/nexus_HR_Ai/backend/src/services/hr_agent/drive_uploader.ts:1)
- Sheets logger: [D:\nexus_HR_Ai\backend\src\services\hr_agent\sheets_logger.ts](D:/nexus_HR_Ai/backend/src/services/hr_agent/sheets_logger.ts:1)
- Google client: [D:\nexus_HR_Ai\backend\src\services\hr_agent\google_client.ts](D:/nexus_HR_Ai/backend/src/services/hr_agent/google_client.ts:1)

---

### 5. Data Model

#### Employees

Stored in `employees` table.

Key fields:

- `id`
- `name`
- `role`
- `department`
- `email`
- `join_date`
- `status`
- `performance_rating`

#### Jobs

Stored in `jobs` table.

Key fields:

- `id`
- `title`
- `department`
- `location`
- `type`
- `status`
- `description`
- `requirements`
- `applicants_count`

#### Candidates

Stored in `candidates` table.

Key fields:

- `id`
- `job_id`
- `first_name`
- `last_name`
- `email`
- `phone`
- `location`
- `years_experience`
- `current_role`
- `skills`
- `achievements`
- `overall_score`
- `breakdown_score`
- `decision_status`
- `ai_reasoning`
- `drive_file_link`
- `created_at`

Important note:

- `job_id` support was added and migrated into the schema.
- candidates without a known job are currently treated as unassigned.

---

### 6. Main Workflows

#### A. Admin Login

1. User opens the app.
2. Frontend checks for stored auth token.
3. If no valid token exists, user lands on the login screen.
4. Backend validates admin credentials and returns a JWT.
5. Frontend stores the token and allows access to protected data routes.

#### B. Standard HR UI Workflow

1. HR logs in.
2. HR reviews:
   - employee data
   - job postings
   - candidate records
3. HR can manually upload and screen candidates from the recruitment UI.

#### C. Automated HR Agent Workflow

1. Scheduler polls Gmail for unread emails with PDF attachments.
2. PDF text is extracted.
3. Candidate CV is analyzed by AI or fallback heuristics.
4. Candidate is classified as:
   - `Shortlisted`
   - `Review Required`
   - `Rejected`
5. Candidate record is inserted into SQLite.
6. If candidate is `Shortlisted`:
   - CV is uploaded to Google Drive
   - candidate row is logged to Google Sheets
7. Candidate receives automated email reply.
8. Email is marked as read.

---

### 7. Google Integration Behavior

The backend uses OAuth credentials for:

- Gmail access
- Google Drive uploads
- Google Sheets logging

Current implementation behavior:

- OAuth callback is publicly reachable and no longer blocked by JWT auth.
- `GOOGLE_REFRESH_TOKEN` is loaded automatically on backend startup.
- If `GOOGLE_DRIVE_FOLDER_ID` is not configured, the system now tries to:
  - reuse a folder named `NexusHR Candidates`
  - or create it automatically
- If `GOOGLE_SHEET_ID` is not configured, the system now tries to:
  - reuse a spreadsheet named `NexusHR Candidate Tracker`
  - or create it automatically
  - and initialize header columns

This means Drive/Sheets setup is now much less fragile than before.

---

### 8. Current Operational Status

#### Working

- backend API launches correctly
- frontend static preview is available
- admin login flow is stabilized
- invalid/stale session fallback now returns cleanly to login
- Google OAuth callback route is fixed
- refresh token is loaded on backend startup
- Drive upload works in the backend HR agent path
- Sheets integration no longer depends strictly on a manually prefilled sheet ID
- candidate `job_id` support exists in the backend schema and API layer

#### Improved Recently

- shared frontend API client
- centralized JWT secret usage
- safer OAuth callback output escaping
- more honest frontend candidate-to-job mapping
- better live preview behavior with no-cache serving
- fixed Tailwind content scanning for top-level files
- robust CSV parsing for analytics candidate data
- explicit shared button styles

#### Known Remaining Gaps

1. **Frontend shortlist actions are not fully unified with backend exports**
   - backend email-processed shortlisted candidates now trigger Drive/Sheets correctly
   - frontend-only shortlist actions are still not a fully integrated export trigger path

2. **AI service reliability depends on external quotas**
   - logs show quota or auth failures can trigger fallback scoring
   - fallback exists, but quality depends on available AI provider health

3. **JWT security posture is still development-grade**
   - current startup logs still warn about a weak/default JWT secret
   - must be hardened before any broader internal rollout

4. **The local preview path is a fallback**
   - Vite dev server is blocked in this environment
   - app is currently served through a static fallback path for preview

---

### 9. Environment Configuration

#### Frontend

Common environment assumptions:

- `VITE_API_URL`

If not provided, frontend falls back to:

- `http://localhost:3001`

#### Backend

Important backend environment variables:

- `PORT`
- `ADMIN_USER`
- `ADMIN_PASSWORD` or `ADMIN_PASSWORD_HASH`
- `JWT_SECRET`
- `ALLOWED_ORIGINS`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `OAUTH_CALLBACK_URL`
- `APP_URL`
- `GOOGLE_DRIVE_FOLDER_ID` (optional now)
- `GOOGLE_DRIVE_FOLDER_NAME` (optional)
- `GOOGLE_SHEET_ID` (optional now)
- `GOOGLE_SHEET_NAME` (optional)
- `GEMINI_API_KEY`
- `OPENROUTER_API_KEY`

---

### 10. Running the Project

#### Backend

From `backend`:

```powershell
npm run build
node dist/server.js
```

Backend default URL:

- `http://localhost:3001`

Health endpoint:

- `http://localhost:3001/api/health`

#### Frontend

The normal intention is:

```powershell
npm run dev
```

In this environment, Vite has had Windows subprocess issues, so a static preview fallback has been used instead.

Primary preview URL used during internal testing:

- `http://127.0.0.1:3003`

---

### 11. Authentication Notes

- Backend auth is JWT-based.
- Login uses admin credentials defined in backend environment variables.
- The app now handles expired or invalid sessions more cleanly.
- Login screen messaging was adjusted to avoid misleading username hints.

Important internal note:

- The login identity for the running environment should be treated as an internal admin credential, not a generic demo account.

---

### 12. Logging and Diagnostics

HR agent activity logs are stored in:

- [D:\nexus_HR_Ai\backend\logs\hr_agent.log](D:/nexus_HR_Ai/backend/logs/hr_agent.log:1)

These logs are the first place to inspect when checking:

- Gmail polling success/failure
- AI scoring failures
- Drive upload status
- Sheets logging status
- automated reply behavior

Examples of issues seen in logs historically:

- `invalid_grant` from Google auth
- AI quota failures
- missing `GOOGLE_SHEET_ID`

---

### 13. API Notes

#### Public / Partially Public

- `POST /api/auth/login`
- `GET /api/health`
- `GET /api/hr-agent/auth/callback`

#### Protected

- `/api/ai/*`
- most `/api/hr-agent/*`

Examples:

- `GET /api/hr-agent/candidates`
- `GET /api/hr-agent/jobs`
- `GET /api/hr-agent/employees`
- `GET /api/hr-agent/status`
- `POST /api/hr-agent/run`
- `POST /api/hr-agent/toggle`
- `POST /api/hr-agent/sync-shortlisted`

---

### 14. Recent Technical Analysis: Shortlist to Drive/Sheets

A recent internal issue was investigated where high-fit / shortlisted candidates were not appearing in Drive and Sheets.

#### Findings

- Drive upload was already functioning in the backend email-processing pipeline.
- Sheets logging was failing because spreadsheet configuration was missing.
- Export logic needed to align more clearly with the shortlist decision.

#### Fixes Applied

- refresh token loads automatically
- Drive folder resolves or auto-creates
- spreadsheet resolves or auto-creates
- headers initialize automatically
- Drive/Sheets export now follows shortlist status in the scheduler
- `sync-shortlisted` backfill route was added

#### Important Limitation

The export logic currently applies to the backend HR-agent processing path. Frontend-only manual shortlist actions still need deeper unification if HR expects every UI shortlist click to trigger backend export automatically.

---

### 15. Recommended Next Technical Steps

1. **Unify shortlist behavior**
   - connect frontend shortlist actions directly to backend export workflows

2. **Add explicit HR action feedback**
   - “Uploaded to Drive”
   - “Logged to Sheets”
   - “Reply sent”
   - “Retry needed”

3. **Harden security**
   - replace weak/default JWT secret
   - avoid plaintext admin password in long-term use

4. **Improve observability**
   - structured job-cycle result summary
   - export counters
   - shortlist export audit history

5. **Stabilize development runtime**
   - resolve Vite/esbuild subprocess issues for normal dev workflow

---

### 16. Recommended Product Steps

For internal HR use, the highest-value direction is:

- one clear intake path
- one shortlist decision path
- one reliable export path
- one source of operational truth

The product should behave like an internal operations system, not a demo dashboard.

That means:

- fewer disconnected paths
- clearer statuses
- less hidden state
- stronger auditability

---

### 17. Ownership Summary

This system is currently best understood as:

- an internal HR operations platform
- with both manual HR UI workflows and automated background screening
- that is in active stabilization

Recent work has moved it meaningfully closer to operational reliability, especially in:

- session handling
- Google OAuth
- Drive/Sheets integration
- shortlist export behavior

The main remaining architectural task is unifying manual shortlist actions with the backend automation/export pipeline so HR gets one consistent workflow regardless of where the shortlist decision happens.

