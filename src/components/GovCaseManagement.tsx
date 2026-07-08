'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';

type GovStatus = 'pending' | 'in_progress' | 'resolved' | 'escalated';
type GovPriority = 'critical' | 'high' | 'medium' | 'low';

type BackendCase = {
  id: string;
  userId: string;
  title?: string;
  description?: string;
  category?: string;
  status?: string;
  createdAt?: number;
  updatedAt?: number;
  metadata?: {
    citizenName?: string;
    ward?: string;
    department?: string;
    inquiryMessage?: string;
    [key: string]: unknown;
  };
};

type GovCaseCard = {
  id: string;
  title: string;
  citizen: string;
  ward: string;
  priority: GovPriority;
  status: GovStatus;
  age: string;
  category: string;
  dept: string;
  slaHours: number;
  source: BackendCase;
};

const PRIORITY_META = {
  critical: { color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'CRITICAL' },
  high: { color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20', label: 'HIGH' },
  medium: { color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: 'MEDIUM' },
  low: { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', label: 'LOW' },
};

const STATUS_META: Record<GovStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  in_progress: { label: 'In Progress', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  resolved: { label: 'Resolved', color: 'text-green-500', bg: 'bg-green-500/10' },
  escalated: { label: 'Escalated', color: 'text-red-500', bg: 'bg-red-500/10' },
};

function formatAge(timestamp?: number): string {
  if (!timestamp) return 'now';
  const diffMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function normalizeStatus(statusRaw?: string): GovStatus {
  const value = (statusRaw || '').toLowerCase();
  if (value.includes('resolved')) return 'resolved';
  if (value.includes('escalated')) return 'escalated';
  if (value.includes('progress')) return 'in_progress';
  if (value === 'open' || value.includes('pending') || value.includes('review')) return 'pending';
  return 'pending';
}

function inferDepartment(categoryRaw?: string, titleRaw?: string): string {
  const category = (categoryRaw || '').toLowerCase();
  const title = (titleRaw || '').toLowerCase();

  if (category.includes('health') || title.includes('hospital') || title.includes('ayushman')) return 'Health';
  if (category.includes('scheme') || category.includes('pds') || title.includes('ration')) return 'Supply';
  if (category.includes('water')) return 'Jal Board';
  if (category.includes('infra') || title.includes('pothole') || title.includes('road')) return 'PWD';
  return 'Municipal';
}

function inferPriority(status: GovStatus, titleRaw?: string, categoryRaw?: string): GovPriority {
  if (status === 'escalated') return 'critical';

  const title = (titleRaw || '').toLowerCase();
  const category = (categoryRaw || '').toLowerCase();

  if (title.includes('sos') || title.includes('emergency') || category.includes('emergency')) return 'critical';
  if (title.includes('drain') || title.includes('water') || title.includes('hospital')) return 'high';
  if (title.includes('streetlight') || title.includes('card') || category.includes('scheme')) return 'medium';
  return 'low';
}

function inferWard(metadataWard?: string, titleRaw?: string): string {
  if (metadataWard?.trim()) return metadataWard.trim();
  const match = (titleRaw || '').match(/ward\s*\d+/i);
  return match ? match[0].replace(/^./, (char) => char.toUpperCase()) : 'Ward Unspecified';
}

function toCard(rawCase: BackendCase): GovCaseCard {
  const status = normalizeStatus(rawCase.status);
  const dept = rawCase.metadata?.department || inferDepartment(rawCase.category, rawCase.title);
  
  const inferred = inferPriority(status, rawCase.title, rawCase.category);
  const priority = (rawCase.metadata?.aiPriority as GovPriority) || inferred;
  
  const slaHours = priority === 'critical' ? 6 : priority === 'high' ? 24 : priority === 'medium' ? 48 : 72;

  let title = rawCase.title || 'Citizen request';
  if (rawCase.metadata?.aiReasoning && rawCase.metadata?.aiPriority) {
    title = `[AI Tuned] ${title}`;
  }

  return {
    id: rawCase.id,
    title,
    citizen: rawCase.metadata?.citizenName || rawCase.userId || 'Citizen',
    ward: inferWard(rawCase.metadata?.ward, rawCase.title),
    priority,
    status,
    age: formatAge(rawCase.createdAt),
    category: rawCase.category || 'General',
    dept,
    slaHours,
    source: rawCase,
  };
}

export default function GovCaseManagement() {
  const { t } = useTranslation();
  const [cases, setCases] = useState<GovCaseCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filterPriority, setFilterPriority] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDept, setFilterDept] = useState('All');
  const [filterWard, setFilterWard] = useState('All Wards');
  const [sortBy, setSortBy] = useState<'priority' | 'age' | 'sla'>('priority');

  const [selectedCases, setSelectedCases] = useState<Set<string>>(new Set());
  const [expandedCase, setExpandedCase] = useState<string | null>(null);
  const [inquiryStatuses, setInquiryStatuses] = useState<Set<string>>(new Set());
  const [inquiryFormOpen, setInquiryFormOpen] = useState<string | null>(null);
  const [inquiryMessage, setInquiryMessage] = useState('');
  const [updatingCases, setUpdatingCases] = useState<Set<string>>(new Set());
  const [isTriaging, setIsTriaging] = useState(false);
  const [bulkWarning, setBulkWarning] = useState(false);

  
  // ── Smart ML State ──
  const [marlResult, setMarlResult] = useState<Record<string, any>>({});
  const [isMarlLoading, setIsMarlLoading] = useState<Record<string, boolean>>({});
  const [resolvingCase, setResolvingCase] = useState<string | null>(null);
  const [resolutionPlan, setResolutionPlan] = useState<any>(null);

  const loadCases = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/backend/cases?scope=government&limit=200');
      if (!response.ok) {
        throw new Error('Unable to load citizen cases');
      }

      const data = (await response.json()) as { cases?: BackendCase[] };
      const records = Array.isArray(data.cases) ? data.cases : [];
      setCases(records.map(toCard));
    } catch {
      setError(t('unableToLoadCitizenCases', 'Unable to load citizen cases right now.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCases();
  }, []);

  const departments = useMemo(() => {
    const dynamic = Array.from(new Set(cases.map((caseItem) => caseItem.dept))).sort();
    return ['All', ...dynamic];
  }, [cases]);

  const wards = useMemo(() => {
    const dynamic = Array.from(new Set(cases.map((caseItem) => caseItem.ward))).sort();
    return ['All Wards', ...dynamic];
  }, [cases]);

  const filtered = useMemo(() => {
    const priorityOrder: Record<GovPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

    return cases
      .filter((caseItem) => filterPriority === 'all' || caseItem.priority === filterPriority)
      .filter((caseItem) => filterStatus === 'all' || caseItem.status === filterStatus)
      .filter((caseItem) => filterDept === 'All' || caseItem.dept === filterDept)
      .filter((caseItem) => filterWard === 'All Wards' || caseItem.ward === filterWard)
      .sort((caseA, caseB) => {
        if (sortBy === 'priority') return priorityOrder[caseA.priority] - priorityOrder[caseB.priority];
        if (sortBy === 'sla') return caseA.slaHours - caseB.slaHours;
        return (caseB.source.updatedAt || 0) - (caseA.source.updatedAt || 0);
      });
  }, [cases, filterDept, filterPriority, filterStatus, filterWard, sortBy]);

  const persistCaseStatus = async (
    caseItem: GovCaseCard,
    status: GovStatus,
    extras?: { inquiryMessage?: string, aiPriority?: string, aiReasoning?: string },
  ) => {
    const sourceCase = caseItem.source;
    const metadata = {
      ...(sourceCase.metadata || {}),
      department: caseItem.dept,
      ward: caseItem.ward,
      inquiryMessage: extras?.inquiryMessage || sourceCase.metadata?.inquiryMessage,
      aiPriority: extras?.aiPriority || sourceCase.metadata?.aiPriority,
      aiReasoning: extras?.aiReasoning || sourceCase.metadata?.aiReasoning,
    };

    setUpdatingCases((previous) => new Set(previous).add(caseItem.id));

    try {
      const response = await fetch('/api/backend/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: sourceCase.userId,
          caseId: sourceCase.id,
          category: sourceCase.category || caseItem.category,
          status,
          title: sourceCase.title || caseItem.title,
          description: sourceCase.description || caseItem.title,
          metadata,
          createdAt: sourceCase.createdAt,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update case status');
      }

      setCases((previousCases) =>
        previousCases.map((existingCase) =>
          existingCase.id === caseItem.id
            ? {
                ...existingCase,
                status,
                source: {
                  ...existingCase.source,
                  status,
                  metadata,
                  updatedAt: Date.now(),
                },
              }
            : existingCase,
        ),
      );
    } catch {
      setError(t('unableToUpdateCaseStatus', 'Unable to update case status right now.'));
    } finally {
      setUpdatingCases((previous) => {
        const next = new Set(previous);
        next.delete(caseItem.id);
        return next;
      });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedCases((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const bulkAction = async (action: 'resolve' | 'escalate') => {
    const targetStatus: GovStatus = action === 'resolve' ? 'resolved' : 'escalated';
    const targets = filtered.filter((caseItem) => selectedCases.has(caseItem.id));

    for (const caseItem of targets) {
      await persistCaseStatus(caseItem, targetStatus);
    }

    setSelectedCases(new Set());
  };

  const handleAiTriage = async () => {
    const targets = filtered.filter((caseItem) => selectedCases.has(caseItem.id));
    if (!targets.length) return;
    
    setIsTriaging(true);
    try {
      const payload = targets.map((c) => ({
        id: c.source.id,
        title: c.source.title || c.title,
        description: c.source.description || c.title,
        category: c.source.category || c.category
      }));
      
      const res = await fetch('/api/ml/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cases: payload })
      });
      
      if (!res.ok) throw new Error("Triage failed");
      const data = await res.json();
      
      if (data.updates) {
        for (const update of data.updates) {
           const caseItem = cases.find((c) => c.id === update.id);
           if (caseItem) {
             await persistCaseStatus(caseItem, caseItem.status, { 
               aiPriority: update.priority, 
               aiReasoning: update.reasoning 
             });
           }
        }
      }
    } catch (e) {
      console.error(e);
      setError(t('unableToLoadCitizenCases', 'AI Triage failed.'));
    } finally {
      setIsTriaging(false);
      setSelectedCases(new Set());
    }
  };

  const handleSmartAssign = async (caseItem: GovCaseCard) => {
    setIsMarlLoading(prev => ({ ...prev, [caseItem.id]: true }));
    try {
      const res = await fetch('/api/ml/marl-optimizer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          caseId: caseItem.id,
          priority: caseItem.priority,
          category: caseItem.category
        })
      });
      if (res.ok) {
        const data = await res.json();
        setMarlResult(prev => ({ ...prev, [caseItem.id]: data.optimalAssignment }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsMarlLoading(prev => ({ ...prev, [caseItem.id]: false }));
    }
  };

  const handleGeneratePlan = async (caseItem: GovCaseCard) => {
    setResolvingCase(caseItem.id);
    setResolutionPlan(null);
    try {
      const res = await fetch('/api/ml/auto-resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          caseId: caseItem.id,
          title: caseItem.title,
          category: caseItem.category
        })
      });
      if (res.ok) {
        const data = await res.json();
        setResolutionPlan(data.plan);
      }
    } catch (e) {
      console.error(e);
    } finally {
      // Keep resolvingCase set so we show the plan modal or section
    }
  };

  const handleAssign = async (caseItem: GovCaseCard) => {
    await persistCaseStatus(caseItem, 'in_progress');
  };

  const handleInquire = (caseId: string) => {
    setInquiryFormOpen(caseId);
    setInquiryMessage('');
  };

  const submitInquiry = async (caseItem: GovCaseCard) => {
    if (!inquiryMessage.trim()) return;

    await persistCaseStatus(caseItem, 'escalated', { inquiryMessage: inquiryMessage.trim() });

    setInquiryStatuses((previous) => new Set(previous).add(caseItem.id));
    setInquiryFormOpen(null);
    setInquiryMessage('');
  };

  const deptCounts = departments
    .filter((department) => department !== 'All')
    .map((department) => ({
      dept: department,
      count: cases.filter((caseItem) => caseItem.dept === department).length,
      color:
        department === 'PWD'
          ? '#3B82F6'
          : department === 'Municipal'
            ? '#F59E0B'
            : department === 'Jal Board'
              ? '#06B6D4'
              : department === 'Supply'
                ? '#8B5CF6'
                : '#EF4444',
    }));

  return (
    <div className="flex flex-col h-full text-slate-900 dark:text-white overflow-y-auto pb-6 no-scrollbar">
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wider">{t('caseManagement', 'Case Management')}</h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
              {cases.filter((caseItem) => caseItem.priority === 'critical').length} {t('critical', 'Critical')}
            </span>
            <span className="text-[10px] font-bold text-slate-500 dark:text-gray-400 bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-full">
              {cases.length} {t('total', 'Total')}
            </span>
          </div>
        </div>

        {error && <p className="text-[10px] text-red-500">{error}</p>}

        <div className="bg-white dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-2xl p-3 shadow-sm dark:shadow-none">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <select value={filterPriority} onChange={(event) => setFilterPriority(event.target.value)} className="bg-slate-100 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-700 dark:text-gray-300 focus:outline-none focus:border-[#138808]/50">
              <option value="all">{t('allPriority', 'All Priority')}</option>
              <option value="critical">🔴 {t('critical', 'Critical')}</option>
              <option value="high">🟠 {t('high', 'High')}</option>
              <option value="medium">🟡 {t('medium', 'Medium')}</option>
              <option value="low">🔵 {t('low', 'Low')}</option>
            </select>
            <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)} className="bg-slate-100 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-700 dark:text-gray-300 focus:outline-none focus:border-[#138808]/50">
              <option value="all">{t('allStatus', 'All Status')}</option>
              <option value="pending">{t('pending', 'Pending')}</option>
              <option value="in_progress">{t('inProgress', 'In Progress')}</option>
              <option value="escalated">{t('escalated', 'Escalated')}</option>
              <option value="resolved">{t('resolved', 'Resolved')}</option>
            </select>
            <select value={filterDept} onChange={(event) => setFilterDept(event.target.value)} className="bg-slate-100 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-700 dark:text-gray-300 focus:outline-none focus:border-[#138808]/50">
              {departments.map((department) => (
                <option key={department} value={department}>{department}</option>
              ))}
            </select>
            <select value={filterWard} onChange={(event) => setFilterWard(event.target.value)} className="bg-slate-100 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-700 dark:text-gray-300 focus:outline-none focus:border-[#138808]/50">
              {wards.map((ward) => (
                <option key={ward} value={ward}>{ward}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {(['priority', 'sla', 'age'] as const).map((sortKey) => (
                <button key={sortKey} onClick={() => setSortBy(sortKey)} className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all ${sortBy === sortKey ? 'bg-[#138808] text-white' : 'bg-black/5 dark:bg-white/5 text-slate-500 dark:text-gray-400'}`}>
                  {sortKey === 'sla' ? t('slaSort', 'SLA ⏱️') : sortKey === 'priority' ? t('prioritySort', 'Priority ⚡') : t('recentSort', 'Recent 📅')}
                </button>
              ))}
            </div>
            <span className="text-[9px] text-slate-400 dark:text-gray-500">{filtered.length} {t('results', 'results')}</span>
          </div>
        </div>

          <div className="flex items-center gap-2 p-3 bg-[#138808]/10 border border-[#138808]/20 rounded-xl" style={{ animation: 'fadeIn 0.2s ease-out' }}>
            {isTriaging ? (
               <span className="text-[10px] font-bold text-[#138808] flex-1 flex items-center gap-2">
                 <span className="w-3 h-3 border-2 border-[#138808]/40 border-t-[#138808] rounded-full animate-spin" />
                 Running AI Analysis...
               </span>
            ) : bulkWarning ? (
               <span className="text-[10px] font-bold text-amber-600 flex-1 flex items-center gap-1.5">
                 <span className="material-symbols-outlined text-[13px]">info</span>
                 Select cases using checkboxes first
               </span>
            ) : (
               <span className="text-[10px] font-bold text-[#138808] flex-1">{selectedCases.size} {t('selected', 'selected')}</span>
            )}
            <button
              onClick={() => {
                const allIds = new Set(filtered.map(c => c.id));
                setSelectedCases(prev => prev.size === filtered.length ? new Set() : allIds);
              }}
              disabled={isTriaging}
              className="px-2 py-1 rounded-lg bg-[#138808]/20 text-[#138808] text-[9px] font-bold hover:bg-[#138808]/30 transition-colors disabled:opacity-50"
            >
              {selectedCases.size === filtered.length && filtered.length > 0 ? '✗ None' : '✓ All'}
            </button>
            <button onClick={() => {
              if (selectedCases.size === 0) { setBulkWarning(true); setTimeout(() => setBulkWarning(false), 2000); return; }
              void bulkAction('resolve');
            }} disabled={isTriaging} className="px-3 py-1 rounded-lg bg-green-500 text-white text-[9px] font-bold hover:bg-green-600 transition-colors disabled:opacity-50">✓ {t('resolveAll', 'Resolve All')}</button>
            <button onClick={() => {
              if (selectedCases.size === 0) { setBulkWarning(true); setTimeout(() => setBulkWarning(false), 2000); return; }
              void bulkAction('escalate');
            }} disabled={isTriaging} className="px-3 py-1 rounded-lg bg-red-500 text-white text-[9px] font-bold hover:bg-red-600 transition-colors disabled:opacity-50">↑ {t('escalate', 'Escalate')}</button>
            <button onClick={() => {
              if (selectedCases.size === 0) { setBulkWarning(true); setTimeout(() => setBulkWarning(false), 2000); return; }
              void handleAiTriage();
            }} disabled={isTriaging} className="px-3 py-1 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[9px] font-bold hover:from-blue-700 hover:to-indigo-700 transition-colors flex items-center gap-1 shadow-md shadow-blue-500/20 disabled:opacity-50">
               <span className="material-symbols-outlined text-[10px]">smart_toy</span> AI Triage
            </button>
            <button onClick={() => setSelectedCases(new Set())} disabled={isTriaging} className="px-2 py-1 rounded-lg bg-black/5 dark:bg-white/5 text-[9px] font-bold text-slate-500 dark:text-gray-400 disabled:opacity-50">{t('cancel', 'Cancel')}</button>
          </div>



        <div className="bg-white dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-2xl p-3 shadow-sm dark:shadow-none">
          <h4 className="text-[9px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest mb-2">{t('departmentLoad', 'Department Load')}</h4>
          <div className="flex gap-1.5">
            {deptCounts.length === 0 ? (
              <p className="text-[10px] text-slate-400 dark:text-gray-500">{t('noCitizenCaseData', 'No citizen case data yet.')}</p>
            ) : deptCounts.map((department) => (
              <div key={department.dept} className="flex-1 text-center">
                <div className="h-12 bg-black/5 dark:bg-white/5 rounded-lg mb-1 relative overflow-hidden flex items-end">
                  <div className="w-full rounded-lg transition-all" style={{ height: `${(department.count / Math.max(...deptCounts.map((item) => item.count), 1)) * 100}%`, backgroundColor: `${department.color}40` }} />
                </div>
                <span className="text-[8px] font-bold text-slate-500 dark:text-gray-400 block truncate">{department.dept}</span>
                <span className="text-[10px] font-black text-slate-900 dark:text-white">{department.count}</span>
              </div>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="bg-white dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-2xl p-4 text-[10px] text-slate-500 dark:text-gray-400">
            {t('loadingCitizenCases', 'Loading citizen cases...')}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((caseItem) => {
              const priorityMeta = PRIORITY_META[caseItem.priority];
              const statusMeta = STATUS_META[caseItem.status];
              const isExpanded = expandedCase === caseItem.id;
              const isSelected = selectedCases.has(caseItem.id);
              const inquiryOpen = inquiryFormOpen === caseItem.id;
              const isUpdating = updatingCases.has(caseItem.id);

              return (
                <div key={caseItem.id} className={`bg-white dark:bg-white/[0.03] border rounded-2xl overflow-hidden shadow-sm dark:shadow-none transition-all ${isSelected ? 'border-[#138808] ring-1 ring-[#138808]/30' : priorityMeta.border}`}>
                  <div className="p-3.5">
                    <div className="flex items-start gap-2.5">
                      <button onClick={() => toggleSelect(caseItem.id)} className={`mt-0.5 w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-all ${isSelected ? 'bg-[#138808] border-[#138808]' : 'border-slate-300 dark:border-gray-600'}`}>
                        {isSelected && <span className="text-white text-[10px]">✓</span>}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className={`text-[8px] font-black ${priorityMeta.color} ${priorityMeta.bg} px-1.5 py-0.5 rounded tracking-wider`}>{priorityMeta.label}</span>
                          <span className={`text-[8px] font-bold ${statusMeta.color} ${statusMeta.bg} px-1.5 py-0.5 rounded`}>{statusMeta.label}</span>
                          <span className="text-[8px] font-bold text-slate-400 dark:text-gray-500 bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded">{caseItem.dept}</span>
                          {caseItem.slaHours <= 12 && caseItem.status === 'pending' && (
                            <span className="text-[8px] font-black text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded animate-pulse">SLA ⏱️ {caseItem.slaHours}h</span>
                          )}
                        </div>
                        <h5 className="text-[12px] font-bold text-slate-900 dark:text-white leading-tight">{caseItem.title}</h5>
                        <p className="text-[10px] text-slate-500 dark:text-gray-400 mt-0.5">{caseItem.citizen} · {caseItem.ward} · {caseItem.age} ago</p>
                      </div>
                      <button onClick={() => setExpandedCase(isExpanded ? null : caseItem.id)} className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0">
                        <span className="material-symbols-outlined text-slate-400 dark:text-gray-500 text-base">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                      <select value={caseItem.status} onChange={(event) => { void persistCaseStatus(caseItem, event.target.value as GovStatus); }} disabled={isUpdating} className="flex-1 min-w-[100px] bg-slate-100 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-900 dark:text-white focus:outline-none focus:border-[#138808]/50 disabled:opacity-60">
                        <option value="pending">{t('pending', 'Pending')}</option>
                        <option value="in_progress">{t('inProgress', 'In Progress')}</option>
                        <option value="escalated">{t('escalated', 'Escalated')}</option>
                        <option value="resolved">{t('resolved', 'Resolved')}</option>
                      </select>
                      {caseItem.status === 'pending' && (
                        <button onClick={() => { void handleAssign(caseItem); }} disabled={isUpdating} className="px-2.5 py-1.5 rounded-lg bg-[#138808]/10 border border-[#138808]/30 text-[10px] font-bold text-[#138808] hover:bg-[#138808]/20 transition-colors disabled:opacity-60">
                          <span className="material-symbols-outlined text-[11px] align-middle mr-0.5">send</span>
                          {t('assign', 'Assign')}
                        </button>
                      )}
                      {caseItem.status !== 'resolved' && !inquiryOpen && (
                        <button
                          onClick={() => handleInquire(caseItem.id)}
                          disabled={inquiryStatuses.has(caseItem.id) || isUpdating}
                          className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-colors ${inquiryStatuses.has(caseItem.id) ? 'bg-orange-500/5 border-orange-500/10 text-orange-400 opacity-80 cursor-not-allowed' : 'bg-orange-500/10 border-orange-500/30 text-orange-600 hover:bg-orange-500/20'} ${isUpdating ? 'opacity-60' : ''}`}
                        >
                          <span className="material-symbols-outlined text-[11px] align-middle mr-0.5">{inquiryStatuses.has(caseItem.id) ? 'check_circle' : 'help'}</span>
                          {inquiryStatuses.has(caseItem.id) ? t('inquirySent', 'Inquiry Sent') : t('inquire', 'Inquire')}
                        </button>
                      )}
                    </div>

                    {inquiryOpen && (
                      <div className="mt-3 bg-orange-500/5 border border-orange-500/20 rounded-xl p-3" style={{ animation: 'fadeIn 0.2s ease-out' }}>
                        <p className="text-[10px] font-bold text-orange-600 mb-1">{t('messageTo', 'Message to')} {caseItem.dept}</p>
                        <textarea
                          value={inquiryMessage}
                          onChange={(event) => setInquiryMessage(event.target.value)}
                          placeholder={t('typeInquiry', 'Type your question or reason for escalation...')}
                          className="w-full bg-white dark:bg-[#050d1a] border border-black/10 dark:border-white/10 rounded-lg p-2 text-[10px] text-slate-900 dark:text-white focus:outline-none focus:border-orange-500/50 resize-none h-16"
                          autoFocus
                        />
                        <div className="flex items-center justify-end gap-2 mt-2">
                          <button onClick={() => setInquiryFormOpen(null)} className="px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 text-[9px] font-bold text-slate-500 dark:text-gray-400 hover:bg-black/10 transition-colors">
                            {t('cancel', 'Cancel')}
                          </button>
                          <button onClick={() => { void submitInquiry(caseItem); }} disabled={!inquiryMessage.trim()} className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-[9px] font-bold hover:bg-orange-600 transition-colors disabled:opacity-50">
                            {t('sendInquiry', 'Send Inquiry')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="border-t border-black/5 dark:border-white/5 bg-slate-50 dark:bg-white/[0.01] p-3.5 space-y-2" style={{ animation: 'fadeIn 0.2s ease-out' }}>
                      {/* ═══ AI SMART ACTIONS ═══ */}
                      <div className="flex gap-2 mt-2">
                        <button 
                          onClick={() => handleSmartAssign(caseItem)}
                          disabled={isMarlLoading[caseItem.id]}
                          className="flex-1 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center justify-center gap-1 hover:bg-indigo-500/20 transition-all"
                        >
                          <span className="material-symbols-outlined text-[13px]">{isMarlLoading[caseItem.id] ? 'sync' : 'person_search'}</span>
                          {isMarlLoading[caseItem.id] ? 'MARL Optimizing...' : 'Smart Assign (MARL)'}
                        </button>
                        <button 
                          onClick={() => handleGeneratePlan(caseItem)}
                          className="flex-1 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1 hover:bg-emerald-500/20 transition-all"
                        >
                          <span className="material-symbols-outlined text-[13px]">playlist_add_check</span>
                          AI Resolution Plan
                        </button>
                      </div>

                      {/* MARL Recommendation Display */}
                      {marlResult[caseItem.id] && (
                        <div className="p-2.5 rounded-xl bg-indigo-500/5 border border-indigo-500/20 animate-in fade-in zoom-in-95 duration-200">
                          <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">recommend</span>
                            Optimal Officer Recommendation
                          </p>
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-[10px] font-black text-indigo-600">
                              {marlResult[caseItem.id].officer?.split(' ').map((n:any) => n[0]).join('')}
                            </div>
                            <div className="flex-1">
                              <p className="text-[10px] font-bold text-slate-900 dark:text-white">{marlResult[caseItem.id].officer}</p>
                              <p className="text-[8px] text-slate-500 dark:text-gray-400">Match Score: {Math.round(marlResult[caseItem.id].utilityScore * 100)}% · Reason: {marlResult[caseItem.id].reason}</p>
                            </div>
                            <button 
                              onClick={() => handleAssign(caseItem)}
                              className="px-2 py-1 rounded bg-indigo-500 text-white text-[9px] font-bold shadow-sm"
                            >
                              Appoint
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Auto-Resolve Plan Display */}
                      {resolvingCase === caseItem.id && (
                        <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 animate-in fade-in zoom-in-95 duration-200">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">auto_fix_high</span>
                              AI-Generated Resolution Strategy
                            </p>
                            <button onClick={() => setResolvingCase(null)} className="text-slate-400 hover:text-slate-600"><span className="material-symbols-outlined text-[14px]">close</span></button>
                          </div>
                          
                          {!resolutionPlan ? (
                            <div className="flex items-center justify-center py-4 gap-2">
                              <span className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                              <span className="text-[9px] text-emerald-600">Simulating workflows...</span>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="space-y-1.5">
                                {resolutionPlan.steps.map((step: any, sidx: number) => (
                                  <div key={sidx} className="flex gap-2">
                                    <span className="text-[9px] font-black text-emerald-500 mt-0.5">{sidx + 1}.</span>
                                    <div className="flex-1">
                                      <p className="text-[10px] font-bold text-slate-700 dark:text-gray-300 leading-tight">{step.action}</p>
                                      <p className="text-[8px] text-slate-400 uppercase font-black tracking-tighter">{step.dept} · {step.hours}h est.</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="pt-2 border-t border-emerald-500/10 grid grid-cols-2 gap-2">
                                <div className="p-1.5 rounded bg-black/5 dark:bg-white/5">
                                  <p className="text-[7px] font-black text-slate-400 uppercase">Est. Completion</p>
                                  <p className="text-[10px] font-black text-emerald-600">{resolutionPlan.estimatedTotal}</p>
                                </div>
                                <div className="p-1.5 rounded bg-black/5 dark:bg-white/5">
                                  <p className="text-[7px] font-black text-slate-400 uppercase">Critical Needs</p>
                                  <p className="text-[10px] font-black text-indigo-600">{resolutionPlan.coordinationNeeds?.join(', ')}</p>
                                </div>
                              </div>
                              <button onClick={() => setResolvingCase(null)} className="w-full py-1.5 rounded-lg bg-emerald-600 text-white text-[9px] font-bold shadow-md shadow-emerald-500/20 mt-1">
                                Deploy Plan to Departments
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div><span className="text-slate-400 dark:text-gray-500">{t('caseId', 'Case ID')}:</span> <span className="font-bold text-slate-900 dark:text-white">{caseItem.id}</span></div>
                        <div><span className="text-slate-400 dark:text-gray-500">{t('category', 'Category')}:</span> <span className="font-bold text-slate-900 dark:text-white">{t(caseItem.category, caseItem.category)}</span></div>
                        <div><span className="text-slate-400 dark:text-gray-500">{t('department', 'Department')}:</span> <span className="font-bold text-slate-900 dark:text-white">{t(caseItem.dept, caseItem.dept)}</span></div>
                        <div><span className="text-slate-400 dark:text-gray-500">{t('sla', 'SLA')}:</span> <span className="font-bold text-slate-900 dark:text-white">{caseItem.slaHours}h {t('deadline', 'deadline')}</span></div>
                        {!!caseItem.source.metadata?.aiReasoning && (
                          <div className="col-span-2 mt-1 p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                            <span className="material-symbols-outlined text-[10px] text-indigo-500 align-middle mr-1">smart_toy</span>
                            <span className="text-slate-400 dark:text-gray-500">AI Priority Reasoning:</span>
                            <p className="font-bold text-indigo-700 dark:text-indigo-400 block mt-0.5">{String(caseItem.source.metadata.aiReasoning)}</p>
                          </div>
                        )}
                      </div>
                      <div className="text-[9px] text-slate-400 dark:text-gray-500">
                        <p className="font-bold mb-1">{t('timeline', 'Timeline')}:</p>
                        <div className="space-y-1 ml-2 border-l-2 border-[#138808]/20 pl-2">
                          <p>📩 {t('filedBy', 'Filed by')} {t(caseItem.citizen, caseItem.citizen)} — {caseItem.age} {t('ago', 'ago')}</p>
                          <p>🔄 {t('autoRoutedTo', 'Auto-routed to')} {t(caseItem.dept, caseItem.dept)}</p>
                          {caseItem.status === 'in_progress' && <p>👤 {t('assignedToSubInspector', 'Assigned to field officer')}</p>}
                          {caseItem.status === 'escalated' && <p>⚠️ {t('escalatedToDistrictLevel', 'Escalated to District level')}</p>}
                          {caseItem.status === 'resolved' && <p>✅ {t('resolvedCitizenNotified', 'Resolved & citizen notified')}</p>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="bg-white dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-2xl p-4 text-[10px] text-slate-500 dark:text-gray-400">
                {t('noCasesMatchFilters', 'No citizen cases match current filters.')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
