# OpenClaw Agentic Recruitment Plan

## Objective

Build the strongest possible low-cost recruitment automation system around:

- Talent Operations Console (existing ATS/UI)
- OpenClaw (agent runtime / orchestration layer)
- Google Workspace (Gmail, Drive, Sheets, Calendar)
- Official job-board integrations where available
- Supervised browser-assisted workflows where official integrations are unavailable

This document separates:

1. a realistic zero-cost MVP
2. the limits of zero-cost
3. the paid path to a production-grade system

## Executive Position

A truly "zero cost" and "full proof" recruitment automation system is not realistic.

What is realistic:

- near-zero infrastructure cost
- low-cost AI usage
- high automation for inbox intake, scoring, follow-up, tracking, and scheduling
- controlled sourcing using public profile discovery plus internal candidate data

What is not realistic at zero cost:

- official deep integrations with every top job board
- unlimited agentic scraping across recruiter portals
- guaranteed deliverability and compliance for bulk outreach
- fully autonomous, no-risk production hiring decisions

## Recommended Architecture

### System of record

Talent Operations Console backend owns:

- candidate records
- workflow state
- audit log
- Drive/Sheets sync
- HR approval checkpoints

### Agent runtime

OpenClaw owns:

- autonomous workflow orchestration
- browser-assisted actions
- qualification follow-up logic
- next-action reasoning
- tool selection

### Workspace tools

Google Workspace owns:

- Gmail inbox and threads
- Google Drive dossier storage
- Google Sheets tracker
- Google Calendar scheduling

## Zero-Cost MVP

### Goal

Build a working autonomous hiring loop with no mandatory paid recruiter-platform integration.

### Scope

1. Gmail intake
2. resume parsing
3. AI screening
4. ATS persistence
5. Drive and Sheets sync
6. qualification-question email workflow
7. reply tracking
8. calendar-based interview slot proposal

### Data sources

- Gmail applicants
- internal database
- manual resume import
- public profile discovery through browser/search-based sourcing

### Agentic loop

1. HR submits JD
2. agent creates hiring brief and qualification checklist
3. agent checks internal DB and Gmail applicants
4. agent discovers public profiles where possible
5. agent scores candidates
6. agent assigns workflow state
7. agent drafts/sends outreach or qualification questions
8. agent reads replies
9. agent updates ATS + Sheets + Drive
10. agent proposes interview slots from Calendar

### Workflow states

- New Intake
- Sourced
- Awaiting Review
- Awaiting Candidate Reply
- Candidate Engaged
- Interview Ready
- Interview Scheduled
- Closed

### Zero-cost tool stack

- existing app backend + SQLite
- OpenClaw local runtime
- Gmail API
- Drive API
- Sheets API
- Calendar API
- OpenAI-compatible model route or low-cost provider

## Zero-Cost Limitations

### Sourcing

Without official partner integrations:

- LinkedIn / Indeed / Naukri / Foundit cannot be treated as guaranteed structured APIs
- sourcing quality depends on public profile discovery and supervised browser workflows

### Messaging

Without a dedicated provider:

- Gmail-based outreach works for small volume only
- scaling candidate outreach through a personal mailbox is fragile

### Deliverability

No low-cost system is "full proof" if:

- domain reputation is weak
- outreach volume rises
- replies are ambiguous
- portal access changes

### Compliance and reliability

At zero cost:

- more manual supervision is required
- more edge cases must be handled in the app
- fewer official guarantees exist

## Paid Production Path

### Phase 1: Stable low-cost production

Buy/enable:

- OpenAI API or equivalent production model route
- Google Workspace production mailbox
- optional email sending provider for controlled outbound workflows

Outcome:

- better reasoning quality
- cleaner automation
- better separation between personal inbox and recruiting ops

### Phase 2: Strong sourcing and posting

Pursue:

- official recruiter-platform partnerships where available
- official job posting APIs where available
- approved ATS/job-board connectors

Outcome:

- structured job posting
- more trustworthy sourcing data
- less reliance on scraping or brittle workflows

### Phase 3: Production outreach and interview ops

Add:

- dedicated communication provider
- templated outreach sequences
- bounce/reply/follow-up handling
- calendar automation with approval rules

Outcome:

- larger-scale outreach
- reliable interview progression

### Phase 4: Offer and onboarding

Add:

- offer letter generation
- document checklist
- joining workflow

Outcome:

- end-to-end hiring operations

## Recommended Implementation Order

### Track A: Build now

1. persist sourced candidates in ATS
2. workflow-state engine
3. qualification-question email workflow
4. reply ingestion and state advancement
5. calendar slot proposal
6. approval/audit trail for sensitive actions

### Track B: Prepare later

1. official posting integrations
2. official sourcing integrations
3. outbound provider for scale
4. offer package automation

## Debug Strategy

For each workflow step, maintain:

- request log
- action log
- prompt/context snapshot
- external tool result
- state before/after
- retry reason

Debug by stage:

1. intake failure
2. parsing failure
3. scoring mismatch
4. messaging failure
5. reply classification failure
6. scheduling conflict
7. sync/export failure

## Recommendation

Proceed with a zero-cost MVP first, but do not market it internally as "full proof."

Describe it as:

"A controlled autonomous recruitment operations system with low-cost infrastructure, human oversight at critical decision points, and a roadmap to official platform integrations."

That is accurate, defensible, and buildable.

## Immediate Next Build

The next highest-value implementation is:

1. qualification-question workflow
2. reply tracking
3. interview-ready promotion logic

That is the first complete autonomous loop with visible business value.
