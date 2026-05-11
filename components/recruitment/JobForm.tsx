import React, { useState } from 'react';
import { JobPosting, JobStatus } from '../../types.ts';
import { Sparkles, ArrowLeft, MapPin } from 'lucide-react';
import { GeminiService } from '../../services/geminiService';
import { apiFetch } from '../../services/apiClient';
import { JobRow } from '../../services/hrDataMappers';

interface JobFormProps {
  onSave: (job: JobPosting) => void;
  onCancel: () => void;
}

const DEPARTMENTS = ['Engineering', 'Product', 'Design', 'Marketing', 'Sales', 'Operations', 'HR', 'Finance', 'General'];

export const JobForm: React.FC<JobFormProps> = ({ onSave, onCancel }) => {
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobDepartment, setNewJobDepartment] = useState('Engineering');
  const [newJobSkills, setNewJobSkills] = useState('');
  const [newJobLocation, setNewJobLocation] = useState('');
  const [generatedDesc, setGeneratedDesc] = useState('');
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const handleGenerateDesc = async () => {
    if (!newJobTitle || !newJobSkills) return;
    setIsGeneratingDesc(true);
    const desc = await GeminiService.generateJobDescription(newJobTitle, newJobSkills);
    setGeneratedDesc(desc);
    setIsGeneratingDesc(false);
  };

  const handleSubmit = async () => {
    if (!newJobTitle || !generatedDesc) return;
    setSaveError('');
    setIsSaving(true);

    try {
      const row = await apiFetch<JobRow>('/api/hr-agent/jobs', {
        method: 'POST',
        body: JSON.stringify({
          title: newJobTitle,
          department: newJobDepartment,
          location: newJobLocation || 'Remote',
          type: 'Full-time',
          status: 'Open',
          description: generatedDesc,
          requirements: newJobSkills.split(',').map(s => s.trim()).filter(Boolean)
        })
      });

      const newJob: JobPosting = {
        id: String(row.id),
        title: row.title || newJobTitle,
        department: row.department || newJobDepartment,
        location: row.location || newJobLocation || 'Remote',
        type: row.type || 'Full-time',
        status: (row.status as JobStatus) || JobStatus.OPEN,
        description: row.description || generatedDesc,
        requirements: (() => {
          if (Array.isArray(row.requirements)) return row.requirements as string[];
          if (typeof row.requirements === 'string') {
            try { return JSON.parse(row.requirements); } catch { return []; }
          }
          return newJobSkills.split(',').map(s => s.trim()).filter(Boolean);
        })(),
        postedDate: row.posted_date || new Date().toISOString().split('T')[0],
        applicantsCount: 0
      };

      onSave(newJob);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save job. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl animate-fade-in rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
      <div className="mb-6 border-b border-slate-700 pb-4">
        <button
          onClick={onCancel}
          className="group mb-4 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-400 transition-all hover:bg-slate-800 hover:text-indigo-300"
        >
          <div className="rounded-full bg-slate-800 p-1 transition-colors group-hover:bg-indigo-500/20">
            <ArrowLeft className="h-4 w-4" />
          </div>
          Back to Jobs
        </button>
        <h2 className="text-xl font-bold text-slate-100">Create AI-Powered Job Posting</h2>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Job Title</label>
            <input
              type="text"
              className="w-full rounded-xl border border-slate-600 bg-slate-800 p-3 text-slate-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
              value={newJobTitle}
              onChange={(e) => setNewJobTitle(e.target.value)}
              placeholder="e.g. Senior Product Manager"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Department</label>
            <select
              className="w-full rounded-xl border border-slate-600 bg-slate-800 p-3 text-slate-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
              value={newJobDepartment}
              onChange={(e) => setNewJobDepartment(e.target.value)}
            >
              {DEPARTMENTS.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Required Skills (comma separated)</label>
            <input
              type="text"
              className="w-full rounded-xl border border-slate-600 bg-slate-800 p-3 text-slate-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
              value={newJobSkills}
              onChange={(e) => setNewJobSkills(e.target.value)}
              placeholder="e.g. Agile, SQL, User Research"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Location</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                className="w-full rounded-xl border border-slate-600 bg-slate-800 py-3 pl-10 pr-4 text-slate-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                value={newJobLocation}
                onChange={(e) => setNewJobLocation(e.target.value)}
                placeholder="e.g. New York, NY or Remote"
              />
            </div>
          </div>
        </div>

        <button
          onClick={handleGenerateDesc}
          disabled={isGeneratingDesc || !newJobTitle}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-900/40 bg-indigo-500/10 py-3 font-medium text-indigo-300 transition-colors hover:bg-indigo-500/20 disabled:opacity-60"
        >
          {isGeneratingDesc ? 'Generating Description...' : 'Generate Description with Gemini AI'}
          {!isGeneratingDesc && <Sparkles className="h-4 w-4" />}
        </button>

        {generatedDesc && (
          <div className="mt-4 animate-fade-in">
            <label className="mb-1 block text-sm font-medium text-slate-300">Job Description</label>
            <textarea
              className="h-64 w-full rounded-xl border border-slate-600 bg-slate-800 p-3 font-mono text-sm text-slate-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
              value={generatedDesc}
              onChange={(e) => setGeneratedDesc(e.target.value)}
            />
            {saveError && (
              <p className="mt-2 text-sm text-red-400">{saveError}</p>
            )}
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={onCancel}
                className="rounded-xl px-6 py-2 font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSaving}
                className="rounded-xl bg-indigo-600 px-6 py-2 font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
              >
                {isSaving ? 'Publishing...' : 'Publish Job'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
