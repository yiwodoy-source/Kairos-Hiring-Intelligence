
import React, { useState, useMemo, useCallback } from 'react';
import { Employee, EmployeeStatus } from '../types.ts';
import { Star, Search, Sparkles, Users, BookUser, X, Plus, Loader2 } from 'lucide-react';
import { GeminiService } from '../services/geminiService';
import { apiFetch } from '../services/apiClient';

interface EmployeesProps {
  employees: Employee[];
  onEmployeeAdded?: () => void;
}

const EMPTY_FORM = {
  name: '',
  email: '',
  role: '',
  department: '',
  status: EmployeeStatus.ACTIVE as string,
  join_date: new Date().toISOString().split('T')[0],
  performance_rating: '3',
  avatar: '',
};

export const Employees: React.FC<EmployeesProps> = React.memo(({ employees, onEmployeeAdded }) => {
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [generatedReview, setGeneratedReview] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const handleAddSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name.trim() || !addForm.email.trim() || !addForm.role.trim() || !addForm.department.trim()) {
      setAddError('Please fill in all required fields.');
      return;
    }
    setAddError(null);
    setIsAdding(true);
    try {
      await apiFetch('/api/hr-agent/employees', {
        method: 'POST',
        body: JSON.stringify({
          name: addForm.name.trim(),
          email: addForm.email.trim(),
          role: addForm.role.trim(),
          department: addForm.department.trim(),
          status: addForm.status,
          join_date: addForm.join_date,
          performance_rating: parseFloat(addForm.performance_rating),
          avatar: addForm.avatar.trim() || undefined,
        }),
      });
      setShowAddModal(false);
      setAddForm(EMPTY_FORM);
      onEmployeeAdded?.();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add employee');
    } finally {
      setIsAdding(false);
    }
  }, [addForm, onEmployeeAdded]);

  const updateField = useCallback((field: string, value: string) => {
    setAddForm(prev => ({ ...prev, [field]: value }));
  }, []);

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
    setReviewError(null);
    try {
      const review = await GeminiService.generatePerformanceReview(
        selectedEmployee.name,
        selectedEmployee.role,
        reviewNotes,
        selectedEmployee.performanceRating
      );
      setGeneratedReview(review);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Failed to generate review');
    } finally {
      setIsGenerating(false);
    }
  }, [selectedEmployee, reviewNotes]);

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex justify-between items-center flex-shrink-0">
        <h1 className="text-2xl font-bold text-slate-800">Employee Management</h1>
        <button
          onClick={() => { setShowAddModal(true); setAddError(null); setAddForm(EMPTY_FORM); }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
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

                {reviewError && (
                  <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                    {reviewError}
                  </div>
                )}

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

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddModal(false)}>
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">Add New Employee</h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="emp-name" className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                  <input id="emp-name" type="text" required value={addForm.name} onChange={e => updateField('name', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
                <div>
                  <label htmlFor="emp-email" className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                  <input id="emp-email" type="email" required value={addForm.email} onChange={e => updateField('email', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="emp-role" className="block text-sm font-medium text-slate-700 mb-1">Role *</label>
                  <input id="emp-role" type="text" required value={addForm.role} onChange={e => updateField('role', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
                <div>
                  <label htmlFor="emp-dept" className="block text-sm font-medium text-slate-700 mb-1">Department *</label>
                  <input id="emp-dept" type="text" required value={addForm.department} onChange={e => updateField('department', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="emp-status" className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                  <select id="emp-status" value={addForm.status} onChange={e => updateField('status', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                    {Object.values(EmployeeStatus).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="emp-date" className="block text-sm font-medium text-slate-700 mb-1">Join Date</label>
                  <input id="emp-date" type="date" value={addForm.join_date} onChange={e => updateField('join_date', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
                <div>
                  <label htmlFor="emp-rating" className="block text-sm font-medium text-slate-700 mb-1">Rating (0-5)</label>
                  <input id="emp-rating" type="number" min="0" max="5" step="0.1" value={addForm.performance_rating}
                    onChange={e => updateField('performance_rating', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
              </div>

              <div>
                <label htmlFor="emp-avatar" className="block text-sm font-medium text-slate-700 mb-1">Avatar URL (optional)</label>
                <input id="emp-avatar" type="url" value={addForm.avatar} onChange={e => updateField('avatar', e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
              </div>

              {addError && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />
                  <span className="text-xs font-medium text-rose-600">{addError}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={isAdding}
                  className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors">
                  {isAdding ? <><Loader2 className="w-4 h-4 animate-spin" />Adding…</> : <><Plus className="w-4 h-4" />Add Employee</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
});
