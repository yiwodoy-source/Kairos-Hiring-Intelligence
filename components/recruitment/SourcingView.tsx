import React, { useState, useMemo } from 'react';
import { Candidate, SourcingStage, SourcingSource, JobPosting } from '../../types.ts';
import { GeminiService } from '../../services/geminiService';
import { apiFetch, ApiError } from '../../services/apiClient';
import { CandidateRow, mapCandidate } from '../../services/hrDataMappers';
import { Search, Globe, Linkedin, Github, Mail, Send, CheckCircle, MessageSquare, Sparkles, Filter, Briefcase, UserPlus, MapPin, X, ExternalLink, FileText, Award, Copy, Phone, Lock } from 'lucide-react';

interface SourcingViewProps {
    candidates: Candidate[];
    setCandidates: React.Dispatch<React.SetStateAction<Candidate[]>>;
    jobs: JobPosting[];
}

const SourceIcon = React.memo(({ source }: { source: string }) => {
    switch (source) {
        case SourcingSource.LINKEDIN: return <Linkedin className="w-3 h-3 text-blue-600" />;
        case SourcingSource.GITHUB: return <Github className="w-3 h-3 text-slate-800" />;
        case SourcingSource.NAUKRI: return <div className="w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center text-[8px] text-white font-bold">N</div>;
        case SourcingSource.INDEED: return <div className="w-3 h-3 bg-blue-700 rounded-full flex items-center justify-center text-[8px] text-white font-bold">I</div>;
        case SourcingSource.SHINE: return <div className="w-3 h-3 bg-purple-600 rounded-full flex items-center justify-center text-[8px] text-white font-bold">S</div>;
        case SourcingSource.FOUNDIT: return <div className="w-3 h-3 bg-red-600 rounded-full flex items-center justify-center text-[8px] text-white font-bold">M</div>;
        default: return <Globe className="w-3 h-3 text-slate-400" />;
    }
});

interface StageColumnProps {
    title: string;
    stage: SourcingStage;
    icon: any;
    color: string;
    candidates: Candidate[]; // This will be the filtered candidates for the stage
    selectedCandidates: Set<string>;
    onToggleSelection: (id: string) => void;
    onViewProfile: (candidate: Candidate) => void;
}

const StageColumn = React.memo(({ title, stage, icon: Icon, color, candidates, selectedCandidates, onToggleSelection, onViewProfile }: StageColumnProps) => {
    return (
        <div className="flex-1 min-w-[250px] bg-slate-100 rounded-xl border border-slate-300 flex flex-col max-h-[600px]">
            <div className={`p-3 border-b border-slate-200 ${color} bg-opacity-10 flex justify-between items-center rounded-t-xl`}>
                <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${color.replace('bg-', 'text-')}`} />
                    <h4 className="font-semibold text-slate-700 text-sm">{title}</h4>
                </div>
                <span className="bg-slate-200 px-2 py-0.5 rounded-full text-xs font-bold shadow-sm">{candidates.length}</span>
            </div>
            <div className="p-2 space-y-2 overflow-y-auto flex-1">
                {candidates.map(c => (
                    <div key={c.id} className="bg-slate-50 p-3 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative group">
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                                <SourceIcon source={c.sourcingSource || ''} />
                                <span className="text-[10px] text-slate-400 uppercase font-bold">{c.sourcingSource}</span>
                            </div>
                            <input
                                type="checkbox"
                                checked={selectedCandidates.has(c.id)}
                                onChange={() => onToggleSelection(c.id)}
                                className="rounded text-indigo-600 focus:ring-indigo-500"
                            />
                        </div>
                        <h5 className="font-bold text-slate-800 text-sm">{c.name}</h5>
                        <p className="text-xs text-slate-500 truncate">{c.company}</p>
                        <div className="mt-2 flex justify-between items-center">
                            {typeof c.aiMatchScore === 'number' && (
                                <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">Match: {c.aiMatchScore}%</span>
                            )}
                            {stage === SourcingStage.CONTACTED && (
                                <span className="text-[10px] text-slate-400 flex items-center gap-1"><Mail className="w-3 h-3" /> Sent</span>
                            )}
                        </div>

                        <button
                            onClick={() => onViewProfile(c)}
                            className="w-full mt-2 text-[10px] text-indigo-600 hover:text-indigo-800 font-medium text-center border-t border-slate-100 pt-2"
                        >
                            View Full Profile
                        </button>
                    </div>
                ))}
                {candidates.length === 0 && (
                    <div className="text-center py-8 text-slate-400 text-sm italic">No candidates</div>
                )}
            </div>
        </div>
    );
});

interface DiscoveryResultsProps {
    candidates: Candidate[];
    onViewProfile: (candidate: Candidate) => void;
    onAddToPipeline: (candidate: Candidate) => void;
}

const DiscoveryResults = React.memo(({ candidates, onViewProfile, onAddToPipeline }: DiscoveryResultsProps) => {
    // STEP 7 — UI RENDER GUARD (FINAL SAFETY)
    const safeCandidates = useMemo(() => candidates.filter(c => {
        // 1. Basic Existence Check
        if (!c.name || c.name === 'Unknown Candidate') return false;
        
        // 2. Content Safety Check
        const content = (c.name + " " + c.resumeText).toLowerCase();
        const bannedPhrases = [
            "how to", "best skills", "resume tips", "career guide", "examples", 
            "writing services", "job description", "step-by-step"
        ];
        
        if (bannedPhrases.some(phrase => content.includes(phrase))) return false;

        return true;
    }), [candidates]);

    return (
        <div className="mt-6 border-t border-slate-100 pt-4 animate-fade-in">
            <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center justify-between">
                <span>Discovered Candidates ({safeCandidates.length})</span>
                <span className="text-xs font-normal text-slate-400 bg-slate-50 px-2 py-1 rounded">Public profile snippets — open to verify</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {safeCandidates.map((c, idx) => (
                    <div key={`${c.name}-${c.company}-${idx}`} className="border border-slate-300 rounded-lg p-3 hover:border-indigo-300 transition-colors bg-slate-100 shadow-sm">
                        <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-xs font-bold">
                                    {c.name.charAt(0)}
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-800">{c.name}</p>
                                    <p className="text-[10px] text-slate-500">{c.company}</p>
                                    {c.location && <p className="text-[10px] text-slate-400 flex items-center gap-1"><MapPin className="w-2 h-2" /> {c.location}</p>}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <SourceIcon source={c.sourcingSource || ''} />
                                <span className="text-[10px] text-slate-400 font-medium">{c.sourcingSource}</span>
                            </div>
                        </div>
                        <p className="text-xs text-slate-600 mb-3 line-clamp-2 h-8">{c.resumeText.replace('Bio: ', '')}</p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => onViewProfile(c)}
                                className="flex-1 text-xs border border-slate-300 text-slate-600 py-1.5 rounded hover:bg-slate-50 font-medium"
                            >
                                View Profile
                            </button>
                            <button
                                onClick={() => onAddToPipeline(c)}
                                className="flex-1 text-xs bg-indigo-500 text-indigo-700 py-1.5 rounded hover:bg-indigo-100 font-medium flex items-center justify-center gap-1"
                            >
                                <UserPlus className="w-3 h-3" /> Pipeline
                            </button>
                            {(c.linkedinUrl || c.portfolioUrl) && (
                                <a
                                    href={c.linkedinUrl || c.portfolioUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 text-xs text-indigo-700 underline"
                                >
                                    Open Profile
                                </a>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
});

export const SourcingView: React.FC<SourcingViewProps> = ({ candidates, setCandidates, jobs }) => {
    // --- Discovery State ---
    const [roleQuery, setRoleQuery] = useState('');
    const [skillsQuery, setSkillsQuery] = useState('');
    const [locationQuery, setLocationQuery] = useState('Remote');
    const [isSearching, setIsSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [discoveredPool, setDiscoveredPool] = useState<Candidate[]>([]);
    const lastRealResultsRef = React.useRef<Candidate[]>([]);


    const normalizeRole = (role: string) => role.replace(/^(Senior|Lead|Junior)\s+/i, '').trim() || 'Developer';
    const broadenLocation = (loc: string) => {
        const s = (loc || '').toLowerCase();
        if (!s || s.includes('remote') || s.length < 4) return 'India';
        return loc;
    };

    // --- Outreach State ---
    const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
    const [isOutreachModalOpen, setIsOutreachModalOpen] = useState(false);
    const [campaignStep, setCampaignStep] = useState(1);
    const [campaignSubject, setCampaignSubject] = useState('');
    const [campaignBody, setCampaignBody] = useState('');
    const [viewingCandidate, setViewingCandidate] = useState<Candidate | null>(null);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importText, setImportText] = useState('');
    const [isParsing, setIsParsing] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // --- Filtering ---
    const sourcedCandidates = useMemo(() => candidates.filter(c => c.isSourced), [candidates]);

    const buildSyntheticSourcedEmail = React.useCallback((candidate: Candidate) => {
        const base = (candidate.profileUrl || candidate.linkedinUrl || candidate.portfolioUrl || `${candidate.name}-${candidate.sourcingSource || 'source'}`)
            .toLowerCase()
            .replace(/https?:\/\//g, '')
            .replace(/[^a-z0-9]+/g, '.')
            .replace(/^\.+|\.+$/g, '')
            .slice(0, 80) || `candidate.${Date.now()}`;
        return `sourced.${base}@internal.local`;
    }, []);

    const deriveStagePayload = React.useCallback((stage: SourcingStage) => {
        if (stage === SourcingStage.CONTACTED) {
            return {
                communication_status: 'Outreach Sent',
                reply_status: 'No Reply',
                decision_status: 'Applied',
                interview_status: 'Not Scheduled'
            };
        }
        if (stage === SourcingStage.ENGAGED) {
            return {
                communication_status: 'Contacted',
                reply_status: 'Interested',
                decision_status: 'Review Required',
                interview_status: 'Not Scheduled'
            };
        }
        if (stage === SourcingStage.QUALIFIED) {
            return {
                communication_status: 'Contacted',
                reply_status: 'Interested',
                decision_status: 'Shortlisted',
                interview_status: 'Awaiting Slots'
            };
        }
        return {
            communication_status: 'Not Contacted',
            reply_status: 'No Reply',
            decision_status: 'Applied',
            interview_status: 'Not Scheduled'
        };
    }, []);

    const handleSearch = async () => {
        if (!roleQuery) return;
        setIsSearching(true);
        setHasSearched(true);

        let realResults: Candidate[] = [];
        const loc = broadenLocation(locationQuery);
        realResults = await GeminiService.sourceCandidates(roleQuery, skillsQuery, loc);

        if (realResults.length > 0) lastRealResultsRef.current = realResults;

        setDiscoveredPool(realResults);
        setIsSearching(false);
    };

    const addToPipeline = React.useCallback(async (candidate: Candidate) => {
        const existingCandidate = sourcedCandidates.find(c =>
            (c.profileUrl || c.linkedinUrl || c.portfolioUrl) &&
            (c.profileUrl || c.linkedinUrl || c.portfolioUrl) === (candidate.profileUrl || candidate.linkedinUrl || candidate.portfolioUrl)
        ) || sourcedCandidates.find(c => c.name === candidate.name && c.sourcingSource === candidate.sourcingSource);

        if (existingCandidate) return;

        const targetJob = jobs.find(j => j.status === 'Open') || jobs[0];
        const stageDefaults = deriveStagePayload(SourcingStage.DISCOVERED);

        try {
            const createdCandidate = await apiFetch<CandidateRow>('/api/hr-agent/candidates', {
                method: 'POST',
                body: JSON.stringify({
                    job_id: targetJob?.id || null,
                    first_name: candidate.name.split(' ')[0] || candidate.name,
                    last_name: candidate.name.split(' ').slice(1).join(' ') || 'Sourced',
                    email: candidate.email || buildSyntheticSourcedEmail(candidate),
                    phone: candidate.phone || '',
                    location: candidate.location || '',
                    current_role: targetJob?.title || roleQuery || 'Prospect',
                    applied_role: targetJob?.title || roleQuery || 'Prospect',
                    years_experience: candidate.experience?.length || 0,
                    skills: candidate.skills || [],
                    achievements: [],
                    overall_score: candidate.aiMatchScore || 0,
                    decision_status: stageDefaults.decision_status,
                    source: candidate.sourcingSource || 'Public Profile Discovery',
                    communication_status: stageDefaults.communication_status,
                    reply_status: stageDefaults.reply_status,
                    interview_status: stageDefaults.interview_status,
                    workflow_state: 'Sourced',
                    next_action: 'Review sourced profile',
                    sourcing_stage: SourcingStage.DISCOVERED,
                    is_sourced: true,
                    profile_url: candidate.profileUrl || candidate.linkedinUrl || candidate.portfolioUrl || '',
                    company: candidate.company || '',
                    ai_reasoning: candidate.resumeText || '',
                    application_content: '',
                    quick_summary: candidate.resumeText?.replace('Bio: ', '').substring(0, 300) || 'Sourced candidate awaiting review.',
                    drive_file_link: ''
                })
            });

            const persistedCandidate = {
                ...candidate,
                ...mapCandidate(createdCandidate),
                resumeText: candidate.resumeText,
                experience: candidate.experience,
                company: candidate.company,
                profileUrl: candidate.profileUrl || candidate.linkedinUrl || candidate.portfolioUrl,
                linkedinUrl: candidate.linkedinUrl,
                portfolioUrl: candidate.portfolioUrl
            };

            setCandidates(prev => [...prev, persistedCandidate]);
            setDiscoveredPool(prev => prev.filter(c => c.name !== candidate.name));
            setErrorMessage(null);
        } catch (error) {
            const message = error instanceof ApiError ? error.message : 'Unable to persist sourced candidate to the ATS.';
            setErrorMessage(message);
        }
    }, [sourcedCandidates, jobs, setCandidates, deriveStagePayload, buildSyntheticSourcedEmail, roleQuery]);

    const updateSourcingStage = React.useCallback(async (candidate: Candidate, stage: SourcingStage) => {
        try {
            const stageDefaults = deriveStagePayload(stage);
            const response = await apiFetch<{ candidate: CandidateRow }>(`/api/hr-agent/candidates/${candidate.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    source: candidate.sourcingSource || '',
                    applied_role: candidate.appliedRole || roleQuery || '',
                    current_role: candidate.currentRole || '',
                    location: candidate.location || '',
                    phone: candidate.phone || '',
                    skills: candidate.skills || [],
                    decision_status: stageDefaults.decision_status,
                    communication_status: stageDefaults.communication_status,
                    reply_status: stageDefaults.reply_status,
                    interview_status: stageDefaults.interview_status,
                    sourcing_stage: stage,
                    is_sourced: true,
                    profile_url: candidate.profileUrl || candidate.linkedinUrl || candidate.portfolioUrl || '',
                    company: candidate.company || '',
                    application_content: candidate.emailContent || '',
                    quick_summary: candidate.quickSummary || ''
                })
            });

            const updatedCandidate = {
                ...candidate,
                ...mapCandidate(response.candidate),
                resumeText: candidate.resumeText,
                experience: candidate.experience,
                company: candidate.company,
                profileUrl: candidate.profileUrl || candidate.linkedinUrl || candidate.portfolioUrl,
                linkedinUrl: candidate.linkedinUrl,
                portfolioUrl: candidate.portfolioUrl
            };

            setCandidates(prev => prev.map(c => c.id === candidate.id ? updatedCandidate : c));
            if (viewingCandidate?.id === candidate.id) {
                setViewingCandidate(updatedCandidate);
            }
            setErrorMessage(null);
        } catch (error) {
            const message = error instanceof ApiError ? error.message : 'Unable to update sourcing workflow stage.';
            setErrorMessage(message);
        }
    }, [deriveStagePayload, roleQuery, setCandidates, viewingCandidate]);

    const handleImport = async () => {
        if (!importText.trim()) return;
        setIsParsing(true);
        const candidate = await GeminiService.parseCandidateProfile(importText);
        setIsParsing(false);

        if (candidate) {
            setDiscoveredPool(prev => [candidate, ...prev]);
            setIsImportModalOpen(false);
            setImportText('');
        }
    };

    const toggleSelection = React.useCallback((id: string) => {
        setSelectedCandidates(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    }, []);

    const startOutreach = () => {
        if (selectedCandidates.size === 0) return;
        const firstId = Array.from(selectedCandidates)[0];
        const candidate = candidates.find(c => c.id === firstId);

        // Auto-fill template
        setCampaignSubject(`Opportunity for ${roleQuery || 'Developer'} Role`);
        setCampaignBody(`Hi ${candidate?.name || 'there'},\n\nI came across your profile and was impressed by your experience with ${skillsQuery || 'your background'}.\n\nWe are currently looking for a ${roleQuery || 'suitable role'} and your profile may be a good fit. Are you open to a quick conversation?\n\nBest,\nTalent Operations Team`);

        setIsOutreachModalOpen(true);
        setCampaignStep(1);
    };

    const StageColumn = ({ title, stage, icon: Icon, color }: any) => {
        const inStage = sourcedCandidates.filter(c => c.sourcingStage === stage);

        return (
            <div className="flex-1 min-w-[250px] bg-slate-100 rounded-xl border border-slate-300 flex flex-col max-h-[600px]">
                <div className={`p-3 border-b border-slate-200 ${color} bg-opacity-10 flex justify-between items-center rounded-t-xl`}>
                    <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${color.replace('bg-', 'text-')}`} />
                        <h4 className="font-semibold text-slate-700 text-sm">{title}</h4>
                    </div>
                    <span className="bg-slate-200 px-2 py-0.5 rounded-full text-xs font-bold shadow-sm">{inStage.length}</span>
                </div>
                <div className="p-2 space-y-2 overflow-y-auto flex-1">
                    {inStage.map(c => (
                        <div key={c.id} className="bg-slate-50 p-3 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative group">
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    <SourceIcon source={c.sourcingSource || ''} />
                                    <span className="text-[10px] text-slate-400 uppercase font-bold">{c.sourcingSource}</span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={selectedCandidates.has(c.id)}
                                    onChange={() => toggleSelection(c.id)}
                                    className="rounded text-indigo-600 focus:ring-indigo-500"
                                />
                            </div>
                            <h5 className="font-bold text-slate-800 text-sm">{c.name}</h5>
                            <p className="text-xs text-slate-500 truncate">{c.resumeText.split('\n')[0].replace('Current Role: ', '')}</p>
                            <div className="mt-2 flex justify-between items-center">
                                {typeof c.aiMatchScore === 'number' && (
                                    <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">Match: {c.aiMatchScore}%</span>
                                )}
                                {stage === SourcingStage.CONTACTED && (
                                    <span className="text-[10px] text-slate-400 flex items-center gap-1"><Mail className="w-3 h-3" /> Sent</span>
                                )}
                            </div>

                            <button
                                onClick={() => setViewingCandidate(c)}
                                className="w-full mt-2 text-[10px] text-indigo-600 hover:text-indigo-800 font-medium text-center border-t border-slate-100 pt-2"
                            >
                                View Full Profile
                            </button>
                        </div>
                    ))}
                    {inStage.length === 0 && (
                        <div className="text-center py-8 text-slate-400 text-sm italic">No candidates</div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full space-y-6">

            {/* --- Discovery Section --- */}
            <div className="bg-slate-100 p-6 rounded-xl shadow-sm border border-slate-300 flex-shrink-0">
                <div className="flex items-center gap-2 mb-4">
                    <div className="bg-indigo-100 p-2 rounded-lg">
                        <Globe className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">AI Candidate Discovery Engine</h2>
                        <p className="text-xs text-slate-500">Use AI-assisted search on connected/imported candidate data. External portal integrations are not connected yet.</p>
                    </div>
                </div>

                <div className="flex gap-4 items-end">
                    <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-700 mb-1">Target Role</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-500"
                                placeholder="e.g. Senior React Developer"
                                value={roleQuery}
                                onChange={(e) => setRoleQuery(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-700 mb-1">Key Skills</label>
                        <input
                            type="text"
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-500"
                            placeholder="e.g. TypeScript, Node.js, AWS"
                            value={skillsQuery}
                            onChange={(e) => setSkillsQuery(e.target.value)}
                        />
                    </div>
                    <div className="w-48">
                        <label className="block text-xs font-bold text-slate-700 mb-1">Location</label>
                        <div className="relative">
                            <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-500"
                                placeholder="City or Remote"
                                value={locationQuery}
                                onChange={(e) => setLocationQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <button
                        onClick={handleSearch}
                        disabled={isSearching || !roleQuery}
                        className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 shadow-sm h-[38px]"
                    >
                        {isSearching ? 'Sourcing...' : 'Start Discovery'}
                        {!isSearching && <Sparkles className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={() => setIsImportModalOpen(true)}
                        className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-50 flex items-center gap-2 shadow-sm h-[38px]"
                        title="Import from Resume/Text"
                    >
                        <FileText className="w-4 h-4" />
                    </button>
                </div>

                {/* Discovery Results */}
                {errorMessage && (
                    <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {errorMessage}
                    </div>
                )}
                {discoveredPool.length > 0 && (
                    <DiscoveryResults
                        candidates={discoveredPool}
                        onViewProfile={setViewingCandidate}
                        onAddToPipeline={addToPipeline}
                    />
                )}

                {/* No Results Message */}
                {!isSearching && hasSearched && discoveredPool.length === 0 && (
                    <div className="mt-6 text-center py-12 bg-slate-50 rounded-lg border border-slate-200 border-dashed">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-50 mb-4">
                            <Search className="w-8 h-8 text-red-300" />
                        </div>
                        <h4 className="text-lg font-bold text-slate-700 mb-2">No verified candidate sources connected</h4>
                        <p className="text-slate-500 max-w-md mx-auto mb-6">
                            This system requires a connection to a valid candidate database or recruitment platform API (LinkedIn Recruiter, Indeed, Naukri) to display real profiles.
                        </p>
                        <div className="flex gap-2 justify-center">
                            <button className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50">
                                Configure API Keys
                            </button>
                            <button className="px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-lg text-sm font-medium text-indigo-600 hover:bg-indigo-100">
                                Upload Resumes
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* --- Pipeline Section --- */}
            <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Filter className="w-5 h-5 text-slate-400" />
                        Sourcing Pipeline
                    </h3>
                    <div className="flex gap-2">
                        {selectedCandidates.size > 0 && (
                            <button
                                onClick={startOutreach}
                                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-2 animate-bounce-in"
                            >
                                <Send className="w-4 h-4" />
                                Draft Outreach ({selectedCandidates.size})
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex gap-4 overflow-x-auto pb-2 flex-1">
                    <StageColumn
                        title="Discovered"
                        stage={SourcingStage.DISCOVERED}
                        icon={Globe}
                        color="bg-slate-500"
                        candidates={sourcedCandidates.filter(c => c.sourcingStage === SourcingStage.DISCOVERED)}
                        selectedCandidates={selectedCandidates}
                        onToggleSelection={toggleSelection}
                        onViewProfile={setViewingCandidate}
                    />
                    <StageColumn
                        title="Outreach Sent"
                        stage={SourcingStage.CONTACTED}
                        icon={Mail}
                        color="bg-blue-500"
                        candidates={sourcedCandidates.filter(c => c.sourcingStage === SourcingStage.CONTACTED)}
                        selectedCandidates={selectedCandidates}
                        onToggleSelection={toggleSelection}
                        onViewProfile={setViewingCandidate}
                    />
                    <StageColumn
                        title="Engaged / Replied"
                        stage={SourcingStage.ENGAGED}
                        icon={MessageSquare}
                        color="bg-purple-500"
                        candidates={sourcedCandidates.filter(c => c.sourcingStage === SourcingStage.ENGAGED)}
                        selectedCandidates={selectedCandidates}
                        onToggleSelection={toggleSelection}
                        onViewProfile={setViewingCandidate}
                    />
                    <StageColumn
                        title="Qualified"
                        stage={SourcingStage.QUALIFIED}
                        icon={CheckCircle}
                        color="bg-green-500"
                        candidates={sourcedCandidates.filter(c => c.sourcingStage === SourcingStage.QUALIFIED)}
                        selectedCandidates={selectedCandidates}
                        onToggleSelection={toggleSelection}
                        onViewProfile={setViewingCandidate}
                    />
                </div>
            </div>

            {/* --- Import Modal --- */}
            {isImportModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden animate-fade-in-up">
                        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center">
                            <h3 className="text-white font-bold flex items-center gap-2">
                                <FileText className="w-5 h-5 text-indigo-400" />
                                Import Candidate Profile
                            </h3>
                            <button onClick={() => setIsImportModalOpen(false)} className="text-slate-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            <p className="text-sm text-slate-600 mb-4">
                                Paste the candidate's resume text, LinkedIn profile summary, or any other profile data below.
                                Our AI will parse it into a structured profile.
                            </p>
                            <textarea
                                className="w-full h-64 p-4 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 font-mono"
                                placeholder="Paste profile text here..."
                                value={importText}
                                onChange={(e) => setImportText(e.target.value)}
                            />
                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    onClick={() => setIsImportModalOpen(false)}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleImport}
                                    disabled={isParsing || !importText.trim()}
                                    className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isParsing ? 'Parsing...' : 'Parse & Import'}
                                    {!isParsing && <Sparkles className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- Outreach Modal --- */}
            {isOutreachModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-slate-100 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden animate-fade-in-up">
                        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center">
                            <h3 className="text-white font-bold flex items-center gap-2">
                                <Send className="w-5 h-5 text-indigo-400" />
                                Outreach Draft
                            </h3>
                        </div>

                        <div className="p-6">
                            {campaignStep === 1 && (
                                <div className="space-y-4">
                                    <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg text-sm text-blue-800 flex items-start gap-3">
                                        <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                                        <p>AI has generated a draft template. Sending is disabled until an approved email, WhatsApp, or SMS provider is connected.</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Subject Line</label>
                                        <input
                                            type="text"
                                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                            value={campaignSubject}
                                            onChange={(e) => setCampaignSubject(e.target.value)}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Email Body</label>
                                        <textarea
                                            className="w-full h-48 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-sans text-sm"
                                            value={campaignBody}
                                            onChange={(e) => setCampaignBody(e.target.value)}
                                        />
                                        <p className="text-xs text-slate-400 mt-1 text-right">Variables like {'{Name}'} are auto-filled.</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
                            <button
                                onClick={() => setIsOutreachModalOpen(false)}
                                className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                disabled
                                className="px-6 py-2 bg-slate-300 text-slate-500 font-bold rounded-lg cursor-not-allowed flex items-center gap-2"
                                title="Connect an approved communication provider before sending outreach."
                            >
                                <Lock className="w-4 h-4" /> Provider Not Connected
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- View Profile Modal --- */}
            {viewingCandidate && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-slate-100 rounded-xl w-full max-w-3xl shadow-2xl overflow-hidden animate-fade-in-up max-h-[90vh] flex flex-col">
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-300 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-indigo-600" />
                                Candidate Profile
                            </h3>
                            <button onClick={() => setViewingCandidate(null)} className="text-slate-500 hover:text-slate-700">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto">
                            <div className="flex items-start gap-6 mb-8">
                                <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-2xl font-bold flex-shrink-0">
                                    {viewingCandidate.name.charAt(0)}
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h2 className="text-2xl font-bold text-slate-800">{viewingCandidate.name}</h2>
                                            <p className="text-slate-600 font-medium">{viewingCandidate.company || 'Open to work'}</p>
                                            <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                                                {viewingCandidate.location && <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {viewingCandidate.location}</span>}
                                                <span className="flex items-center gap-1"><Briefcase className="w-4 h-4" /> {viewingCandidate.sourcingSource}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            {typeof viewingCandidate.aiMatchScore === 'number' && (
                                                <div className="inline-block bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-sm font-bold mb-2">
                                                    {viewingCandidate.aiMatchScore}% Match
                                                </div>
                                            )}
                                            <div className="flex gap-2 justify-end">
                                                {viewingCandidate.linkedinUrl && (
                                                    <a href={viewingCandidate.linkedinUrl} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors">
                                                        <Linkedin className="w-5 h-5" />
                                                    </a>
                                                )}
                                                {viewingCandidate.portfolioUrl && (
                                                    <a href={viewingCandidate.portfolioUrl} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors">
                                                        <Github className="w-5 h-5" />
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="rounded-xl border border-slate-300 bg-slate-50 p-4">
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Workflow State</p>
                                    <p className="mt-2 text-sm font-semibold text-slate-800">{viewingCandidate.workflowState || 'Sourced'}</p>
                                </div>
                                <div className="rounded-xl border border-slate-300 bg-slate-50 p-4">
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Next Action</p>
                                    <p className="mt-2 text-sm font-semibold text-slate-800">{viewingCandidate.nextAction || 'Review sourced profile'}</p>
                                </div>
                            </div>

                            {/* Contact Information Section - Unlock on Add */}
                            {(viewingCandidate.email || viewingCandidate.phone) && (() => {
                                const isInPipeline = sourcedCandidates.some(c => c.name === viewingCandidate.name && c.company === viewingCandidate.company);

                                return (
                                    <div className="px-6 pb-4">
                                        <div className={`relative rounded-xl p-4 border transition-all ${isInPipeline
                                            ? 'bg-green-50 border-green-200'
                                            : 'bg-slate-50 border-slate-300'
                                            }`}>
                                            <h4 className={`font-bold mb-3 text-sm flex items-center gap-2 ${isInPipeline ? 'text-green-800' : 'text-slate-800'
                                                }`}>
                                                {isInPipeline ? (
                                                    <>
                                                        <CheckCircle className="w-4 h-4 text-green-600" /> Contact Information Unlocked
                                                    </>
                                                ) : (
                                                    <>
                                                        <Lock className="w-4 h-4 text-slate-600" /> Contact Information
                                                    </>
                                                )}
                                            </h4>

                                            {!isInPipeline && (
                                                <div className="absolute inset-0 bg-slate-300/60 backdrop-blur-sm rounded-xl flex items-center justify-center z-10">
                                                    <div className="text-center bg-slate-100 px-6 py-4 rounded-lg shadow-lg border border-slate-300">
                                                        <Lock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                                                        <p className="font-bold text-slate-800 mb-1">Contact Locked</p>
                                                        <p className="text-xs text-slate-600">Add to pipeline to unlock contact details</p>
                                                    </div>
                                                </div>
                                            )}

                                            <div className={`grid grid-cols-2 gap-3 ${!isInPipeline ? 'blur-sm' : ''}`}>
                                                {viewingCandidate.email && (
                                                    <div className={`flex items-center gap-2 rounded-lg p-2 ${isInPipeline ? 'bg-green-100' : 'bg-slate-100'
                                                        }`}>
                                                        <Mail className="w-4 h-4 text-slate-500" />
                                                        <span className="text-sm text-slate-700 flex-1 truncate">{viewingCandidate.email}</span>
                                                        {isInPipeline && (
                                                            <button
                                                                onClick={() => navigator.clipboard.writeText(viewingCandidate.email!)}
                                                                className="p-1 hover:bg-green-200 rounded transition-colors"
                                                                title="Copy email"
                                                            >
                                                                <Copy className="w-3 h-3 text-slate-500" />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                                {viewingCandidate.phone && (
                                                    <div className={`flex items-center gap-2 rounded-lg p-2 ${isInPipeline ? 'bg-green-100' : 'bg-slate-100'
                                                        }`}>
                                                        <Phone className="w-4 h-4 text-slate-500" />
                                                        <span className="text-sm text-slate-700 flex-1">{viewingCandidate.phone}</span>
                                                        {isInPipeline && (
                                                            <button
                                                                onClick={() => navigator.clipboard.writeText(viewingCandidate.phone!)}
                                                                className="p-1 hover:bg-green-200 rounded transition-colors"
                                                                title="Copy phone"
                                                            >
                                                                <Copy className="w-3 h-3 text-slate-500" />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            <div className="grid grid-cols-3 gap-6">
                                <div className="col-span-2 space-y-6">
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-300">
                                        <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                                            <Sparkles className="w-4 h-4 text-indigo-500" /> AI Summary
                                        </h4>
                                        <p className="text-sm text-slate-600 leading-relaxed">
                                            {viewingCandidate.resumeText.replace('Bio: ', '')}
                                        </p>
                                    </div>

                                    <div>
                                        <h4 className="font-bold text-slate-800 mb-3">Experience & Skills</h4>
                                        {viewingCandidate.skills && (
                                            <div className="flex flex-wrap gap-2 mb-4">
                                                {viewingCandidate.skills.map((skill, i) => (
                                                    <span key={i} className="px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-full text-xs font-medium text-indigo-700">
                                                        {skill}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <div className="space-y-4">
                                            {viewingCandidate.experience ? (
                                                viewingCandidate.experience.map((exp, i) => (
                                                    <div key={i} className="border-l-2 border-indigo-200 pl-4 relative">
                                                        <div className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-indigo-500"></div>
                                                        <h5 className="font-bold text-slate-800 text-sm">{exp.role}</h5>
                                                        <p className="text-xs text-slate-500 font-medium">{exp.company} • {exp.duration}</p>
                                                        <p className="text-sm text-slate-600 mt-1">{exp.description}</p>
                                                    </div>
                                                ))
                                            ) : null}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="bg-slate-50 border border-slate-300 rounded-xl p-4 shadow-sm">
                                        <h4 className="font-bold text-slate-800 mb-3 text-sm">Quick Actions</h4>
                                        {(() => {
                                            const isInPipeline = sourcedCandidates.some(c => c.name === viewingCandidate.name && c.company === viewingCandidate.company);

                                            return (
                                                <button
                                                    onClick={() => {
                                                        if (!isInPipeline) {
                                                            void addToPipeline(viewingCandidate);
                                                        }
                                                    }}
                                                    disabled={isInPipeline}
                                                    className={`w-full py-3 rounded-lg text-sm font-bold shadow-md transition-all mb-3 flex items-center justify-center gap-2 ${isInPipeline
                                                        ? 'bg-green-600 text-white cursor-not-allowed'
                                                        : 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white hover:from-indigo-700 hover:to-indigo-800 transform hover:-translate-y-0.5'
                                                        }`}
                                                >
                                                    {isInPipeline ? (
                                                        <>
                                                            <CheckCircle className="w-5 h-5" /> Added to Pipeline
                                                        </>
                                                    ) : (
                                                        <>
                                                            <UserPlus className="w-5 h-5" /> Add to Pipeline
                                                        </>
                                                    )}
                                                </button>
                                            );
                                        })()}
                                        {sourcedCandidates.some(c => c.id === viewingCandidate.id) && (
                                            <div className="space-y-2">
                                                <button
                                                    onClick={() => void updateSourcingStage(viewingCandidate, SourcingStage.CONTACTED)}
                                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                                >
                                                    Mark Outreach Sent
                                                </button>
                                                <button
                                                    onClick={() => void updateSourcingStage(viewingCandidate, SourcingStage.ENGAGED)}
                                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                                >
                                                    Mark Candidate Engaged
                                                </button>
                                                <button
                                                    onClick={() => void updateSourcingStage(viewingCandidate, SourcingStage.QUALIFIED)}
                                                    className="w-full rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
                                                >
                                                    Mark Qualified
                                                </button>
                                            </div>
                                        )}
                                        <button className="w-full border border-slate-300 text-slate-600 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center justify-center gap-2">
                                            <Mail className="w-4 h-4" /> Send Email
                                        </button>
                                    </div>

                                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                                        <h4 className="font-bold text-indigo-600 mb-2 text-sm flex items-center gap-2">
                                            <Award className="w-4 h-4" /> AI Insights
                                        </h4>
                                        <ul className="space-y-2 text-xs text-indigo-400">
                                            <li className="flex items-start gap-2">
                                                <CheckCircle className="w-3 h-3 mt-0.5" /> Strong match for required skills
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <CheckCircle className="w-3 h-3 mt-0.5" /> Located in target region
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <CheckCircle className="w-3 h-3 mt-0.5" /> Experience level aligns with role
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
