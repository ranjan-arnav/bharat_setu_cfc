'use client';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef } from 'react';
import { FlagStripe } from '@/components/ui/GoiElements';
import { useAppStore } from '@/lib/store';
import { translateText } from '@/app/actions/gemini-ai';
import { useTTS } from '@/hooks/useTTS';

// ── Types ─────────────────────────────────────────────────────────────
type StepStatus = 'done' | 'active' | 'pending';

interface TimelineStep {
  id: string;
  label: string;
  sublabel: string;
  date?: string;
  status: StepStatus;
  badge?: string;
}

interface Application {
  id: string;
  refId: string;
  title: string;
  amount: string;
  filedVia: string;
  category: string;
  eta: string;
  daysLeft: number;
  progress: number;
  officer: string;
  officerRole: string;
  avgDays: string;
  isStuck: boolean;
  steps: TimelineStep[];
}

// ── Data ──────────────────────────────────────────────────────────────
const APPS: Application[] = [
  {
    id: 'pmfby',
    refId: '#PMFBY-2026-DUM-4521',
    title: 'PMFBY Crop Insurance',
    amount: '₹25,000',
    filedVia: 'Yojana Saathi',
    category: 'Agriculture',
    eta: '4–5 Mar 2026',
    daysLeft: 3,
    progress: 65,
    officer: 'R.K. Singh',
    officerRole: 'BDO – Agriculture Dept',
    avgDays: '2–3 days',
    isStuck: false,
    steps: [
      { id: 's1', label: 'Application Submitted', sublabel: 'Digital receipt generated', date: '28 Feb', status: 'done' },
      { id: 's2', label: 'Documents Verified', sublabel: 'Land records fetched via DIGIPIN', date: '1 Mar', status: 'done', badge: 'DIGIPIN' },
      { id: 's3', label: 'Forwarded to Block Office', sublabel: 'Received by BDO Desk', date: '1 Mar', status: 'done' },
      { id: 's4', label: 'Under Review', sublabel: 'Agriculture Dept — 2 days elapsed', status: 'active' },
      { id: 's5', label: 'Amount Sanctioned', sublabel: 'Pending review completion', status: 'pending' },
      { id: 's6', label: 'DBT to Bank A/C', sublabel: 'Final disbursement step', status: 'pending' },
    ],
  },
  {
    id: 'pmawas',
    refId: '#PMAY-2026-RUR-8812',
    title: 'PM Awas Yojana',
    amount: '₹1,20,000',
    filedVia: 'Nagarik Mitra',
    category: 'Housing',
    eta: '15 Apr 2026',
    daysLeft: 24,
    progress: 30,
    officer: 'S. Mehta',
    officerRole: 'Tehsildar – Revenue Dept',
    avgDays: '3–5 days',
    isStuck: true,
    steps: [
      { id: 's1', label: 'Application Submitted', sublabel: 'Reference number issued', date: '10 Feb', status: 'done' },
      { id: 's2', label: 'BPL Verification', sublabel: 'Ration card check pending', status: 'active' },
      { id: 's3', label: 'Field Inspection', sublabel: 'Site visit by BDO', status: 'pending' },
      { id: 's4', label: 'Sanction Order', sublabel: 'District-level approval', status: 'pending' },
      { id: 's5', label: 'First Instalment', sublabel: '₹40,000 via DBT', status: 'pending' },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────
function StepDot({ status }: { status: StepStatus }) {
  if (status === 'done')
    return (
      <div className="size-8 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/25 border-2 border-white dark:border-[#0a1628]">
        <span className="material-symbols-outlined text-sm font-bold text-white">check</span>
      </div>
    );
  if (status === 'active')
    return (
      <div className="size-8 relative flex items-center justify-center shrink-0 rounded-full bg-orange-500 border-2 border-white dark:border-[#0a1628]">
        <span className="absolute inset-0 rounded-full border-2 border-orange-500 animate-ping opacity-60" />
        <span className="material-symbols-outlined text-sm font-bold text-white">pending</span>
      </div>
    );
  return (
    <div className="size-8 rounded-full bg-black/5 dark:bg-white/5 border-2 border-black/10 dark:border-white/10 shrink-0" />
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 60 ? '#10b981' : pct >= 30 ? '#f59e0b' : '#ef4444';
  return (
    <svg width="56" height="56" className="-rotate-90">
      <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-black/10 dark:text-white/10" />
      <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
    </svg>
  );
}

// ── Main ──────────────────────────────────────────────────────────────
export default function BureaucracyXRay({ onClose }: { onClose?: () => void }) {
  const { t, lang } = useTranslation();
  const { setActiveAgent, setOverlay } = useAppStore();
  const [activeId, setActiveId] = useState(APPS[0].id);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [nudgeSent, setNudgeSent] = useState(false);
  
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatedAppId, setTranslatedAppId] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const { isPlaying, playTTS } = useTTS(lang);

  const getBaseSummary = (appId: string) => {
    return appId === 'pmfby' 
      ? 'The agricultural officer is currently reviewing your crop insurance claim at the Block Office. It has been there for two days, and is expected to complete by March 5th.'
      : 'Your housing application appears to be stuck. The background BPL verification is still pending. Please escalate this if it exceeds forty-eight hours.';
  };

  async function handleTranslate() {
    if (translatedAppId === activeId) return;
    setIsTranslating(true);
    
    const baseText = getBaseSummary(activeId);
    let translatedText = baseText;

    if (lang !== 'en') {
      try {
        translatedText = await translateText(baseText, lang);
      } catch (err) {
        console.error('Translation failed', err);
        // Fallback
        translatedText = lang === 'hi' 
          ? (activeId === 'pmfby' ? 'कृषि अधिकारी वर्तमान में ब्लॉक कार्यालय में आपके फसल बीमा दावे की समीक्षा कर रहे हैं।' : 'आपका आवास आवेदन अटका हुआ प्रतीत होता है। बीपीएल सत्यापन अभी भी लंबित है।') 
          : baseText;
      }
    }
    
    setAiSummary(translatedText);
    setTranslatedAppId(activeId);
    setIsTranslating(false);
  }

  const app = APPS.find(a => a.id === activeId) ?? APPS[0];

  const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

  const [isXrayLoading, setIsXrayLoading] = useState(false);
  const [xrayResult, setXrayResult] = useState<any>(null);

  const handleXRay = async () => {
    setIsXrayLoading(true);
    try {
      const res = await fetch('/api/ml/knowledge-graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `Analyze application ${app.title} for bottlenecks`
        })
      });
      if (res.ok) {
        const data = await res.json();
        setXrayResult(data);
      }
    } catch (e) {
      console.error("X-Ray failed", e);
    } finally {
      setIsXrayLoading(false);
    }
  };

  function handleNudge() {
    setNudgeSent(true);
    setTimeout(() => setNudgeSent(false), 3000);
  }

  const [isDownloading, setIsDownloading] = useState(false);
  const [reportDate, setReportDate] = useState<string>('');
  const [showRTIModal, setShowRTIModal] = useState(false);
  const [showCPGRAMSModal, setShowCPGRAMSModal] = useState(false);

  async function handleDownload(app: Application) {
    if (isDownloading) return;
    setIsDownloading(true);
    // Set the EXACT current generation time in state so the PDF renders with current time
    const now = new Date().toLocaleString('en-US', { 
      year: 'numeric', month: 'short', day: 'numeric', 
      hour: '2-digit', minute: '2-digit', second: '2-digit' 
    });
    setReportDate(now);

    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      // Wait a tick for the reportDate state to flush
      await new Promise(resolve => setTimeout(resolve, 50));

      const el = document.getElementById('bureaucracy-report-container');
      if (!el) return;

      const canvas = await html2canvas(el, { 
        scale: 2, 
        useCORS: true, 
        windowWidth: 1120,
        allowTaint: true,
      });

      const imgData = canvas.toDataURL('image/png');
      
      // Calculate dimensions in mm
      const pdfWidth = 210; // A4 width in mm
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      // Create PDF with custom height to perfectly fit the content without scaling/margins
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: [pdfWidth, pdfHeight]
      });
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Bharat_Setu_Receipt_${app.refId}.pdf`);
    } catch (err) {
      console.error('Download failed', err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  }

  function handleShare(app: Application) {
    const text = `📢 Bharat Setu Application Update

📝 Application: ${app.title}
🆔 Ref ID: ${app.refId}
📊 Status: ${app.steps.filter(s => s.status === 'done' || s.status === 'active').pop()?.label || 'Pending'}
⏳ ETA: ${app.eta} (${app.daysLeft} days left)
👨‍💼 Assigned Officer: ${app.officer} (${app.officerRole})

Track seamlessly with Bharat Setu! 🇮🇳
#BharatSetu #DigitalIndia`;
    if (navigator.share) {
      navigator.share({
        title: 'Bharat Setu Application Status',
        text,
        // Removed url to avoid localhost append
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(text);
      alert('Status copied to clipboard!');
    }
  }

  function handleRTI() {
    setShowRTIModal(true);
  }

  function handleCPGRAMS() {
    setShowCPGRAMSModal(true);
  }

  function handleCall() {
    window.location.href = 'tel:1800111555';
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 dark:bg-[#0a1628] flex flex-col max-w-[430px] mx-auto" style={{ animation: 'slideUp 0.3s ease-out' }}>
      <FlagStripe />

      {/* ── Header ── */}
      <div className="px-4 py-3 bg-white/95 dark:bg-[#0f1f3a]/95 backdrop-blur-xl border-b border-black/10 dark:border-white/10">
        {/* Row 1: back + title + live badge */}
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] active:scale-[0.98]">
            <span className="material-symbols-outlined text-slate-500 dark:text-gray-400">arrow_back</span>
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              {t('schemeTracker', 'Scheme Tracker')}
              <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400">
                TRACK
              </span>
            </h2>
            <span className="text-[10px] text-slate-500 dark:text-gray-400">
              {APPS.length} active application{APPS.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="bg-black/5 dark:bg-white/5 px-2 py-1 rounded-lg border border-black/10 dark:border-white/10">
            <span className="text-[9px] text-green-400 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              LIVE
            </span>
          </div>
        </div>

        {/* Row 2: app switcher pills */}
        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
          {APPS.map(a => (
            <button key={a.id} onClick={() => setActiveId(a.id)}
              className={`min-h-10 px-4 rounded-2xl text-[13px] font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                a.id === activeId
                  ? 'bg-[#FF9933] text-slate-900 shadow-sm border border-black/10'
                  : 'bg-black/5 dark:bg-white/5 text-slate-500 dark:text-gray-300 active:scale-[0.98] border border-transparent'
              }`}>
              {a.isStuck && <span className="size-2 rounded-full bg-red-500 animate-pulse shrink-0" />}
              {a.title.split(' ').slice(0, 2).join(' ')}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable Content ── */}
      <div className="flex-1 overflow-y-auto p-4 pb-20 space-y-4 no-scrollbar">

        {/* Stuck Banner */}
        <AnimatePresence>
          {app.isStuck && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-2 bg-red-500 text-white px-4 py-2.5 rounded-2xl text-sm font-bold shadow-lg">
              <span className="material-symbols-outlined text-base animate-pulse">warning</span>
              Stuck for 48+ hours — action required
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hero Card */}
        <motion.div key={app.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border mb-2 text-green-700 bg-[#138808]/10 border-[#138808]/20">
                <span className="material-symbols-outlined text-[11px]">category</span>
                {app.category}
              </span>
              <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">{app.title}</h3>
              <p className="font-mono text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">{app.refId}</p>
            </div>
            <div className="shrink-0 flex flex-col items-center">
              <div className="relative">
                <ProgressRing pct={app.progress} />
                <span className="absolute inset-0 flex items-center justify-center text-[12px] font-black text-slate-900 dark:text-white">{app.progress}%</span>
              </div>
              <span className="text-[9px] font-bold text-slate-400 mt-0.5 uppercase">Progress</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-[#138808]/8 border border-[#138808]/20 rounded-xl px-3 py-2.5 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#138808] font-light text-lg">currency_rupee</span>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Claim Amount</p>
                <p className="text-base font-black text-slate-900 dark:text-white leading-tight">{app.amount}</p>
              </div>
            </div>
            <div className={`rounded-xl px-3 py-2.5 flex items-center gap-2 border ${app.daysLeft <= 5 ? 'bg-[#FF9933]/8 border-[#FF9933]/20' : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10'}`}>
              <span className={`material-symbols-outlined font-light text-lg ${app.daysLeft <= 5 ? 'text-[#FF9933]' : 'text-slate-400'}`}>schedule</span>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">ETA</p>
                <p className="text-sm font-black text-slate-900 dark:text-white leading-tight">{app.eta}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-gray-400">
            <span className="material-symbols-outlined text-sm text-[#138808] font-normal">verified_user</span>
            Filed via <span className="text-[#FF9933] font-bold ml-1">{app.filedVia}</span>
          </div>
        </motion.div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: 'notifications_active', label: 'Nudge\nOfficer', style: 'text-blue-600 bg-blue-500/10 border-blue-500/20', action: handleNudge },
            { 
              icon: isXrayLoading ? 'hourglass_empty' : 'psychology', 
              label: isXrayLoading ? 'Analyzing...' : 'AI X-Ray\n(City Brain)', 
              style: 'text-amber-600 bg-amber-500/10 border-amber-500/20 shadow-inner', 
              action: handleXRay 
            },
            { icon: isDownloading ? 'hourglass_empty' : 'download', label: isDownloading ? 'Generating\nReceipt' : 'Download\nReceipt', style: 'text-[#138808] bg-[#138808]/10 border-[#138808]/20', action: () => handleDownload(app) },
          ].map(btn => (
            <button key={btn.label} onClick={btn.action}
              className={`flex flex-col items-center gap-1.5 py-3.5 rounded-2xl border active:scale-95 transition-transform ${btn.style}`}>
              <span className={`material-symbols-outlined text-2xl font-light`}>{btn.icon}</span>
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 text-center leading-tight whitespace-pre-line">{btn.label}</span>
            </button>
          ))}
        </div>

        {/* Nudge toast */}
        <AnimatePresence>
          {nudgeSent && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-2 bg-blue-500 text-white px-4 py-3 rounded-xl text-sm font-bold">
              <span className="material-symbols-outlined text-base">check_circle</span>
              Reminder sent to {app.officer}!
            </motion.div>
          )}
        </AnimatePresence>

        {/* Officer Card */}
        <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4 flex items-center gap-3">
          <div className="size-12 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white font-black text-base shrink-0">
            {app.officer.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 dark:text-white text-sm truncate">{app.officer}</p>
            <p className="text-[11px] text-slate-500 dark:text-gray-400 truncate mt-0.5">{app.officerRole}</p>
            <div className="flex items-center gap-1 mt-1.5">
              <span className="material-symbols-outlined text-[12px] text-[#FF9933]">schedule</span>
              <span className="text-[10px] font-bold text-slate-400">Avg: {app.avgDays}</span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1 shrink-0">
            <span className="size-2.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[9px] text-green-400 font-bold">Online</span>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4">
          <h4 className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[14px]">timeline</span>
            Journey Timeline
          </h4>

          <motion.div key={app.id} variants={stagger} initial="hidden" animate="show">
            {app.steps.map((step, idx) => (
              <motion.div key={step.id} variants={fadeUp}>
                <button onClick={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
                  className="w-full flex gap-3 text-left active:scale-[0.98] transition-transform min-h-12">
                  <div className="flex flex-col items-center">
                    <StepDot status={step.status} />
                    {idx < app.steps.length - 1 && (
                      <div className={`w-0.5 h-10 mt-0.5 ${
                        step.status === 'done' ? 'bg-emerald-400/40' :
                        step.status === 'active' ? 'bg-gradient-to-b from-orange-400/40 to-black/10 dark:to-white/5' :
                        'bg-black/10 dark:bg-white/5'
                      }`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pt-1 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-bold text-[13px] leading-snug ${
                        step.status === 'done' ? 'text-slate-900 dark:text-white' :
                        step.status === 'active' ? 'text-[#FF9933]' :
                        'text-slate-400 dark:text-gray-500'
                      }`}>{step.label}</span>
                      {step.date && (
                        <span className="text-[10px] text-slate-500 bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded font-medium">{step.date}</span>
                      )}
                      {step.badge && (
                        <span className="text-[10px] font-black text-blue-600 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">{step.badge}</span>
                      )}
                    </div>
                    <AnimatePresence>
                      {(expandedStep === step.id || step.status === 'active') && (
                        <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                          className="text-[11px] text-slate-500 dark:text-gray-400 mt-1 leading-snug">
                          {step.sublabel}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                  <span className={`material-symbols-outlined text-base text-slate-300 dark:text-gray-600 shrink-0 mt-1.5 transition-transform ${expandedStep === step.id ? 'rotate-180' : ''}`}>expand_more</span>
                </button>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* ETA strip */}
        <div className={`rounded-2xl border p-4 flex items-center gap-3 ${app.daysLeft <= 5 ? 'bg-[#FF9933]/8 border-[#FF9933]/20' : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10'}`}>
          <span className={`material-symbols-outlined text-2xl font-light ${app.daysLeft <= 5 ? 'text-[#FF9933]' : 'text-slate-400'}`}>event_upcoming</span>
          <div className="flex-1">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Expected Completion</p>
            <p className="font-black text-slate-900 dark:text-white">{app.eta}</p>
          </div>
          <span className={`text-[10px] font-black tracking-wider px-3 py-1.5 rounded-xl border ${app.daysLeft <= 5 ? 'text-[#FF9933] bg-[#FF9933]/10 border-[#FF9933]/20' : 'text-slate-500 bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10'}`}>
            {app.daysLeft}d left
          </span>
        </div>

        {/* Escalate */}
        <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl overflow-hidden">
          <button onClick={() => setEscalateOpen(!escalateOpen)}
            className="w-full flex items-center gap-3 p-4 active:bg-black/5 dark:active:bg-white/5 transition-colors">
            <div className="size-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-red-500 font-light">escalator_warning</span>
            </div>
            <div className="flex-1 text-left">
              <p className="font-bold text-red-600 dark:text-red-400 text-[13px]">Application stuck?</p>
              <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">Escalate via RTI or CPGRAMS</p>
            </div>
            <span className={`material-symbols-outlined text-slate-400 transition-transform duration-200 ${escalateOpen ? 'rotate-180' : ''}`}>expand_more</span>
          </button>
          <AnimatePresence>
            {escalateOpen && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                <div className="px-4 pb-4 space-y-2">
                  <p className="text-[11px] text-slate-500 dark:text-gray-400 leading-relaxed">
                    Stuck for over 48 hours? Escalate through any channel below.
                  </p>
                  {[
                    { label: 'File RTI Application', icon: 'description', color: 'bg-blue-600', sub: 'Via Yojana Saathi', action: handleRTI },
                    { label: 'CPGRAMS Complaint', icon: 'support_agent', color: 'bg-[#8B5CF6]', sub: 'Via Yojana Saathi', action: handleCPGRAMS },
                    { label: 'Call Helpline 1800', icon: 'call', color: 'bg-[#1b8844]', sub: 'Toll-free 24x7', action: handleCall },
                  ].map((btn) => (
                    <button key={btn.label} onClick={btn.action}
                      className={`w-full flex items-center gap-3 ${btn.color} text-white py-3.5 px-4 rounded-xl active:scale-[0.98] transition-transform`}>
                      <span className="material-symbols-outlined font-light">{btn.icon}</span>
                      <div className="text-left">
                        <p className="font-bold text-[13px] leading-tight">{btn.label}</p>
                        <p className="text-[10px] opacity-75 mt-0.5">{btn.sub}</p>
                      </div>
                      <span className="material-symbols-outlined ml-auto opacity-60">chevron_right</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* AI Native Language Summary Insight */}
        <div className="rounded-2xl border border-[#FF9933]/40 bg-gradient-to-br from-[#FF9933]/15 to-[#138808]/15 p-4 relative overflow-hidden">
          {isTranslating && (
            <div className="absolute inset-0 bg-white/50 dark:bg-black/50 backdrop-blur-sm z-10 flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[#FF9933] animate-spin">sync</span>
              <span className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">Generating Native Flow...</span>
            </div>
          )}
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[#FF9933] text-[24px] mt-0.5">neurology</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-[12px] font-black uppercase tracking-wider text-slate-900 dark:text-white">AI Bilingual Journey Summary</h4>
                <button 
                  onClick={handleTranslate}
                  disabled={isTranslating || translatedAppId === activeId}
                  className="bg-[#FF9933]/20 hover:bg-[#FF9933]/30 text-[#FF9933] border border-[#FF9933]/30 px-2 py-1 rounded text-[10px] uppercase font-bold transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[12px]">translate</span>
                  {translatedAppId === activeId ? 'Translated' : 'Parse Native'}
                </button>
              </div>
              
              {translatedAppId === activeId ? (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mt-2 bg-black/5 dark:bg-white/5 p-3 rounded-xl border border-black/10 dark:border-white/10">
                  <p className="text-[13px] text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                    {aiSummary}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Translated to {lang.toUpperCase()}</span>
                    <button 
                      onClick={() => playTTS(aiSummary || '')}
                      className={`flex items-center gap-1 active:scale-95 ${isPlaying ? 'text-[#138808] animate-pulse' : 'text-[#FF9933]'}`}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {isPlaying ? 'graphic_eq' : 'volume_up'}
                      </span>
                      <span className="text-[10px] font-bold">{isPlaying ? 'Speaking...' : 'Listen'}</span>
                    </button>
                  </div>
                </motion.div>
              ) : (
                <p className="text-[12px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  Click 'Parse Native' to have AI summarize the journey timeline context into your preferred vernacular (Hindi/English). Current app typical processing time: {app.avgDays}.
                </p>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Hidden printable receipt structure initialized off-screen to prevent visual disruption */}
      <div id="bureaucracy-report-container" className="absolute left-[-9999px] top-0 w-[1120px] bg-white text-slate-800 p-0 pointer-events-none" style={{ fontFamily: 'sans-serif' }}>
        {/* Header matching original image */}
        <div className="bg-[#1b8844] text-white px-14 py-10 flex items-center gap-8">
          <div className="size-[120px] rounded-full bg-white flex items-center justify-center shrink-0 shadow-lg border-[6px] border-[#1b8844]/20 overflow-hidden relative">
            <img src="/logo.png" alt="Bharat Setu Logo" className="w-[85px] h-[85px] object-contain" onError={(e) => { e.currentTarget.style.display='none'; }} />
          </div>
          <div>
            <h1 className="text-[42px] font-bold mb-2 tracking-tight">Bharat Setu Official Report</h1>
            <p className="text-[15px] font-semibold tracking-widest text-white/95 uppercase">GOVERNMENT OF INDIA • {app.category.toUpperCase()} DESK</p>
          </div>
        </div>
        
        <div className="px-14 py-10">
          {/* Email Subject / Metadata area matching original */}
          <div className="mb-10 text-slate-700">
            <h2 className="text-[28px] mb-6 text-slate-600">Subject: <span className="font-semibold text-slate-800">Application Status Report: {app.title}</span></h2>
            <div className="space-y-3 text-[16px] text-slate-600 font-medium">
              <p>Generated on: {reportDate}</p>
              <p>Jurisdiction: {app.officerRole.split('–').pop()?.trim() || 'General Desk'}</p>
              <p>Reference ID: <span className="text-slate-900 font-bold">{app.refId}</span></p>
            </div>
          </div>
          
          <div className="border-t-[3px] border-slate-100 mb-10 pt-10">
            <h3 className="text-[28px] font-bold text-slate-800 mb-6 border-l-8 border-[#138808] pl-5">Application Details</h3>
            <div className="grid grid-cols-2 gap-x-12 gap-y-6 text-[18px]">
              <div className="flex justify-between border-b pb-2"><span className="text-slate-500 font-semibold tracking-wide">Scheme/Category</span><span className="font-extrabold text-slate-800">{app.category}</span></div>
              <div className="flex justify-between border-b pb-2"><span className="text-slate-500 font-semibold tracking-wide">Claim Amount</span><span className="font-extrabold text-slate-800 border bg-green-50 px-3 rounded-lg text-green-700">{app.amount}</span></div>
              <div className="flex justify-between border-b pb-2"><span className="text-slate-500 font-semibold tracking-wide">Filed Via</span><span className="font-extrabold text-slate-800">{app.filedVia}</span></div>
              <div className="flex justify-between border-b pb-2"><span className="text-slate-500 font-semibold tracking-wide">Assigned To</span><span className="font-extrabold text-slate-800 bg-blue-50 px-3 rounded-lg text-blue-800">{app.officer}</span></div>
            </div>
          </div>

          <h3 className="text-[28px] font-bold text-slate-800 mb-8 mt-12 border-l-8 border-[#138808] pl-5">Performance Overview</h3>
          <div className="grid grid-cols-2 gap-8 mb-12">
            {[
              { label: 'CURRENT PHASE', value: app.steps.filter(s => s.status === 'active' || s.status === 'done').pop()?.label || 'Pending', color: 'bg-blue-600' },
              { label: 'EXPECTED COMPLETION', value: app.eta, color: 'bg-emerald-500' },
              { label: 'AVERAGE RESOLUTION', value: app.avgDays, color: 'bg-purple-600' },
              { label: 'DAYS REMAINING', value: app.daysLeft.toString(), color: 'bg-red-500' },
            ].map(stat => (
              <div key={stat.label} className="border-[3px] border-slate-100 rounded-[24px] p-8 relative bg-slate-50 shadow-sm flex flex-col justify-center min-h-[140px]">
                <div className={`absolute left-0 top-0 bottom-0 w-3 ${stat.color} rounded-l-[18px]`}></div>
                <p className="text-sm font-black text-slate-400 mb-3 tracking-[0.15em] ml-2">{stat.label}</p>
                <p className="text-[40px] font-extrabold text-slate-900 leading-tight whitespace-nowrap ml-2">{stat.value}</p>
              </div>
            ))}
          </div>

          <h3 className="text-[28px] font-bold text-slate-800 mb-8 border-l-8 border-[#138808] pl-5">Journey Timeline</h3>
          <div className="overflow-hidden rounded-xl border-[3px] border-slate-100">
            <table className="w-full text-left bg-white">
              <thead>
                <tr className="bg-slate-50 border-b-[3px] border-slate-100">
                  <th className="py-5 px-6 font-black text-slate-400 uppercase text-xs tracking-[0.15em] w-[40%]">Step Details</th>
                  <th className="py-5 px-6 font-black text-slate-400 uppercase text-xs tracking-[0.15em]">Update / Action</th>
                  <th className="py-5 px-6 font-black text-slate-400 uppercase text-xs tracking-[0.15em] text-right w-[20%]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y-[3px] divide-slate-100">
                {app.steps.map((step) => (
                  <tr key={step.id}>
                    <td className="py-5 px-6 text-slate-900 font-bold text-[17px]">
                      {step.label}
                      {step.date && <div className="text-sm text-slate-500 font-semibold mt-1">{step.date}</div>}
                    </td>
                    <td className="py-5 px-6 text-slate-600 font-medium leading-relaxed text-[17px]">{step.sublabel}</td>
                    <td className="py-5 px-6 text-right">
                      <span className={`inline-flex items-center justify-center px-4 py-2 rounded-full text-[12px] font-black tracking-widest uppercase border-2 ${
                        step.status === 'done' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        step.status === 'active' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                        'bg-slate-50 text-slate-500 border-slate-200'
                      }`}>
                        {step.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-16 pt-8 border-t-[3px] border-slate-100 text-center text-slate-500 font-medium">
            <p className="text-[15px]">This is a system generated report from the <span className="font-bold text-slate-700">Bharat Setu Digital Desk</span> and does not require a signature.</p>
            <p className="mt-2 text-[14px]">For escalated queries, file a complaint via CPGRAMS or contact the Toll-free helpline at <span className="font-bold text-slate-700">1800-111-555</span>.</p>
          </div>
        </div>
      </div>
      {/* ── AI X-RAY MODAL ── */}
      <AnimatePresence>
        {xrayResult && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-white dark:bg-slate-900 border border-amber-500/30 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">
              
              <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-5 text-white relative">
                 <button onClick={() => setXrayResult(null)} className="absolute top-4 right-4 text-white/80 hover:text-white">
                   <span className="material-symbols-outlined">close</span>
                 </button>
                 <div className="flex items-center gap-3">
                   <div className="size-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                     <span className="material-symbols-outlined text-3xl">hub</span>
                   </div>
                   <div>
                     <h3 className="text-lg font-black leading-tight">City Brain X-Ray</h3>
                     <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Cross-Entity Knowledge Graph</p>
                   </div>
                 </div>
              </div>

              <div className="p-5 space-y-4">
                 <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Current Bottleneck</p>
                    <div className="text-sm font-bold text-slate-800 dark:text-white leading-snug">
                       {xrayResult.answer?.split('\n').map((line: string, lIdx: number) => {
                         const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('* ');
                         const contentLine = isBullet ? line.replace(/^\s*[-*]\s*/, '') : line;
                         return (
                           <div key={lIdx} className={`${line.trim() === '' ? 'h-2' : 'mb-1'} ${isBullet ? 'flex gap-1.5' : ''}`}>
                             {isBullet && <span className="text-amber-500 mt-[7px] text-[6px] shrink-0">●</span>}
                             <div className={isBullet ? 'flex-1' : ''}>
                               {contentLine.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((part, idx) => {
                                 if (part.startsWith('**') && part.endsWith('**')) return <strong key={idx} className="text-slate-900 dark:text-white font-black">{part.slice(2, -2)}</strong>;
                                 if (part.startsWith('_') && part.endsWith('_')) return <span key={idx} className="italic opacity-90">{part.slice(1, -1)}</span>;
                                 return <span key={idx}>{part}</span>;
                               })}
                             </div>
                           </div>
                         );
                       })}
                    </div>
                 </div>

                 <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4">
                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2">Graph Relationships</p>
                    <div className="space-y-3">
                       {xrayResult.relatedEntities?.slice(0, 3).map((n: any, i: number) => (
                         <div key={i} className="flex gap-3">
                            <span className="material-symbols-outlined text-amber-500 text-sm mt-0.5">account_tree</span>
                            <div>
                               <p className="text-[11px] font-black text-slate-700 dark:text-slate-200">{n.label}</p>
                               <p className="text-[9px] text-slate-500 dark:text-slate-400">Type: {n.type}</p>
                            </div>
                         </div>
                       ))}
                    </div>
                 </div>

                 <div className="flex items-center gap-2 text-[10px] text-slate-400 italic">
                    <span className="material-symbols-outlined text-[14px]">info</span>
                    BFS Depth: {xrayResult.graphStats?.maxDepth || 3} · Relational Entities Scanned: {xrayResult.graphStats?.nodesTraversed || 142}
                 </div>

                 <button onClick={() => setXrayResult(null)}
                   className="w-full py-3 rounded-2xl bg-slate-900 text-white font-black text-sm active:scale-95 transition-transform shadow-xl">
                   UNDERSTOOD
                 </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* RTI Modal */}
      <AnimatePresence>
        {showRTIModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className="bg-white dark:bg-[#0f1f3a] w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border border-black/10 dark:border-white/10">
              <div className="bg-blue-600 px-4 py-3 text-white flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2"><span className="material-symbols-outlined text-[18px]">description</span> File RTI Application</h3>
                <button onClick={() => setShowRTIModal(false)} className="active:scale-90 transition-transform"><span className="material-symbols-outlined text-[18px]">close</span></button>
              </div>
              <div className="p-4 space-y-3">
                 <p className="text-[11px] text-slate-500 mb-3">Requesting information under Right to Information Act, 2005.</p>
                 <div>
                   <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Subject</label>
                   <input type="text" readOnly value={`Status enquiry for ${app.title}`} className="w-full mt-1 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-[13px] text-slate-700 dark:text-gray-200 outline-none" />
                 </div>
                 <div>
                   <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Reference ID</label>
                   <input type="text" readOnly value={app.refId} className="w-full mt-1 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-[13px] text-slate-700 dark:text-gray-200 outline-none font-mono tracking-tight" />
                 </div>
                 <div>
                   <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Information Requested</label>
                   <textarea rows={3} className="w-full mt-1 bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-[13px] text-slate-900 dark:text-white outline-none resize-none focus:border-blue-500 transition-colors" defaultValue={`Please provide the exact current status, reasons for delay, and name of the official holding the application ${app.refId}.`}></textarea>
                 </div>
                 <button onClick={() => { alert('RTI Application submitted successfully!'); setShowRTIModal(false); }} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 mt-4 rounded-xl transition-colors text-[13px] shadow-md shadow-blue-500/20 active:scale-[0.98]">Submit RTI via Yojana Saathi</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CPGRAMS Modal */}
      <AnimatePresence>
        {showCPGRAMSModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className="bg-white dark:bg-[#0f1f3a] w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border border-black/10 dark:border-white/10">
              <div className="bg-[#8B5CF6] px-4 py-3 text-white flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2"><span className="material-symbols-outlined text-[18px]">support_agent</span> CPGRAMS Grievance</h3>
                <button onClick={() => setShowCPGRAMSModal(false)} className="active:scale-90 transition-transform"><span className="material-symbols-outlined text-[18px]">close</span></button>
              </div>
              <div className="p-4 space-y-3">
                 <p className="text-[11px] text-slate-500 mb-3">Public Grievance Redressal and Monitoring System.</p>
                 <div>
                   <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Grievance Category</label>
                   <input type="text" readOnly value={`Delay in Processing: ${app.category}`} className="w-full mt-1 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-[13px] text-slate-700 dark:text-gray-200 outline-none" />
                 </div>
                 <div>
                   <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Application Number</label>
                   <input type="text" readOnly value={app.refId} className="w-full mt-1 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-[13px] text-slate-700 dark:text-gray-200 outline-none font-mono tracking-tight" />
                 </div>
                 <div>
                   <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Grievance Details</label>
                   <textarea rows={3} className="w-full mt-1 bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-[13px] text-slate-900 dark:text-white outline-none resize-none focus:border-[#8B5CF6] transition-colors" defaultValue={`My application ${app.refId} has been stuck out of SLA bounds (` + app.daysLeft + ` days left). Officer assigned is ${app.officer}. Please expedite.`}></textarea>
                 </div>
                 <button onClick={() => { alert('CPGRAMS Grievance registered successfully!'); setShowCPGRAMSModal(false); }} className="w-full bg-[#8B5CF6] hover:bg-[#7c3aed] text-white font-bold py-3 mt-4 rounded-xl transition-colors text-[13px] shadow-md shadow-[#8B5CF6]/20 active:scale-[0.98]">Lodge Grievance</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
