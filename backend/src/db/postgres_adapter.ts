import { Pool, PoolConfig } from 'pg';

let pool: Pool | null = null;

export interface RunResult {
    lastID?: number;
    changes: number;
}

// Drop-in replacement for the `sqlite` package API used throughout the codebase.
export interface DbAdapter {
    get<T = any>(sql: string, params?: any): Promise<T | undefined>;
    all<T = any>(sql: string, params?: any): Promise<T[]>;
    run(sql: string, params?: any): Promise<RunResult>;
    exec(sql: string): Promise<void>;
}

function getPool(): Pool {
    if (pool) return pool;

    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL environment variable is not set.');

    const cfg: PoolConfig = {
        connectionString: url,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
    };

    // Supabase requires SSL; skip cert verification for self-signed certs
    if (url.includes('supabase.co') || url.includes('pooler.supabase.com')) {
        cfg.ssl = { rejectUnauthorized: false };
    }

    pool = new Pool(cfg);

    pool.on('error', (err) => {
        console.error('[DB:postgres] Unexpected pool error:', err.message);
    });

    return pool;
}

// Convert SQLite ? positional placeholders → PostgreSQL $1, $2 ... positional placeholders
function convertPlaceholders(sql: string): string {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
}

// Normalise params so the adapter always receives a flat array.
// The sqlite package accepts both db.get(sql, [a, b]) and db.get(sql, a, b) —
// callers in this codebase use both forms.
function normalizeParams(params?: any): any[] {
    if (params === undefined || params === null) return [];
    if (Array.isArray(params)) return params;
    return [params]; // single scalar — wrap
}

export function createPostgresAdapter(): DbAdapter {
    return {
        async get<T>(sql: string, params?: any): Promise<T | undefined> {
            const pgSql = convertPlaceholders(sql);
            const result = await getPool().query(pgSql, normalizeParams(params));
            return result.rows[0] as T | undefined;
        },

        async all<T>(sql: string, params?: any): Promise<T[]> {
            const pgSql = convertPlaceholders(sql);
            const result = await getPool().query(pgSql, normalizeParams(params));
            return result.rows as T[];
        },

        async run(sql: string, params?: any): Promise<RunResult> {
            let pgSql = convertPlaceholders(sql);

            // Auto-append RETURNING id to INSERT statements so callers can use result.lastID.
            // When ON CONFLICT DO NOTHING fires, RETURNING returns no rows — lastID will be null.
            const isInsert = /^\s*INSERT\b/i.test(pgSql);
            if (isInsert && !/RETURNING\b/i.test(pgSql)) {
                pgSql = pgSql.trimEnd().replace(/;?\s*$/, '') + ' RETURNING id';
            }

            const result = await getPool().query(pgSql, normalizeParams(params));
            return {
                lastID: isInsert ? (result.rows[0]?.id as number | undefined) : undefined,
                changes: result.rowCount ?? 0,
            };
        },

        async exec(sql: string): Promise<void> {
            // exec() is used for multi-statement DDL (CREATE TABLE, ALTER TABLE, indexes).
            // pg doesn't support multi-statement strings in query(), so split on semicolons.
            const statements = sql
                .split(/;\s*(?=\S)/)
                .map((s) => s.trim())
                .filter(Boolean);

            for (const stmt of statements) {
                await getPool().query(stmt);
            }
        },
    };
}

export async function closePostgresPool(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
        console.log('[DB:postgres] Connection pool closed');
    }
}

export function testPostgresConnection(): Promise<boolean> {
    return getPool()
        .query('SELECT 1')
        .then(() => true)
        .catch(() => false);
}
