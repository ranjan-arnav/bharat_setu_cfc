'use client';

import { useEffect, useState } from 'react';
import { useAppStore, type TrackedItem, type AgentKey } from '@/lib/store';
import { hasPermission } from '@/lib/permissions';
import { FlagStripe } from '@/components/ui/GoiElements';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { calculateTrustScore } from '@/lib/intelligence';
import { buildBackendUserId } from '@/lib/backend-identity';

const STATUS_META: Record<TrackedItem['status'], { label: string; color: string; bg: string; border: string; dot: string }> = {
  'Active':       { label: 'Active',        color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/25',   dot: 'bg-blue-400' },
  'Under Review': { label: 'Under Review',  color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/25',  dot: 'bg-amber-400 animate-pulse' },
  'In Progress':  { label: 'In Progress',   color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/25', dot: 'bg-orange-400 animate-pulse' },
  'Resolved':     { label: 'Resolved ✓',    color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/25',  dot: 'bg-green-400' },
  'Pending':      { label: 'Pending',       color: 'text-slate-500 dark:text-gray-400',   bg: 'bg-black/5 dark:bg-white/5',       border: 'border-black/10 dark:border-white/10',      dot: 'bg-gray-500' },
};

const TYPE_ICON: Record<TrackedItem['type'], { icon: string; color: string; bg: string }> = {
  grievance: { icon: 'report_problem', color: '#3B82F6', bg: '#3B82F610' },
  scheme:    { icon: 'volunteer_activism', color: '#F59E0B', bg: '#F59E0B10' },
  health:    { icon: 'health_and_safety', color: '#10B981', bg: '#10B98110' },
  legal:     { icon: 'gavel',             color: '#EF4444', bg: '#EF444410' },
  finance:   { icon: 'account_balance_wallet', color: '#8B5CF6', bg: '#8B5CF610' },
};

const AGENT_NAMES: Record<AgentKey, string> = {
  nagarik_mitra:    'Nagarik Mitra',
  swasthya_sahayak: 'Swasthya Sahayak',
  yojana_saathi:    'Yojana Saathi',
  arthik_salahkar:  'Arthik Salahkar',
  vidhi_sahayak:    'Vidhi Sahayak',
  kisan_mitra:      'Kisan Mitra',
};

function timeAgo(ts: number, t: (key: string, fallback?: string) => string): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return t('Just now');
  if (diff < 3600000) return `${Math.floor(diff / 60000)}${t('m ago')}`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}${t('h ago')}`;
  return `${Math.floor(diff / 86400000)}${t('d ago')}`;
}

interface Props {
  onClose: () => void;
  onOpenGrievance: () => void;
  onOpenAgent: (agent: AgentKey) => void;
}

export default function TrackCasesOverlay({ onClose, onOpenGrievance, onOpenAgent }: Props) {
  const { trackedItems, replaceTrackedItems, updateTrackedStatus, setActiveAgent, role, setOverlay } = useAppStore();
  const canUpdateStatus = hasPermission(role, 'update_status');
  const { t } = useTranslation();
  const [filter, setFilter] = useState<TrackedItem['type'] | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCaseSelector, setShowCaseSelector] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const normalizeStatus = (status: unknown): TrackedItem['status'] => {
      if (status === 'Active' || status === 'Under Review' || status === 'In Progress' || status === 'Resolved' || status === 'Pending') {
        return status;
      }
      const text = String(status || '').toLowerCase();
      if (text.includes('review')) return 'Under Review';
      if (text.includes('progress') || text.includes('open')) return 'In Progress';
      if (text.includes('resolved') || text.includes('closed')) return 'Resolved';
      if (text.includes('pending') || text.includes('submitted')) return 'Pending';
      return 'Active';
    };

    const mapCaseType = (category: unknown): TrackedItem['type'] => {
      const value = String(category || '').toLowerCase();
      if (value === 'health' || value === 'legal' || value === 'finance') return value;
      return 'grievance';
    };

    const loadTrackedItems = async () => {
      const state = useAppStore.getState();
      const userId = buildBackendUserId(state);

      try {
        const [casesRes, schemesRes] = await Promise.all([
          fetch(`/api/backend/cases?userId=${encodeURIComponent(userId)}&limit=100`),
          fetch(`/api/backend/scheme-applications?userId=${encodeURIComponent(userId)}&limit=100`),
        ]);

        if (cancelled) return;

        const merged = new Map<string, TrackedItem>();
        for (const item of state.trackedItems) {
          merged.set(item.id, item);
        }

        if (casesRes.ok) {
          const casesData = await casesRes.json() as {
            cases?: Array<Record<string, unknown>>;
          };
          for (const backendCase of casesData.cases || []) {
            const id = String(backendCase.id || '').trim();
            if (!id) continue;
            merged.set(id, {
              id,
              type: mapCaseType(backendCase.category),
              title: String(backendCase.title || 'Case'),
              description: String(backendCase.description || ''),
              status: normalizeStatus(backendCase.status),
              createdAt: typeof backendCase.createdAt === 'number' ? backendCase.createdAt : Date.now(),
              agentKey: (backendCase.metadata as { agentKey?: AgentKey } | undefined)?.agentKey || 'nagarik_mitra',
              refId: String((backendCase.metadata as { refId?: string } | undefined)?.refId || '' ) || undefined,
              eta: typeof backendCase.eta === 'string' ? backendCase.eta : undefined,
              portal: String((backendCase.metadata as { portal?: string } | undefined)?.portal || '' ) || undefined,
            });
          }
        }

        if (schemesRes.ok) {
          const schemesData = await schemesRes.json() as {
            applications?: Array<Record<string, unknown>>;
          };
          for (const application of schemesData.applications || []) {
            const id = String(application.id || '').trim();
            if (!id) continue;
            merged.set(id, {
              id,
              type: 'scheme',
              title: String(application.schemeName || 'Scheme application'),
              description: typeof application.notes === 'string' ? application.notes : 'Applied via Yojana Saathi',
              status: normalizeStatus(application.workflowStage),
              createdAt: typeof application.createdAt === 'number' ? application.createdAt : Date.now(),
              agentKey: 'yojana_saathi',
            });
          }
        }

        replaceTrackedItems(Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt));
      } catch {
        // keep existing local items when backend is unavailable
      }
    };

    void loadTrackedItems();
    return () => {
      cancelled = true;
    };
  }, [replaceTrackedItems]);

  const FILTERS: { key: TrackedItem['type'] | 'all'; label: string; icon: string }[] = [
    { key: 'all',       label: t('filterAll'),     icon: 'list_alt' },
    { key: 'grievance', label: t('filterCivic'),   icon: 'report_problem' },
    { key: 'scheme',    label: t('filterSchemes'), icon: 'volunteer_activism' },
    { key: 'health',    label: t('filterHealth'),  icon: 'health_and_safety' },
    { key: 'legal',     label: t('filterLegal'),   icon: 'gavel' },
    { key: 'finance',   label: t('filterFinance'), icon: 'account_balance_wallet' },
  ];

  const filtered = filter === 'all' ? trackedItems : trackedItems.filter((item) => item.type === filter);
  const activeItems = trackedItems.filter((item) => item.status !== 'Resolved');
  const activeCount = activeItems.length;
  const resolvedCount = trackedItems.filter((item) => item.status === 'Resolved').length;

  const handleAskAgent = (item: TrackedItem) => {
    setActiveAgent(item.agentKey);
    // Give context to the agent about the specific case
    useAppStore.getState().setTranscript(`What is the status of my case: ${item.title}? Reference ID: ${item.id}`);
    setShowCaseSelector(false);
    onOpenAgent(item.agentKey);
  };

  const getProgressValue = (status: TrackedItem['status']) => {
    if (status === 'Pending' || status === 'Active') return 20;
    if (status === 'Under Review') return 45;
    if (status === 'In Progress') return 75;
    return 100;
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-50 dark:bg-[#0a1628] flex flex-col max-w-[430px] mx-auto"
      style={{ animation: 'slideUp 0.3s ease-out' }}
    >
      <FlagStripe />
      {/* Header */}
      <div className="z-[60] shrink-0 px-4 py-3 bg-white/95 dark:bg-[#0f1f3a]/95 backdrop-blur-xl border-b border-black/10 dark:border-white/10 shadow-sm relative">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onClose} className="p-2 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] active:scale-[0.98]">
            <span className="material-symbols-outlined text-slate-500 dark:text-gray-400">arrow_back</span>
          </button>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[#FF9933] text-base">assignment</span>
              {t('myCasesTracking')}
            </h2>
            <div className="text-[10px] text-slate-500 dark:text-gray-400">{activeCount} {t('activeCases')} · {resolvedCount} {t('resolvedCases')}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 mb-3">
          <button
            onClick={onOpenGrievance}
            className="min-h-12 rounded-xl bg-[#FF9933] text-slate-900 dark:text-white text-[12px] font-bold flex items-center justify-center gap-1.5 active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-[18px]">add_task</span>
            {t('fileGrievanceBtn')}
          </button>
          <button
            onClick={() => {
              if (activeItems.length === 0) return;
              if (activeItems.length === 1) {
                handleAskAgent(activeItems[0]);
              } else {
                setShowCaseSelector(true);
              }
            }}
            disabled={activeItems.length === 0}
            className="min-h-12 rounded-xl bg-[#8B5CF6]/12 border border-[#8B5CF6]/25 text-[#8B5CF6] text-[12px] font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">smart_toy</span>
            {t('askAgent', 'Ask Agent')}
          </button>
        </div>

        {/* Summary pills */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-2.5 text-center">
            <div className="text-xl font-black text-orange-400">{activeCount}</div>
            <div className="text-[10px] text-slate-500 dark:text-gray-400 font-bold">{t('activeCases')}</div>
          </div>
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-2.5 text-center">
            <div className="text-xl font-black text-green-400">{resolvedCount}</div>
            <div className="text-[10px] text-slate-500 dark:text-gray-400 font-bold">{t('resolvedCases')}</div>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-2.5 text-center">
            <div className="text-xl font-black text-blue-400">{trackedItems.length}</div>
            <div className="text-[10px] text-slate-500 dark:text-gray-400 font-bold">{t('totalCases')}</div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="grid grid-cols-3 gap-2">
          {FILTERS.map((f) => {
            const count = f.key === 'all' ? trackedItems.length : trackedItems.filter((item) => item.type === f.key).length;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`min-h-11 flex items-center justify-center gap-1 px-2 rounded-xl text-[11px] font-bold transition-all ${
                  filter === f.key
                    ? 'bg-[#FF9933] text-slate-900 dark:text-white'
                    : 'bg-black/5 dark:bg-white/5 text-slate-500 dark:text-gray-300 border border-black/10 dark:border-white/10 active:scale-[0.98]'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">{f.icon}</span>
                {f.label}
                {count > 0 && (
                  <span className={`ml-0.5 text-[9px] rounded-full w-4 h-4 flex items-center justify-center ${filter === f.key ? 'bg-white/30 text-slate-900 dark:text-white' : 'bg-black/10 dark:bg-white/10 text-slate-600 dark:text-gray-300'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cases list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-36 relative z-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
              <span className="material-symbols-outlined text-gray-500 text-3xl">inbox</span>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-600 dark:text-gray-300">{t('noCasesYet')}</p>
              <p className="text-xs text-gray-500 mt-1">{t('fileGrievancePrompt')}</p>
            </div>
            <button
              onClick={onOpenGrievance}
              className="bg-[#FF9933]/15 border border-[#FF9933]/30 rounded-xl px-4 py-2 text-sm font-bold text-[#FF9933]"
            >
              {t('fileGrievanceBtn')}
            </button>
          </div>
        ) : (
          filtered.map((item) => {
            const sm = STATUS_META[item.status];
            const tm = TYPE_ICON[item.type];
            const isExpanded = expandedId === item.id;

            return (
              <div
                key={item.id}
                className={`rounded-2xl border overflow-hidden transition-all ${sm.bg} ${sm.border}`}
              >
                {/* Card header — always visible */}
                <button
                  className="w-full px-4 py-4 flex items-start gap-3 text-left"
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                >
                  {/* Type icon */}
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: tm.bg }}
                  >
                    {item.emoji ? (
                      <span className="text-xl">{item.emoji}</span>
                    ) : (
                      <span className="material-symbols-outlined text-base" style={{ color: tm.color }}>
                        {tm.icon}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${sm.color} ${sm.bg} ${sm.border} flex items-center gap-1`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`}></span>
                        {t(sm.label, sm.label)}
                      </span>
                      <span className="text-[10px] text-gray-500">{timeAgo(item.createdAt, t)}</span>
                    </div>
                    <p className="text-[14px] font-bold text-slate-900 dark:text-white leading-snug">{item.title}</p>
                    <div className="mt-2">
                      <div className="h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${getProgressValue(item.status)}%`, backgroundColor: tm.color }} />
                      </div>
                    </div>
                  </div>

                  <span className="material-symbols-outlined text-gray-500 text-lg shrink-0 mt-1 transition-transform" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                    expand_more
                  </span>
                </button>

                {/* Expanded detail panel */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-white/8 pt-3" style={{ animation: 'fadeIn 0.2s ease-out' }}>
                    <p className="text-[12px] text-slate-600 dark:text-slate-300 leading-relaxed">{item.description}</p>
                    {/* Meta info */}
                    <div className="grid grid-cols-2 gap-2">
                      {item.refId && (
                        <div className="bg-black/5 dark:bg-white/5 rounded-xl p-2.5">
                          <div className="text-[9px] text-gray-500 uppercase tracking-wide">{t('Ref ID')}</div>
                          <div className="text-[11px] font-mono font-bold text-slate-900 dark:text-white mt-0.5">{item.refId}</div>
                        </div>
                      )}
                      {item.amount && (
                        <div className="bg-black/5 dark:bg-white/5 rounded-xl p-2.5">
                          <div className="text-[9px] text-gray-500 uppercase tracking-wide">{t('Amount')}</div>
                          <div className="text-[11px] font-bold text-green-400 mt-0.5">{item.amount}</div>
                        </div>
                      )}
                      {item.eta && (
                        <div className="bg-black/5 dark:bg-white/5 rounded-xl p-2.5">
                          <div className="text-[9px] text-gray-500 uppercase tracking-wide">{t('ETA')}</div>
                          <div className="text-[11px] font-bold text-slate-900 dark:text-white mt-0.5">{item.eta}</div>
                        </div>
                      )}
                      {item.neighbourhood && (
                        <div className="bg-black/5 dark:bg-white/5 rounded-xl p-2.5">
                          <div className="text-[9px] text-gray-500 uppercase tracking-wide">{t('Neighbours')}</div>
                          <div className="text-[11px] font-bold text-amber-400 mt-0.5">+{item.neighbourhood} {t('same issue')}</div>
                        </div>
                      )}
                    </div>

                    {/* Trust Score Badge */}
                    {(() => {
                      const deptMap: Record<string, string> = { grievance: 'Municipal', scheme: 'Revenue', health: 'Health', legal: 'Police', finance: 'Revenue' };
                      const dept = deptMap[item.type] || 'Municipal';
                      const ts = calculateTrustScore(dept);
                      return (
                        <div className="flex items-center gap-2 p-2 rounded-xl bg-black/5 dark:bg-white/5">
                          <span className="material-symbols-outlined text-sm" style={{ color: ts.color }}>verified</span>
                          <div className="flex-1">
                            <span className="text-[10px] font-bold text-slate-900 dark:text-white">{t(dept, dept)} {t('Dept Trust Score: ')}</span>
                            <span className="text-[11px] font-black" style={{ color: ts.color }}>{ts.score}/10</span>
                            <span className="text-[8px] font-bold ml-1 px-1 py-0.5 rounded" style={{ color: ts.color, backgroundColor: ts.color + '15' }}>{t(ts.label, ts.label)}</span>
                          </div>
                          <span className={`material-symbols-outlined text-xs ${ts.trend === 'up' ? 'text-green-500' : ts.trend === 'down' ? 'text-red-500' : 'text-slate-400'}`}>
                            {ts.trend === 'up' ? 'trending_up' : ts.trend === 'down' ? 'trending_down' : 'trending_flat'}
                          </span>
                        </div>
                      );
                    })()}

                    {/* Agent tag + portal */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 bg-black/5 dark:bg-white/5 rounded-full px-2 py-1">
                        <span className="material-symbols-outlined text-[10px] text-slate-500 dark:text-gray-400">smart_toy</span>
                        <span className="text-[10px] text-slate-500 dark:text-gray-400">{t(AGENT_NAMES[item.agentKey], AGENT_NAMES[item.agentKey])}</span>
                      </div>
                      {item.portal && (
                        <div className="flex items-center gap-1 text-[10px] text-blue-400">
                          <span className="material-symbols-outlined text-[10px]">link</span>
                          <span>{item.portal}</span>
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {item.status !== 'Resolved' && (
                        <button
                          onClick={() => updateTrackedStatus(item.id, 'Resolved')}
                          className="min-h-12 py-2 rounded-xl text-[13px] font-bold bg-green-500/15 text-green-400 border border-green-500/25 hover:bg-green-500/25 transition-all active:scale-95"
                        >
                          {t('✓ Mark Resolved')}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setActiveAgent(item.agentKey);
                          onOpenAgent(item.agentKey);
                        }}
                        className="min-h-12 py-2 rounded-xl text-[13px] font-bold bg-[#FF9933]/15 text-[#FF9933] border border-[#FF9933]/25 hover:bg-[#FF9933]/25 transition-all active:scale-95"
                      >
                        {t('💬 Ask Agent')}
                      </button>
                    </div>

                    {/* Government-only: Status Update Dropdown */}
                    {canUpdateStatus && item.status !== 'Resolved' && (
                      <div className="mt-2 p-2.5 rounded-xl bg-[#138808]/10 border border-[#138808]/20">
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="material-symbols-outlined text-[12px] text-[#138808]">admin_panel_settings</span>
                          <span className="text-[9px] font-bold text-[#138808] uppercase tracking-wider">{t('Government Action')}</span>
                        </div>
                        <select
                          value={item.status}
                          onChange={(e) => updateTrackedStatus(item.id, e.target.value as TrackedItem['status'])}
                          className="w-full bg-white dark:bg-black/30 border border-[#138808]/30 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#138808]"
                        >
                          <option value="Pending">{t('Pending')}</option>
                          <option value="Under Review">{t('Under Review')}</option>
                          <option value="In Progress">{t('In Progress')}</option>
                          <option value="Resolved">{t('Resolved')}</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* New Grievance CTA at bottom */}
        {filtered.length > 0 && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 w-[min(398px,calc(100%-2rem))] z-[101]">
            <button
              onClick={onOpenGrievance}
              className="w-full min-h-12 py-3 rounded-2xl bg-[#FF9933] text-slate-900 dark:text-white text-sm font-black shadow-lg shadow-[#FF9933]/20 flex items-center justify-center gap-2 active:scale-[0.99]"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              {t('fileGrievanceBtn')}
            </button>
          </div>
        )}
      </div>

      {/* Case Selector Modal overlay at root level */}
      {showCaseSelector && (
        <div 
          className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" 
          onClick={() => setShowCaseSelector(false)}
          style={{ animation: 'fadeIn 0.2s ease-out' }}
        >
          <div 
            className="w-full max-w-sm bg-white dark:bg-[#0f1f3a] rounded-3xl p-5 shadow-2xl border border-black/10 dark:border-white/10" 
            style={{ animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black text-slate-900 dark:text-white">Choose a case</h3>
              <button onClick={() => setShowCaseSelector(false)} className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                <span className="material-symbols-outlined text-gray-500">close</span>
              </button>
            </div>
            <div className="space-y-2.5 max-h-[45vh] overflow-y-auto pr-1">
              {activeItems.map(item => {
                const tm = TYPE_ICON[item.type];
                return (
                  <button 
                    key={item.id} 
                    onClick={() => handleAskAgent(item)}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] hover:bg-black/[0.06] dark:hover:bg-white/[0.06] border border-black/5 dark:border-white/5 active:scale-[0.98] text-left transition-all"
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: tm.bg }}>
                      <span className="material-symbols-outlined text-base" style={{ color: tm.color }}>{tm.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-slate-900 dark:text-white truncate">{item.title}</div>
                      <div className="text-[10px] text-gray-500 font-medium tracking-wide mt-0.5">{t(AGENT_NAMES[item.agentKey], AGENT_NAMES[item.agentKey])}</div>
                    </div>
                    <span className="material-symbols-outlined text-gray-400 text-lg">chevron_right</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
