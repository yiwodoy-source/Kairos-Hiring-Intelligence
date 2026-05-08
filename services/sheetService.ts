import axios from 'axios';

export interface CandidateData {
    firstName: string;
    lastName: string;
    email: string;
    emailContent: string;
    summary: string;
    cv: string;
    scoring: number;
    quickRead: string;
}

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1_aV03JLQPBHEt3TxFbAmQ7s3zH6MRygCgoRrYNJOWEo/export?format=csv';

const DEMO_CANDIDATES: CandidateData[] = [
    {
        firstName: 'Arjun',
        lastName: 'Mehta',
        email: 'arjun.m@techcorp.com',
        emailContent: 'Interested in the Senior React position...',
        summary: '8 years experience in full-stack development and team leadership.',
        cv: 'https://drive.google.com/cv/arjun',
        scoring: 92,
        quickRead: 'Strong technical background, crisp communication, good culture fit.'
    },
    {
        firstName: 'Sanya',
        lastName: 'Iyer',
        email: 'sanya.i@innovate.io',
        emailContent: 'Applying for the Product Manager role...',
        summary: 'Ex-Google PM with a strong record shipping AI-led workflow products.',
        cv: 'https://drive.google.com/cv/sanya',
        scoring: 88,
        quickRead: 'Strategic thinker with strong product judgment.'
    },
    {
        firstName: 'Rahul',
        lastName: 'Sharma',
        email: 'rahul.s@startup.in',
        emailContent: 'Excited about the SDR opportunity...',
        summary: 'Top sales performer for 3 consecutive years in growth-stage teams.',
        cv: 'https://drive.google.com/cv/rahul',
        scoring: 75,
        quickRead: 'High energy profile, worth screening further.'
    }
];

function parseCsv(csv: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < csv.length; i += 1) {
        const char = csv[i];
        const nextChar = csv[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentCell += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            currentRow.push(currentCell);
            currentCell = '';
            continue;
        }

        if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
                i += 1;
            }

            currentRow.push(currentCell);
            rows.push(currentRow);
            currentRow = [];
            currentCell = '';
            continue;
        }

        currentCell += char;
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
        currentRow.push(currentCell);
        rows.push(currentRow);
    }

    return rows;
}

function stripHtml(value: string): string {
    return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeScore(value: string): number {
    const match = value.match(/(\d+(?:\.\d+)?)/);
    if (!match) return 0;

    const parsed = Number(match[1]);
    if (!Number.isFinite(parsed)) return 0;

    if (parsed <= 10) {
        return Math.round(parsed * 10);
    }

    return Math.max(0, Math.min(100, Math.round(parsed)));
}

function getCell(row: string[], index: number): string {
    return (row[index] || '').trim();
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
        return { firstName: '', lastName: '' };
    }

    return {
        firstName: parts[0],
        lastName: parts.slice(1).join(' ')
    };
}

function buildHeaderMap(headers: string[]): Record<string, number> {
    const map: Record<string, number> = {};
    headers.forEach((header, index) => {
        const normalized = header.trim().toLowerCase();
        if (normalized) {
            map[normalized] = index;
        }
    });
    return map;
}

function headerCell(row: string[], headerMap: Record<string, number>, key: string): string {
    const index = headerMap[key.toLowerCase()];
    if (index === undefined) return '';
    return getCell(row, index);
}

function mapRowToCandidate(row: string[], headerMap: Record<string, number>): CandidateData | null {
    const fullName = headerCell(row, headerMap, 'full name');
    const nameParts = splitFullName(fullName);
    const email = headerCell(row, headerMap, 'email');
    const currentRole = headerCell(row, headerMap, 'current role');
    const appliedRole = headerCell(row, headerMap, 'applied role');
    const emailContent = stripHtml(headerCell(row, headerMap, 'application content'));
    const quickSummary = stripHtml(headerCell(row, headerMap, 'quick summary'));
    const cv = headerCell(row, headerMap, 'drive link');
    const scoring = normalizeScore(headerCell(row, headerMap, 'overall score'));
    const decisionStatus = headerCell(row, headerMap, 'decision status');
    const location = headerCell(row, headerMap, 'location');
    const workflowState = headerCell(row, headerMap, 'workflow state');

    const firstName = nameParts.firstName;
    const lastName = nameParts.lastName;

    if (!firstName || !email) return null;

    return {
        firstName,
        lastName,
        email,
        emailContent,
        summary: [appliedRole, currentRole, location].filter(Boolean).join(' | '),
        cv,
        scoring,
        quickRead: quickSummary || workflowState || decisionStatus
    };
}

export const fetchCandidateData = async (): Promise<CandidateData[]> => {
    try {
        const response = await axios.get<string>(SHEET_URL, { responseType: 'text' });
        const csv = response.data;

        if (!csv || !csv.includes(',')) {
            console.warn('Sheet data appears invalid or empty, using demo candidate data.');
            return DEMO_CANDIDATES;
        }

        const parsedRows = parseCsv(csv);
        const headers = parsedRows[0] || [];
        const rows = parsedRows.slice(1);
        const headerMap = buildHeaderMap(headers);
        const candidates = rows
            .map(row => mapRowToCandidate(row, headerMap))
            .filter((candidate): candidate is CandidateData => candidate !== null);

        return candidates.length > 0 ? candidates : DEMO_CANDIDATES;
    } catch (error) {
        console.error('Error fetching candidate data:', error);
        return DEMO_CANDIDATES;
    }
};
