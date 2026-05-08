# Talent Operations Console

## Execution Plan

### Purpose

This document defines the most practical next-phase execution plan for Talent Operations Console.

It is written from an ownership perspective:

- what the system should ultimately become
- what is already working today
- what is still missing
- what should be prioritized first
- what should wait until later phases

The goal is to keep the project grounded in usable HR workflows instead of expanding into disconnected prototype features.

---

## 1. Product Understanding

Talent Operations Console is intended to become an end-to-end recruitment operations system.

The desired end state is not just an AI dashboard. It is a working HR operating workflow where:

1. jobs are created and structured
2. candidates are captured from multiple sources
3. resumes are parsed and screened
4. relevant candidates are shortlisted
5. outreach happens with controlled automation
6. interviews are scheduled with minimal manual coordination
7. data is stored reliably for HR and management visibility

The system should reduce repetitive HR workload while keeping final judgment and hiring decisions with the human hiring owner.

---

## 2. What Already Exists

The current project is not starting from zero. It already has a meaningful operational base.

### Current Working Foundation

- admin login and protected backend
- candidate database
- jobs and recruitment records
- Gmail-based CV intake
- PDF parsing
- AI or fallback candidate scoring
- shortlist/reject/review status handling
- Google Drive export
- Google Sheets export
- application content and quick summary logging
- autonomous monitoring foundation

### Important Reality

This means the product is already beyond concept stage.

However, it is still a partial recruitment automation platform, not yet a complete hiring system.

---

## 3. What The Vision Actually Means

The feature list provided by management translates into seven functional pillars:

### A. Applicant Tracking System

One place to store:

- candidate identity
- resume
- source
- application content
- communication history
- evaluation status
- interview stage
- hiring outcome

### B. Automated Job Posting and Candidate Sourcing

The system should publish openings and source candidates from:

- internal database first
- approved external platforms
- controlled imports
- social and referral channels

### C. Resume Parsing and Automated Screening

The system should:

- extract structured candidate data
- compare against role requirements
- rank by fit
- explain why a candidate is a match or not

### D. Interview Scheduling Automation

The system should:

- collect candidate availability
- check hiring owner calendar availability
- propose slots
- confirm interviews
- send reminders

### E. AI-Powered Assessment and Evaluation

The system should support:

- structured scorecards
- pre-screen questions
- later-stage assessment workflows

### F. Offer and Onboarding Automation

The system should eventually support:

- offer templates
- handoff to onboarding
- pre-joining document collection

### G. Reporting and Analytics

The system should show:

- time-to-hire
- source quality
- shortlist rate
- interview conversion
- hiring funnel visibility

---

## 4. What Is Missing Today

The biggest gaps are not in candidate storage anymore. The real gaps are workflow continuity and operational completeness.

### Major Missing Capabilities

- structured internal database import for the existing 1500 records
- candidate source tracking across all channels
- salary, notice period, availability, and communication-status fields
- structured JD matching engine
- controlled outbound communication workflow
- candidate reply tracking
- interview scheduling integration
- job posting workflow
- compliant external sourcing integrations
- management-grade workflow screens

### Important Product Gap

The application currently contains some screens that look "AI-rich" but are not the strongest operational value.

The next phase should move away from decorative analytics and toward action-oriented recruitment operations.

---

## 5. Recommended Product Direction

The best path is to build this as a workflow console, not as a demo-heavy AI shell.

### Principle

Every major screen should answer one of these questions:

- what candidates came in
- which candidates are relevant
- what action is pending
- what communication already happened
- what should HR do next

If a screen does not help with those questions, it should not be first priority.

---

## 6. Recommended Phase Order

### Phase 1: Stable Demo Workflow

This phase should focus only on the workflow that is already partially real.

Scope:

- candidate intake
- candidate storage
- quick summary and application content
- scoring and status
- Drive and Sheets sync
- candidate review visibility

Success criteria:

- HR can show an applicant moving from intake into the system
- candidate record is visible in the app
- candidate data is visible in Google Sheets
- Drive handoff works
- decision status is visible

### Phase 2: Core ATS Completion

This phase should make the database useful as an actual ATS.

Scope:

- source
- applied role
- salary expectation
- notice period
- communication status
- reply status
- interview status
- candidate timeline
- searchable and filterable candidate lifecycle fields

Success criteria:

- HR can track a candidate without leaving the system
- the system reflects more than score and email

### Phase 3: Internal Database Activation

This phase should unlock the existing internal candidate pool.

Scope:

- CSV or Excel import
- normalization
- duplicate handling
- audit report
- source tagging
- import health visibility

Success criteria:

- the 1500 internal records become usable as a sourcing asset

### Phase 4: JD Matching Engine

This phase should make screening role-aware instead of generic.

Scope:

- JD ingestion
- structured role criteria
- weighted fit rules
- must-have vs preferred criteria
- location and salary alignment
- explainable match scoring

Success criteria:

- scores reflect role relevance, not only generic resume parsing

### Phase 5: Communication Workflow

This phase should automate practical HR follow-up.

Scope:

- acknowledgment email
- shortlist follow-up
- salary and notice-period confirmation
- candidate reply tracking
- communication status timeline

Success criteria:

- HR knows who was contacted, who responded, and who is pending

### Phase 6: Interview Scheduling

This phase should remove scheduling friction.

Scope:

- calendar integration
- availability collection
- interview slot proposal
- confirmation and reminder workflow

Success criteria:

- shortlisted candidates can move from confirmed interest to scheduled interview with minimal manual effort

### Phase 7: External Posting and Sourcing

This phase should be approached carefully and compliantly.

Scope:

- job posting workflow
- HR approval before publish
- official APIs or approved partner integrations
- social distribution support
- controlled import flows where APIs do not exist

Success criteria:

- the system expands sourcing reach without creating platform risk

### Phase 8: Assessments, Offer, and Onboarding

This is valuable, but not the first operational bottleneck.

Scope:

- pre-screen questions
- structured evaluation scorecards
- offer templates
- onboarding handoff

Success criteria:

- post-shortlist flow becomes more standardized

---

## 7. What Should Be Deferred

To protect focus, the following items should not dominate the next build cycle:

- decorative analytics redesign for its own sake
- broad claims of full autonomy before the workflow is complete
- unsupported "auto-post everywhere" features
- scraping-first external sourcing strategies
- heavy assessment automation before candidate flow is stable

These are valid future capabilities, but they are not the highest-value next move.

---

## 8. What The Demo Should Present

The most credible demonstration should show a complete, narrow story.

### Recommended Demo Story

1. A candidate applies or is imported.
2. The system captures the record.
3. Resume/application content is stored.
4. Quick summary and fit status are generated.
5. The candidate appears in the ATS view.
6. The candidate is exported to Drive and Sheets.
7. HR can review and decide next action.

This is honest, operational, and strong enough to build trust.

---

## 9. Ownership Recommendation

If I were managing this product directly, I would define the immediate mission as:

`Turn the current prototype foundation into a reliable ATS and candidate workflow console before expanding into external posting, assessments, and advanced automation.`

That gives the project a sane center of gravity.

---

## 10. Final Recommendation

The best next move is not "more AI."

The best next move is:

- complete the ATS workflow
- make candidate records operationally complete
- activate the internal database
- make communication and scheduling traceable
- only then expand to external posting and multi-platform sourcing

This keeps the system useful, believable, and scalable.
