# NexusHR AI Recruitment Automation Roadmap

## 1. Executive Objective

The objective is to build an AI-driven recruitment automation system that can help the HR team manage hiring for approximately 30-50 candidates per month with significantly less manual coordination.

The intended end state is an internal system where operational recruitment work is automated across sourcing, matching, shortlisting, candidate outreach, confirmation, and interview scheduling. Human involvement should be focused on final personal interviews, final selection, and joining decisions.

This project is an internal productivity initiative, not a client-facing or commercial product.

---

## 2. Business Pain Being Solved

Current hiring operations require repeated manual effort across multiple steps:

- understanding the hiring requirement for each role
- searching across multiple candidate sources
- checking whether candidates match salary, experience, location, and skills
- calling or messaging candidates manually
- following up to confirm interest and availability
- coordinating interview timing
- keeping the hiring owner updated

At low volume, this is manageable. At 30-50 hires per month, manual coordination becomes a bottleneck and increases the risk of missed candidates, delayed follow-up, inconsistent screening, and poor operational visibility.

The business problem is not only candidate sourcing. The bigger problem is recruitment throughput.

---

## 3. Target Operating Model

The desired recruitment workflow should operate as follows:

1. HR or the hiring owner provides the job description and hiring criteria.
2. The system understands the requirement and converts it into structured matching criteria.
3. The system searches internal and approved external candidate sources.
4. Candidates are scored and ranked based on fit.
5. Only relevant candidates are shortlisted.
6. Shortlisted candidates are contacted automatically through approved communication channels.
7. Candidate interest, salary expectation, location fit, notice period, and availability are confirmed.
8. Interviews are scheduled automatically based on the hiring owner's availability.
9. The hiring owner remains informed and only joins at the final interview and decision stage.

The intended result is a recruitment workflow where AI handles operational activity and humans handle judgment.

---

## 4. Candidate Sources

### Internal Source

- Existing internal candidate database of approximately 1500 records.
- This should become the first source of truth before external sourcing.

### External Sources

The long-term system should support sourcing from job portals and public candidate platforms such as:

- LinkedIn
- Indeed
- Naukri
- Apna
- WorkIndia
- Job Hai
- Internshala
- Freshersworld
- Shine
- PlacementIndia
- Quikr Jobs
- ClickIndia
- OLX Jobs
- Jora Jobs
- Foundit

Important implementation note:

External sourcing must be done through approved APIs, official integrations, partner access, CSV imports, browser-assisted workflows, or compliant data ingestion methods. The system should not rely on scraping approaches that violate platform terms or create account risk.

---

## 5. Matching and Shortlisting Criteria

The system should shortlist candidates using structured relevance signals, including:

- job role alignment
- required skills
- preferred skills
- experience level
- salary expectation
- current or preferred location
- notice period
- employment type
- education or certification where relevant
- communication readiness
- previous interaction history

The matching result should produce:

- fit score
- shortlist recommendation
- rejection or review reason
- missing information flags
- recommended next action

The system should avoid sending candidates forward when critical information is missing or misaligned.

---

## 6. Communication Automation

The system should automatically approach shortlisted candidates through approved channels.

### Target Channels

- Email
- WhatsApp
- SMS
- Calls

### Recommended Implementation Order

1. Email
2. WhatsApp or SMS
3. Calling integration

This order reduces implementation risk and gives HR a reliable communication baseline before moving into more complex voice automation.

### Communication Goals

Candidate communication should confirm:

- interest in the role
- expected salary
- current salary where required
- notice period
- location preference
- work mode preference
- availability for interview
- consent to proceed

The system should keep the hiring owner in the loop through status updates, not by forwarding every raw interaction.

---

## 7. Interview Scheduling

The final target is automated interview scheduling based on hiring owner availability.

The scheduling system should:

- check available interview slots
- propose slots to the candidate
- confirm candidate acceptance
- create the interview event
- send calendar invites
- notify the hiring owner
- record the scheduled status against the candidate

No candidate should be scheduled unless the system has confirmed basic alignment on role, salary, experience, location, and availability.

---

## 8. Human Role After Automation

The hiring owner's role should be limited to:

- final personal interview
- final selection decision
- joining decision
- escalation handling for exceptional candidates

The system should handle:

- sourcing
- initial screening
- shortlisting
- candidate outreach
- confirmation
- interview scheduling
- operational tracking

---

## 9. Functional Modules

### A. Requirement Intake

Purpose:

- Convert JD and hiring criteria into structured search and matching requirements.

Core features:

- JD upload or manual entry
- required and preferred criteria extraction
- salary range capture
- location and work-mode capture
- experience range capture
- must-have knockout criteria

### B. Candidate Database

Purpose:

- Store, search, and enrich internal candidate records.

Core features:

- import existing 1500 candidate records
- normalize candidate fields
- deduplicate candidate records
- track previous contact history
- track candidate stage and availability

### C. Sourcing Engine

Purpose:

- Search internal and approved external sources.

Core features:

- internal database search
- portal-specific integration strategy
- CSV/import workflows where APIs are unavailable
- source attribution
- duplicate detection across sources

### D. Matching Engine

Purpose:

- Rank candidates based on relevance to the role.

Core features:

- skill match scoring
- experience scoring
- salary fit scoring
- location fit scoring
- role alignment scoring
- explainable shortlist recommendation

### E. Outreach Engine

Purpose:

- Contact candidates and collect confirmations.

Core features:

- email templates
- WhatsApp/SMS templates
- staged follow-up rules
- candidate response tracking
- consent and readiness capture

### F. Scheduling Engine

Purpose:

- Schedule confirmed candidates for interviews.

Core features:

- calendar availability integration
- candidate slot selection
- automatic event creation
- reminders
- hiring owner notifications

### G. Operations Dashboard

Purpose:

- Give HR and hiring owners visibility into pipeline health.

Core features:

- total sourced
- shortlisted
- contacted
- interested
- not interested
- scheduled
- interviewed
- selected
- pending action
- failed automation steps

---

## 10. Implementation Phases

### Phase 1: Stabilize Core System

Goal:

- Make the current NexusHR app reliable enough to use as the foundation.

Deliverables:

- stable login and authenticated navigation
- consistent UI/UX across primary screens
- reliable candidate database schema
- working candidate shortlist status flow
- Drive and Sheets export reliability
- clear logs and error states

Status:

- In progress.

### Phase 2: Internal Database Automation

Goal:

- Use the existing 1500 internal candidate records as the first automated sourcing pool.

Deliverables:

- candidate import pipeline
- candidate normalization
- duplicate detection
- structured search
- JD-to-candidate matching
- shortlist scoring

### Phase 3: Communication Automation

Goal:

- Automatically contact shortlisted candidates and collect readiness information.

Deliverables:

- email outreach flow
- candidate response capture
- salary, location, notice period, and interest confirmation
- follow-up rules
- hiring owner status updates

### Phase 4: Interview Scheduling

Goal:

- Schedule interviews automatically after candidate alignment is confirmed.

Deliverables:

- calendar integration
- available slot detection
- candidate slot confirmation
- interview event creation
- notification and reminder flow

### Phase 5: External Source Expansion

Goal:

- Extend sourcing beyond the internal database.

Deliverables:

- approved integration strategy for each portal
- source-specific ingestion workflows
- compliance review for each external source
- unified candidate matching across sources

### Phase 6: Production Readiness

Goal:

- Prepare the system for regular HR operations.

Deliverables:

- operational dashboard
- audit logs
- failure recovery
- role-based access where needed
- backup and data protection process
- user acceptance testing

---

## 11. Key Risks

### External Portal Access

Many job portals restrict automated scraping or messaging. This must be handled through compliant integrations, exports, APIs, or controlled workflows.

### Communication Compliance

WhatsApp, SMS, email, and calling automation must follow consent, rate limit, and anti-spam requirements.

### Candidate Data Quality

The internal database may contain incomplete, duplicate, outdated, or inconsistent records. Data normalization is a prerequisite for reliable automation.

### AI Decision Quality

AI shortlisting must be explainable and auditable. The system should support human override and should not silently reject candidates without traceable reasons.

### Calendar and Scheduling Accuracy

Interview scheduling must avoid double-booking and should not create events unless candidate readiness has been confirmed.

---

## 12. Success Measures

The system should be measured by operational outcomes:

- number of candidates processed per role
- number of relevant candidates shortlisted
- percentage of candidates successfully contacted
- candidate response rate
- number of interviews scheduled automatically
- reduction in manual calling and follow-up effort
- time from JD input to interview-ready candidate
- hiring owner satisfaction
- HR team adoption

The target outcome is not simply automation. The target outcome is reliable hiring capacity at 30-50 candidates per month.

---

## 13. June 30 Review Target

As discussed, the project review and assessment is planned for June 30.

Recommended review scope:

1. Demonstrate stable login and dashboard navigation.
2. Demonstrate JD input and structured requirement extraction.
3. Demonstrate internal candidate database search.
4. Demonstrate candidate matching and ranking.
5. Demonstrate shortlist generation with explainable reasons.
6. Demonstrate candidate outreach workflow for at least one channel.
7. Demonstrate interview scheduling concept or working prototype.
8. Review remaining blockers for external portal integration.

The June 30 review should focus on whether the system can realistically become the operating layer for high-volume internal recruitment.

---

## 14. Immediate Next Actions

1. Complete UI/UX stabilization of the current app.
2. Finalize the candidate database schema required for the 1500-record import.
3. Add structured job requirement intake fields.
4. Build the internal candidate search and matching engine.
5. Add shortlist reason codes and readiness fields.
6. Implement email-based candidate outreach as the first communication channel.
7. Design the calendar scheduling workflow.

---

## 15. Ownership Position

This initiative should be treated as a workflow transformation project, not just a software build.

The system must reduce manual effort, improve hiring speed, preserve candidate quality, and keep the hiring owner focused only on final interviews and final decisions.

The development direction from this point forward should prioritize:

- reliability
- clear HR workflows
- candidate data quality
- explainable automation
- compliant integrations
- measurable time savings
