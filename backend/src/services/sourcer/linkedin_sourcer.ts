import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const SOURCER_DIR = path.resolve(process.cwd(), '..', 'sourcer');
const SCOUT_SCRIPT = path.join(SOURCER_DIR, 'excel-scout.js');
const SESSION_FILE = path.join(SOURCER_DIR, 'recordings', 'linkedin_session.json');
const JOBS_INPUT = path.join(SOURCER_DIR, 'jobs_input.xlsx');
const OUTPUT_DIR = path.join(SOURCER_DIR, 'output');

export interface LinkedInCandidate {
    jobRole: string;
    name: string;
    headline: string;
    company: string;
    location: string;
    phone: string;
    email: string;
    website: string;
    profileUrl: string;
    skills: string;
    experience: string;
    education: string;
    about: string;
}

export function getLinkedInSessionStatus(): {
    hasSession: boolean;
    sessionPath: string;
    scriptExists: boolean;
    sourcerDir: string;
} {
    return {
        hasSession: fs.existsSync(SESSION_FILE),
        sessionPath: SESSION_FILE,
        scriptExists: fs.existsSync(SCOUT_SCRIPT),
        sourcerDir: SOURCER_DIR,
    };
}

export async function writeJobsInput(jobs: { title: string; limit: number }[]): Promise<void> {
    if (!fs.existsSync(SOURCER_DIR)) {
        throw new Error(`Sourcer directory not found at ${SOURCER_DIR}. Please ensure the sourcer/ folder exists in the project root.`);
    }
    // Dynamic import to avoid requiring exceljs at module load time
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.default.Workbook();
    const ws = wb.addWorksheet('Jobs');
    ws.addRow(['Role', 'Limit']);
    for (const j of jobs) {
        ws.addRow([j.title, j.limit]);
    }
    await wb.xlsx.writeFile(JOBS_INPUT);
}

export function runLinkedInScout(timeoutMs = 8 * 60 * 1000): Promise<{
    success: boolean;
    outputFile?: string;
    candidateCount?: number;
    error?: string;
    logs?: string;
}> {
    return new Promise((resolve) => {
        if (!fs.existsSync(SCOUT_SCRIPT)) {
            resolve({ success: false, error: `LinkedIn scout script not found at ${SCOUT_SCRIPT}. Run setup first.` });
            return;
        }
        if (!fs.existsSync(SESSION_FILE)) {
            resolve({ success: false, error: 'No LinkedIn session found. Save a session via the sourcer setup first.' });
            return;
        }

        const before = getOutputFiles();

        const child = spawn('node', [SCOUT_SCRIPT, JOBS_INPUT], {
            cwd: SOURCER_DIR,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
        child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

        const timer = setTimeout(() => {
            child.kill('SIGTERM');
            resolve({ success: false, error: 'LinkedIn scout timed out after 8 minutes.' });
        }, timeoutMs);

        child.on('close', (code) => {
            clearTimeout(timer);
            const after = getOutputFiles();
            const newFiles = after.filter(f => !before.includes(f));
            const outputFile = newFiles.length > 0 ? newFiles[newFiles.length - 1] : undefined;

            const match = stdout.match(/\[Excel\] Writing (\d+) candidates/);
            const candidateCount = match ? parseInt(match[1], 10) : undefined;

            if (code === 0 || outputFile) {
                resolve({ success: true, outputFile, candidateCount, logs: stdout.slice(-2000) });
            } else {
                resolve({
                    success: false,
                    error: (stderr || stdout).slice(-500) || `Process exited with code ${code}`,
                    logs: stdout.slice(-1000),
                });
            }
        });

        child.on('error', (err) => {
            clearTimeout(timer);
            resolve({ success: false, error: err.message });
        });
    });
}

function getOutputFiles(): string[] {
    if (!fs.existsSync(OUTPUT_DIR)) return [];
    return fs.readdirSync(OUTPUT_DIR)
        .filter(f => f.startsWith('candidates_') && f.endsWith('.xlsx'))
        .map(f => path.join(OUTPUT_DIR, f))
        .sort();
}

export async function parseLinkedInOutput(xlsxPath: string): Promise<LinkedInCandidate[]> {
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.default.Workbook();
    await wb.xlsx.readFile(xlsxPath);

    const ws = wb.getWorksheet('All Candidates');
    if (!ws) return [];

    const candidates: LinkedInCandidate[] = [];
    ws.eachRow((row, i) => {
        if (i === 1) return;

        const cellVal = (n: number): string => {
            const cell = row.getCell(n);
            const v = cell.value;
            if (!v) return '';
            if (typeof v === 'object' && 'hyperlink' in (v as any)) return (v as any).hyperlink || '';
            return String(v).trim();
        };

        const name = cellVal(2);
        if (!name) return;

        candidates.push({
            jobRole:    cellVal(1),
            name,
            headline:   cellVal(3),
            company:    cellVal(4),
            location:   cellVal(5),
            phone:      cellVal(6),
            email:      cellVal(7),
            website:    cellVal(8),
            profileUrl: cellVal(10),
            skills:     cellVal(11),
            experience: cellVal(12),
            education:  cellVal(13),
            about:      cellVal(14),
        });
    });

    return candidates;
}
