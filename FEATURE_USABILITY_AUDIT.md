# Feature Usability Audit

## Purpose

This audit identifies which current NexusHR AI features are production-usable, partially usable, or prototype-only before the project moves into the next phase.

## Decision Summary

The system should prioritize reliable HR operations over extra AI/demo features. Any feature that appears to send messages, source external candidates, or automate decisions must either be connected to a real backend provider or clearly marked as unavailable.

## Feature Classification

| Feature | Status | Decision |
|---|---|---|
| Login | Usable | Keep and continue UI verification |
| Dashboard | Usable | Keep |
| Employees | Usable basic module | Keep |
| Recruitment jobs | Usable basic module | Keep |
| Candidate screening | Partially usable | Keep, improve export/status feedback |
| HR AI Agent | Usable operational module | Keep as primary automation screen |
| AI Recruitment Assistant chat | Prototype/demo | Removed from primary navigation |
| AI Candidate Discovery | Partial/prototype | Keep only with honest wording |
| External portal sourcing | Not connected | Do not present as active integration |
| Outreach campaign sending | Not connected | Disable sending until provider exists |
| Simulated engagement/time passing | Demo-only | Removed from usable workflow |
| Drive/Sheets export | Usable, needs end-to-end verification | Keep and harden |

## Actions Taken

1. Removed the old AI Assistant from primary navigation because it simulated email sending and overlapped with the HR AI Agent.
2. Updated sourcing screen language so it no longer claims LinkedIn/Naukri/Indeed integrations are active.
3. Changed outreach wording from campaign launch to outreach draft.
4. Disabled outreach sending until an approved communication provider is connected.
5. Removed the "Simulate Time Passing" action from the sourcing pipeline.

## Recommended Next Step

Continue with UI/UX stabilization and end-to-end verification of the real workflow:

1. Login
2. Recruitment
3. Candidate creation/update
4. All-candidate export to Drive/Sheets
5. HR AI Agent dashboard

Do not add new AI-facing features until existing workflows are reliable and clearly understandable for HR users.
