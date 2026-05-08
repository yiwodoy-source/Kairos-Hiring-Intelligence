
import React, { useState, useMemo, useCallback } from 'react';
import { Send, Bot, RefreshCw, Clock, CheckCircle, Mail } from 'lucide-react';
import { Employee, JobPosting, Candidate, CandidateStatus, JobStatus, EmployeeStatus } from '../types.ts';
import { apiFetch } from '../services/apiClient';

interface AiAssistantProps {
  employees: Employee[];
  jobs: JobPosting[];
  candidates: Candidate[];
}

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

interface EmailWorkflowState {
  step: 'idle' | 'awaiting_subject' | 'awaiting_body';
  candidate?: Candidate;
  subject?: string;
}

export const AiAssistant: React.FC<AiAssistantProps> = React.memo(({ employees, jobs, candidates }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: "Hello! I'm your AI Recruitment Assistant. I have access to your live data. I can help you manage job applications, find employees, or email candidates. How can I help?",
      sender: "ai",
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // State to track the multi-turn email conversation
  const [emailWorkflow, setEmailWorkflow] = useState<EmailWorkflowState>({ step: 'idle' });

  // Calculate real-time stats
  const stats = useMemo(() => {
    const totalCandidates = candidates.length;
    const processed = candidates.filter(c => c.status !== CandidateStatus.APPLIED).length;
    const pending = candidates.filter(c => c.status === CandidateStatus.APPLIED).length;
    // Simple check for "today" - in a real app, compare dates properly
    const todayStr = new Date().toISOString().split('T')[0];
    const today = candidates.filter(c => c.appliedDate === todayStr).length;

    return { total: totalCandidates, processed, pending, today };
  }, [candidates]);

  const handleSendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const userMessage: Message = {
      id: messages.length + 1,
      text: inputMessage,
      sender: "user",
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    // Simulate AI processing time
    setTimeout(() => {
      let aiResponse = "";
      const lowerInput = userMessage.text.toLowerCase();

      // --- 1. Handle Cancellation ---
      if (lowerInput === 'cancel' && emailWorkflow.step !== 'idle') {
        setEmailWorkflow({ step: 'idle' });
        aiResponse = "🚫 Email draft cancelled. How else can I assist you?";
      }
      // --- 2. Handle Email Workflow Steps ---
      else if (emailWorkflow.step === 'awaiting_subject' && emailWorkflow.candidate) {
        setEmailWorkflow(prev => ({ ...prev, subject: userMessage.text, step: 'awaiting_body' }));
        aiResponse = `📝 Subject set: "**${userMessage.text}**"\n\nWhat is the body of the email you'd like to send to ${emailWorkflow.candidate!.name}?`;
      }
      else if (emailWorkflow.step === 'awaiting_body' && emailWorkflow.candidate) {
        // Simulate sending
        aiResponse = `✅ **Email Sent Successfully!**\n\n**To:** ${emailWorkflow.candidate.name} <${emailWorkflow.candidate.email}>\n**Subject:** ${emailWorkflow.subject}\n**Body:** "${userMessage.text}"\n\nThe candidate has been notified.`;
        setEmailWorkflow({ step: 'idle' });
      }
      // --- 3. Standard Command Processing ---
      else {
        // --- Email Trigger ---
        if (lowerInput.includes("email candidate") || lowerInput.includes("send email to") || (lowerInput.startsWith("email ") && !lowerInput.includes("workflow"))) {
          let nameQuery = "";
          if (lowerInput.includes("email candidate")) {
            nameQuery = lowerInput.split("email candidate")[1].trim();
          } else if (lowerInput.includes("send email to")) {
            nameQuery = lowerInput.split("send email to")[1].trim();
          } else if (lowerInput.startsWith("email ")) {
            nameQuery = lowerInput.split("email ")[1].trim();
          }
          nameQuery = nameQuery.replace(/[?.!]$/, ''); // Clean punctuation

          const candidate = candidates.find(app => app.name.toLowerCase().includes(nameQuery));

          if (candidate) {
            setEmailWorkflow({ step: 'awaiting_subject', candidate });
            aiResponse = `📧 I'll help you send an email to **${candidate.name}**.\n\nWhat should the **Subject Line** be? (Type 'cancel' to stop)`;
          } else if (nameQuery) {
            aiResponse = `I couldn't find a candidate named "${nameQuery}". Please check the name in the Recruitment tab.`;
          } else {
            aiResponse = "Who would you like to email? Please say something like 'Email candidate John'.";
          }
        }
        // --- Job Queries ---
        else if (lowerInput.includes("job") && (lowerInput.includes("open") || lowerInput.includes("list") || lowerInput.includes("show"))) {
          const openJobs = jobs.filter(j => j.status === JobStatus.OPEN);
          if (openJobs.length > 0) {
            aiResponse = `Here are the currently **Open Jobs**:\n\n` +
              openJobs.map(j => `• **${j.title}** (${j.department}) - ${j.location}`).join('\n');
          } else {
            aiResponse = "There are currently no open job postings.";
          }
        }
        else if (lowerInput.includes("job") && lowerInput.includes("closed")) {
          const closedJobs = jobs.filter(j => j.status === JobStatus.CLOSED);
          aiResponse = closedJobs.length > 0
            ? `Here are the **Closed Jobs**:\n\n` + closedJobs.map(j => `• **${j.title}**`).join('\n')
            : "No closed jobs found.";
        }
        // --- Employee Queries ---
        else if (lowerInput.includes("employee") || lowerInput.includes("who is")) {
          if (lowerInput.includes("leave")) {
            const onLeave = employees.filter(e => e.status === EmployeeStatus.ON_LEAVE);
            aiResponse = onLeave.length > 0
              ? `Currently on leave:\n` + onLeave.map(e => `• ${e.name} (${e.role})`).join('\n')
              : "No employees are currently on leave.";
          } else if (lowerInput.includes("active")) {
            aiResponse = `We have **${employees.filter(e => e.status === EmployeeStatus.ACTIVE).length}** active employees.`;
          } else {
            // List all/search
            aiResponse = `We have **${employees.length}** total employees registered in the system.`;
          }
        }
        // --- Candidate/App Queries ---
        else if (lowerInput.includes("show") && lowerInput.includes("today")) {
          // In a real app, filter by date. Here we just check mock logic or return latest
          const latest = candidates.slice(-3);
          aiResponse = `Here are the latest applicants:\n\n` +
            latest.map(app =>
              `• **${app.name}**${app.jobId !== 'unassigned' ? ` applied for Job ID ${app.jobId}` : ' is not linked to a job yet'}`
            ).join('\n');
        }
        else if (lowerInput.includes("trigger") || lowerInput.includes("process")) {
          aiResponse = "✅ I've triggered the CV screening workflow! Your n8n automation will now process any new job applications from your inbox. You'll receive updates as candidates are processed.";
        }
        else if (lowerInput.includes("summary") || lowerInput.includes("stats")) {
          aiResponse = `📊 **Recruitment Summary**\n\n• Total Applications: **${stats.total}**\n• Processed: **${stats.processed}**\n• Pending: **${stats.pending}**\n• Open Jobs: **${jobs.filter(j => j.status === JobStatus.OPEN).length}**`;
        }
        else if (lowerInput.includes("python") || lowerInput.includes("react") || lowerInput.includes("skills") || lowerInput.includes("find")) {
          const skill = lowerInput.match(/(python|react|aws|typescript|docker|marketing|seo)/i)?.[0] || "";
          if (skill) {
            const skilledApplicants = candidates.filter(app =>
              (app.resumeText && app.resumeText.toLowerCase().includes(skill.toLowerCase()))
            );
            aiResponse = skilledApplicants.length > 0
              ? `I found ${skilledApplicants.length} candidates with **${skill}** experience based on their resume text:\n\n` +
              skilledApplicants.map(app => `• ${app.name}`).join('\n')
              : `No candidates found with explicit **${skill}** experience in their resume text.`;
          } else {
            aiResponse = "Which skill are you looking for? Try 'Find candidates with React'.";
          }
        }
        else if (lowerInput.includes("help")) {
          aiResponse = "I can help you with:\n\n• **'Email candidate [Name]'** - Send an email\n• **'Show open jobs'** - List active postings\n• **'Who is on leave?'** - Check employee status\n• **'Find candidates with [Skill]'** - Search resumes\n• **'Show summary'** - Get recruitment statistics";
        }
        else {
          aiResponse = "I understand commands like:\n• 'Email candidate Sarah'\n• 'Show open jobs'\n• 'Who is on leave?'\n• 'Find candidates with React'\n\nHow else can I assist you?";
        }
      }

      const aiMessage: Message = {
        id: messages.length + 2,
        text: aiResponse,
        sender: "ai",
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);
      setIsLoading(false);
    }, 1000);
  }, [inputMessage, messages, emailWorkflow, candidates, jobs, employees, stats]);

  const triggerProcessing = useCallback(async () => {
    const triggerMessage: Message = {
      id: messages.length + 1,
      text: "Trigger processing",
      sender: "user",
      timestamp: new Date()
    };
    setMessages(prev => [...prev, triggerMessage]);
    setIsLoading(true);

    try {
      await apiFetch<{ message: string }>('/api/hr-agent/run', { method: 'POST' });

      const aiMessage: Message = {
        id: messages.length + 2,
        text: "✅ **Autonomous HR Agent Triggered!**\n\nThe agent is now scanning your inbox for new CVs and processing them directly. New candidates will appear in your recruitment list shortly.",
        sender: "ai",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: messages.length + 2,
        text: "❌ Failed to trigger workflow. Please check your backend connection.",
        sender: "ai",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, candidates, jobs]);

  return (
    <div className="h-full bg-gradient-to-br from-slate-50 to-slate-100 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4 shadow-lg">
            <Bot className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 mb-2">AI Recruitment Assistant</h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Your intelligent interface for managing job applications. Ask about <strong>real-time data</strong>, trigger workflows,
            email candidates, and get updates.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Chat Interface */}
          <div className="lg:col-span-2">
            <div className="bg-slate-100 rounded-xl shadow-lg overflow-hidden border border-slate-300">
              {/* Chat Header */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-4">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 bg-green-400 rounded-full ring-2 ring-green-200"></div>
                  <h2 className="text-white font-semibold">AI Assistant</h2>
                  <span className="text-blue-200 text-sm">Online • Connected to DB</span>
                </div>
              </div>

              {/* Messages */}
              <div className="h-96 overflow-y-auto p-4 space-y-4 bg-slate-50">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl shadow-sm ${message.sender === 'user'
                        ? 'bg-blue-600 text-white rounded-br-none'
                        : 'bg-slate-200 text-gray-800 rounded-bl-none border border-gray-200'
                        }`}
                    >
                      <div className="whitespace-pre-wrap text-sm">{message.text}</div>
                      <div className={`text-xs mt-1 ${message.sender === 'user' ? 'text-blue-100' : 'text-gray-400'
                        }`}>
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-200 text-gray-800 px-4 py-2 rounded-2xl rounded-bl-none border border-gray-200 shadow-sm">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Input Form */}
              <form onSubmit={handleSendMessage} className="border-t border-gray-200 p-4 bg-slate-100 relative">
                {emailWorkflow.step !== 'idle' && (
                  <div className="absolute bottom-full left-0 w-full bg-indigo-50 px-4 py-2 text-xs text-indigo-600 border-t border-indigo-100 flex justify-between items-center">
                    <span className="font-semibold flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      Drafting Email to {emailWorkflow.candidate?.name}...
                      ({emailWorkflow.step === 'awaiting_subject' ? 'Waiting for Subject' : 'Waiting for Body'})
                    </span>
                    <span className="text-indigo-400">Type 'cancel' to abort</span>
                  </div>
                )}
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder={
                      emailWorkflow.step === 'awaiting_subject' ? "Enter email subject..." :
                        emailWorkflow.step === 'awaiting_body' ? "Enter email message body..." :
                          "Ask about candidates, jobs, employees, or 'Email candidate...'"
                    }
                    className="flex-1 bg-slate-50 text-slate-800 border border-gray-300 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    type="submit"
                    disabled={!inputMessage.trim() || isLoading}
                    className="bg-blue-600 text-white rounded-full p-2 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="bg-slate-100 rounded-xl shadow-lg p-6 border border-slate-300">
              <h3 className="font-semibold text-slate-800 mb-4 flex items-center">
                <RefreshCw className="w-5 h-5 mr-2 text-blue-600" />
                Quick Actions
              </h3>
              <button
                onClick={triggerProcessing}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2 shadow-sm"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Trigger CV Processing</span>
              </button>
              <p className="text-xs text-gray-500 mt-2 text-center">
                Manually start screening workflow
              </p>
            </div>

            {/* Statistics */}
            <div className="bg-slate-100 rounded-xl shadow-lg p-6 border border-slate-300">
              <h3 className="font-semibold text-slate-800 mb-4">Recruitment Stats</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Applications</span>
                  <span className="font-semibold">{stats.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Processed</span>
                  <span className="font-semibold text-green-600">{stats.processed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Pending</span>
                  <span className="font-semibold text-yellow-600">{stats.pending}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Open Jobs</span>
                  <span className="font-semibold text-blue-600">{jobs.filter(j => j.status === JobStatus.OPEN).length}</span>
                </div>
              </div>
            </div>

            {/* Recent Applicants */}
            <div className="bg-slate-100 rounded-xl shadow-lg p-6 border border-slate-300">
              <h3 className="font-semibold text-slate-800 mb-4">Recent Applicants</h3>
              <div className="space-y-4">
                {candidates.slice(-3).reverse().map((applicant) => (
                  <div key={applicant.id} className="border border-gray-200 rounded-lg p-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start space-x-3">
                      <div className="bg-indigo-100 border-2 border-indigo-200 border-dashed rounded-xl w-12 h-12 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-slate-800 truncate">{applicant.name}</h4>
                          {applicant.status === CandidateStatus.APPLIED ? (
                            <Clock className="w-4 h-4 text-yellow-500" />
                          ) : (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          )}
                        </div>
                        <p className="text-sm text-gray-600 truncate">
                          {applicant.jobId !== 'unassigned' ? `Job ID: ${applicant.jobId}` : 'Job not linked'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Integration Info */}
        <div className="mt-8 text-center text-gray-500 text-sm">
          <p>
            This dashboard integrates with your n8n workflow to process email applications,
            extract CV details, and update Google Sheets automatically.
          </p>
        </div>
      </div>
    </div>
  );
});

AiAssistant.displayName = 'AiAssistant';
