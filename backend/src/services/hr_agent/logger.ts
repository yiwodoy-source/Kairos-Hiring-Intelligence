import fs from 'fs';
import path from 'path';
import { log as structuredLog } from '../../lib/logger';
import { errMsg } from '../../lib/errMsg';

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'hr_agent.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_LOG_FILES = 5;

// Create log directory if it doesn't exist (no-op on read-only filesystems like Vercel)
try {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
} catch { /* read-only fs (e.g. Vercel) — file logging disabled, structured logs still work */ }

// Rotate logs if they get too large
function rotateLogs(): void {
    try {
        if (fs.existsSync(LOG_FILE)) {
            const stats = fs.statSync(LOG_FILE);
            if (stats.size > MAX_LOG_SIZE) {
                // Rotate existing log files
                for (let i = MAX_LOG_FILES - 1; i > 0; i--) {
                    const oldFile = `${LOG_FILE}.${i}`;
                    const newFile = `${LOG_FILE}.${i + 1}`;
                    if (fs.existsSync(oldFile)) {
                        fs.renameSync(oldFile, newFile);
                    }
                }
                // Move current log to .1
                fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
            }
        }
    } catch (err) {
        console.error('Log rotation failed:', err);
    }
}

export function logAgentActivity(message: string, level: 'INFO' | 'ERROR' | 'WARN' = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;

    // Emit structured JSON to stdout/stderr
    const ctx = { component: 'hr-agent' };
    if (level === 'ERROR') structuredLog.error(message, ctx);
    else if (level === 'WARN') structuredLog.warn(message, ctx);
    else structuredLog.info(message, ctx);

    // Keep flat-text file — getLogs() reads it for the UI activity panel
    try {
        rotateLogs();
        fs.appendFileSync(LOG_FILE, logEntry);
    } catch (err: unknown) {
        structuredLog.error('failed to write agent log file', { error: errMsg(err) });
    }
}

export function getLogs(limit = 100): string[] {
    try {
        if (!fs.existsSync(LOG_FILE)) return [];
        
        // Read file asynchronously in production
        const content = fs.readFileSync(LOG_FILE, 'utf-8');
        const lines = content.split('\n').filter(line => line.length > 0);
        
        // Return last N lines
        return lines.slice(-limit);
    } catch (err) {
        console.error('Failed to read logs:', err);
        return [];
    }
}

// Clean old log files periodically
export function cleanupOldLogs(): void {
    try {
        if (!fs.existsSync(LOG_DIR)) return;
        
        const files = fs.readdirSync(LOG_DIR);
        files.forEach(file => {
            if (file.startsWith('hr_agent.log.')) {
                const filePath = path.join(LOG_DIR, file);
                const stats = fs.statSync(filePath);
                // Delete logs older than 7 days
                if (Date.now() - stats.mtime.getTime() > 7 * 24 * 60 * 60 * 1000) {
                    fs.unlinkSync(filePath);
                }
            }
        });
    } catch (err) {
        // Silently fail cleanup
    }
}

// Run cleanup on startup
cleanupOldLogs();