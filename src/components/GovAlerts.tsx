'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAppStore } from '@/lib/store';

type AlertHistoryItem = {
  id: string;
  title?: string;
  message: string;
  category: string;
  priority: string;
  createdAt: number;
};

function formatRelativeTime(timestamp: number) {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function getHistoryIcon(category: string) {
  if (category === 'health') return { icon: 'vaccines', color: '#10B981' };
  if (category === 'schemes') return { icon: 'agriculture', color: '#FF9933' };
  if (category === 'emergency') return { icon: 'warning', color: '#EF4444' };
  return { icon: 'campaign', color: '#06B6D4' };
}

export default function GovAlerts() {
  const { t } = useTranslation();
  const { userProfile } = useAppStore();
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastSent, setBroadcastSent] = useState(false);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastReach, setBroadcastReach] = useState<number | null>(null);
  const [broadcastError, setBroadcastError] = useState('');
  const [broadcastWard, setBroadcastWard] = useState('all');
  const [broadcastCategory, setBroadcastCategory] = useState('all');
  const [activeProtocol, setActiveProtocol] = useState<string | null>(null);
  const [activatedProtocols, setActivatedProtocols] = useState<Set<string>>(new Set());
  const [activatingProtocol, setActivatingProtocol] = useState<string | null>(null);
  const [notificationHistory, setNotificationHistory] = useState<AlertHistoryItem[]>([]);
  
  const [completedSteps, setCompletedSteps] = useState<Record<string, Set<number>>>({});
  const [executingStep, setExecutingStep] = useState<{protocol: string, step: number} | null>(null);

  const fetchHistory = async () => {
    try {
      const response = await fetch('/api/backend/citizen-alerts?limit=8&includeExpired=true&sinceHours=168');
      if (!response.ok) return;

      const data = (await response.json()) as { alerts?: AlertHistoryItem[] };
      if (Array.isArray(data.alerts)) {
        setNotificationHistory(data.alerts);
      }
    } catch {
      // keep existing history UI when backend is unavailable
    }
  };

  useEffect(() => {
    void fetchHistory();
  }, []);

  const publishCitizenAlert = async (payload: {
    message: string;
    category: string;
    targetWard: string;
    channel: 'broadcast' | 'protocol';
    priority?: 'medium' | 'high' | 'critical';
    protocolId?: string;
    title?: string;
  }) => {
    const response = await fetch('/api/backend/citizen-alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: payload.title,
        message: payload.message,
        category: payload.category,
        targetWard: payload.targetWard,
        channel: payload.channel,
        priority: payload.priority,
        protocolId: payload.protocolId,
        source: userProfile.name?.trim() ? `${userProfile.name} · District Administration` : 'District Administration',
        userId: userProfile.name?.trim() || 'gov-admin',
      }),
    });

    if (!response.ok) {
      throw new Error('Alert publish failed');
    }

    const data = (await response.json()) as { estimatedReach?: number };
    return typeof data.estimatedReach === 'number' ? data.estimatedReach : null;
  };

  const handleExecuteStep = (protocolId: string, stepIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExecutingStep({protocol: protocolId, step: stepIdx});
    // Simulate task execution
    setTimeout(() => {
      setCompletedSteps(prev => {
        const pSteps = new Set(prev[protocolId] || []);
        pSteps.add(stepIdx);
        // Automatically mark active if all 4 steps are done
        if (pSteps.size === 4) {
           setActivatedProtocols(act => new Set(act).add(protocolId));
        }
        return { ...prev, [protocolId]: pSteps };
      });
      setExecutingStep(null);
    }, 1000);
  };

  const handleActivateProtocol = (id: string, label: string, desc: string, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent collapsing the accordion
    setActivatingProtocol(id);

    // Trigger RN App Emergency Simulation IMMEDIATELY
    void fetch('/api/call/ring/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emergencyType: id, emergencyLabel: label }),
    }).catch(console.error);

    setTimeout(() => {
      setActivatedProtocols(prev => new Set(prev).add(id));
      setCompletedSteps(prev => ({ ...prev, [id]: new Set([0, 1, 2, 3]) }));
      setActivatingProtocol(null);
      setBroadcastSent(true);
      setBroadcastReach(null);
      setBroadcastError('');

      void publishCitizenAlert({
        title: `${label} Activated`,
        message: `${label} activated. ${desc}. Follow official ward advisory and safety instructions.`,
        category: 'emergency',
        targetWard: 'all',
        channel: 'protocol',
        priority: 'critical',
        protocolId: id,
      }).then((reach) => {
        if (typeof reach === 'number') {
          setBroadcastReach(reach);
        }
        void fetchHistory();
      }).catch(() => {
        setBroadcastError(t('unableToPublishProtocolAlert', 'Unable to publish protocol alert right now.'));
      });
    }, 1500);
  };

  const handleSendBroadcast = async () => {
    const text = typeof broadcastText === 'string' ? broadcastText.trim() : '';
    if (!text || broadcastSending) return;

    setBroadcastSending(true);
    setBroadcastError('');

    try {
      const reach = await publishCitizenAlert({
        message: text,
        category: broadcastCategory === 'all' ? 'civic' : broadcastCategory,
        targetWard: broadcastWard,
        channel: 'broadcast',
        priority: broadcastCategory === 'emergency' ? 'high' : 'medium',
        title: 'Public Announcement',
      });

      setBroadcastSent(true);
      setBroadcastReach(reach);
      setBroadcastText('');
      await fetchHistory();
    } catch {
      setBroadcastError(t('unableToSendBroadcast', 'Unable to send broadcast right now. Please retry.'));
    } finally {
      setBroadcastSending(false);
    }
  };

  const handleStandDown = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActivatedProtocols(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setCompletedSteps(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full text-slate-900 dark:text-white overflow-y-auto pb-6 no-scrollbar">
      <div className="p-4 space-y-4">
        <h3 className="text-sm font-black uppercase tracking-wider">{t('alertsAndCommunications', 'Alerts & Communications')}</h3>

        {/* Live SOS Feed */}
        <div className="bg-white dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-2xl p-4 shadow-sm dark:shadow-none">
          <h4 className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[14px] text-red-400 animate-pulse">sos</span>
            {t('liveDistressFeed', 'Live Distress Feed')}
            <span className="ml-auto text-[9px] font-bold text-green-500 dark:text-green-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Monitoring
            </span>
          </h4>
          <div className="space-y-2">
            {[
              { citizen: 'Anonymous', location: 'Ward 14, Sector 3', time: '2 min ago', type: 'Hardware Trigger', severity: 'critical' as const, lat: '26.8467°N', lng: '80.9462°E' },
              { citizen: 'Ravi Kumar', location: 'Ward 7, Market Area', time: '18 min ago', type: 'Voice SOS', severity: 'high' as const, lat: '26.8512°N', lng: '80.9338°E' },
              { citizen: 'Meena Devi', location: 'Ward 22, Bus Stand', time: '1 hour ago', type: 'App Button', severity: 'resolved' as const, lat: '26.8389°N', lng: '80.9215°E' },
              { citizen: 'Ankit Sharma', location: 'Ward 3, Railway Crossing', time: '3 hours ago', type: 'Voice SOS', severity: 'resolved' as const, lat: '26.8601°N', lng: '80.9543°E' },
            ].map((sos, i) => (
              <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                sos.severity === 'critical' ? 'bg-red-500/5 border-red-500/20' :
                sos.severity === 'high' ? 'bg-orange-500/5 border-orange-500/20' :
                'bg-green-500/5 border-green-500/20'
              }`}>
                <span className={`material-symbols-outlined text-lg ${
                  sos.severity === 'critical' ? 'text-red-500 animate-pulse' :
                  sos.severity === 'high' ? 'text-orange-400' : 'text-green-400'
                }`}>
                  {sos.severity === 'resolved' ? 'check_circle' : 'emergency'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[11px] font-bold">{t(sos.citizen, sos.citizen)}</p>
                    <span className="text-[8px] font-bold text-slate-400 dark:text-gray-500 bg-black/5 dark:bg-white/5 px-1 py-0.5 rounded">{t(sos.type, sos.type)}</span>
                  </div>
                  <p className="text-[9px] text-slate-500 dark:text-gray-400">{t(sos.location, sos.location)}</p>
                  <p className="text-[8px] text-slate-400 dark:text-gray-500">{sos.lat}, {sos.lng}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[9px] text-slate-400 dark:text-gray-500 block">{t(sos.time, sos.time)}</span>
                  {sos.severity !== 'resolved' && (
                    <button className="mt-1 px-2 py-0.5 rounded bg-[#138808]/10 text-[8px] font-bold text-[#138808] hover:bg-[#138808]/20 transition-colors">
                      {t('respond', 'Respond')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Emergency Protocols */}
        <div className="bg-white dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-2xl p-4 shadow-sm dark:shadow-none">
          <h4 className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[14px] text-red-500">emergency_home</span>
            {t('emergencyProtocols', 'Emergency Protocols')}
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'flood', label: t('floodAlert', 'Flood Alert'), icon: 'flood', color: '#06B6D4', desc: t('evacuateLowLyingWards', 'Evacuate low-lying wards'), steps: ['Notify State Disaster Response Force', 'Trigger Emergency Broadcast to vulnerable wards', 'Deploy localized water pumps', 'Alert Primary Health Centers'] },
              { id: 'fire', label: t('fireResponse', 'Fire Response'), icon: 'local_fire_department', color: '#EF4444', desc: t('deployFireBrigade', 'Deploy fire brigade'), steps: ['Dispatch Central Fire Tenders', 'Coordinate Ward Traffic Control', 'Alert City Hospital Burn Ward', 'Issue evacuation notice explicitly'] },
              { id: 'epidemic', label: t('healthEmergency', 'Health Emergency'), icon: 'coronavirus', color: '#10B981', desc: t('medicalTeamsAlert', 'Medical teams alert'), steps: ['Activate isolation wards', 'Dispatch mobile testing units', 'Broadcast hygiene protocol safely', 'Coordinate with vaccine distributors'] },
              { id: 'riot', label: t('lawAndOrder', 'Law & Order'), icon: 'shield', color: '#F59E0B', desc: t('policeDeployment', 'Police deployment'), steps: ['Deploy rapid action force', 'Implement local curfew', 'Monitor secondary hotspots', 'Broadcast immediate peace appeal'] },
              { id: 'power', label: t('powerGridFailure', 'Power Grid Failure'), icon: 'power_off', color: '#8B5CF6', desc: t('emergencyGenerators', 'Emergency generators'), steps: ['Activate hospital backup generators', 'Deploy traffic police to unlit crossways', 'Notify state electricity board', 'Broadcast repair ETAs locally'] },
              { id: 'quake', label: t('earthquakeAlert', 'Earthquake Alert'), icon: 'landslide', color: '#FF9933', desc: t('evacuationProtocol', 'Evacuation protocol'), steps: ['Trigger open-ground evacuation', 'Dispatch structural assessment teams', 'Coordinate heavy lifting equipment', 'Setup emergency relief camp nodes'] },
            ].map(p => {
              const isActive = activatedProtocols.has(p.id);
              const isActivating = activatingProtocol === p.id;
              const pSteps = completedSteps[p.id] || new Set();
              const isExpanded = activeProtocol === p.id || isActive || isActivating;
              
              return (
              <div
                key={p.id}
                className={`p-4 rounded-xl border transition-all relative overflow-hidden flex flex-col ${
                  isActive 
                    ? 'border-red-500 bg-red-500/10 shadow-[0_0_20px_rgba(239,68,68,0.2)] ring-1 ring-red-500 col-span-2' 
                    : isExpanded
                      ? 'border-red-500/30 bg-red-500/5 ring-1 ring-red-500/20 col-span-2'
                      : 'border-black/5 dark:border-white/5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] col-span-1'
                }`}
              >
                {isActive && <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/20 blur-3xl rounded-full pointer-events-none" />}
                
                <div 
                  onClick={() => !isActive && !isActivating && setActiveProtocol(activeProtocol === p.id ? null : p.id)}
                  className={`flex items-start gap-4 w-full text-left relative z-10 ${(!isActive && !isActivating) ? 'cursor-pointer hover:opacity-80' : ''}`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-all ${isActive ? 'bg-red-500 text-white animate-pulse shadow-lg' : 'bg-black/5 dark:bg-white/5'}`} style={{ color: isActive ? '#fff' : p.color }}>
                    <span className="material-symbols-outlined text-3xl">{p.icon}</span>
                  </div>
                  
                  <div className="flex-1 min-w-0 pt-1">
                    <div className="flex justify-between items-start mb-1">
                      <p className="text-sm font-black tracking-wide text-slate-800 dark:text-white">{p.label}</p>
                    </div>
                    <p className="text-[11px] font-medium text-slate-500 dark:text-gray-400 max-w-[80%] leading-relaxed">{p.desc}</p>
                    {isActive && <span className="absolute top-1 right-0 bg-red-500 text-white text-[10px] font-black px-2.5 py-1 rounded-md shadow-lg animate-pulse tracking-widest">ACTIVE</span>}
                  </div>
                </div>
                
                {isExpanded && (
                  <div className={`mt-5 pt-5 border-t relative z-10 flex-1 flex flex-col ${isActive ? 'border-red-500/30' : 'border-red-500/20'}`}>
                    
                    {/* Action Plan Checklist */}
                    <div className="mb-5">
                      
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[11px] font-black text-red-500 dark:text-red-400 uppercase tracking-widest flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[15px]">checklist</span> Protocol Action Plan
                        </p>
                        
                        <button 
                          onClick={(e) => { e.stopPropagation(); setActiveProtocol(null); }}
                          className="w-7 h-7 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/20 transition-colors shrink-0"
                          title="Close Action Plan"
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                      </div>
                      
                      <div className="flex flex-col gap-2.5">
                        {p.steps.map((step, idx) => {
                          const isCompleted = pSteps.has(idx);
                          const isExecuting = executingStep?.protocol === p.id && executingStep?.step === idx;
                          return (
                            <div key={idx} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${isCompleted ? 'bg-green-500/10 border-green-500/30 shadow-sm' : 'bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5 hover:border-black/10 dark:hover:border-white/10'}`}>
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${isCompleted ? 'bg-green-500 text-white shadow-md' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
                                {isCompleted ? <span className="material-symbols-outlined text-[14px] font-black">check</span> : <span className="text-[11px] font-black">{idx + 1}</span>}
                              </div>
                              <p className={`text-[12px] flex-1 leading-snug ${isCompleted ? 'text-green-700 dark:text-green-400 font-bold' : 'text-slate-700 dark:text-gray-300 font-medium'}`}>{step}</p>
                              {!isCompleted && !isActive && (
                                <button 
                                   onClick={(e) => handleExecuteStep(p.id, idx, e)}
                                   disabled={isExecuting || isActivating}
                                   className="px-4 py-2 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-slate-900 dark:text-white text-[10px] font-black transition-all disabled:opacity-50 shrink-0 uppercase tracking-wider"
                                >
                                   {isExecuting ? '...' : 'Execute'}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Master Action Button */}
                    <div className="mt-auto">
                      {isActive ? (
                        <button onClick={(e) => handleStandDown(p.id, e)} className="w-full py-3 rounded-xl bg-slate-800 dark:bg-black/50 text-white text-[12px] font-black hover:bg-slate-700 active:scale-[0.99] transition-all border border-white/10 flex items-center justify-center gap-2 shadow-lg tracking-widest">
                          <span className="material-symbols-outlined text-[18px]">stop_circle</span>
                          {t('standDown', 'STAND DOWN ROUTINE')}
                        </button>
                      ) : isActivating ? (
                        <button disabled className="w-full py-3 rounded-xl bg-red-500/50 text-white text-[12px] font-black flex items-center justify-center gap-2 tracking-widest cursor-wait shadow-lg">
                          <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                          {t('activating', 'DEPLOYING ALL ACTIONS...')}
                        </button>
                      ) : (
                        <button onClick={(e) => handleActivateProtocol(p.id, p.label, p.desc, e)} className="w-full py-3 rounded-xl bg-red-500 text-white text-[12px] font-black hover:bg-red-600 active:scale-[0.99] transition-all shadow-xl shadow-red-500/20 flex items-center justify-center gap-2 tracking-widest">
                          <span className="material-symbols-outlined text-[18px]">warning</span>
                          {t('activateProtocol', 'DEPLOY ENTIRE PROTOCOL IMMEDIATELY')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>

        {/* Broadcast composer */}
        <div className="bg-[#138808]/5 border border-[#138808]/20 rounded-2xl p-4">
          <h4 className="text-[11px] font-black text-[#138808] uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base">campaign</span>
            {t('broadcastToCitizens', 'Broadcast to Citizens')}
          </h4>
          {broadcastSent && (
            <div className="flex items-center gap-2 pb-3">
              <span className="material-symbols-outlined text-green-500 dark:text-green-400 text-2xl">check_circle</span>
              <div>
                <p className="text-sm font-bold text-green-600 dark:text-green-400">{t('announcementSent', 'Announcement Sent!')}</p>
                <p className="text-[10px] text-slate-500 dark:text-gray-400">{t('broadcastedToCitizensInJurisdiction', `Broadcasted to ${broadcastReach ?? 0} citizens in your jurisdiction`)}</p>
              </div>
            </div>
          )}

          {broadcastError && (
            <p className="text-[10px] text-red-500 pb-2">{broadcastError}</p>
          )}

          <textarea
            value={broadcastText}
            onChange={e => {
              setBroadcastText(e.target.value);
              if (broadcastSent) setBroadcastSent(false);
            }}
            placeholder={t('typeYourPublicAnnouncement', 'Type your public announcement...')}
            className="w-full bg-slate-100 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-[#138808]/50 resize-none h-20 mb-2"
          />
          <div className="flex gap-2 mb-3">
            <select value={broadcastWard} onChange={e => setBroadcastWard(e.target.value)} className="flex-1 bg-slate-100 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-slate-600 dark:text-gray-300 focus:outline-none">
              <option value="all">{t('allWards', 'All Wards')}</option>
              <option value="1-10">{t('ward1to10', 'Ward 1-10')}</option>
              <option value="11-20">{t('ward11to20', 'Ward 11-20')}</option>
              <option value="21-30">{t('ward21to30', 'Ward 21-30')}</option>
            </select>
            <select value={broadcastCategory} onChange={e => setBroadcastCategory(e.target.value)} className="flex-1 bg-slate-100 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-slate-600 dark:text-gray-300 focus:outline-none">
              <option value="all">{t('allCategories', 'All Categories')}</option>
              <option value="infra">{t('infrastructure', 'Infrastructure')}</option>
              <option value="health">{t('health', 'Health')}</option>
              <option value="schemes">{t('schemes', 'Schemes')}</option>
              <option value="emergency">{t('emergency', 'Emergency')}</option>
            </select>
          </div>
          <div className="flex gap-2 mb-3">
             <button
               onClick={async () => {
                 setBroadcastSending(true);
                 try {
                   const res = await fetch('/api/ml/broadcast-ai', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ category: broadcastCategory, ward: broadcastWard })
                   });
                   if (res.ok) {
                     const data = await res.json();
                     const draft = data.draft;
                     if (typeof draft === 'string') {
                       setBroadcastText(draft);
                     } else if (draft && typeof draft === 'object') {
                       // Concatenate bilingual versions for the textarea
                       setBroadcastText(`${draft.en}\n\n${draft.hi}`);
                     }
                   }
                 } catch (e) { console.error(e); }
                 finally { setBroadcastSending(false); }
               }}
               className="flex-1 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[#8B5CF6] text-[9px] font-black flex items-center justify-center gap-1 hover:bg-indigo-500/20 transition-all border-dashed"
             >
               <span className="material-symbols-outlined text-[14px]">magic_button</span>
               AI Draft (Bilingual)
             </button>
             <button
               className="flex-1 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 text-slate-400 text-[9px] font-black flex items-center justify-center gap-1"
             >
               <span className="material-symbols-outlined text-[14px]">translate</span>
               Translate to Hindi
             </button>
          </div>
          <button
            onClick={handleSendBroadcast}
            disabled={!(typeof broadcastText === 'string' && broadcastText.trim()) || broadcastSending}
            className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#138808] text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#0d6b06] transition-all active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-[14px] align-middle mr-1">send</span>
            {broadcastSending ? t('sendingAnnouncement', 'Sending...') : t('sendPublicAnnouncement', 'Send Public Announcement')}
          </button>
        </div>

        {/* Policy directives */}
        <div className="bg-white dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-2xl p-4 shadow-sm dark:shadow-none">
          <h4 className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[14px] text-amber-400">gavel</span>
            {t('policyDirectives', 'Policy Directives')}
          </h4>
          <div className="space-y-2">
            {[
              { title: 'Free ration distribution extended till June 2026', source: 'PMO', time: '3 hours ago', priority: 'high' },
              { title: 'All BPL cards must be linked to Aadhaar by April 15', source: 'State Gov', time: '1 day ago', priority: 'medium' },
              { title: 'New ward boundary definitions effective immediately', source: 'District HQ', time: '2 days ago', priority: 'low' },
              { title: 'COVID-19 booster campaign — all PHCs activated', source: 'Health Dept', time: '3 days ago', priority: 'high' },
              { title: 'Mid-day meal quality audit mandated for all schools', source: 'Education Dept', time: '5 days ago', priority: 'medium' },
            ].map((p, i) => (
              <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors border border-transparent hover:border-black/5 dark:hover:border-white/5">
                <span className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${
                  p.priority === 'high' ? 'bg-red-400' : p.priority === 'medium' ? 'bg-amber-400' : 'bg-blue-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold leading-snug">{t(p.title, p.title)}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] text-slate-400 dark:text-gray-500">{t(p.source, p.source)}</span>
                    <span className="text-[8px] text-slate-300 dark:text-gray-600">·</span>
                    <span className="text-[9px] text-slate-400 dark:text-gray-500">{t(p.time, p.time)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notification history */}
        <div className="bg-white dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-2xl p-4 shadow-sm dark:shadow-none">
          <h4 className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[14px] text-[#3B82F6]">history</span>
            {t('notificationHistory', 'Notification History')}
          </h4>
          <div className="space-y-2">
            {notificationHistory.length === 0 ? (
              <p className="text-[10px] text-slate-500 dark:text-gray-400">{t('noRecentCitizenAlerts', 'No recent citizen alerts yet.')}</p>
            ) : notificationHistory.map((alert) => {
              const visual = getHistoryIcon(alert.category);
              return (
                <div key={alert.id} className="flex items-center gap-2.5 p-2 rounded-lg">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${visual.color}15` }}>
                    <span className="material-symbols-outlined text-[14px]" style={{ color: visual.color }}>{visual.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold truncate">{t(alert.message, alert.message)}</p>
                    <p className="text-[9px] text-slate-400 dark:text-gray-500">{t(formatRelativeTime(alert.createdAt), formatRelativeTime(alert.createdAt))}</p>
                  </div>
                  <span className="material-symbols-outlined text-[14px] text-slate-300 dark:text-gray-600">chevron_right</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
