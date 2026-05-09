import React, { useCallback, useRef, useState } from 'react';
import {
  X,
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Download,
  ChevronRight,
} from 'lucide-react';
import { apiFetch } from '../services/apiClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImportModalProps {
  onClose: () => void;
  onImported: (count: number) => void;
}

interface ParsedCandidate {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  current_role: string;
  applied_role: string;
  skills: string;
  years_experience: string;
  location: string;
  expected_salary: string;
  notice_period: string;
  source: string;
  company: string;
  [key: string]: string;
}

interface ImportResult {
  inserted: number;
  duplicates: number;
  errors: string[];
}

type Step = 'upload' | 'importing' | 'result';

// ---------------------------------------------------------------------------
// CSV parser — handles quoted fields with embedded commas/newlines
// ---------------------------------------------------------------------------

function parseCSV(text: string): ParsedCandidate[] {
  const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalised) return [];

  // Tokenise character-by-character to handle quoted fields correctly
  function tokeniseRow(line: string): string[] {
    const fields: string[] = [];
    let field = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const ch = line[i];

      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote inside quoted field
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(field.trim());
        field = '';
      } else {
        field += ch;
      }
      i++;
    }

    fields.push(field.trim());
    return fields;
  }

  // Split into lines — but respect quoted fields that contain \n
  const lines: string[] = [];
  let current = '';
  let inQ = false;
  for (let i = 0; i < normalised.length; i++) {
    const ch = normalised[i];
    if (ch === '"') {
      inQ = !inQ;
      current += ch;
    } else if (ch === '\n' && !inQ) {
      lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);

  if (lines.length < 2) return [];

  const headers = tokeniseRow(lines[0]).map((h) =>
    h.replace(/^["']|["']$/g, '').trim().toLowerCase()
  );

  const rows: ParsedCandidate[] = [];

  for (let r = 1; r < lines.length; r++) {
    const line = lines[r].trim();
    if (!line) continue;

    const values = tokeniseRow(line);
    const row: Record<string, string> = {};

    headers.forEach((header, idx) => {
      row[header] = (values[idx] ?? '').replace(/^["']|["']$/g, '').trim();
    });

    rows.push(row as ParsedCandidate);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Sample CSV download helper
// ---------------------------------------------------------------------------

const SAMPLE_HEADERS =
  'first_name,last_name,email,phone,current_role,applied_role,skills,years_experience,location,expected_salary,notice_period,source,company';

const SAMPLE_ROWS = [
  'Jane,Doe,jane.doe@example.com,+1-555-0101,Software Engineer,Senior Engineer,"TypeScript,React,Node.js",5,"San Francisco, CA",120000,30 days,LinkedIn,Acme Corp',
  'John,Smith,john.smith@example.com,+1-555-0102,Product Manager,Head of Product,"Roadmapping,Jira,SQL",8,"New York, NY",140000,60 days,Referral,Beta Inc',
];

function downloadSampleCSV() {
  const content = [SAMPLE_HEADERS, ...SAMPLE_ROWS].join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kairos_candidates_sample.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Preview table
// ---------------------------------------------------------------------------

const PREVIEW_COLUMNS: Array<{ key: keyof ParsedCandidate; label: string }> = [
  { key: 'first_name', label: 'First' },
  { key: 'last_name', label: 'Last' },
  { key: 'email', label: 'Email' },
  { key: 'applied_role', label: 'Role' },
  { key: 'location', label: 'Location' },
];

function PreviewTable({ rows }: { rows: ParsedCandidate[] }) {
  const preview = rows.slice(0, 3);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50">
            {PREVIEW_COLUMNS.map((col) => (
              <th
                key={col.key}
                className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {preview.map((row, i) => (
            <tr key={i} className="bg-white">
              {PREVIEW_COLUMNS.map((col) => (
                <td
                  key={col.key}
                  className="px-3 py-2 text-slate-700 max-w-[140px] truncate"
                  title={row[col.key]}
                >
                  {row[col.key] || (
                    <span className="text-slate-400 italic">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ImportModal({ onClose, onImported }: ImportModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [parsedRows, setParsedRows] = useState<ParsedCandidate[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- File processing ----

  function processFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setParseError('Please upload a .csv file.');
      return;
    }
    setParseError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text !== 'string') {
        setParseError('Could not read file.');
        return;
      }
      try {
        const rows = parseCSV(text);
        if (rows.length === 0) {
          setParseError('No data rows found. Make sure the CSV has a header row and at least one data row.');
          return;
        }
        setParsedRows(rows);
      } catch {
        setParseError('Failed to parse CSV. Please check the file format.');
      }
    };
    reader.onerror = () => setParseError('Failed to read file.');
    reader.readAsText(file);
  }

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  // ---- Import ----

  async function handleImport() {
    if (parsedRows.length === 0) return;
    setStep('importing');

    try {
      const result = await apiFetch<ImportResult>('/api/hr-agent/import', {
        method: 'POST',
        body: JSON.stringify({ candidates: parsedRows }),
      });
      setImportResult(result);
      setStep('result');
    } catch (err) {
      setImportResult({
        inserted: 0,
        duplicates: 0,
        errors: [err instanceof Error ? err.message : 'Import failed. Please try again.'],
      });
      setStep('result');
    }
  }

  function handleDone() {
    onImported(importResult?.inserted ?? 0);
    onClose();
  }

  // ---- Render ----

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
              <FileText className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Import Candidates
              </h2>
              <p className="text-xs text-slate-500">Bulk CSV import</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* ---- Step: Upload ---- */}
          {(step === 'upload') && (
            <>
              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-amber-500 bg-amber-50'
                    : 'border-slate-300 hover:border-violet-400'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Upload
                  className={`w-8 h-8 mx-auto mb-3 ${
                    isDragging ? 'text-amber-500' : 'text-slate-400'
                  }`}
                />
                {fileName ? (
                  <>
                    <p className="text-sm font-semibold text-slate-700">
                      {fileName}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Click to change file
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-slate-700">
                      Drop a CSV file here
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      or click to browse — .csv files only
                    </p>
                  </>
                )}
              </div>

              {/* Parse error */}
              {parseError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{parseError}</p>
                </div>
              )}

              {/* Row count + preview */}
              {parsedRows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-semibold text-slate-700">
                      {parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''} detected
                    </span>
                    {parsedRows.length > 3 && (
                      <span className="text-xs text-slate-400">
                        (showing first 3 below)
                      </span>
                    )}
                  </div>
                  <PreviewTable rows={parsedRows} />
                </div>
              )}

              {/* Expected columns helper */}
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                  <ChevronRight className="w-3.5 h-3.5" />
                  Expected CSV columns
                </p>
                <p className="text-xs font-mono text-slate-500 break-all leading-relaxed">
                  first_name, last_name, email, phone, current_role, applied_role,{' '}
                  <span className="text-amber-600">
                    skills (comma-separated, in quotes)
                  </span>
                  , years_experience, location, expected_salary, notice_period, source, company
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadSampleCSV();
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 hover:text-amber-700 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  Download sample CSV
                </button>
              </div>
            </>
          )}

          {/* ---- Step: Importing ---- */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-700">
                  Importing {parsedRows.length} candidates…
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  This may take a moment.
                </p>
              </div>
            </div>
          )}

          {/* ---- Step: Result ---- */}
          {step === 'result' && importResult && (
            <div className="space-y-4">
              {/* Success summary */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-emerald-700">
                    {importResult.inserted} candidate{importResult.inserted !== 1 ? 's' : ''} imported
                  </p>
                  {importResult.duplicates > 0 && (
                    <p className="text-xs text-emerald-600 mt-0.5">
                      {importResult.duplicates} duplicate{importResult.duplicates !== 1 ? 's' : ''} skipped
                    </p>
                  )}
                </div>
              </div>

              {/* Errors */}
              {importResult.errors.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {importResult.errors.length} error{importResult.errors.length !== 1 ? 's' : ''}
                  </p>
                  <ul className="space-y-1">
                    {importResult.errors.slice(0, 10).map((err, i) => (
                      <li key={i} className="text-xs text-amber-700 font-mono">
                        {err}
                      </li>
                    ))}
                  </ul>
                  {importResult.errors.length > 10 && (
                    <p className="text-xs text-amber-600 mt-2">
                      …and {importResult.errors.length - 10} more
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 flex-shrink-0">
          {step === 'upload' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleImport()}
                disabled={parsedRows.length === 0}
                className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-800 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors"
              >
                <Upload className="w-4 h-4" />
                Import {parsedRows.length > 0 ? `${parsedRows.length} ` : ''}Candidate{parsedRows.length !== 1 ? 's' : ''}
              </button>
            </>
          )}

          {step === 'importing' && (
            <button
              disabled
              className="inline-flex items-center gap-2 bg-amber-500 opacity-60 cursor-not-allowed text-slate-800 rounded-xl px-5 py-2.5 text-sm font-semibold"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              Importing…
            </button>
          )}

          {step === 'result' && (
            <button
              onClick={handleDone}
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-800 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ImportModal;
