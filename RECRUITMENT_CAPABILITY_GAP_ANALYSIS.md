# Recruitment Capability Gap Analysis

## Executive Summary

The current NexusHR system already has a recruitment foundation: job management, candidate records, Gmail-based CV intake, AI/fallback scoring, shortlist status handling, and Google Drive/Sheets handoff for shortlisted candidates.

However, the complete target system described by management is not fully implemented yet. The current product is best classified as an early recruitment automation platform with partial HR Agent capabilities, not a full end-to-end autonomous hiring system.

Approximate implementation status:

- Core recruitment foundation: partially implemented
- CV intake and shortlist scoring: partially implemented
- Drive/Sheets handoff: implemented for selected HR Agent flows, but needs end-to-end hardening
- External portal sourcing: not implemented as real integrations
- WhatsApp/SMS/call outreach: not implemented
- Interview scheduling: not implemented
- Candidate readiness confirmation: not implemented
- Production-grade UI/UX: needs stabilization

## Capability Matrix

| Capability | Current Status | Technical Finding | Required Next Work |
|---|---:|---|---|
| Job posting and job management | Present | Jobs table and recruitment UI exist. Jobs include title, department, location, type, status, description, and requirements. | Improve JD criteria structure and connect jobs to matching rules. |
| Candidate database | Present, basic | Candidates table exists with name, email, phone, skills, experience, score, status, reasoning, and Drive link. | Add recruitment lifecycle fields: salary expectation, notice period, availability, source, stage, contact status, interview status. |
| Internal candidate database of 1500 records | Not implemented | Database supports candidates, but no production import, dedupe, enrichment, or migration pipeline for the existing internal records was found. | Build CSV/Excel import, validation, dedupe, normalization, and audit report. |
| Gmail CV intake | Present | HR Agent checks unread Gmail messages, extracts PDF CVs, analyzes candidates, saves results, and marks emails as processed. | Add better failure handling, duplicate protection, and visible processing logs. |
| CV parsing and AI analysis | Present, partial | AI/fallback analyzer and decision engine exist. Candidate score and decision status are saved. | Make scoring explainable and configurable per JD. Add structured extraction for salary, notice period, location, and role fit. |
| Intelligent shortlisting | Partial | Shortlist/review/reject status exists based mainly on score. | Add weighted matching against JD, salary, experience, skill, location, and role alignment. |
| Drive upload | Present, flow-specific | Shortlisted candidates can be uploaded to Google Drive in the HR Agent flow. | Make export idempotent, visible in UI, and retryable. |
| Google Sheets logging | Present, flow-specific | Shortlisted candidates can be logged to Sheets in the HR Agent flow. | Add row-level status, duplicate prevention, and error visibility. |
| Manual shortlist movement to Drive/Sheets | Partial | UI/backend support appears partly present, but this needs full end-to-end verification and hardening. | Verify every shortlist action triggers export reliably and displays success/failure. |
| Automated email reply | Present, limited | Backend can send Gmail replies for inbound CV processing statuses. | Extend into controlled outreach campaigns with templates, consent checks, and delivery tracking. |
| AI sourcing UI | Prototype | Frontend sourcing screen exists, but it does not represent real verified external source integrations. | Replace prototype data flow with real source connectors or compliant import workflows. |
| External portals: LinkedIn, Indeed, Naukri, Apna, etc. | Not implemented | No real official integrations were found for the listed job portals. | Define legal/compliant integration strategy per portal. Use official APIs, partner exports, or manual import where APIs are unavailable. |
| WhatsApp outreach | Not implemented | No WhatsApp Business integration was found. | Add WhatsApp Business Cloud API or approved provider integration. |
| SMS outreach | Not implemented | No SMS provider integration was found. | Add provider such as Twilio, MSG91, Exotel, or equivalent based on company preference. |
| Automated calls | Not implemented | No telephony integration was found. | Add call provider integration only after message/email workflows are stable. |
| Candidate response tracking | Not implemented | No structured lifecycle fields for contacted/responded/confirmed/not interested were found. | Add candidate communication events and pipeline stages. |
| Candidate readiness confirmation | Not implemented | No structured confirmation flow exists for salary alignment, location, availability, and interview interest. | Build confirmation questionnaire and response parser. |
| Interview scheduling | Not implemented | No Google Calendar scheduling service was found. | Add Calendar integration, availability rules, slot booking, rescheduling, and notifications. |
| Keeping hiring owner in loop | Partial | Dashboard exists, but no robust notification workflow was found. | Add daily summary, shortlist alerts, scheduled interview notifications, and exception reports. |
| Auditability and operations visibility | Partial | Dashboard shows stats, but process-level logs are limited. | Add automation run logs, per-candidate status timeline, retry history, and error reporting. |
| UI/UX production readiness | Needs work | Recent screenshots show broken visual hierarchy, contrast, and layout issues. | Stabilize login, navigation, recruitment, HR Agent, and dashboard layouts before expanding features. |

## What Already Exists

The system already has enough foundation to support the next phase:

1. Job records and recruitment screens.
2. Candidate database and candidate scoring fields.
3. Gmail-based CV intake.
4. PDF CV extraction and candidate analysis.
5. Shortlist/review/reject decision status.
6. Google Drive upload service.
7. Google Sheets logging service.
8. Automated Gmail response service.
9. HR Agent dashboard and controls.
10. Prototype AI sourcing interface.

## What Still Needs To Be Implemented

The following items are required before the system can meet the stated target of handling 30-50 hires per month with minimal manual intervention:

1. Import and normalize the existing internal candidate database.
2. Expand candidate schema for salary, notice period, availability, source, stage, and communication status.
3. Convert JD input into structured matching criteria.
4. Build a weighted matching engine for skills, salary, experience, role, and location.
5. Harden shortlist movement into Drive and Sheets.
6. Add real outbound email campaign capability.
7. Add WhatsApp/SMS provider integrations.
8. Add candidate confirmation workflow before scheduling.
9. Add Google Calendar interview scheduling.
10. Add operational logs, retries, failure handling, and admin visibility.
11. Replace prototype external sourcing with compliant portal integrations or import workflows.
12. Stabilize UI/UX before scaling functionality.

## Recommended Execution Order

### Phase 1: Trust and Stability

Fix broken UI/UX, login field visibility, navigation, dashboard layout, and recruitment screens. This must come first because the team currently cannot trust the interface.

### Phase 2: Internal Database Activation

Import the existing 1500 candidate records, normalize fields, detect duplicates, and make them searchable/filterable.

### Phase 3: Matching Engine

Create structured JD criteria and candidate scoring rules for salary, experience, skills, role alignment, and location fit.

### Phase 4: Shortlist Export Reliability

Ensure every shortlisted candidate reliably moves to Drive and Sheets with visible success/failure status.

### Phase 5: Candidate Outreach

Start with email outreach because Gmail already exists in the system. Add WhatsApp and SMS after email tracking is stable.

### Phase 6: Scheduling Automation

Add Google Calendar availability, slot booking, confirmation messages, rescheduling, and hiring owner notifications.

### Phase 7: External Sourcing

Implement external sourcing only through compliant channels: official APIs, approved partner integrations, or controlled import files. This should not be built as scraping-first automation.

## Technical Conclusion

The recruitment module is not starting from zero. The system already has a useful base for CV intake, scoring, shortlisting, and Google workspace export.

But the complete recruitment automation described by management is not already present. The biggest missing areas are real candidate sourcing, communication automation, readiness confirmation, scheduling, and production-grade operational visibility.

The correct next move is not to add more prototype UI. The correct next move is to stabilize the existing interface, verify the HR Agent shortlist-to-Drive/Sheets flow end to end, then implement the internal candidate database and matching engine.
