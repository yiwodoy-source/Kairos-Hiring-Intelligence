import path from 'path';
import { DbAdapter, RunResult, createPostgresAdapter, closePostgresPool } from './db/postgres_adapter';

// Re-export so callers can type their db parameter without importing from two places
export type { DbAdapter, RunResult };

// ── Mode detection ────────────────────────────────────────────────────────────

function isPostgresMode(): boolean {
    return Boolean(process.env.DATABASE_URL);
}

// ── Singleton connection ──────────────────────────────────────────────────────

let db: DbAdapter | null = null;
let dbInitPromise: Promise<DbAdapter> | null = null;

export async function getDb(): Promise<DbAdapter> {
    if (db) return db;
    if (dbInitPromise) return dbInitPromise;

    dbInitPromise = isPostgresMode()
        ? initializePostgres()
        : initializeSQLite();

    try {
        db = await dbInitPromise;
        return db;
    } finally {
        dbInitPromise = null;
    }
}

export async function closeDb(): Promise<void> {
    if (db) {
        if (isPostgresMode()) {
            await closePostgresPool();
        } else {
            // SQLite — cast back to access close()
            await (db as any).close?.();
        }
        db = null;
        console.log('[DB] Connection closed');
    }
}

// ── SQLite initialisation (existing behaviour) ────────────────────────────────

async function initializeSQLite(): Promise<DbAdapter> {
    // Lazy-load sqlite3 so the native module is only required in local dev
    // (Vercel serverless uses PostgreSQL via DATABASE_URL — sqlite3 native binaries
    // are not guaranteed to be compatible with the Lambda runtime).
    const sqlite3Module = await import('sqlite3');
    const { open } = await import('sqlite');
    const sqlite3 = sqlite3Module.default;

    const dbPath = path.resolve(process.cwd(), 'database.sqlite');

    const sqliteDb = await open({
        filename: dbPath,
        driver: sqlite3.Database,
    });

    await sqliteDb.exec('PRAGMA journal_mode = WAL;');
    await sqliteDb.exec('PRAGMA busy_timeout = 5000;');

    await createTablesSQLite(sqliteDb);

    const base = sqliteDb as unknown as DbAdapter;
    const adapter: DbAdapter = {
        get: base.get.bind(base),
        all: base.all.bind(base),
        run: base.run.bind(base),
        exec: base.exec.bind(base),
        async transaction<T>(fn: (db: DbAdapter) => Promise<T>): Promise<T> {
            await sqliteDb.run('BEGIN');
            try {
                const result = await fn(adapter);
                await sqliteDb.run('COMMIT');
                return result;
            } catch (err) {
                await sqliteDb.run('ROLLBACK');
                throw err;
            }
        },
    };

    await seedDatabase(adapter, false);

    console.log('[DB:sqlite] Schema ready');
    return adapter;
}

// ── PostgreSQL initialisation ─────────────────────────────────────────────────

async function initializePostgres(): Promise<DbAdapter> {
    const pgDb = createPostgresAdapter();

    await createTablesPostgres(pgDb);
    await migrateSchemaPostgres(pgDb);
    await seedDatabase(pgDb, true);
    await normalizeLegacyCandidateRecords(pgDb);

    console.log('[DB:postgres] Schema ready');
    return pgDb;
}

// ── SQLite schema (unchanged from original) ───────────────────────────────────

async function createTablesSQLite(sqliteDb: any) {
    await sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS candidates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT,
            location TEXT,
            years_experience REAL DEFAULT 0,
            current_role TEXT,
            skills TEXT,
            achievements TEXT,
            overall_score INTEGER CHECK(overall_score BETWEEN 0 AND 100),
            breakdown_score TEXT,
            decision_status TEXT DEFAULT 'Review Required',
            ai_reasoning TEXT,
            source TEXT,
            applied_role TEXT,
            expected_salary TEXT,
            notice_period TEXT,
            communication_status TEXT,
            reply_status TEXT,
            interview_status TEXT,
            interview_scheduled_at TEXT,
            interview_event_id TEXT,
            interview_meet_link TEXT,
            workflow_state TEXT,
            next_action TEXT,
            sourcing_stage TEXT,
            is_sourced INTEGER DEFAULT 0,
            profile_url TEXT,
            company TEXT,
            application_content TEXT,
            quick_summary TEXT,
            drive_file_link TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            department TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            join_date DATE NOT NULL,
            status TEXT CHECK(status IN ('Active', 'On Leave', 'Terminated')) DEFAULT 'Active',
            performance_rating REAL DEFAULT 0,
            avatar TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            department TEXT NOT NULL,
            location TEXT NOT NULL,
            type TEXT CHECK(type IN ('Full-time', 'Part-time', 'Contract', 'Internship')) DEFAULT 'Full-time',
            status TEXT CHECK(status IN ('Open', 'Closed', 'On Hold')) DEFAULT 'Open',
            description TEXT,
            requirements TEXT,
            posted_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            applicants_count INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS processed_email_messages (
            message_id TEXT PRIMARY KEY,
            sender_email TEXT,
            subject TEXT,
            status TEXT NOT NULL,
            processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS candidate_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            candidate_id INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            description TEXT NOT NULL,
            actor TEXT DEFAULT 'system',
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS agent_registry (
            agent_id TEXT PRIMARY KEY,
            agent_type TEXT NOT NULL,
            capabilities TEXT NOT NULL DEFAULT '[]',
            public_key TEXT NOT NULL,
            version TEXT NOT NULL DEFAULT '1.0.0',
            status TEXT NOT NULL DEFAULT 'active',
            current_load INTEGER DEFAULT 0,
            last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS agent_tasks (
            task_id TEXT PRIMARY KEY,
            task_type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            priority INTEGER DEFAULT 5,
            payload TEXT NOT NULL DEFAULT '{}',
            assigned_to TEXT,
            parent_task_id TEXT,
            result TEXT,
            error TEXT,
            retries INTEGER DEFAULT 0,
            max_retries INTEGER DEFAULT 3,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            assigned_at DATETIME,
            started_at DATETIME,
            completed_at DATETIME
        );

        CREATE TABLE IF NOT EXISTS agent_decisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT,
            agent_id TEXT NOT NULL,
            agent_type TEXT NOT NULL,
            candidate_email TEXT,
            decision_type TEXT NOT NULL,
            reasoning TEXT,
            confidence TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS whatsapp_messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            phone       TEXT NOT NULL,
            direction   TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
            body        TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'pending',
            candidate_email TEXT,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await migrateSchema(sqliteDb);

    await sqliteDb.exec(`
        CREATE INDEX IF NOT EXISTS idx_wa_phone ON whatsapp_messages(phone, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_wa_candidate ON whatsapp_messages(candidate_email);
        CREATE INDEX IF NOT EXISTS idx_candidates_created ON candidates(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_candidates_status_score ON candidates(decision_status, overall_score DESC);
        CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(email);
        CREATE INDEX IF NOT EXISTS idx_candidates_job_id ON candidates(job_id);
        CREATE INDEX IF NOT EXISTS idx_processed_email_status ON processed_email_messages(status, processed_at DESC);
        CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees(department);
        CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
        CREATE INDEX IF NOT EXISTS idx_candidate_events_candidate ON candidate_events(candidate_id, created_at DESC);
    `);
}

// ── PostgreSQL schema ─────────────────────────────────────────────────────────

async function createTablesPostgres(db: DbAdapter) {
    // Create tables one at a time — exec() splits on ; but complex multi-statement
    // DDL is clearer written as individual calls.
    await db.exec(`
        CREATE TABLE IF NOT EXISTS candidates (
            id BIGSERIAL PRIMARY KEY,
            job_id BIGINT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT,
            location TEXT,
            years_experience REAL DEFAULT 0,
            "current_role" TEXT,
            skills TEXT,
            achievements TEXT,
            overall_score INTEGER CHECK(overall_score BETWEEN 0 AND 100),
            breakdown_score TEXT,
            decision_status TEXT DEFAULT 'Review Required',
            ai_reasoning TEXT,
            source TEXT,
            applied_role TEXT,
            expected_salary TEXT,
            notice_period TEXT,
            communication_status TEXT,
            reply_status TEXT,
            interview_status TEXT,
            interview_scheduled_at TEXT,
            interview_event_id TEXT,
            interview_meet_link TEXT,
            workflow_state TEXT,
            next_action TEXT,
            sourcing_stage TEXT,
            is_sourced INTEGER DEFAULT 0,
            profile_url TEXT,
            company TEXT,
            application_content TEXT,
            quick_summary TEXT,
            drive_file_link TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS employees (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            department TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            join_date DATE NOT NULL,
            status TEXT CHECK(status IN ('Active', 'On Leave', 'Terminated')) DEFAULT 'Active',
            performance_rating REAL DEFAULT 0,
            avatar TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS jobs (
            id BIGSERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            department TEXT NOT NULL,
            location TEXT NOT NULL,
            type TEXT CHECK(type IN ('Full-time', 'Part-time', 'Contract', 'Internship')) DEFAULT 'Full-time',
            status TEXT CHECK(status IN ('Open', 'Closed', 'On Hold')) DEFAULT 'Open',
            description TEXT,
            requirements TEXT,
            posted_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            applicants_count INTEGER DEFAULT 0
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS processed_email_messages (
            message_id TEXT PRIMARY KEY,
            sender_email TEXT,
            subject TEXT,
            status TEXT NOT NULL,
            processed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS candidate_events (
            id BIGSERIAL PRIMARY KEY,
            candidate_id BIGINT NOT NULL,
            event_type TEXT NOT NULL,
            description TEXT NOT NULL,
            actor TEXT DEFAULT 'system',
            metadata TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Indexes
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_candidates_created ON candidates(created_at DESC)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_candidates_status_score ON candidates(decision_status, overall_score DESC)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(email)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_candidates_job_id ON candidates(job_id)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_processed_email_status ON processed_email_messages(status, processed_at DESC)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees(department)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_candidate_events_candidate ON candidate_events(candidate_id, created_at DESC)`);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS agent_registry (
            agent_id TEXT PRIMARY KEY,
            agent_type TEXT NOT NULL,
            capabilities TEXT NOT NULL DEFAULT '[]',
            public_key TEXT NOT NULL,
            version TEXT NOT NULL DEFAULT '1.0.0',
            status TEXT NOT NULL DEFAULT 'active',
            current_load INTEGER DEFAULT 0,
            last_heartbeat TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS agent_tasks (
            task_id TEXT PRIMARY KEY,
            task_type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            priority INTEGER DEFAULT 5,
            payload TEXT NOT NULL DEFAULT '{}',
            assigned_to TEXT,
            parent_task_id TEXT,
            result TEXT,
            error TEXT,
            retries INTEGER DEFAULT 0,
            max_retries INTEGER DEFAULT 3,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            assigned_at TIMESTAMPTZ,
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS agent_decisions (
            id BIGSERIAL PRIMARY KEY,
            task_id TEXT,
            agent_id TEXT NOT NULL,
            agent_type TEXT NOT NULL,
            candidate_email TEXT,
            decision_type TEXT NOT NULL,
            reasoning TEXT,
            confidence TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status, priority ASC, created_at ASC)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_tasks_type ON agent_tasks(task_type, status)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_registry_type ON agent_registry(agent_type, status)`);

    // WhatsApp message log
    await db.exec(`
        CREATE TABLE IF NOT EXISTS whatsapp_messages (
            id          BIGSERIAL PRIMARY KEY,
            phone       TEXT NOT NULL,
            direction   TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
            body        TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'pending',
            candidate_email TEXT,
            created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_wa_phone ON whatsapp_messages(phone, created_at DESC)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_wa_candidate ON whatsapp_messages(candidate_email)`);
}

// ── PostgreSQL column migration ───────────────────────────────────────────────

async function getColumnsPostgres(db: DbAdapter, tableName: string): Promise<string[]> {
    const rows = await db.all<{ name: string }>(
        `SELECT column_name AS name FROM information_schema.columns WHERE table_name = ? AND table_schema = 'public'`,
        [tableName]
    );
    return rows.map((r) => r.name);
}

async function migrateSchemaPostgres(db: DbAdapter) {
    const candidateColumns = await getColumnsPostgres(db, 'candidates');

    const newColumns: [string, string][] = [
        ['job_id', 'BIGINT'],
        ['application_content', 'TEXT'],
        ['quick_summary', 'TEXT'],
        ['source', 'TEXT'],
        ['applied_role', 'TEXT'],
        ['expected_salary', 'TEXT'],
        ['notice_period', 'TEXT'],
        ['communication_status', 'TEXT'],
        ['reply_status', 'TEXT'],
        ['interview_status', 'TEXT'],
        ['interview_scheduled_at', 'TEXT'],
        ['interview_event_id', 'TEXT'],
        ['interview_meet_link', 'TEXT'],
        ['workflow_state', 'TEXT'],
        ['next_action', 'TEXT'],
        ['sourcing_stage', 'TEXT'],
        ['is_sourced', 'INTEGER DEFAULT 0'],
        ['profile_url', 'TEXT'],
        ['company', 'TEXT'],
        ['drive_file_link', 'TEXT'],
    ];

    for (const [col, colType] of newColumns) {
        if (!candidateColumns.includes(col)) {
            await db.exec(`ALTER TABLE candidates ADD COLUMN ${col} ${colType}`);
        }
    }

    // Set defaults for any NULLs introduced by new columns
    await db.exec(`
        UPDATE candidates SET
            source = CASE WHEN source IS NOT NULL AND TRIM(source) <> '' THEN source
                          WHEN email LIKE '%@internal.local' THEN 'Manual Upload'
                          ELSE 'Historical Import' END,
            applied_role = CASE WHEN applied_role IS NOT NULL AND TRIM(applied_role) <> '' THEN applied_role
                                WHEN "current_role" IS NOT NULL AND TRIM("current_role") <> '' THEN "current_role"
                                ELSE 'Role Pending' END,
            expected_salary   = COALESCE(expected_salary, ''),
            notice_period     = COALESCE(notice_period, ''),
            communication_status = CASE WHEN communication_status IS NOT NULL AND TRIM(communication_status) <> '' THEN communication_status
                                        ELSE 'Not Contacted' END,
            reply_status      = CASE WHEN reply_status IS NOT NULL AND TRIM(reply_status) <> '' THEN reply_status
                                     ELSE 'No Reply' END,
            interview_status  = CASE WHEN interview_status IS NOT NULL AND TRIM(interview_status) <> '' THEN interview_status
                                     ELSE 'Not Scheduled' END,
            workflow_state    = CASE WHEN workflow_state IS NOT NULL AND TRIM(workflow_state) <> '' THEN workflow_state
                                     WHEN decision_status = 'Shortlisted' THEN 'Interview Ready'
                                     WHEN decision_status = 'Review Required' THEN 'Awaiting Review'
                                     WHEN decision_status = 'Rejected' THEN 'Closed'
                                     ELSE 'New Intake' END,
            next_action       = CASE WHEN next_action IS NOT NULL AND TRIM(next_action) <> '' THEN next_action
                                     WHEN decision_status = 'Shortlisted' THEN 'Collect candidate availability'
                                     WHEN decision_status = 'Review Required' THEN 'Review candidate fit'
                                     WHEN decision_status = 'Rejected' THEN 'No action required'
                                     ELSE 'Screen candidate' END,
            application_content = COALESCE(application_content, ''),
            quick_summary       = COALESCE(quick_summary, '')
    `);
}

// ── SQLite schema migration (kept for SQLite path) ────────────────────────────

async function migrateSchema(sqliteDb: any) {
    const candidateColumns = await sqliteDb.all('PRAGMA table_info(candidates)') as Array<{ name: string }>;

    const checks: Record<string, string> = {
        job_id: 'INTEGER',
        application_content: 'TEXT',
        quick_summary: 'TEXT',
        source: 'TEXT',
        applied_role: 'TEXT',
        expected_salary: 'TEXT',
        notice_period: 'TEXT',
        communication_status: 'TEXT',
        reply_status: 'TEXT',
        interview_status: 'TEXT',
        interview_scheduled_at: 'TEXT',
        interview_event_id: 'TEXT',
        interview_meet_link: 'TEXT',
        workflow_state: 'TEXT',
        next_action: 'TEXT',
        sourcing_stage: 'TEXT',
        is_sourced: 'INTEGER DEFAULT 0',
        profile_url: 'TEXT',
        company: 'TEXT',
        drive_file_link: 'TEXT',
    };

    for (const [col, colDef] of Object.entries(checks)) {
        if (!candidateColumns.some((c: any) => c.name === col)) {
            await sqliteDb.exec(`ALTER TABLE candidates ADD COLUMN ${col} ${colDef}`);
        }
    }

    await sqliteDb.exec(`
        UPDATE candidates SET
            source = CASE WHEN source IS NOT NULL AND TRIM(source) <> '' THEN source
                          WHEN email LIKE '%@internal.local' THEN 'Manual Upload'
                          ELSE 'Historical Import' END,
            applied_role = CASE WHEN applied_role IS NOT NULL AND TRIM(applied_role) <> '' THEN applied_role
                                WHEN "current_role" IS NOT NULL AND TRIM("current_role") <> '' THEN "current_role"
                                ELSE 'Role Pending' END,
            expected_salary   = COALESCE(expected_salary, ''),
            notice_period     = COALESCE(notice_period, ''),
            communication_status = CASE WHEN communication_status IS NOT NULL AND TRIM(communication_status) <> '' THEN communication_status
                                        ELSE 'Not Contacted' END,
            reply_status      = CASE WHEN reply_status IS NOT NULL AND TRIM(reply_status) <> '' THEN reply_status
                                     ELSE 'No Reply' END,
            interview_status  = CASE WHEN interview_status IS NOT NULL AND TRIM(interview_status) <> '' THEN interview_status
                                     ELSE 'Not Scheduled' END,
            workflow_state    = CASE WHEN workflow_state IS NOT NULL AND TRIM(workflow_state) <> '' THEN workflow_state
                                     WHEN decision_status = 'Shortlisted' THEN 'Interview Ready'
                                     WHEN decision_status = 'Review Required' THEN 'Awaiting Review'
                                     WHEN decision_status = 'Rejected' THEN 'Closed'
                                     ELSE 'New Intake' END,
            next_action       = CASE WHEN next_action IS NOT NULL AND TRIM(next_action) <> '' THEN next_action
                                     WHEN decision_status = 'Shortlisted' THEN 'Collect candidate availability'
                                     WHEN decision_status = 'Review Required' THEN 'Review candidate fit'
                                     WHEN decision_status = 'Rejected' THEN 'No action required'
                                     ELSE 'Screen candidate' END,
            sourcing_stage = CASE WHEN sourcing_stage IS NOT NULL AND TRIM(sourcing_stage) <> '' THEN sourcing_stage
                                  WHEN source LIKE '%LinkedIn%' OR source LIKE '%Indeed%' OR source LIKE '%GitHub%' THEN 'Discovered'
                                  ELSE sourcing_stage END,
            is_sourced = CASE WHEN is_sourced = 1 THEN 1
                              WHEN source LIKE '%LinkedIn%' OR source LIKE '%Indeed%' OR source LIKE '%GitHub%' THEN 1
                              ELSE 0 END,
            application_content = COALESCE(application_content, ''),
            quick_summary       = COALESCE(quick_summary, '')
    `);

    await normalizeLegacyCandidateRecords(sqliteDb);
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function titleCaseWords(value: string): string {
    return value
        .toLowerCase()
        .split(/[\s._-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function looksLikeRoleGarbage(value: string): boolean {
    const normalized = (value || '').trim();
    if (!normalized) return true;
    const lower = normalized.toLowerCase();
    return (
        lower.startsWith('email:') ||
        lower.startsWith('date') ||
        lower.includes('phone:') ||
        lower.includes('linkedin:') ||
        lower.includes('want achieve') ||
        lower.includes('basis of my skills') ||
        /^[A-Z\s]{8,}$/.test(normalized)
    );
}

function deriveNameFromEmail(email: string): { firstName: string; lastName: string } | null {
    const localPart = (email || '').split('@')[0];
    if (!localPart) return null;
    const cleaned = localPart.replace(/[0-9]+$/g, '');
    const parts = cleaned.split(/[._-]+/).filter(Boolean);
    if (parts.length === 0) return null;
    return {
        firstName: titleCaseWords(parts[0]) || 'Candidate',
        lastName: titleCaseWords(parts.slice(1).join(' ')),
    };
}

function deriveNameFromCandidateText(value: string): { firstName: string; lastName: string } | null {
    const normalized = (value || '').trim().replace(/\s+/g, ' ');
    if (!normalized) return null;
    if (!/^[A-Za-z\s]{5,40}$/.test(normalized)) return null;
    const parts = normalized.toLowerCase().split(' ').filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1));
    if (parts.length < 2 || parts.length > 4) return null;
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function deriveRoleFromApplicationContent(content: string): string {
    const match = (content || '').toLowerCase().match(
        /apply(?:ing)? for\s+(?:the\s+)?([a-z0-9\s/&-]{3,80}?)(?:\s+role|\s+position|[.!,$]|$)/i
    );
    if (!match?.[1]) return '';
    return match[1]
        .split(/\s+/)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ')
        .replace(/\bAnd\b/g, 'and');
}

async function normalizeLegacyCandidateRecords(db: DbAdapter) {
    const rows = await db.all<{
        id: number;
        first_name: string;
        last_name: string;
        email: string;
        current_role: string | null;
        applied_role: string | null;
        application_content: string | null;
        source: string | null;
    }>(`SELECT id, first_name, last_name, email, "current_role", applied_role, application_content, source FROM candidates`);

    for (const row of rows) {
        let firstName = row.first_name || '';
        let lastName = row.last_name || '';
        let currentRole = row.current_role || '';
        let appliedRole = row.applied_role || '';

        const emailName = deriveNameFromEmail(row.email);
        const textName = deriveNameFromCandidateText(row.current_role || row.applied_role || '');
        const roleFromContent = deriveRoleFromApplicationContent(row.application_content || '');

        if (
            firstName.trim().toUpperCase() === 'RESUME' ||
            firstName.trim().toUpperCase() === 'AS' ||
            firstName.trim().toUpperCase() === 'GIMBOOKS' ||
            firstName.trim().length <= 2
        ) {
            if (textName) {
                firstName = textName.firstName;
                lastName = textName.lastName;
            } else if (emailName) {
                firstName = emailName.firstName;
                lastName = emailName.lastName;
            }
        }

        if (looksLikeRoleGarbage(currentRole)) currentRole = '';
        if (looksLikeRoleGarbage(appliedRole)) appliedRole = '';
        if (!appliedRole && roleFromContent) appliedRole = roleFromContent;

        await db.run(
            `UPDATE candidates SET first_name = ?, last_name = ?, "current_role" = ?, applied_role = ? WHERE id = ?`,
            [firstName || 'Candidate', lastName || '', currentRole, appliedRole, row.id]
        );
    }
}

// ── Seed data ─────────────────────────────────────────────────────────────────

async function seedDatabase(db: DbAdapter, isPostgres: boolean) {
    const empRow = await db.get<{ count: string | number }>('SELECT COUNT(*) as count FROM employees');
    if (Number(empRow?.count ?? 0) === 0) {
        console.log('[DB] Seeding employees...');
        await db.run(
            `INSERT INTO employees (name, role, department, email, join_date, status, performance_rating, avatar) VALUES
             (?, ?, ?, ?, ?, ?, ?, ?)`,
            ['Sarah Jenkins', 'Senior React Engineer', 'Engineering', 'sarah.j@nexushr.com', '2022-03-15', 'Active', 4.8, 'https://picsum.photos/seed/sarah/200']
        );
        await db.run(
            `INSERT INTO employees (name, role, department, email, join_date, status, performance_rating, avatar) VALUES
             (?, ?, ?, ?, ?, ?, ?, ?)`,
            ['Michael Chen', 'Product Manager', 'Product', 'm.chen@nexushr.com', '2021-11-01', 'Active', 4.2, 'https://picsum.photos/seed/michael/200']
        );
        await db.run(
            `INSERT INTO employees (name, role, department, email, join_date, status, performance_rating, avatar) VALUES
             (?, ?, ?, ?, ?, ?, ?, ?)`,
            ['Emily Davis', 'UX Designer', 'Design', 'emily.d@nexushr.com', '2023-06-10', 'On Leave', 3.9, 'https://picsum.photos/seed/emily/200']
        );
    }

    const jobRow = await db.get<{ count: string | number }>('SELECT COUNT(*) as count FROM jobs');
    if (Number(jobRow?.count ?? 0) === 0) {
        console.log('[DB] Seeding jobs...');
        await ensureBaselineHiringRoles(db);
    } else {
        await ensureBaselineHiringRoles(db);
    }
}

async function ensureBaselineHiringRoles(db: DbAdapter) {
    const baselineJobs = [
        {
            title: 'Frontend Developer',
            department: 'Engineering',
            location: 'Remote',
            type: 'Full-time',
            status: 'Open',
            description: 'Build and maintain modern web applications with strong frontend engineering standards.',
            requirements: ['React', 'TypeScript', 'Tailwind', 'Node.js', 'Responsive UI'],
        },
        {
            title: 'Marketing Specialist',
            department: 'Marketing',
            location: 'New York, NY',
            type: 'Full-time',
            status: 'Open',
            description: 'Own campaign execution, content coordination, and performance tracking across digital growth channels.',
            requirements: ['SEO', 'Content Marketing', 'Analytics', 'Social Media', 'Campaign Management'],
        },
        {
            title: 'SDR and BDR',
            department: 'Sales',
            location: 'Bengaluru',
            type: 'Full-time',
            status: 'Open',
            description: 'Drive outbound prospecting, lead generation, CRM hygiene, and top-of-funnel meeting creation.',
            requirements: ['Lead Generation', 'Cold Outreach', 'CRM', 'B2B Sales', 'Prospecting', 'Communication'],
        },
        {
            title: 'Social Media Executive',
            department: 'Marketing',
            location: 'Remote',
            type: 'Full-time',
            status: 'Open',
            description: 'Manage content publishing, community engagement, and campaign execution across social platforms.',
            requirements: ['Social Media', 'Content Creation', 'Campaign Management', 'Analytics', 'Community Management'],
        },
    ];

    for (const job of baselineJobs) {
        const existing = await db.get<{ id: number }>(
            `SELECT id FROM jobs WHERE LOWER(title) = LOWER(?) LIMIT 1`,
            [job.title]
        );

        if (existing?.id) {
            await db.run(
                `UPDATE jobs SET department = ?, location = ?, type = ?, status = ?, description = ?, requirements = ? WHERE id = ?`,
                [job.department, job.location, job.type, job.status, job.description, JSON.stringify(job.requirements), existing.id]
            );
        } else {
            await db.run(
                `INSERT INTO jobs (title, department, location, type, status, description, requirements) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [job.title, job.department, job.location, job.type, job.status, job.description, JSON.stringify(job.requirements)]
            );
        }
    }
}
