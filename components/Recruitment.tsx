
import React, { useState, useCallback } from 'react';
import { JobPosting, Candidate, JobStatus, CandidateStatus } from '../types.ts';
import { RotateCcw, User, Globe } from 'lucide-react';
import { GeminiService } from '../services/geminiService';
import { apiFetch, ApiError } from '../services/apiClient';
import { CandidateRow, mapCandidate } from '../services/hrDataMappers';
import { JobBoard } from './recruitment/JobBoard';
import { JobDetail } from './recruitment/JobDetail';
import { JobForm } from './recruitment/JobForm';
import { CandidateList } from './recruitment/CandidateList';
import { CandidateDetail } from './recruitment/CandidateDetail';
import { SourcingView } from './recruitment/SourcingView';

interface RecruitmentProps {
  jobs: JobPosting[];
  candidates: Candidate[];
  setJobs: React.Dispatch<React.SetStateAction<JobPosting[]>>;
  setCandidates: React.Dispatch<React.SetStateAction<Candidate[]>>;
}

interface UndoAction {
  type: 'DELETE_JOB' | 'DELETE_CANDIDATE';
  data: any;
  associatedData?: any[];
  timestamp: number;
}

export const Recruitment: React.FC<RecruitmentProps> = React.memo(({ jobs, candidates, setJobs, setCandidates }) => {
  const [activeTab, setActiveTab] = useState<'jobs' | 'screening' | 'sourcing'>('jobs');

  const [showJobForm, setShowJobForm] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);

  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUpdatingCandidateStatus, setIsUpdatingCandidateStatus] = useState(false);
  const [emailContentInput, setEmailContentInput] = useState('');

  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);

  const logAction = useCallback((action: string, details: any) => {
    const timestamp = new Date().toISOString();
    console.log(`[AUDIT LOG] ${timestamp} - ACTION: ${action}`, details);
  }, []);

  const showNotification = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;

    const lastAction = undoStack[undoStack.length - 1];
    const newStack = undoStack.slice(0, -1);
    setUndoStack(newStack);

    if (lastAction.type === 'DELETE_CANDIDATE') {
      setCandidates(prev => [...prev, lastAction.data]);
      showNotification(`Undid deletion of candidate: ${lastAction.data.name}`);
      logAction('UNDO_DELETE_CANDIDATE', { id: lastAction.data.id });
    }
    else if (lastAction.type === 'DELETE_JOB') {
      setJobs(prev => [...prev, lastAction.data]);
      if (lastAction.associatedData && lastAction.associatedData.length > 0) {
        setCandidates(prev => [...prev, ...lastAction.associatedData!]);
      }
      showNotification(`Undid deletion of job: ${lastAction.data.title}`);
      logAction('UNDO_DELETE_JOB', { id: lastAction.data.id });
    }
  }, [undoStack, setCandidates, setJobs, showNotification, logAction]);

  const handleToggleJobStatus = useCallback((jobId: string) => {
    const updatedJobs = jobs.map(job => {
      if (job.id === jobId) {
        const newStatus = job.status === JobStatus.OPEN ? JobStatus.CLOSED : JobStatus.OPEN;
        if (selectedJob && selectedJob.id === jobId) {
          setSelectedJob({ ...job, status: newStatus });
        }
        logAction('TOGGLE_JOB_STATUS', { id: jobId, newStatus });
        return { ...job, status: newStatus };
      }
      return job;
    });

    setJobs(updatedJobs);
    const job = updatedJobs.find(j => j.id === jobId);
    showNotification(`Job status updated to: ${job?.status}`);
  }, [jobs, selectedJob, setJobs, logAction, showNotification]);

  const handleDeleteCandidate = useCallback((candidateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const candidate = candidates.find(c => c.id === candidateId);
    if (!candidate) return;

    if (window.confirm(`Are you sure you want to delete candidate "${candidate.name}"? This action is logged.`)) {
      setUndoStack(prev => [...prev, {
        type: 'DELETE_CANDIDATE',
        data: candidate,
        timestamp: Date.now()
      }]);

      setCandidates(prev => prev.filter(c => c.id !== candidateId));
      if (selectedCandidate?.id === candidateId) {
        setSelectedCandidate(null);
      }

      logAction('DELETE_CANDIDATE', { id: candidateId, name: candidate.name });
      showNotification(`Candidate ${candidate.name} deleted.`);
    }
  }, [candidates, selectedCandidate, setCandidates, logAction, showNotification]);

  const handleDeleteJob = useCallback((jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    const linkedCandidates = candidates.filter(c => c.jobId === jobId);
    const hasCandidates = linkedCandidates.length > 0;

    let confirmMessage = `Are you sure you want to delete the job posting "${job.title}"?`;
    if (hasCandidates) {
      confirmMessage += `\n\nWARNING: This will also delete ${linkedCandidates.length} associated candidate(s).`;
    }

    if (window.confirm(confirmMessage)) {
      setUndoStack(prev => [...prev, {
        type: 'DELETE_JOB',
        data: job,
        associatedData: linkedCandidates,
        timestamp: Date.now()
      }]);

      setJobs(prev => prev.filter(j => j.id !== jobId));
      if (hasCandidates) {
        setCandidates(prev => prev.filter(c => c.jobId !== jobId));
      }

      if (selectedJob?.id === jobId) {
        setSelectedJob(null);
      }

      logAction('DELETE_JOB', { id: jobId, title: job.title, candidatesRemoved: linkedCandidates.length });
      showNotification(`Job "${job.title}" deleted.`);
    }
  }, [jobs, candidates, selectedJob, setJobs, setCandidates, logAction, showNotification]);

  const handleSaveJob = useCallback((newJob: JobPosting) => {
    setJobs([...jobs, newJob]);
    setShowJobForm(false);
    showNotification("Job posted successfully.");
  }, [jobs, setJobs, showNotification]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let textContent = "";

    if (file.type === "text/plain") {
      try {
        textContent = await file.text();
      } catch (err) {
        console.error("Failed to read text file", err);
      }
    }

    if (!textContent) {
      const targetJob = jobs.length > 0 ? jobs[0] : null;
      textContent = `[SIMULATED RESUME CONTENT FOR ${file.name.toUpperCase()}]
        
CANDIDATE: ${file.name.split('.')[0]}
TARGET ROLE: ${targetJob?.title || 'Applicant'}

PROFESSIONAL SUMMARY:
Dedicated and results-oriented professional with 5 years of experience.

SKILLS:
- ${targetJob?.requirements.join('\n- ') || 'Communication, Project Management'}

EXPERIENCE:
Senior Associate | Industry Corp | 2020 - Present
`;
    }

    const inferredName = file.name.split('.')[0].replace(/[_-]+/g, ' ').trim() || 'Candidate';
    const [firstName, ...restNameParts] = inferredName.split(/\s+/);
    const lastName = restNameParts.join(' ') || 'Applicant';
    const emailLocalPart = inferredName.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') || `candidate.${Date.now()}`;

    try {
      const createdCandidate = await apiFetch<CandidateRow>('/api/hr-agent/candidates', {
        method: 'POST',
        body: JSON.stringify({
          job_id: jobs[0]?.id || null,
          first_name: firstName,
          last_name: lastName,
          email: `${emailLocalPart}.${Date.now()}@internal.local`,
          phone: '555-0123',
          location: 'Unspecified',
          current_role: jobs[0]?.title || 'Applicant',
          applied_role: jobs[0]?.title || 'Applicant',
          years_experience: 0,
          skills: jobs[0]?.requirements || [],
          achievements: [],
          overall_score: 0,
          decision_status: CandidateStatus.APPLIED,
          source: 'Manual Upload',
          communication_status: 'Not Contacted',
          reply_status: 'No Reply',
          interview_status: 'Not Scheduled',
          ai_reasoning: textContent,
          application_content: emailContentInput || `Dear Hiring Team,\n\nI am writing to apply for the ${jobs[0]?.title || 'open'} position.\n\nSincerely,\n${inferredName}`,
          quick_summary: 'Candidate added manually and awaiting screening.',
          drive_file_link: ''
        })
      });

      const mappedCandidate = {
        ...mapCandidate(createdCandidate),
        resumeText: textContent,
        emailContent: emailContentInput || `Dear Hiring Team,\n\nI am writing to apply for the ${jobs[0]?.title || 'open'} position.\n\nSincerely,\n${inferredName}`
      };

      setCandidates(prev => [...prev, mappedCandidate]);
      setSelectedCandidate(mappedCandidate);
      setEmailContentInput('');
      showNotification('Candidate added to the live pipeline.');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to add candidate to the backend pipeline.';
      showNotification(message, 'error');
    } finally {
      e.target.value = '';
    }
  }, [jobs, emailContentInput, setCandidates, showNotification]);

  const handleAnalyzeCandidate = useCallback(async (candidate: Candidate) => {
    const job = jobs.find(j => j.id === candidate.jobId);
    if (!job) return;

    setIsAnalyzing(true);
    const result = await GeminiService.analyzeCandidate(candidate, job.description);

    const scoreMatch = result.Scoring.match(/\d+/);
    const scoreNum = scoreMatch ? parseInt(scoreMatch[0]) : 0;

    try {
      const response = await apiFetch<{ candidate: CandidateRow }>(`/api/hr-agent/candidates/${candidate.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          overall_score: scoreNum * 10,
          ai_reasoning: JSON.stringify(result),
          decision_status: candidate.status,
          current_role: job.title
        })
      });

      const updatedCandidate = {
        ...mapCandidate(response.candidate),
        aiAnalysis: JSON.stringify(result),
        emailContent: candidate.emailContent,
        resumeText: candidate.resumeText
      };

      setCandidates(prev => prev.map(c => c.id === candidate.id ? updatedCandidate : c));
      setSelectedCandidate(updatedCandidate);
      showNotification('AI analysis saved to the live pipeline.');
    } catch (err) {
      const updatedCandidates = candidates.map(c =>
        c.id === candidate.id
          ? { ...c, aiMatchScore: scoreNum * 10, aiAnalysis: JSON.stringify(result) }
          : c
      );

      setCandidates(updatedCandidates);
      const updatedSelected = updatedCandidates.find(c => c.id === candidate.id);
      if (updatedSelected) setSelectedCandidate(updatedSelected);
      const message = err instanceof ApiError ? err.message : 'AI analysis completed locally, but backend sync failed.';
      showNotification(message, 'info');
    } finally {
      setIsAnalyzing(false);
    }
  }, [jobs, candidates, setCandidates, showNotification]);

  const handleUpdateCandidateStatus = useCallback(async (candidate: Candidate, status: CandidateStatus) => {
    setIsUpdatingCandidateStatus(true);
    try {
      const response = await apiFetch<{ candidate: CandidateRow; export: { shortlisted: boolean; driveLinked: boolean; sheetsLogged: boolean; }; }>(`/api/hr-agent/candidates/${candidate.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          decision_status: status,
          overall_score: candidate.aiMatchScore || 0,
          ai_reasoning: candidate.aiAnalysis || candidate.resumeText,
          source: candidate.sourcingSource || '',
          applied_role: candidate.appliedRole || '',
          expected_salary: candidate.expectedSalary || '',
          notice_period: candidate.noticePeriod || '',
          communication_status: candidate.communicationStatus || '',
          reply_status: candidate.replyStatus || '',
          interview_status: candidate.interviewStatus || '',
          application_content: candidate.emailContent || '',
          quick_summary: candidate.quickSummary || '',
          current_role: candidate.currentRole || ''
        })
      });

      const updatedCandidate = {
        ...mapCandidate(response.candidate),
        aiAnalysis: candidate.aiAnalysis,
        emailContent: candidate.emailContent,
        resumeText: candidate.resumeText
      };

      setCandidates(prev => prev.map(c => c.id === candidate.id ? updatedCandidate : c));
      setSelectedCandidate(updatedCandidate);

      if (response.export.driveLinked && response.export.sheetsLogged) {
        const statusPrefix = response.export.shortlisted ? 'Candidate shortlisted' : `Candidate marked as ${status}`;
        showNotification(`${statusPrefix} and synced to Drive and Sheets.`);
      } else if (response.export.driveLinked) {
        showNotification(`Candidate marked as ${status} and saved to Drive. Sheets logging needs attention.`, 'info');
      } else if (response.export.sheetsLogged) {
        showNotification(`Candidate marked as ${status} and logged to Sheets. Drive link could not be created yet.`, 'info');
      } else {
        showNotification(`Candidate marked as ${status}, but Google export needs attention. Check HR Agent logs.`, 'error');
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to update candidate status.';
      showNotification(message, 'error');
    } finally {
      setIsUpdatingCandidateStatus(false);
    }
  }, [setCandidates, showNotification]);

  const handleSaveCandidateDetails = useCallback(async (candidate: Candidate) => {
    setIsUpdatingCandidateStatus(true);
    try {
      const response = await apiFetch<{ candidate: CandidateRow }>(`/api/hr-agent/candidates/${candidate.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          decision_status: candidate.status,
          overall_score: candidate.aiMatchScore || 0,
          ai_reasoning: candidate.aiAnalysis || candidate.resumeText,
          current_role: candidate.currentRole || '',
          location: candidate.location || '',
          phone: candidate.phone || '',
          source: candidate.sourcingSource || '',
          applied_role: candidate.appliedRole || '',
          expected_salary: candidate.expectedSalary || '',
          notice_period: candidate.noticePeriod || '',
          communication_status: candidate.communicationStatus || '',
          reply_status: candidate.replyStatus || '',
          interview_status: candidate.interviewStatus || '',
          application_content: candidate.emailContent || '',
          quick_summary: candidate.quickSummary || ''
        })
      });

      const updatedCandidate = {
        ...mapCandidate(response.candidate),
        aiAnalysis: candidate.aiAnalysis,
        resumeText: candidate.resumeText
      };

      setCandidates(prev => prev.map(c => c.id === candidate.id ? updatedCandidate : c));
      setSelectedCandidate(updatedCandidate);
      showNotification('Candidate ATS details saved and synced.');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to save candidate ATS details.';
      showNotification(message, 'error');
    } finally {
      setIsUpdatingCandidateStatus(false);
    }
  }, [setCandidates, showNotification]);

  return (
    <div className="space-y-6 h-full flex flex-col relative">

      {/* --- Header --- */}
      <div className="flex flex-col gap-4 lg:flex-row lg:justify-between lg:items-center flex-shrink-0">
        <h1 className="text-2xl font-bold text-slate-800">Recruitment & Hiring</h1>
        <div className="flex flex-wrap gap-2 bg-white border border-slate-200 p-1 rounded-xl shadow-sm">
          <button
            onClick={() => setActiveTab('jobs')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'jobs' ? 'bg-indigo-500/15 text-indigo-300 shadow-sm ring-1 ring-indigo-400/40' : 'text-slate-400 hover:text-slate-100 hover:bg-white'}`}
          >
            Job Postings
          </button>
          <button
            onClick={() => setActiveTab('screening')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'screening' ? 'bg-indigo-500/15 text-indigo-300 shadow-sm ring-1 ring-indigo-400/40' : 'text-slate-400 hover:text-slate-100 hover:bg-white'}`}
          >
            Candidate Screening
          </button>
          <button
            onClick={() => setActiveTab('sourcing')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'sourcing' ? 'bg-indigo-500/15 text-indigo-300 shadow-sm ring-1 ring-indigo-400/40' : 'text-slate-400 hover:text-slate-100 hover:bg-white'}`}
          >
            <Globe className="w-3.5 h-3.5" />
            AI Sourcing
          </button>
        </div>
      </div>

      {/* --- Content --- */}
      {activeTab === 'jobs' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {showJobForm ? (
            <JobForm onSave={handleSaveJob} onCancel={() => setShowJobForm(false)} />
          ) : selectedJob ? (
            <JobDetail
              job={selectedJob}
              candidates={candidates.filter(c => c.jobId === selectedJob.id)}
              onBack={() => setSelectedJob(null)}
              onDelete={handleDeleteJob}
              onToggleStatus={handleToggleJobStatus}
            />
          ) : (
            <JobBoard
              jobs={jobs}
              candidates={candidates}
              onSelectJob={setSelectedJob}
              onDeleteJob={handleDeleteJob}
              onCreateNew={() => setShowJobForm(true)}
            />
          )}
        </div>
      )}

      {activeTab === 'screening' && (
        <div className="flex flex-col xl:flex-row gap-6 flex-1 min-h-0 overflow-hidden">
          <CandidateList
            candidates={candidates.filter(c => !c.isSourced)}
            selectedCandidateId={selectedCandidate?.id}
            onSelectCandidate={setSelectedCandidate}
            onFileUpload={handleFileUpload}
            emailContentInput={emailContentInput}
            setEmailContentInput={setEmailContentInput}
          />

          {selectedCandidate ? (
            <CandidateDetail
              candidate={selectedCandidate}
              onDelete={handleDeleteCandidate}
              onAnalyze={handleAnalyzeCandidate}
              onUpdateStatus={handleUpdateCandidateStatus}
              onSaveDetails={handleSaveCandidateDetails}
              onClose={() => setSelectedCandidate(null)}
              isAnalyzing={isAnalyzing}
              isUpdatingStatus={isUpdatingCandidateStatus}
            />
          ) : (
            <div className="flex-1 h-full flex flex-col items-center justify-center text-slate-400 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <User className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-base font-medium text-slate-200">Select a candidate to review screening details</p>
              <p className="mt-2 text-sm text-slate-500">Analysis, status updates, and export actions will appear here.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'sourcing' && (
        <SourcingView
          candidates={candidates}
          setCandidates={setCandidates}
          jobs={jobs}
        />
      )}

      {/* --- Toast Notification System --- */}
      {notification && (
        <div className="fixed bottom-6 right-6 max-w-md bg-white text-slate-800 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-bounce-in z-50 border border-slate-200">
          <div className={`w-2 h-2 rounded-full ${notification.type === 'success' ? 'bg-green-400' : notification.type === 'info' ? 'bg-sky-400' : 'bg-red-400'}`} />
          <span className="text-sm font-medium">{notification.message}</span>
          {undoStack.length > 0 && (
            <button
              onClick={handleUndo}
              className="ml-2 text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
});
