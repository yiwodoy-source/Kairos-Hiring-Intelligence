import { getDriveClient, getSheetsClient } from './google_client';
import { logAgentActivity } from './logger';

const DEFAULT_SPREADSHEET_TITLE = process.env.GOOGLE_SHEET_NAME || 'Talent Operations Candidate Tracker';
const DEFAULT_SHEET_TAB = 'Candidates';
const HEADER_ROW = [[
    'Candidate ID',
    'Full Name',
    'Email',
    'Phone',
    'Source',
    'Applied Role',
    'Current Role',
    'Location',
    'Expected Salary',
    'Notice Period',
    'Overall Score',
    'Decision Status',
    'Workflow State',
    'Next Action',
    'Communication Status',
    'Reply Status',
    'Interview Status',
    'Interview Scheduled At',
    'Interview Meet Link',
    'Application Content',
    'Quick Summary',
    'Drive Link',
    'Processed At'
]];

const COLUMN_COUNT = HEADER_ROW[0].length;
const LAST_COLUMN = 'W';

let resolvedSpreadsheetId: string | null | undefined;

function escapeDriveQueryValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function truncate(value: string | undefined, limit: number): string {
    if (!value) return '';
    const normalized = String(value).replace(/\s+/g, ' ').trim();
    if (normalized.length <= limit) return normalized;
    return `${normalized.slice(0, limit - 1).trim()}…`;
}

function stripHtml(value: string | undefined): string {
    if (!value) return '';
    return value
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#39;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function buildFullName(candidateData: any): string {
    const name = [candidateData.first_name, candidateData.last_name]
        .filter(Boolean)
        .join(' ')
        .trim();
    return name || candidateData.email || 'Unknown Candidate';
}

function getCandidateRow(candidateData: any): string[] {
    const applicationContent = truncate(stripHtml(candidateData.application_content), 1200);
    const quickSummary = truncate(stripHtml(candidateData.quick_summary || candidateData.ai_reasoning), 800);

    return [
        String(candidateData.id ?? ''),
        buildFullName(candidateData),
        String(candidateData.email || ''),
        String(candidateData.phone || ''),
        String(candidateData.source || ''),
        String(candidateData.applied_role || ''),
        String(candidateData.current_role || ''),
        String(candidateData.location || ''),
        String(candidateData.expected_salary || ''),
        String(candidateData.notice_period || ''),
        String(candidateData.overall_score ?? 0),
        String(candidateData.decision_status || ''),
        String(candidateData.workflow_state || ''),
        String(candidateData.next_action || ''),
        String(candidateData.communication_status || ''),
        String(candidateData.reply_status || ''),
        String(candidateData.interview_status || ''),
        String(candidateData.interview_scheduled_at || ''),
        String(candidateData.interview_meet_link || ''),
        applicationContent,
        quickSummary,
        String(candidateData.drive_file_link || ''),
        new Date().toISOString()
    ];
}

async function ensureSheetTab(spreadsheetId: string): Promise<void> {
    const sheets = getSheetsClient();
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const hasTab = (spreadsheet.data.sheets || []).some(
        sheet => sheet.properties?.title === DEFAULT_SHEET_TAB
    );

    if (!hasTab) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
                requests: [{
                    addSheet: {
                        properties: { title: DEFAULT_SHEET_TAB }
                    }
                }]
            }
        });
        logAgentActivity(`Created Google Sheet tab: ${DEFAULT_SHEET_TAB}`);
    }
}

async function applySheetFormatting(spreadsheetId: string): Promise<void> {
    const sheets = getSheetsClient();
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = (spreadsheet.data.sheets || []).find(s => s.properties?.title === DEFAULT_SHEET_TAB);
    const sheetId = sheet?.properties?.sheetId;

    if (sheetId === undefined) return;

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests: [
                {
                    updateSheetProperties: {
                        properties: {
                            sheetId,
                            gridProperties: {
                                frozenRowCount: 1
                            }
                        },
                        fields: 'gridProperties.frozenRowCount'
                    }
                },
                {
                    setBasicFilter: {
                        filter: {
                            range: {
                                sheetId,
                                startRowIndex: 0,
                                endRowIndex: 1,
                                startColumnIndex: 0,
                                endColumnIndex: COLUMN_COUNT
                            }
                        }
                    }
                },
                {
                    repeatCell: {
                        range: {
                            sheetId,
                            startRowIndex: 0,
                            endRowIndex: 1
                        },
                        cell: {
                            userEnteredFormat: {
                                backgroundColor: { red: 0.09, green: 0.28, blue: 0.55 },
                                textFormat: {
                                    bold: true,
                                    foregroundColor: { red: 1, green: 1, blue: 1 }
                                },
                                wrapStrategy: 'WRAP',
                                verticalAlignment: 'MIDDLE'
                            }
                        },
                        fields: 'userEnteredFormat(backgroundColor,textFormat,wrapStrategy,verticalAlignment)'
                    }
                },
                {
                    autoResizeDimensions: {
                        dimensions: {
                            sheetId,
                            dimension: 'COLUMNS',
                            startIndex: 0,
                            endIndex: COLUMN_COUNT
                        }
                    }
                }
            ]
        }
    });
}

async function ensureSheetHeaders(spreadsheetId: string): Promise<void> {
    const sheets = getSheetsClient();

    await ensureSheetTab(spreadsheetId);

    const existing = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${DEFAULT_SHEET_TAB}!A1:${LAST_COLUMN}1`
    });

    const existingHeader = existing.data.values?.[0] || [];
    const headersMatch = HEADER_ROW[0].every((header, index) => existingHeader[index] === header);

    if (!headersMatch) {
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${DEFAULT_SHEET_TAB}!A1:${LAST_COLUMN}1`,
            valueInputOption: 'RAW',
            requestBody: { values: HEADER_ROW }
        });
        logAgentActivity(`Initialized Google Sheet headers in ${DEFAULT_SHEET_TAB}`);
    }

    await applySheetFormatting(spreadsheetId);
}

async function resolveSpreadsheetId(): Promise<string | null> {
    if (resolvedSpreadsheetId !== undefined) {
        return resolvedSpreadsheetId;
    }

    if (process.env.GOOGLE_SHEET_ID) {
        resolvedSpreadsheetId = process.env.GOOGLE_SHEET_ID;
        await ensureSheetHeaders(resolvedSpreadsheetId);
        return resolvedSpreadsheetId;
    }

    try {
        const drive = getDriveClient();
        const sheets = getSheetsClient();

        const existing = await drive.files.list({
            q: `mimeType = 'application/vnd.google-apps.spreadsheet' and name = '${escapeDriveQueryValue(DEFAULT_SPREADSHEET_TITLE)}' and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 1
        });

        const spreadsheet = existing.data.files?.[0];
        if (spreadsheet?.id) {
            resolvedSpreadsheetId = spreadsheet.id;
            await ensureSheetHeaders(resolvedSpreadsheetId);
            logAgentActivity(`Using existing Google Sheet: ${DEFAULT_SPREADSHEET_TITLE} (${resolvedSpreadsheetId})`);
            return resolvedSpreadsheetId;
        }

        const created = await sheets.spreadsheets.create({
            requestBody: {
                properties: { title: DEFAULT_SPREADSHEET_TITLE },
                sheets: [{ properties: { title: DEFAULT_SHEET_TAB } }]
            }
        });

        resolvedSpreadsheetId = created.data.spreadsheetId || null;
        if (resolvedSpreadsheetId) {
            await ensureSheetHeaders(resolvedSpreadsheetId);
            logAgentActivity(`Created Google Sheet for candidate exports: ${DEFAULT_SPREADSHEET_TITLE} (${resolvedSpreadsheetId})`);
        }

        return resolvedSpreadsheetId;
    } catch (error: any) {
        logAgentActivity(`Failed to resolve Google Sheet: ${error.message}`, 'ERROR');
        resolvedSpreadsheetId = null;
        return null;
    }
}

export async function logCandidateToSheets(candidateData: any): Promise<boolean> {
    try {
        const spreadsheetId = await resolveSpreadsheetId();

        if (!spreadsheetId) {
            logAgentActivity('No Google Sheet available for candidate logging', 'WARN');
            return false;
        }

        if (!candidateData.email) {
            logAgentActivity('Candidate email missing, skipping sheets log', 'WARN');
            return false;
        }

        const sheets = getSheetsClient();
        const values = [getCandidateRow(candidateData)];

        const existingRows = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${DEFAULT_SHEET_TAB}!A:${LAST_COLUMN}`
        });

        const rows = existingRows.data.values || [];
        const candidateEmail = String(candidateData.email).toLowerCase();
        const existingIndex = rows.findIndex((row, index) => index > 0 && String(row[2] || '').toLowerCase() === candidateEmail);

        if (existingIndex > 0) {
            const rowNumber = existingIndex + 1;
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${DEFAULT_SHEET_TAB}!A${rowNumber}:${LAST_COLUMN}${rowNumber}`,
                valueInputOption: 'RAW',
                requestBody: { values }
            });
        } else {
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: `${DEFAULT_SHEET_TAB}!A:${LAST_COLUMN}`,
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                requestBody: { values }
            });
        }

        logAgentActivity(`Logged candidate ${candidateData.email} to Google Sheets`);
        return true;
    } catch (error: any) {
        if (error.message?.includes('404')) {
            logAgentActivity('Sheets logging failed: Spreadsheet not found. Check GOOGLE_SHEET_ID.', 'ERROR');
        } else if (error.message?.includes('403')) {
            logAgentActivity('Sheets logging failed: Permission denied. Check OAuth scopes.', 'ERROR');
        } else {
            logAgentActivity(`Sheets logging failed: ${error.message}`, 'ERROR');
        }
        return false;
    }
}
