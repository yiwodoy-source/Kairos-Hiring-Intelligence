
import React, { useState, useMemo, useCallback } from 'react';
import { Employee, EmployeeStatus } from '../types.ts';
import { Star, Search, Sparkles, Users, BookUser } from 'lucide-react';
import { GeminiService } from '../services/geminiService';

interface EmployeesProps {
  employees: Employee[];
}

export const Employees: React.FC<EmployeesProps> = React.memo(({ employees }) => {
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [generatedReview, setGeneratedReview] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Optimize: Memoize filtering to prevent recalculation on every render
  const filteredEmployees = useMemo(() => {
    return employees.filter(e =>
      e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.role.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [employees, searchTerm]);

  const handleGenerateReview = useCallback(async () => {
    if (!selectedEmployee) return;
    setIsGenerating(true);
    const review = await GeminiService.generatePerformanceReview(
      selectedEmployee.name,
      selectedEmployee.role,
      reviewNotes,
      selectedEmployee.performanceRating
    );
    setGeneratedReview(review);
    setIsGenerating(false);
  }, [selectedEmployee, reviewNotes]);

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex justify-between items-center flex-shrink-0">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Employee Management</h1>
        <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
          Add Employee
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Employee List */}
        <div className="lg:col-span-1 bg-slate-100 rounded-xl shadow-sm border border-slate-300 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-2 mb-3 text-slate-700 font-semibold">
              <BookUser className="w-5 h-5 text-indigo-500" />
              <h2>Directory</h2>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search employees..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 placeholder-slate-400"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {filteredEmployees.map(emp => (
              <div
                key={emp.id}
                onClick={() => { setSelectedEmployee(emp); setGeneratedReview(''); setReviewNotes(''); }}
                className={`p-4 border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors flex items-center space-x-4 ${selectedEmployee?.id === emp.id ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : ''}`}
              >
                <img
                  src={emp.avatar}
                  alt={emp.name}
                  loading="lazy"
                  width="40"
                  height="40"
                  className="w-10 h-10 rounded-full object-cover bg-slate-200"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-slate-800 truncate">{emp.name}</h4>
                  <p className="text-xs text-slate-500 truncate">{emp.role}</p>
                </div>
                <span className={`px-2 py-1 text-xs rounded-full ${emp.status === EmployeeStatus.ACTIVE ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {emp.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Employee Detail / Performance Review */}
        <div className="lg:col-span-2 bg-slate-100 rounded-xl shadow-sm border border-slate-300 p-6 overflow-y-auto">
          {selectedEmployee ? (
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-4">
                  <img
                    src={selectedEmployee.avatar}
                    alt={selectedEmployee.name}
                    loading="lazy"
                    className="w-16 h-16 rounded-full border-4 border-white shadow-sm bg-slate-200"
                  />
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">{selectedEmployee.name}</h2>
                    <p className="text-slate-500">{selectedEmployee.role} • {selectedEmployee.department}</p>
                    <div className="flex items-center mt-1 text-sm text-slate-500">
                      <span>Joined: {selectedEmployee.joinDate}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-1 bg-yellow-50 px-3 py-1 rounded-full border border-yellow-100">
                  <Star className="w-4 h-4 text-yellow-500 fill-current" />
                  <span className="font-bold text-yellow-700">{selectedEmployee.performanceRating}</span>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-500" />
                    AI Performance Review Generator
                  </h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Manager's Notes / Key Achievements</label>
                    <textarea
                      className="w-full h-24 p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                      placeholder="e.g. Delivered project X ahead of schedule, improved team morale, needs to work on communication..."
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={handleGenerateReview}
                    disabled={isGenerating || !reviewNotes}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isGenerating ? 'Generating...' : 'Draft Review with AI'}
                    {!isGenerating && <Sparkles className="w-4 h-4" />}
                  </button>
                </div>

                {generatedReview && (
                  <div className="mt-6 bg-slate-50 p-6 rounded-xl border border-slate-200">
                    <h4 className="text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">Generated Draft</h4>
                    <div className="prose prose-sm max-w-none text-slate-600 whitespace-pre-line">
                      {generatedReview}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <Users className="w-16 h-16 mb-4 opacity-20" />
              <p>Select an employee to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
