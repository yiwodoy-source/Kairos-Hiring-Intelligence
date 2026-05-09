type Level = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
    [key: string]: unknown;
}

const LEVEL_RANK: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function activeLevel(): Level {
    const env = (process.env.LOG_LEVEL || '').toLowerCase() as Level;
    return LEVEL_RANK[env] !== undefined ? env : 'info';
}

function emit(level: Level, msg: string, ctx?: LogContext): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[activeLevel()]) return;

    const line = JSON.stringify({
        ts: new Date().toISOString(),
        level,
        msg,
        ...(ctx ?? {}),
    });

    if (level === 'error' || level === 'warn') {
        process.stderr.write(line + '\n');
    } else {
        process.stdout.write(line + '\n');
    }
}

export const log = {
    debug: (msg: string, ctx?: LogContext) => emit('debug', msg, ctx),
    info:  (msg: string, ctx?: LogContext) => emit('info',  msg, ctx),
    warn:  (msg: string, ctx?: LogContext) => emit('warn',  msg, ctx),
    error: (msg: string, ctx?: LogContext) => emit('error', msg, ctx),
};
