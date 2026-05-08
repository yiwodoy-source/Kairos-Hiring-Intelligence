# OpenClaw Integration Setup

## What is implemented

The backend now includes an OpenClaw integration layer:

- `GET /api/openclaw/status`
- `POST /api/openclaw/candidate/:id/run`
- `POST /api/openclaw/candidate/:id/apply-recommendations`

This lets Talent Operations Console:

- send one candidate dossier to OpenClaw
- ask OpenClaw for the next best workflow step
- receive structured recruiting recommendations
- optionally apply the returned workflow recommendations back into the ATS

## Required backend environment variables

Add these to `backend/.env`:

```env
OPENCLAW_ENABLED=true
OPENCLAW_BASE_URL=http://127.0.0.1:4010
OPENCLAW_AUTH_TOKEN=your_openclaw_gateway_token
OPENCLAW_MODEL=openclaw/default
```

If your OpenClaw gateway is configured without token auth, leave `OPENCLAW_AUTH_TOKEN` empty and adjust the gateway auth mode carefully.

## Expected OpenClaw gateway capability

The backend calls OpenClaw's OpenResponses-compatible endpoint:

- `POST /v1/responses`

The candidate orchestration prompt asks OpenClaw to return JSON including:

- workflow state
- next action
- decision status
- communication state
- reply state
- interview state
- sourcing stage
- qualification questions
- outreach subject/body
- offer outline
- calendar, Gmail, and Drive actions
- screening notes
- risk flags

## Suggested OpenClaw runtime role

Use OpenClaw as the autonomous operator for:

- candidate screening
- qualification-question generation
- outreach drafting
- reply handling logic
- interview-readiness reasoning
- offer-letter drafting support

Keep Talent Operations Console as:

- ATS
- system of record
- sync and audit layer
- HR approval surface

## Recommended first live test

1. Start OpenClaw gateway locally.
2. Configure the backend `.env`.
3. Restart backend.
4. Login to Talent Operations Console.
5. Call:

   - `GET /api/openclaw/status`
   - `POST /api/openclaw/candidate/11/run`

6. Inspect the returned JSON/text.
7. Apply selected recommendations via:

   - `POST /api/openclaw/candidate/11/apply-recommendations`

## Important note

This repo now has the integration hooks, but it does not install or bootstrap OpenClaw itself.

That separation is intentional:

- OpenClaw should run as its own local service
- the HR system should consume it over a stable API
- that keeps the HR app auditable and easier to debug
