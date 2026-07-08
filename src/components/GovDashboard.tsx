'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/lib/store';
import { getTrendInsights, calculateTrustScore } from '@/lib/intelligence';

// ─── Ward data ────────────────────────────────────────────────────────────────
const WARD_INTENSITIES  = [0.2,0.8,0.5,0.3,0.9,0.1,0.6,0.4,0.7,0.2,0.5,0.8,0.3,0.6,0.9,0.1,0.4,0.7,0.5,0.2,0.8,0.3,0.6,0.4];
const WARD_GRIEF_COUNTS = [4,18,11,6,22,2,14,9,17,3,10,19,7,15,23,1,8,16,11,4,20,6,13,9];
const WARD_NAMES = [
  'Baharpur Sector 1','Mahanagar Colony','Gomti Nagar West','Alambagh','Sector 3 Baharpur',
  'Rajajipuram','Aliganj North','Chinhat','Indira Nagar','Transport Nagar',
  'Hazratganj','Indira Colony','Gomti Nagar East','Chinhat Extension','NH-44 Zone',
  'Sushant Golf City','Sitapur Road','Shahjahanpur Mode','Aminabad','Nishatganj',
  'Railway Station Zone','Old City Market','Dalibagh','Vikas Nagar',
];

// ─── Quick-action definitions ─────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { icon: 'emergency',         label: 'Emergency Alert', color: '#EF4444', msg: '⚠️ Emergency declared in [Ward]. All residents stay indoors and follow authority instructions.' },
  { icon: 'water_drop',        label: 'Water Advisory',  color: '#06B6D4', msg: '🚰 Water supply disruption in [Ward]. Municipal tankers deployed. Restoration est. 4–6 hrs.' },
  { icon: 'do_not_disturb_on', label: 'Road Closure',    color: '#F59E0B', msg: '🚧 Road closed in [Ward] for repair. Please use alternate routes. Inconvenience regretted.' },
  { icon: 'power_off',         label: 'Power Outage',    color: '#8B5CF6', msg: '⚡ Power outage in [Ward]. DISCOM teams deployed. Estimated restoration: 2–3 hours.' },
  { icon: 'shield',            label: 'Curfew Notice',   color: '#EF4444', msg: '🛡️ Curfew imposed in [Ward]. Citizens must stay indoors. Essential services operational.' },
  { icon: 'health_and_safety', label: 'Health Alert',    color: '#10B981', msg: '🏥 Health advisory for [Ward]. Residents with symptoms visit nearest PHC immediately.' },
  { icon: 'school',            label: 'School Closure',  color: '#3B82F6', msg: '📚 Schools in [Ward] closed tomorrow. Students/parents stay updated via official channels.' },
  { icon: 'celebration',       label: 'Festival Alert',  color: '#FF9933', msg: '🎉 Traffic diversions in [Ward] due to festival. Plan travel accordingly.' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

type WardColorResult = { bg: string; text: string; border: string; hex: string; label: string };
function wardColor(intensity: number): WardColorResult {
  if (intensity > 0.7) return { bg: '#EF444420', text: '#C01C1C', border: '#EF4444', hex: '%23EF4444', label: 'High' };
  if (intensity > 0.4) return { bg: '#F59E0B18', text: '#92611C', border: '#F59E0B', hex: '%23F59E0B', label: 'Medium' };
  return                       { bg: '#10B98112', text: '#067A53', border: '#10B981', hex: '%2310B981', label: 'Low' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Portal helpers — escape overflow-y-auto parent
// ═══════════════════════════════════════════════════════════════════════════════

function usePortalMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted;
}

// ─── Snackbar ─────────────────────────────────────────────────────────────────
function Snackbar({ message, type = 'success' }: { message: string; type?: 'success' | 'info' }) {
  const mounted = usePortalMounted();
  if (!mounted) return null;

  return createPortal(
    <div style={{
      position: 'fixed', bottom: '84px', left: '50%', transform: 'translateX(-50%)',
      zIndex: 99999, width: '90%', maxWidth: '380px',
      animation: 'slideUp 0.22s ease-out', pointerEvents: 'none',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '12px 16px', borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.40)',
        fontSize: '11px', fontWeight: 700, color: '#fff',
        background: type === 'success' ? '#138808' : '#3B82F6',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
          {type === 'success' ? 'check_circle' : 'info'}
        </span>
        {message}
      </div>
    </div>,
    document.body
  );
}

// ─── Broadcast / Action Modal ─────────────────────────────────────────────────
interface ActionModalProps {
  title: string;
  message: string;
  ward?: string;
  onClose: () => void;
}

function ActionModal({ title, message: initMsg, ward = 'All Wards', onClose }: ActionModalProps) {
  const mounted = usePortalMounted();
  const [msg, setMsg]   = useState(initMsg.replace('[Ward]', ward));
  const [targetWard, setTargetWard] = useState(ward === 'All Wards' ? 'all' : ward);
  const [sent, setSent] = useState<'idle' | 'broadcast' | 'dispatched'>('idle');
  if (!mounted) return null;

  const handleBroadcast = () => { setSent('broadcast'); setTimeout(onClose, 2200); };
  const handleDispatch  = () => { setSent('dispatched'); setTimeout(onClose, 2200); };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 5000, display: 'flex', alignItems: 'flex-end', maxWidth: '430px', margin: '0 auto' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: '100%', background: 'var(--modal-bg, #fff)', borderRadius: '24px 24px 0 0', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 -8px 40px rgba(0,0,0,0.2)', animation: 'slideUp 0.25s ease-out' }}
        className="bg-white dark:bg-[#0f1f3a]"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 className="text-sm font-black text-slate-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            <span className="material-symbols-outlined text-slate-400 text-lg">close</span>
          </button>
        </div>

        {sent !== 'idle' ? (
          <div className="flex flex-col items-center py-6 gap-3">
            <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-green-500 text-3xl">check_circle</span>
            </div>
            <p className="text-sm font-bold text-green-600 dark:text-green-400">
              {sent === 'broadcast' ? 'Broadcast Sent!' : 'Dispatch Order Issued!'}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-gray-400 text-center">
              {sent === 'broadcast'
                ? 'Message delivered to 1,247 citizens in jurisdiction.'
                : 'Authority team notified — en route to location.'}
            </p>
          </div>
        ) : (
          <>
            <textarea
              value={msg}
              onChange={e => setMsg(e.target.value)}
              className="w-full bg-slate-100 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#138808]/50 resize-none h-24"
            />
            <select
              value={targetWard}
              onChange={e => setTargetWard(e.target.value)}
              className="w-full bg-slate-100 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-slate-600 dark:text-gray-300 focus:outline-none"
            >
              <option value="all">All Wards</option>
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={`Ward ${i + 1}`}>Ward {i + 1}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleBroadcast}
                disabled={!msg.trim()}
                className="py-2.5 rounded-xl text-xs font-bold bg-[#138808] text-white disabled:opacity-30 hover:bg-[#0d6b06] transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[14px]">campaign</span>
                Broadcast Alert
              </button>
              <button
                onClick={handleDispatch}
                className="py-2.5 rounded-xl text-xs font-bold bg-[#3B82F6] text-white hover:bg-[#2563EB] transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[14px]">local_shipping</span>
                Dispatch Team
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// ─── Ward Map Overlay (Leaflet iframe, theme-aware) ────────────────────────────
interface WardMapProps {
  wardIdx: number;
  onClose: () => void;
  onDispatch: (wardIdx: number) => void;
  onBroadcast: (wardIdx: number) => void;
}

function WardMapOverlay({ wardIdx, onClose, onDispatch, onBroadcast }: WardMapProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const mounted   = usePortalMounted();
  const intensity = WARD_INTENSITIES[wardIdx];
  const col       = wardColor(intensity);
  const count     = WARD_GRIEF_COUNTS[wardIdx];
  const name      = WARD_NAMES[wardIdx] ?? `Ward ${wardIdx + 1}`;
  const wardNum   = wardIdx + 1;

  // Detect theme from document at render time
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  const mapSrc = `/ward-map.html?ward=${wardIdx}&name=${encodeURIComponent(name)}&color=${col.hex}&count=${count}&theme=${isDark ? 'dark' : 'light'}`;

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      iframe.contentWindow?.postMessage(
        { type: 'init-ward-map', wardIdx, wardName: name, wardColor: col.border, grievanceCount: count, theme: isDark ? 'dark' : 'light' },
        '*'
      );
    };
    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, [wardIdx, name, col.border, count, isDark]);

  if (!mounted) return null;

  // Theme-adaptive colours for UI chrome
  const panelBg  = isDark ? '#050d1a' : '#f8fafc';
  const panelBdr = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const txtPri   = isDark ? '#ffffff' : '#0f172a';
  const txtSub   = isDark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.45)';
  const issueBg  = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  const statsBg  = isDark ? 'rgba(5,13,26,0.90)' : 'rgba(255,255,255,0.94)';
  const statsTxt = isDark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.45)';

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 5000, display: 'flex', flexDirection: 'column', maxWidth: '430px', margin: '0 auto', background: panelBg, animation: 'slideUp 0.25s ease-out' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: `1px solid ${panelBdr}`, background: panelBg }}>
        <button onClick={onClose} style={{ padding: '6px', borderRadius: '10px', background: 'transparent', border: 'none', cursor: 'pointer', lineHeight: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: '20px', color: isDark ? 'rgba(255,255,255,0.7)' : '#475569' }}>arrow_back</span>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: '9px', color: txtSub, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ward {wardNum} · Live Map</p>
          <p style={{ margin: 0, fontSize: '14px', fontWeight: 900, color: txtPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
        </div>
        <span style={{ fontSize: '9px', fontWeight: 800, padding: '4px 10px', borderRadius: '999px', border: `1.5px solid ${col.border}`, color: col.text, background: col.bg, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {col.label} Severity
        </span>
      </div>

      {/* ── Map ── */}
      <div style={{ position: 'relative', flex: 1, background: isDark ? '#0d1b2e' : '#dde8f0', overflow: 'hidden' }}>
        <iframe ref={iframeRef} src={mapSrc} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} title={`Ward ${wardNum} Map`} />

        {/* Stats card */}
        <div style={{ position: 'absolute', top: '12px', right: '12px', background: statsBg, border: `1px solid ${panelBdr}`, borderRadius: '12px', padding: '10px', backdropFilter: 'blur(8px)', pointerEvents: 'none' }}>
          <p style={{ margin: '0 0 2px', fontSize: '8px', color: statsTxt, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Grievances</p>
          <p style={{ margin: 0, fontSize: '26px', fontWeight: 900, color: col.text, lineHeight: 1 }}>{count}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#EF4444', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: '8px', color: statsTxt }}>{Math.min(count, 20)} mapped</span>
          </div>
        </div>

        {/* Legend */}
        <div style={{ position: 'absolute', bottom: '12px', left: '12px', background: statsBg, border: `1px solid ${panelBdr}`, borderRadius: '10px', padding: '8px 10px', backdropFilter: 'blur(8px)', pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '11px', height: '11px', borderRadius: '50%', background: '#EF4444', border: '1.5px solid rgba(255,255,255,0.8)', flexShrink: 0 }} />
            <span style={{ fontSize: '8px', color: statsTxt, fontWeight: 500 }}>Grievance</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '11px', height: '7px', borderRadius: '3px', border: `2px solid ${col.border}`, flexShrink: 0 }} />
            <span style={{ fontSize: '8px', color: statsTxt, fontWeight: 500 }}>Ward Boundary</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '10px' }}>🗺</span>
            <span style={{ fontSize: '8px', color: statsTxt, fontWeight: 500 }}>OpenStreetMap</span>
          </div>
        </div>
      </div>

      {/* ── Issue breakdown ── */}
      <div style={{ background: panelBg, borderTop: `1px solid ${panelBdr}`, padding: '10px 16px' }}>
        <p style={{ margin: '0 0 6px', fontSize: '8px', fontWeight: 700, color: txtSub, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Top Issues · Ward {wardNum}</p>
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto' }}>
          {[
            { label: 'Water',    pct: 0.35, col: '#06B6D4' },
            { label: 'Road',     pct: 0.25, col: '#F59E0B' },
            { label: 'Drainage', pct: 0.20, col: '#8B5CF6' },
            { label: 'Power',    pct: 0.12, col: '#EF4444' },
            { label: 'Other',    pct: 0.08, col: '#10B981' },
          ].map(t => (
            <div key={t.label} style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', background: issueBg, borderRadius: '10px', padding: '6px 12px' }}>
              <span style={{ fontSize: '14px', fontWeight: 900, color: t.col, lineHeight: 1 }}>{Math.round(count * t.pct)}</span>
              <span style={{ fontSize: '8px', fontWeight: 700, color: txtSub, marginTop: '2px' }}>{t.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Action buttons ── */}
      <div style={{ background: panelBg, borderTop: `1px solid ${panelBdr}`, padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <button
          onClick={() => onBroadcast(wardIdx)}
          style={{ padding: '10px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 700, background: '#138808', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>campaign</span>
          Broadcast Alert
        </button>
        <button
          onClick={() => onDispatch(wardIdx)}
          style={{ padding: '10px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 700, background: '#3B82F6', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>local_shipping</span>
          Dispatch Team
        </button>
      </div>
    </div>,
    document.body
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════════════

interface SnackbarState { message: string; type: 'success' | 'info'; }

export default function GovDashboard() {
  const { citizenProfile } = useAppStore();
  const pendingCases  = 5;
  const criticalCases = 2;

  const [tab, setTab] = useState<'overview' | 'ward_map' | 'alerts' | 'analytics'>('overview');
  const [wardSelected, setWardSelected] = useState<string | null>(null);
  
  // Dynamic AI State
  const [hotspots, setHotspots] = useState<any[]>([]);
  const [predictions, setPredictions] = useState<any[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(true);

  // ── Causal AI State ──
  const [causalIntervention, setCausalIntervention] = useState('drainage');
  const [causalResults, setCausalResults] = useState<any>(null);
  const [causalLoading, setCausalLoading] = useState(false);

  // ── Anomaly Radar State ──
  const [anomalyData, setAnomalyData] = useState<any>(null);

  // ── Surge Forecast State ──
  const [surgeData, setSurgeData] = useState<any>(null);

  useEffect(() => {
    async function fetchInsights() {
      setIsAiLoading(true);
      try {
        const res = await fetch(`/api/ml/intelligence-engine?ward=${wardSelected || 'all'}`);
        if (res.ok) {
          const data = await res.json();
          setHotspots(data.hotspots || []);
          setPredictions(data.predictions || []);
        }
      } catch (err) {
        console.error("AI Insight Fetch failed", err);
      } finally {
        setIsAiLoading(false);
      }
    }
    fetchInsights();
  }, [wardSelected]);

  // Fetch anomaly + surge data once on mount
  useEffect(() => {
    fetch('/api/ml/anomaly-detector').then(r => r.ok ? r.json() : null).then(d => d && setAnomalyData(d)).catch(() => {});
    fetch('/api/ml/spatiotemporal').then(r => r.ok ? r.json() : null).then(d => d && setSurgeData(d)).catch(() => {});
  }, []);

  // Fetch causal results when intervention changes
  useEffect(() => {
    setCausalLoading(true);
    fetch(`/api/ml/causal-engine?intervention=${causalIntervention}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setCausalResults(d); })
      .catch(() => {})
      .finally(() => setCausalLoading(false));
  }, [causalIntervention]);

  // Static Fallbacks / Constants
  const defaultHotspots = [
    { count: 18, category: 'Water Supply', ward: 'Ward 12', location: 'Near Sector B', trend: 'rising', severity: 'high' },
    { count: 12, category: 'Drainage Issue', ward: 'Ward 7', location: 'Main Market Road', trend: 'stable', severity: 'medium' },
    { count: 24, category: 'Garbage Collection', ward: 'Ward 22', location: 'Slum Area 2', trend: 'rising', severity: 'critical' },
  ];
  const defaultPredictions = [
    { category: 'Heavy Rain/Waterlogging', area: 'Ward 14', probability: 82, timeframe: 'next 12h' },
  ];

  const trends = useMemo(() => getTrendInsights(), []);
  const [actionModal, setActionModal] = useState<{ title: string; message: string; ward?: string } | null>(null);
  const [wardMap,     setWardMap]     = useState<number | null>(null);
  const [snackbar,    setSnackbar]    = useState<SnackbarState | null>(null);
  const snackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSnackbar = useCallback((message: string, type: 'success' | 'info' = 'success') => {
    if (snackTimerRef.current) clearTimeout(snackTimerRef.current);
    setSnackbar({ message, type });
    snackTimerRef.current = setTimeout(() => setSnackbar(null), 3500);
  }, []);

  const openActionModal = useCallback((title: string, message: string, ward?: string) => {
    setActionModal({ title, message, ward });
  }, []);

  const handleWardDispatch = useCallback((wardIdx: number) => {
    setWardMap(null);
    setTimeout(() => showSnackbar(`✅ Dispatch order sent for Ward ${wardIdx + 1} — team en route`, 'success'), 150);
  }, [showSnackbar]);

  const handleWardBroadcast = useCallback((wardIdx: number) => {
    setWardMap(null);
    setTimeout(() => {
      openActionModal(
        `Broadcast — Ward ${wardIdx + 1}`,
        `⚠️ Citizens of Ward ${wardIdx + 1}: Municipal alert issued. Team is being mobilized to resolve the reported issues. Stay updated via Bharat Setu.`,
        `Ward ${wardIdx + 1}`
      );
    }, 150);
  }, [openActionModal]);

  return (
    <>
      {/* ─── Main scrollable content ─── */}
      <div className="flex flex-col h-full text-slate-900 dark:text-white overflow-y-auto pb-6 no-scrollbar">
        <div className="p-4 space-y-4">

          {/* GREETING */}
          <div className="bg-gradient-to-r from-[#138808]/10 via-[#138808]/5 to-transparent dark:from-[#138808]/15 dark:via-[#138808]/5 rounded-2xl p-4 border border-[#138808]/15">
            <p className="text-[10px] text-[#138808] font-bold uppercase tracking-widest mb-1">{getGreeting()}</p>
            <h2 className="text-lg font-black leading-tight">{citizenProfile?.name || 'District Magistrate'}</h2>
            <p className="text-[10px] text-slate-500 dark:text-gray-400 mt-1">{citizenProfile?.district || 'Lucknow'} District · Government Panel</p>
            <div className="flex gap-2 mt-3">
              <div className="px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20">
                <span className="text-[9px] font-black text-red-500">{criticalCases} Critical</span>
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <span className="text-[9px] font-black text-amber-500">{pendingCases} Pending</span>
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-green-500/10 border border-green-500/20">
                <span className="text-[9px] font-bold text-green-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> LIVE
                </span>
              </div>
            </div>
          </div>

          {/* DAILY BRIEFING */}
          <div className="bg-white dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-2xl p-4 shadow-sm dark:shadow-none">
            <h4 className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px] text-[#FF9933]">summarize</span>
              Daily Briefing
            </h4>
            <div className="space-y-2">
              {[
                { text: 'Ward 12 drainage issue escalated — Sub-Inspector deployed', icon: 'priority_high', color: '#EF4444' },
                { text: 'PM-KISAN installment for 1,240 farmers processed today',    icon: 'agriculture',   color: '#FF9933' },
                { text: 'SOS trigger from Ward 14 — Police response dispatched',      icon: 'emergency',     color: '#EF4444' },
                { text: '87% resolution rate maintained — above state average',       icon: 'trending_up',   color: '#10B981' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-[14px] mt-0.5" style={{ color: item.color }}>{item.icon}</span>
                  <p className="text-[11px] leading-snug">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* QUICK ACTIONS */}
          <div className="bg-white dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-2xl p-4 shadow-sm dark:shadow-none">
            <h4 className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px] text-[#138808]">bolt</span>
              Quick Actions
            </h4>
            <div className="grid grid-cols-4 gap-2">
              {QUICK_ACTIONS.map((action, i) => (
                <button
                  key={i}
                  onClick={() => openActionModal(action.label, action.msg)}
                  className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-all active:scale-95"
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: action.color + '18' }}>
                    <span className="material-symbols-outlined text-lg" style={{ color: action.color }}>{action.icon}</span>
                  </div>
                  <span className="text-[8px] font-bold text-slate-600 dark:text-gray-300 text-center leading-tight">{action.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* KPI GRID */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Pending',      value: '5',     icon: 'pending_actions',     color: '#F59E0B' },
              { label: 'Critical',     value: '2',     icon: 'priority_high',       color: '#EF4444' },
              { label: 'Resolved',     value: '186',   icon: 'task_alt',            color: '#10B981' },
              { label: 'Citizens',     value: '1,247', icon: 'groups',              color: '#3B82F6' },
              { label: 'Resolution',   value: '87%',   icon: 'trending_up',         color: '#138808' },
              { label: 'Satisfaction', value: '4.2',   icon: 'sentiment_satisfied', color: '#8B5CF6' },
            ].map((kpi, i) => (
              <div key={i} className="bg-white dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-xl p-3 relative overflow-hidden shadow-sm dark:shadow-none">
                <div className="absolute top-0 right-0 w-10 h-10 rounded-full blur-2xl opacity-20" style={{ backgroundColor: kpi.color }} />
                <span className="material-symbols-outlined text-[14px]" style={{ color: kpi.color }}>{kpi.icon}</span>
                <p className="text-xl font-black mt-0.5">{kpi.value}</p>
                <p className="text-[8px] text-slate-400 dark:text-gray-500 font-bold uppercase">{kpi.label}</p>
              </div>
            ))}
          </div>

          {/* WARD HEATMAP */}
          <div className="bg-white dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-2xl p-4 shadow-sm dark:shadow-none">
            <h4 className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px] text-[#FF9933]">map</span>
              Ward Grievance Heatmap
              <span className="ml-auto text-[8px] text-slate-400 dark:text-gray-500 font-medium normal-case">Tap to view live map</span>
            </h4>
            <p className="text-[9px] text-slate-400 dark:text-gray-500 mb-3">Tap any ward to open a live street map with georeferenced grievance pins</p>
            <div className="grid grid-cols-6 gap-1.5">
              {Array.from({ length: 24 }, (_, i) => {
                const c = wardColor(WARD_INTENSITIES[i]);
                return (
                  <button
                    key={i}
                    onClick={() => setWardMap(i)}
                    className="aspect-square rounded-lg flex items-center justify-center text-[8px] font-black border transition-all active:scale-90 hover:scale-105 hover:shadow-md"
                    style={{
                      backgroundColor: c.bg,
                      color: c.text,
                      borderColor: c.border + '50',
                    }}
                  >
                    W{i + 1}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-center gap-3 mt-2.5">
              {[
                { label: 'Low',    bg: '#10B98118', text: '#067A53', border: '#10B98140' },
                { label: 'Medium', bg: '#F59E0B18', text: '#92611C', border: '#F59E0B40' },
                { label: 'High',   bg: '#EF444420', text: '#C01C1C', border: '#EF444440' },
              ].map(s => (
                <span key={s.label} className="flex items-center gap-1 text-[8px] font-bold" style={{ color: s.text }}>
                  <span className="w-3 h-3 rounded" style={{ background: s.bg, border: `1px solid ${s.border}` }}/>
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          {/* REVENUE & BUDGET */}
          <div className="bg-white dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-2xl p-4 shadow-sm dark:shadow-none">
            <h4 className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px] text-[#3B82F6]">account_balance_wallet</span>
              Revenue &amp; Budget
            </h4>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-[#138808]/5 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-[#138808]">₹1.2Cr</p>
                <p className="text-[8px] text-slate-400 dark:text-gray-500 font-bold">Revenue Collected</p>
              </div>
              <div className="bg-[#3B82F6]/5 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-[#3B82F6]">₹1.08Cr</p>
                <p className="text-[8px] text-slate-400 dark:text-gray-500 font-bold">Budget Utilized</p>
              </div>
            </div>
            {[
              { dept: 'Infrastructure',  allocated: 45, spent: 31 },
              { dept: 'Sanitation',      allocated: 28, spent: 22 },
              { dept: 'Health Services', allocated: 35, spent: 12 },
              { dept: 'Education',       allocated: 22, spent: 18 },
            ].map((b, i) => (
              <div key={i} className="mb-2.5 last:mb-0">
                <div className="flex justify-between mb-0.5">
                  <span className="text-[10px] font-bold">{b.dept}</span>
                  <span className="text-[9px] text-slate-400 dark:text-gray-500">₹{b.spent}L / ₹{b.allocated}L</span>
                </div>
                <div className="h-1.5 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#138808] to-[#10B981]" style={{ width: `${(b.spent / b.allocated) * 100}%` }}/>
                </div>
              </div>
            ))}
          </div>

          {/* CIVIC INTELLIGENCE */}
          <div className="bg-gradient-to-br from-[#8B5CF6]/5 to-[#8B5CF6]/10 border border-[#8B5CF6]/15 rounded-2xl p-4">
            <h4 className="text-[10px] font-bold text-[#8B5CF6] uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px]">psychology</span>
              Civic Intelligence Insights
              <span className="ml-auto text-[8px] font-bold text-green-500 flex items-center gap-1 bg-green-500/10 px-1.5 py-0.5 rounded-full">
                <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse"/> AI
              </span>
            </h4>
            <div className="space-y-2 mb-3">
              {(hotspots.length > 0 ? hotspots : defaultHotspots).slice(0, 3).map((h: any, i: number) => (
                <div key={i} className="p-2.5 rounded-xl bg-white/50 dark:bg-white/[0.03] border border-black/5 dark:border-white/5">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className={`text-sm font-black ${
                      h.severity === 'critical' ? 'text-red-500' : h.severity === 'high' ? 'text-orange-500' : 'text-amber-500'
                    }`}>{h.count}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold truncate">{h.category} — {h.ward}</p>
                      <p className="text-[8px] text-slate-500 dark:text-gray-400">{h.location} · {h.trend === 'rising' ? '↑ Rising' : h.trend === 'declining' ? '↓ Declining' : '→ Stable'}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openActionModal(
                        `Broadcast — ${h.ward}`,
                        `⚠️ ${h.count} ${h.category} complaints rising in ${h.ward}. Municipal authorities alerted and teams being mobilized.`,
                        h.ward
                      )}
                      className="flex-1 py-1.5 rounded-lg text-[9px] font-bold bg-[#138808]/10 text-[#138808] border border-[#138808]/20 hover:bg-[#138808]/20 transition-colors flex items-center justify-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[11px]">campaign</span>
                      Broadcast
                    </button>
                    <button
                      onClick={() => showSnackbar(`✅ Dispatch order sent to dept. for ${h.ward}`, 'success')}
                      className="flex-1 py-1.5 rounded-lg text-[9px] font-bold bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/20 hover:bg-[#3B82F6]/20 transition-colors flex items-center justify-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[11px]">local_shipping</span>
                      Dispatch
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* AI Prediction */}
            {(() => {
              const p: any | undefined = predictions.length > 0 ? predictions[0] : defaultPredictions[0];
              return p ? (
                <div className="p-2.5 rounded-xl bg-red-500/5 border border-red-500/15">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="material-symbols-outlined text-lg text-red-500">warning</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold">⚡ Prediction: {p.category} — {p.area}</p>
                      <p className="text-[8px] text-slate-500 dark:text-gray-400">{p.probability}% likelihood in {p.timeframe}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openActionModal(
                        'Broadcast Warning',
                        `⚡ Predicted ${p.category} risk in ${p.area} — ${p.probability}% likelihood. Residents advised to take precautionary measures immediately.`,
                        p.area
                      )}
                      className="flex-1 py-1.5 rounded-lg text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 transition-colors flex items-center justify-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[11px]">campaign</span>
                      Broadcast Warning
                    </button>
                    <button
                      onClick={() => showSnackbar('📨 Escalated to State HQ successfully', 'success')}
                      className="flex-1 py-1.5 rounded-lg text-[9px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20 transition-colors flex items-center justify-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[11px]">arrow_upward</span>
                      Escalate to State
                    </button>
                  </div>
                </div>
              ) : null;
            })()}
          </div>

          {/* ═══ CAUSAL AI INTERVENTION SIMULATOR ═══ */}
          <div className="bg-gradient-to-br from-[#06B6D4]/5 to-[#3B82F6]/10 border border-[#06B6D4]/15 rounded-2xl p-4">
            <h4 className="text-[10px] font-bold text-[#06B6D4] uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px]">account_tree</span>
              Causal AI Engine
              <span className="ml-auto text-[8px] font-bold text-cyan-500 bg-cyan-500/10 px-1.5 py-0.5 rounded-full">SCM</span>
            </h4>
            <p className="text-[9px] text-slate-500 dark:text-gray-400 mb-3">Structural Causal Model — see what happens downstream if you fix a root cause:</p>
            <select
              value={causalIntervention}
              onChange={e => setCausalIntervention(e.target.value)}
              className="w-full bg-slate-100 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-700 dark:text-gray-200 focus:outline-none mb-3"
            >
              {['drainage','waterlogging','garbage','power_failure','road_damage','water_supply','mosquito'].map(opt => (
                <option key={opt} value={opt}>{opt.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
              ))}
            </select>
            {causalLoading ? (
              <div className="flex items-center justify-center py-4 gap-2">
                <span className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px] text-slate-500">Running do-calculus...</span>
              </div>
            ) : causalResults?.downstreamEffects?.length > 0 ? (
              <div className="space-y-1.5">
                {causalResults.downstreamEffects.slice(0, 5).map((e: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-white/50 dark:bg-white/[0.02] border border-black/5 dark:border-white/5">
                    <span className="material-symbols-outlined text-[14px]" style={{ color: e.color }}>{e.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold truncate">{e.label}</p>
                      <p className="text-[8px] text-slate-400 truncate">{e.mechanism}</p>
                    </div>
                    <span className="text-[11px] font-black text-green-500">-{e.reductionPct}%</span>
                  </div>
                ))}
                <p className="text-[8px] text-cyan-600 dark:text-cyan-400 font-bold text-center mt-1">
                  Fixing "{causalResults.intervention?.label}" → avg {causalResults.summary?.avgReduction}% downstream reduction
                </p>
              </div>
            ) : (
              <p className="text-[9px] text-slate-400 text-center py-3">No downstream effects found.</p>
            )}
          </div>

          {/* ═══ ANOMALY RADAR ═══ */}
          {anomalyData && (
            <div className="bg-gradient-to-br from-[#EF4444]/5 to-[#F59E0B]/10 border border-[#EF4444]/15 rounded-2xl p-4">
              <h4 className="text-[10px] font-bold text-[#EF4444] uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px] animate-pulse">radar</span>
                Anomaly Radar
                <span className={`ml-auto text-[8px] font-black px-1.5 py-0.5 rounded-full ${
                  anomalyData.summary?.overallRiskLevel === 'HIGH' ? 'bg-red-500/20 text-red-500' :
                  anomalyData.summary?.overallRiskLevel === 'ELEVATED' ? 'bg-amber-500/20 text-amber-500' :
                  'bg-green-500/20 text-green-500'
                }`}>{anomalyData.summary?.overallRiskLevel}</span>
              </h4>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center p-2 rounded-xl bg-red-500/10 border border-red-500/20">
                  <p className="text-lg font-black text-red-500">{anomalyData.summary?.criticalWards}</p>
                  <p className="text-[8px] text-slate-400 font-bold">CRITICAL</p>
                </div>
                <div className="text-center p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <p className="text-lg font-black text-amber-500">{anomalyData.summary?.warningWards}</p>
                  <p className="text-[8px] text-slate-400 font-bold">WARNING</p>
                </div>
                <div className="text-center p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <p className="text-lg font-black text-blue-500">{anomalyData.summary?.anomalousHours}</p>
                  <p className="text-[8px] text-slate-400 font-bold">TIME ANOMALIES</p>
                </div>
              </div>
              <div className="space-y-1.5">
                {anomalyData.wardAnomalies?.filter((w: any) => w.severity !== 'normal').slice(0, 4).map((w: any, i: number) => (
                  <div key={i} className={`flex items-center gap-2 p-2 rounded-lg border ${
                    w.severity === 'critical' ? 'bg-red-500/5 border-red-500/20' : 'bg-amber-500/5 border-amber-500/20'
                  }`}>
                    <span className={`material-symbols-outlined text-sm ${
                      w.severity === 'critical' ? 'text-red-500 animate-pulse' : 'text-amber-500'
                    }`}>warning</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold">{w.ward} — Z={w.zScore}σ</p>
                      <p className="text-[8px] text-slate-400 truncate">{w.interpretation}</p>
                    </div>
                    <span className="text-[10px] font-black" style={{ color: w.severity === 'critical' ? '#EF4444' : '#F59E0B' }}>{w.currentRate} cases</span>
                  </div>
                ))}
              </div>
              <p className="text-[8px] text-slate-400 mt-2 text-center">Algorithm: Z-Score + Grubbs&apos; Test (α=0.05, 30-day window)</p>
            </div>
          )}

          {/* ═══ SURGE FORECAST (Spatio-Temporal) ═══ */}
          {surgeData?.surgeAlerts?.length > 0 && (
            <div className="bg-gradient-to-br from-[#F59E0B]/5 to-[#FF9933]/10 border border-[#F59E0B]/15 rounded-2xl p-4">
              <h4 className="text-[10px] font-bold text-[#F59E0B] uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px]">speed</span>
                Surge Forecast (6h)
                <span className="ml-auto text-[8px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full">Holt-Winters+Moran</span>
              </h4>
              <div className="space-y-1.5">
                {surgeData.surgeAlerts.slice(0, 4).map((s: any, i: number) => (
                  <div key={i} className={`flex items-center gap-2 p-2 rounded-lg border ${
                    s.category === 'critical' ? 'bg-red-500/5 border-red-500/20' :
                    s.category === 'high' ? 'bg-orange-500/5 border-orange-500/20' :
                    'bg-amber-500/5 border-amber-500/20'
                  }`}>
                    <span className={`material-symbols-outlined text-sm ${
                      s.category === 'critical' ? 'text-red-500' : s.category === 'high' ? 'text-orange-500' : 'text-amber-500'
                    }`}>trending_up</span>
                    <div className="flex-1">
                      <p className="text-[10px] font-bold">Ward {s.ward} — Surge {Math.round(s.surgeScore * 100)}%</p>
                      <p className="text-[8px] text-slate-400">Predicted: {s.predicted} cases (avg: {s.historical_avg})</p>
                    </div>
                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                      s.category === 'critical' ? 'bg-red-500/20 text-red-500' :
                      s.category === 'high' ? 'bg-orange-500/20 text-orange-500' :
                      'bg-amber-500/20 text-amber-500'
                    }`}>{s.category}</span>
                  </div>
                ))}
              </div>
              {surgeData.spatialStats && (
                <p className="text-[8px] text-slate-400 mt-2 text-center">
                  Moran&apos;s I = {surgeData.spatialStats.moransI} — {surgeData.spatialStats.interpretation}
                </p>
              )}
            </div>
          )}

          {/* RECENT ACTIVITY */}
          <div className="bg-white dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-2xl p-4 shadow-sm dark:shadow-none">
            <h4 className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px] text-[#8B5CF6]">history</span>
              Recent Activity
            </h4>
            <div className="space-y-0">
              {[
                { text: 'Water supply issue in Ward 19 marked resolved', time: '10 min ago', icon: 'check_circle', color: '#10B981' },
                { text: 'New SOS alert received from Ward 14',            time: '25 min ago', icon: 'emergency',    color: '#EF4444' },
                { text: 'PM-KISAN installment processed for 1,240 farmers',time:'1 hour ago', icon: 'agriculture',  color: '#FF9933' },
                { text: 'Budget ₹5L approved for Ward 12 drainage',        time: '2 hours ago',icon: 'payments',    color: '#3B82F6' },
                { text: 'Broadcast: Road closure alert NH-44',              time: '4 hours ago',icon: 'campaign',    color: '#8B5CF6' },
              ].map((item, i) => (
                <div key={i} className="flex gap-3 py-2.5 border-b border-black/5 dark:border-white/5 last:border-0">
                  <div className="flex flex-col items-center">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: item.color + '15' }}>
                      <span className="material-symbols-outlined text-[12px]" style={{ color: item.color }}>{item.icon}</span>
                    </div>
                    {i < 4 && <div className="w-px flex-1 bg-black/5 dark:bg-white/5 mt-1"/>}
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold leading-snug">{item.text}</p>
                    <p className="text-[9px] text-slate-400 dark:text-gray-500">{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ─── PORTALS — all mounted via createPortal in document.body ─── */}
      {wardMap !== null && (
        <WardMapOverlay
          wardIdx={wardMap}
          onClose={() => setWardMap(null)}
          onDispatch={handleWardDispatch}
          onBroadcast={handleWardBroadcast}
        />
      )}

      {actionModal && (
        <ActionModal
          title={actionModal.title}
          message={actionModal.message}
          ward={actionModal.ward}
          onClose={() => setActionModal(null)}
        />
      )}

      {snackbar && <Snackbar message={snackbar.message} type={snackbar.type} />}
    </>
  );
}
