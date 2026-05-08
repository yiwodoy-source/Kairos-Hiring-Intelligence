import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

let db: Database | null = null;
let dbInitPromise: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
    // Return existing connection if available
    if (db) return db;

    // Prevent concurrent initialization
    if (dbInitPromise) {
        return dbInitPromise;
    }

    dbInitPromise = initializeDatabase();
    
    try {
        db = await dbInitPromise;
        return db;
    } finally {
        dbInitPromise = null;
    }
}

async function initializeDatabase(): Promise<Database> {
    const dbPath = path.resolve(process.cwd(), 'database.sqlite');

    const sqliteDb = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    // Enable WAL mode for better concurrent access
    await sqliteDb.exec('PRAGMA journal_mode = WAL;');
    await sqliteDb.exec('PRAGMA busy_timeout = 5000;');

    await createTables(sqliteDb);
    await seedDatabase(sqliteDb);
    
    console.log('[DB] Database schema optimized and seeded');
    
    return sqliteDb;
}

async function createTables(sqliteDb: Database) {
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
            skills TEXT, -- JSON Array: string[]
            achievements TEXT, -- JSON Array: string[]
            overall_score INTEGER CHECK(overall_score BETWEEN 0 AND 100),
            breakdown_score TEXT, -- JSON Object: { [category: string]: number }
            decision_status TEXT DEFAULT 'Review Required',
            ai_reasoning TEXT, -- JSON Object: { [key: string]: string }
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
            requirements TEXT, -- JSON Array: string[]
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
    `);

    await migrateSchema(sqliteDb);

    // Create indexes for performance
    await sqliteDb.exec(`
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

async function migrateSchema(sqliteDb: Database) {
    const candidateColumns = await sqliteDb.all('PRAGMA table_info(candidates)') as Array<{ name: string }>;
    const hasJobId = candidateColumns.some(column => column.name === 'job_id');
    const hasSource = candidateColumns.some(column => column.name === 'source');
    const hasAppliedRole = candidateColumns.some(column => column.name === 'applied_role');
    const hasExpectedSalary = candidateColumns.some(column => column.name === 'expected_salary');
    const hasNoticePeriod = candidateColumns.some(column => column.name === 'notice_period');
    const hasCommunicationStatus = candidateColumns.some(column => column.name === 'communication_status');
    const hasReplyStatus = candidateColumns.some(column => column.name === 'reply_status');
    const hasInterviewStatus = candidateColumns.some(column => column.name === 'interview_status');
    const hasWorkflowState = candidateColumns.some(column => column.name === 'workflow_state');
    const hasNextAction = candidateColumns.some(column => column.name === 'next_action');
    const hasSourcingStage = candidateColumns.some(column => column.name === 'sourcing_stage');
    const hasIsSourced = candidateColumns.some(column => column.name === 'is_sourced');
    const hasProfileUrl = candidateColumns.some(column => column.name === 'profile_url');
    const hasCompany = candidateColumns.some(column => column.name === 'company');
    const hasApplicationContent = candidateColumns.some(column => column.name === 'application_content');
    const hasQuickSummary = candidateColumns.some(column => column.name === 'quick_summary');
    const hasInterviewScheduledAt = candidateColumns.some(column => column.name === 'interview_scheduled_at');
    const hasInterviewEventId = candidateColumns.some(column => column.name === 'interview_event_id');
    const hasInterviewMeetLink = candidateColumns.some(column => column.name === 'interview_meet_link');

    if (!hasJobId) {
        await sqliteDb.exec('ALTER TABLE candidates ADD COLUMN job_id INTEGER');
    }

    if (!hasApplicationContent) {
        await sqliteDb.exec('ALTER TABLE candidates ADD COLUMN application_content TEXT');
    }

    if (!hasQuickSummary) {
        await sqliteDb.exec('ALTER TABLE candidates ADD COLUMN quick_summary TEXT');
    }

    if (!hasSource) {
        await sqliteDb.exec('ALTER TABLE candidates ADD COLUMN source TEXT');
    }

    if (!hasAppliedRole) {
        await sqliteDb.exec('ALTER TABLE candidates ADD COLUMN applied_role TEXT');
    }

    if (!hasExpectedSalary) {
        await sqliteDb.exec('ALTER TABLE candidates ADD COLUMN expected_salary TEXT');
    }

    if (!hasNoticePeriod) {
        await sqliteDb.exec('ALTER TABLE candidates ADD COLUMN notice_period TEXT');
    }

    if (!hasCommunicationStatus) {
        await sqliteDb.exec('ALTER TABLE candidates ADD COLUMN communication_status TEXT');
    }

    if (!hasReplyStatus) {
        await sqliteDb.exec('ALTER TABLE candidates ADD COLUMN reply_status TEXT');
    }

    if (!hasInterviewStatus) {
        await sqliteDb.exec('ALTER TABLE candidates ADD COLUMN interview_status TEXT');
    }

    if (!hasInterviewScheduledAt) {
        await sqliteDb.exec('ALTER TABLE candidates ADD COLUMN interview_scheduled_at TEXT');
    }

    if (!hasInterviewEventId) {
        await sqliteDb.exec('ALTER TABLE candidates ADD COLUMN interview_event_id TEXT');
    }

    if (!hasInterviewMeetLink) {
        await sqliteDb.exec('ALTER TABLE candidates ADD COLUMN interview_meet_link TEXT');
    }

    if (!hasWorkflowState) {
        await sqliteDb.exec('ALTER TABLE candidates ADD COLUMN workflow_state TEXT');
    }

    if (!hasNextAction) {
        await sqliteDb.exec('ALTER TABLE candidates ADD COLUMN next_action TEXT');
    }

    if (!hasSourcingStage) {
        await sqliteDb.exec('ALTER TABLE candidates ADD COLUMN sourcing_stage TEXT');
    }

    if (!hasIsSourced) {
        await sqliteDb.exec('ALTER TABLE candidates ADD COLUMN is_sourced INTEGER DEFAULT 0');
    }

    if (!hasProfileUrl) {
        await sqliteDb.exec('ALTER TABLE candidates ADD COLUMN profile_url TEXT');
    }

    if (!hasCompany) {
        await sqliteDb.exec('ALTER TABLE candidates ADD COLUMN company TEXT');
    }

    await sqliteDb.exec(`
        UPDATE candidates
        SET
            source = CASE
                WHEN source IS NOT NULL AND TRIM(source) <> '' THEN source
                WHEN email LIKE '%@internal.local' THEN 'Manual Upload'
                ELSE 'Historical Import'
            END,
            applied_role = CASE
                WHEN applied_role IS NOT NULL AND TRIM(applied_role) <> '' THEN applied_role
                WHEN current_role IS NOT NULL AND TRIM(current_role) <> '' THEN current_role
                ELSE 'Role Pending'
            END,
            expected_salary = COALESCE(expected_salary, ''),
            notice_period = COALESCE(notice_period, ''),
            communication_status = CASE
                WHEN communication_status IS NOT NULL AND TRIM(communication_status) <> '' THEN communication_status
                ELSE 'Not Contacted'
            END,
            reply_status = CASE
                WHEN reply_status IS NOT NULL AND TRIM(reply_status) <> '' THEN reply_status
                ELSE 'No Reply'
            END,
            interview_status = CASE
                WHEN interview_status IS NOT NULL AND TRIM(interview_status) <> '' THEN interview_status
                ELSE 'Not Scheduled'
            END,
            workflow_state = CASE
                WHEN workflow_state IS NOT NULL AND TRIM(workflow_state) <> '' THEN workflow_state
                WHEN decision_status = 'Shortlisted' THEN 'Interview Ready'
                WHEN decision_status = 'Review Required' THEN 'Awaiting Review'
                WHEN decision_status = 'Rejected' THEN 'Closed'
                ELSE 'New Intake'
            END,
            next_action = CASE
                WHEN next_action IS NOT NULL AND TRIM(next_action) <> '' THEN next_action
                WHEN decision_status = 'Shortlisted' THEN 'Collect candidate availability'
                WHEN decision_status = 'Review Required' THEN 'Review candidate fit'
                WHEN decision_status = 'Rejected' THEN 'No action required'
                ELSE 'Screen candidate'
            END,
            sourcing_stage = CASE
                WHEN sourcing_stage IS NOT NULL AND TRIM(sourcing_stage) <> '' THEN sourcing_stage
                WHEN source LIKE '%LinkedIn%' OR source LIKE '%Indeed%' OR source LIKE '%Naukri%' OR source LIKE '%Foundit%' OR source LIKE '%GitHub%' OR source LIKE '%Behance%' OR source LIKE '%Dribbble%' THEN 'Discovered'
                ELSE sourcing_stage
            END,
            is_sourced = CASE
                WHEN is_sourced = 1 THEN 1
                WHEN source LIKE '%LinkedIn%' OR source LIKE '%Indeed%' OR source LIKE '%Naukri%' OR source LIKE '%Foundit%' OR source LIKE '%GitHub%' OR source LIKE '%Behance%' OR source LIKE '%Dribbble%' THEN 1
                ELSE 0
            END,
            application_content = COALESCE(application_content, ''),
            quick_summary = COALESCE(quick_summary, '')
    `);

    await normalizeLegacyCandidateRecords(sqliteDb);
}

function titleCaseWords(value: string): string {
    return value
        .toLowerCase()
        .split(/[\s._-]+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
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

    const firstName = titleCaseWords(parts[0]);
    const lastName = titleCaseWords(parts.slice(1).join(' '));
    return { firstName: firstName || 'Candidate', lastName };
}

function deriveNameFromCandidateText(value: string): { firstName: string; lastName: string } | null {
    const normalized = (value || '').trim().replace(/\s+/g, ' ');
    if (!normalized) return null;
    if (!/^[A-Za-z\s]{5,40}$/.test(normalized)) return null;

    const parts = normalized
        .toLowerCase()
        .split(' ')
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1));

    if (parts.length < 2 || parts.length > 4) return null;

    return {
        firstName: parts[0],
        lastName: parts.slice(1).join(' ')
    };
}

function deriveRoleFromApplicationContent(content: string): string {
    const lower = (content || '').toLowerCase();
    const match = lower.match(/apply(?:ing)? for\s+(?:the\s+)?([a-z0-9\s/&-]{3,80}?)(?:\s+role|\s+position|[.!,$]|$)/i);
    if (!match?.[1]) return '';
    return match[1]
        .split(/\s+/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
        .replace(/\bAnd\b/g, 'and');
}

async function normalizeLegacyCandidateRecords(sqliteDb: Database) {
    const rows = await sqliteDb.all(`
        SELECT id, first_name, last_name, email, current_role, applied_role, application_content, source
        FROM candidates
    `) as Array<{
        id: number;
        first_name: string;
        last_name: string;
        email: string;
        current_role: string | null;
        applied_role: string | null;
        application_content: string | null;
        source: string | null;
    }>;

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

        if (looksLikeRoleGarbage(currentRole)) {
            currentRole = '';
        }

        if (looksLikeRoleGarbage(appliedRole)) {
            appliedRole = '';
        }

        if (!appliedRole && roleFromContent) {
            appliedRole = roleFromContent;
        }

        if (!currentRole && row.source === 'Gmail Intake' && roleFromContent) {
            currentRole = '';
        }

        await sqliteDb.run(`
            UPDATE candidates
            SET first_name = ?, last_name = ?, current_role = ?, applied_role = ?
            WHERE id = ?
        `, [firstName || 'Candidate', lastName || '', currentRole, appliedRole, row.id]);
    }
}

async function seedDatabase(sqliteDb: Database) {
    const employeeCount = await sqliteDb.get('SELECT COUNT(*) as count FROM employees');
    if (employeeCount.count === 0) {
        console.log('[DB] Seeding employees...');
        await sqliteDb.run(`
            INSERT INTO employees (name, role, department, email, join_date, status, performance_rating, avatar)
            VALUES 
            ('Sarah Jenkins', 'Senior React Engineer', 'Engineering', 'sarah.j@nexushr.com', '2022-03-15', 'Active', 4.8, 'https://picsum.photos/seed/sarah/200'),
            ('Michael Chen', 'Product Manager', 'Product', 'm.chen@nexushr.com', '2021-11-01', 'Active', 4.2, 'https://picsum.photos/seed/michael/200'),
            ('Emily Davis', 'UX Designer', 'Design', 'emily.d@nexushr.com', '2023-06-10', 'On Leave', 3.9, 'https://picsum.photos/seed/emily/200')
        `);
    }

    const jobCount = await sqliteDb.get('SELECT COUNT(*) as count FROM jobs');
    if (jobCount.count === 0) {
        console.log('[DB] Seeding jobs...');
        await sqliteDb.run(`
            INSERT INTO jobs (title, department, location, type, status, description, requirements)
            VALUES 
            ('Frontend Developer', 'Engineering', 'Remote', 'Full-time', 'Open', 'We are looking for a skilled React developer with experience in modern web technologies.', '["React", "TypeScript", "Tailwind", "Node.js"]'),
            ('Marketing Specialist', 'Marketing', 'New York, NY', 'Full-time', 'Open', 'Join our growth team and help us reach new heights through innovative campaigns.', '["SEO", "Content Marketing", "Analytics", "Social Media"]')
        `);
    }

    await ensureBaselineHiringRoles(sqliteDb);
}

async function ensureBaselineHiringRoles(sqliteDb: Database) {
    const baselineJobs = [
        {
            title: 'Frontend Developer',
            department: 'Engineering',
            location: 'Remote',
            type: 'Full-time',
            status: 'Open',
            description: 'Build and maintain modern web applications with strong frontend engineering standards and collaboration with product and design.',
            requirements: ['React', 'TypeScript', 'Tailwind', 'Node.js', 'Responsive UI']
        },
        {
            title: 'Marketing Specialist',
            department: 'Marketing',
            location: 'New York, NY',
            type: 'Full-time',
            status: 'Open',
            description: 'Own campaign execution, content coordination, and performance tracking across digital growth channels.',
            requirements: ['SEO', 'Content Marketing', 'Analytics', 'Social Media', 'Campaign Management']
        },
        {
            title: 'SDR and BDR',
            department: 'Sales',
            location: 'Bengaluru',
            type: 'Full-time',
            status: 'Open',
            description: 'Drive outbound prospecting, lead generation, CRM hygiene, and top-of-funnel meeting creation for the revenue team.',
            requirements: ['Lead Generation', 'Cold Outreach', 'CRM', 'B2B Sales', 'Prospecting', 'Communication']
        },
        {
            title: 'Social Media Executive',
            department: 'Marketing',
            location: 'Remote',
            type: 'Full-time',
            status: 'Open',
            description: 'Manage content publishing, community engagement, performance tracking, and campaign execution across social platforms.',
            requirements: ['Social Media', 'Content Creation', 'Campaign Management', 'Analytics', 'Community Management']
        }
    ];

    for (const job of baselineJobs) {
        const existing = await sqliteDb.get(`
            SELECT id
            FROM jobs
            WHERE LOWER(title) = LOWER(?)
            LIMIT 1
        `, [job.title]) as { id?: number } | undefined;

        if (existing?.id) {
            await sqliteDb.run(`
                UPDATE jobs
                SET department = ?,
                    location = ?,
                    type = ?,
                    status = ?,
                    description = ?,
                    requirements = ?
                WHERE id = ?
            `, [
                job.department,
                job.location,
                job.type,
                job.status,
                job.description,
                JSON.stringify(job.requirements),
                existing.id
            ]);
        } else {
            await sqliteDb.run(`
                INSERT INTO jobs (title, department, location, type, status, description, requirements)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                job.title,
                job.department,
                job.location,
                job.type,
                job.status,
                job.description,
                JSON.stringify(job.requirements)
            ]);
        }
    }
}

// Graceful shutdown
export async function closeDb(): Promise<void> {
    if (db) {
        await db.close();
        db = null;
        console.log('[DB] Connection closed');
    }
}
