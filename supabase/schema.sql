-- ============================================================
-- Kairos HR AI — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- before pointing DATABASE_URL at your project.
-- ============================================================

-- Candidates pipeline
CREATE TABLE IF NOT EXISTS candidates (
    id                   BIGSERIAL PRIMARY KEY,
    job_id               BIGINT,
    first_name           TEXT NOT NULL,
    last_name            TEXT NOT NULL,
    email                TEXT UNIQUE NOT NULL,
    phone                TEXT,
    location             TEXT,
    years_experience     REAL DEFAULT 0,
    current_role         TEXT,
    skills               TEXT,           -- JSON array: string[]
    achievements         TEXT,           -- JSON array: string[]
    overall_score        INTEGER CHECK(overall_score BETWEEN 0 AND 100),
    breakdown_score      TEXT,           -- JSON object
    decision_status      TEXT DEFAULT 'Review Required',
    ai_reasoning         TEXT,           -- JSON object
    source               TEXT,
    applied_role         TEXT,
    expected_salary      TEXT,
    notice_period        TEXT,
    communication_status TEXT,
    reply_status         TEXT,
    interview_status     TEXT,
    interview_scheduled_at TEXT,
    interview_event_id   TEXT,
    interview_meet_link  TEXT,
    workflow_state       TEXT,
    next_action          TEXT,
    sourcing_stage       TEXT,
    is_sourced           INTEGER DEFAULT 0,
    profile_url          TEXT,
    company              TEXT,
    application_content  TEXT,
    quick_summary        TEXT,
    drive_file_link      TEXT,
    created_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Employee directory
CREATE TABLE IF NOT EXISTS employees (
    id                 BIGSERIAL PRIMARY KEY,
    name               TEXT NOT NULL,
    role               TEXT NOT NULL,
    department         TEXT NOT NULL,
    email              TEXT UNIQUE NOT NULL,
    join_date          DATE NOT NULL,
    status             TEXT CHECK(status IN ('Active', 'On Leave', 'Terminated')) DEFAULT 'Active',
    performance_rating REAL DEFAULT 0,
    avatar             TEXT,
    created_at         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Open job postings
CREATE TABLE IF NOT EXISTS jobs (
    id               BIGSERIAL PRIMARY KEY,
    title            TEXT NOT NULL,
    department       TEXT NOT NULL,
    location         TEXT NOT NULL,
    type             TEXT CHECK(type IN ('Full-time', 'Part-time', 'Contract', 'Internship')) DEFAULT 'Full-time',
    status           TEXT CHECK(status IN ('Open', 'Closed', 'On Hold')) DEFAULT 'Open',
    description      TEXT,
    requirements     TEXT,              -- JSON array: string[]
    posted_date      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    applicants_count INTEGER DEFAULT 0
);

-- Gmail deduplication log
CREATE TABLE IF NOT EXISTS processed_email_messages (
    message_id   TEXT PRIMARY KEY,
    sender_email TEXT,
    subject      TEXT,
    status       TEXT NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Candidate activity timeline
CREATE TABLE IF NOT EXISTS candidate_events (
    id           BIGSERIAL PRIMARY KEY,
    candidate_id BIGINT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    event_type   TEXT NOT NULL,
    description  TEXT NOT NULL,
    actor        TEXT DEFAULT 'system',
    metadata     TEXT,
    created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_candidates_created        ON candidates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_status_score   ON candidates(decision_status, overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_email          ON candidates(email);
CREATE INDEX IF NOT EXISTS idx_candidates_job_id         ON candidates(job_id);
CREATE INDEX IF NOT EXISTS idx_processed_email_status    ON processed_email_messages(status, processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_employees_dept            ON employees(department);
CREATE INDEX IF NOT EXISTS idx_jobs_status               ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_candidate_events_candidate ON candidate_events(candidate_id, created_at DESC);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- The backend connects via the service role / direct DB URL which bypasses RLS.
-- Disable RLS on all tables so the backend can read/write freely.
-- If you want to add client-side realtime later, re-enable RLS and add policies.
ALTER TABLE candidates               DISABLE ROW LEVEL SECURITY;
ALTER TABLE employees                DISABLE ROW LEVEL SECURITY;
ALTER TABLE jobs                     DISABLE ROW LEVEL SECURITY;
ALTER TABLE processed_email_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_events         DISABLE ROW LEVEL SECURITY;
