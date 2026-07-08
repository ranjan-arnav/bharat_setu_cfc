'use client';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAppStore } from '@/lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { FlagStripe } from '@/components/ui/GoiElements';

// ── Tier config ───────────────────────────────────────────────────────
const TIERS = [
  { min: 2000, label: 'Setu Hero',     icon: 'military_tech', color: '#FF9933', next: 9999, nextName: 'Legend' },
  { min: 1000, label: 'Gold Citizen',  icon: 'stars',          color: '#EAB308', next: 2000, nextName: 'Hero' },
  { min: 400,  label: 'Silver Citizen',icon: 'workspace_premium', color: '#94A3B8', next: 1000, nextName: 'Gold' },
  { min: 0,    label: 'Naya Nagarik', icon: 'person',          color: '#10B981', next: 400,  nextName: 'Silver' },
];

const BREAKDOWN = [
  { icon: 'campaign',    label: 'Grievances', val: 70,  color: '#FF9933' },
  { icon: 'diversity_3', label: 'Helped',     val: 150, color: '#8B5CF6' },
  { icon: 'description', label: 'Schemes',    val: 100, color: '#138808' },
  { icon: 'verified',    label: 'Verified',   val: 120, color: '#3B82F6' },
];

const LEADERBOARD = [
  { name: 'Priya Devi',    tier: 'Setu Hero',   score: 2450, rank: 1,  isYou: false, initials: 'PD' },
  { name: 'Rajesh Kumar',  tier: 'Gold Citizen', score: 2120, rank: 2,  isYou: false, initials: 'RK' },
  { name: 'Sunita Sharma', tier: 'Gold Citizen', score: 1890, rank: 3,  isYou: false, initials: 'SS' },
  { name: 'You',           tier: '',             score: 0,    rank: 47, isYou: true,  initials: 'YO' },
];

const REWARDS = [
  { icon: 'percent',         label: 'Free Bus Pass',       pts: 500,  available: true  },
  { icon: 'health_and_safety',label: 'Health Check-up',    pts: 800,  available: true  },
  { icon: 'school',          label: 'e-Learning Access',   pts: 1200, available: false },
  { icon: 'account_balance', label: 'Loan Rate Discount',  pts: 2000, available: false },
];

type Tab = 'overview' | 'challenges' | 'leaderboard' | 'rewards';

// ── Score Arc ─────────────────────────────────────────────────────────
function ScoreArc({ pct, score, tierLabel, tierColor }: { pct: number; score: number; tierLabel: string; tierColor: string }) {
  const r = 70; const circ = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(1, pct / 100)) * circ;
  return (
    <div className="flex flex-col items-center py-6">
      <div className="relative flex items-center justify-center">
        <svg width="168" height="168" className="-rotate-90">
          <circle cx="84" cy="84" r={r} fill="none" stroke="currentColor" strokeWidth="10" className="text-black/10 dark:text-white/10" />
          <circle cx="84" cy="84" r={r} fill="none" stroke={tierColor} strokeWidth="10"
            strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1.2s ease', filter: `drop-shadow(0 0 8px ${tierColor}60)` }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">{score.toLocaleString('en-IN')}</span>
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Karma Points</span>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <span className="material-symbols-outlined font-normal text-lg" style={{ color: tierColor }}>workspace_premium</span>
        <span className="font-black text-sm uppercase tracking-widest" style={{ color: tierColor }}>{tierLabel}</span>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────
export default function CivicKarma({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();
  const { citizenProfile, trackedItems, karmaScore: storeKarma, redeemReward, redeemedRewards, setActiveAgent, setOverlay } = useAppStore();

  const district = citizenProfile?.district || 'Dumka';
  const karmaScore = storeKarma ?? trackedItems.reduce((acc, item) => acc + (item.status === 'Resolved' ? 50 : 10), 530);
  const tInfo = TIERS.find(x => karmaScore >= x.min) ?? TIERS[3];
  const pct = Math.min(100, Math.round((karmaScore / tInfo.next) * 100));
  const streakDays = Math.max(1, trackedItems.filter(i => i.status === 'Resolved').length * 2 + 1);

  const [tab, setTab] = useState<Tab>('overview');
  
  const [isGeneratingPass, setIsGeneratingPass] = useState(false);

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  async function handleRedeem(pts: number, label: string) {
    if (isGeneratingPass) return;

    if (karmaScore < pts) {
      alert(`Not enough points to redeem ${label}. You need ${pts - karmaScore} more.`);
      return;
    }

    const success = redeemReward(pts, label);
    if (!success) {
      useAppStore.setState({ karmaScore: karmaScore - pts, redeemedRewards: [...redeemedRewards, label] });
    }

    setIsGeneratingPass(true);

    try {
      const W = 1000, H = 1500;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;

      // Load Logo
      const logoImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => {
          const empty = new Image(); resolve(empty);
        };
        img.src = '/logo.png';
      });

      // Background Modern Blur/Blobs
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, W, H);

      const drawBlob = (x: number, y: number, r: number, color: string) => {
        ctx.beginPath();
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, color);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      drawBlob(200, 200, 600, 'rgba(255, 153, 51, 0.25)'); // Saffron
      drawBlob(W - 200, H - 200, 600, 'rgba(19, 136, 8, 0.25)'); // Green
      drawBlob(W/2, H/2, 500, 'rgba(59, 130, 246, 0.15)'); // Blue

      // Ticket geometry
      const tX = 100, tY = 150, tW = 800, tH = 1200;
      
      // Shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 20;

      // Draw ticket shape with punch holes
      ctx.beginPath();
      const tr = 40;
      ctx.moveTo(tX + tr, tY);
      ctx.lineTo(tX + tW - tr, tY);
      ctx.quadraticCurveTo(tX + tW, tY, tX + tW, tY + tr);
      
      const punchY = tY + tH * 0.72;
      const punchR = 40;
      ctx.lineTo(tX + tW, punchY - punchR);
      ctx.arc(tX + tW, punchY, punchR, -Math.PI/2, Math.PI/2, true);
      
      ctx.lineTo(tX + tW, tY + tH - tr);
      ctx.quadraticCurveTo(tX + tW, tY + tH, tX + tW - tr, tY + tH);
      
      ctx.lineTo(tX + tr, tY + tH);
      ctx.quadraticCurveTo(tX, tY + tH, tX, tY + tH - tr);
      
      ctx.lineTo(tX, punchY + punchR);
      ctx.arc(tX, punchY, punchR, Math.PI/2, -Math.PI/2, true);
      
      ctx.lineTo(tX, tY + tr);
      ctx.quadraticCurveTo(tX, tY, tX + tr, tY);
      ctx.closePath();
      
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // Header Brand Bar
      ctx.save();
      ctx.clip(); 
      const headerGrad = ctx.createLinearGradient(tX, tY, tX + tW, tY);
      headerGrad.addColorStop(0, '#FF9933');
      headerGrad.addColorStop(0.5, '#ffffff');
      headerGrad.addColorStop(1, '#138808');
      ctx.fillStyle = headerGrad;
      ctx.fillRect(tX, tY, tW, 16); 
      
      // Dashed Line across punch holes
      ctx.beginPath();
      ctx.moveTo(tX + punchR + 20, punchY);
      ctx.lineTo(tX + tW - punchR - 20, punchY);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 4;
      ctx.setLineDash([15, 15]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Logo & Header text
      const logoSize = 100;
      if (logoImg.width > 0) {
        ctx.drawImage(logoImg, tX + 60, tY + 60, logoSize, logoSize);
      } else {
        // Fallback
        ctx.fillStyle = '#FF9933';
        ctx.beginPath(); ctx.arc(tX + 110, tY + 110, 50, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('BS', tX + 110, tY + 122);
      }
      
      ctx.fillStyle = '#0f172a';
      ctx.font = '900 48px "Inter", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('BHARAT SETU', tX + 190, tY + 105);
      
      ctx.fillStyle = '#64748b';
      ctx.font = '600 22px "Inter", sans-serif';
      ctx.fillText('OFFICIAL REWARD PASS', tX + 190, tY + 140);
      
      // Verified Badge
      ctx.fillStyle = '#dcfce7'; // light green
      roundRect(ctx, tX + tW - 200, tY + 80, 140, 46, 23);
      ctx.fill();
      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 18px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✓ VERIFIED', tX + tW - 130, tY + 109);

      // Icon placeholder in the center based on label
      const cY = tY + 340;
      const cGrad = ctx.createLinearGradient(tX + tW/2 - 80, cY - 80, tX + tW/2 + 80, cY + 80);
      cGrad.addColorStop(0, '#e0e7ff');
      cGrad.addColorStop(1, '#dbeafe');
      ctx.fillStyle = cGrad;
      ctx.beginPath();
      ctx.arc(tX + tW/2, cY, 80, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#3b82f6';
      ctx.font = '60px sans-serif';
      let icon = '★'; 
      if(label.toLowerCase().includes('bus')) icon = '🚌';
      if(label.toLowerCase().includes('health')) icon = '⚕️';
      if(label.toLowerCase().includes('learning')) icon = '🎓';
      if(label.toLowerCase().includes('loan')) icon = '🏦';
      ctx.fillText(icon, tX + tW/2, cY + 20);

      const titleY = cY + 150;
      // Main Benefit Label
      ctx.fillStyle = '#0f172a';
      ctx.font = '900 60px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label.toUpperCase(), tX + tW/2, titleY);
      
      // Info Table / Fields
      const infoY = titleY + 110;
      const col1 = tX + 80;
      const col2 = tX + 440;

      const drawField = (lbl: string, val: string, x: number, y: number, highlight = false) => {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 16px "Inter", sans-serif';
        ctx.fillText(lbl, x, y);
        ctx.fillStyle = highlight ? '#FF9933' : '#1e293b';
        ctx.font = '800 26px "Inter", sans-serif';
        ctx.fillText(val, x, y + 42);
      };

      drawField('ISSUED TO', citizenProfile?.name || 'Verified Citizen', col1, infoY);
      drawField('DISTRICT', `${district} Hub`, col2, infoY);
      
      const todayStr = new Date().toLocaleDateString('en-GB');
      drawField('ISSUED ON', todayStr, col1, infoY + 110);
      const randomID = 'BS-' + Math.random().toString(36).substr(2, 9).toUpperCase();
      drawField('PASS ID', randomID, col2, infoY + 110, true);

      // Barcode / Bottom Section
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 22px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SCAN TO REDEEM', tX + tW/2, punchY + 70);

      // Generate Barcode
      const barWidths = [4,2,3,6,2,2,4,3,6,2,3,4,2,4,3,6,2,3,2,4,3,5,2,4,2,3,6,4,2];
      const totalBarW = barWidths.reduce((a,b)=>a+b*4+4, 0); 
      let bx = tX + tW/2 - totalBarW/2;
      
      ctx.fillStyle = '#0f172a';
      barWidths.forEach((bw) => {
        ctx.fillRect(bx, punchY + 110, bw * 4, 130);
        bx += bw * 4 + 4;
      });

      // Footer
      ctx.fillStyle = '#94a3b8';
      ctx.font = '16px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Pass digitally generated and non-transferable via Bharat Setu Platform', tX + tW/2, tY + tH - 40);

      // Download
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `BharatSetu_${label.replace(/\s+/g, '')}_Pass.png`;
      link.href = dataUrl;
      link.click();
    } catch (err: any) {
      console.error('Failed to generate pass', err);
      alert('Pass generation failed: ' + (err.message || String(err)));
    } finally {
      setIsGeneratingPass(false);
    }
  }

  const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const fadeUp = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } };

  const TABS: { id: Tab; icon: string; label: string }[] = [
    { id: 'overview',    icon: 'dashboard',    label: 'Overview' },
    { id: 'challenges',  icon: 'flag',         label: 'Challenges' },
    { id: 'leaderboard', icon: 'leaderboard',  label: 'Board' },
    { id: 'rewards',     icon: 'redeem',       label: 'Rewards' },
  ];

  const CHALLENGES = [
    { title: 'Report 3 civic issues',         pts: 50,  progress: 66, text: '2/3', done: false },
    { title: 'Verify 5 resolved grievances',   pts: 40,  progress: 60, text: '3/5', done: false },
    { title: 'Help 2 neighbors with PM-KISAN', pts: 100, progress: 0,  text: '0/2', done: false },
    { title: 'Share a scheme with a friend',   pts: 20,  progress: 100, text: '1/1', done: true  },
  ];

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 dark:bg-[#0a1628] flex flex-col max-w-[430px] mx-auto" style={{ animation: 'slideUp 0.3s ease-out' }}>
      <FlagStripe />

      {/* ── Header ── */}
      <div className="px-4 py-3 bg-white/95 dark:bg-[#0f1f3a]/95 backdrop-blur-xl border-b border-black/10 dark:border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onClose} className="p-2.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] active:scale-[0.98]">
            <span className="material-symbols-outlined text-slate-500 dark:text-gray-400">arrow_back</span>
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              Civic Karma
              <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-[#FF9933]/10 text-[#FF9933]">
                {tInfo.label}
              </span>
            </h2>
            <span className="text-[10px] text-slate-500 dark:text-gray-400">{district} District</span>
          </div>
          {/* Streak badge */}
          <div className="flex items-center gap-1 bg-orange-500/10 border border-orange-500/20 px-2.5 py-1.5 rounded-xl">
            <span className="material-symbols-outlined text-orange-500 text-base font-normal">local_fire_department</span>
            <span className="text-sm font-black text-orange-600 dark:text-orange-400">{streakDays}</span>
            <span className="text-[9px] font-bold text-orange-500/70 uppercase tracking-wide">day</span>
          </div>
        </div>

        {/* Tab bar */}
        <div className="grid grid-cols-4 gap-1.5">
          {TABS.map(tb => (
            <button key={tb.id} onClick={() => setTab(tb.id)}
              className={`min-h-[44px] rounded-xl text-[12px] font-bold flex flex-col items-center justify-center gap-0.5 transition-all ${
                tab === tb.id
                  ? 'bg-[#FF9933] text-white shadow-sm'
                  : 'bg-black/5 dark:bg-white/5 text-slate-500 dark:text-gray-400 active:scale-[0.97]'
              }`}>
              <span className="material-symbols-outlined text-[18px]">{tb.icon}</span>
              <span className="text-[10px] font-bold">{tb.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable Content ── */}
      <div className="flex-1 overflow-y-auto pb-20 no-scrollbar">

        {/* OVERVIEW TAB */}
        {tab === 'overview' && (
          <motion.div variants={stagger} initial="hidden" animate="show" className="p-4 space-y-4">

            {/* Score arc */}
            <motion.div variants={fadeUp} className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl">
              <ScoreArc pct={pct} score={karmaScore} tierLabel={tInfo.label} tierColor={tInfo.color} />
              {/* Progress bar */}
              <div className="px-6 pb-5">
                <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-2">
                  <span>{karmaScore} pts</span>
                  <span>{tInfo.next} pts to {tInfo.nextName}</span>
                </div>
                <div className="w-full bg-black/10 dark:bg-white/10 h-2.5 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1.2, delay: 0.2 }}
                    className="h-full rounded-full" style={{ background: tInfo.color }} />
                </div>
              </div>
            </motion.div>

            {/* Karma breakdown grid */}
            <motion.div variants={fadeUp}>
              <h4 className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-3">Karma Breakdown</h4>
              <div className="grid grid-cols-4 gap-2">
                {BREAKDOWN.map(b => (
                  <div key={b.label} className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-3 flex flex-col items-center gap-1.5">
                    <span className="material-symbols-outlined text-xl font-light" style={{ color: b.color }}>{b.icon}</span>
                    <span className="text-[10px] text-slate-500 dark:text-gray-400 font-semibold text-center leading-tight">{b.label}</span>
                    <span className="text-base font-black text-slate-900 dark:text-white">+{b.val}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Quick boost actions */}
            <motion.div variants={fadeUp}>
              <h4 className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-3">Boost Karma Now</h4>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: 'record_voice_over', label: 'AI Grievance Draft', action: () => { setOverlay('omni-router'); onClose?.(); }, pts: '+10', color: 'bg-[#FF9933]/10 border-[#FF9933]/20 text-[#FF9933]', span: 1 },
                  { icon: 'hub',  label: 'Community Impact', action: () => { setOverlay('impact'); onClose?.(); }, pts: '+15', color: 'bg-[#8B5CF6]/10 border-[#8B5CF6]/20 text-[#8B5CF6]', span: 1 },
                  { icon: 'document_scanner',  label: 'AI Scheme Matcher', action: () => { setOverlay('scheme-scanner'); onClose?.(); }, pts: '+20', color: 'bg-[#138808]/10 border-[#138808]/20 text-[#138808]', span: 1 },
                  { icon: 'group_add',  label: 'Help Neighbours', action: () => { setOverlay('help-neighbour'); onClose?.(); }, pts: '+25', color: 'bg-[#f43f5e]/10 border-[#f43f5e]/20 text-[#f43f5e]', span: 1 },
                ].map(a => (
                  <button key={a.label} onClick={a.action} className={`flex items-center gap-3 p-3.5 rounded-xl border active:scale-[0.97] transition-transform ${a.color} text-left ${a.span === 2 ? 'col-span-2' : ''}`}>
                    <span className="material-symbols-outlined text-2xl font-light shrink-0">{a.icon}</span>
                    <div className="flex-1">
                      <p className="text-[12px] font-bold text-slate-800 dark:text-white leading-tight flex items-center gap-1">
                        {a.label}
                        <span className="material-symbols-outlined text-[10px] opacity-70">auto_awesome</span>
                      </p>
                      <p className="text-[10px] font-black opacity-80 mt-0.5">{a.pts} pts</p>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>

            {/* District banner */}
            <motion.div variants={fadeUp}
              className="rounded-2xl border border-[#138808]/20 bg-gradient-to-br from-[#138808]/12 to-[#FF9933]/8 p-4 flex items-center gap-3">
              <div className="size-12 rounded-full bg-[#138808] flex items-center justify-center shrink-0 shadow-lg shadow-[#138808]/30">
                <span className="material-symbols-outlined text-white font-normal">celebration</span>
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white text-sm leading-tight">
                  <span className="text-[#138808]">{district}</span> citizens resolved <span className="font-black underline">234 issues</span> together!
                </p>
                <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">🏆 Top 3 in State · Keep going!</p>
              </div>
            </motion.div>

            {/* AI tip */}
            <motion.div variants={fadeUp}
              className="rounded-2xl border border-[#FF9933]/20 bg-gradient-to-br from-[#FF9933]/12 to-[#138808]/8 p-4">
              <div className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-[#FF9933] text-[22px]">auto_awesome</span>
                <div>
                  <h4 className="text-[12px] font-black uppercase tracking-wider text-slate-900 dark:text-white">AI Tip</h4>
                  <p className="text-[12px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                    You're {tInfo.next - karmaScore} pts from <strong>{tInfo.nextName}</strong> tier. Filing 2 more grievances this week will get you there!
                  </p>
                </div>
              </div>
            </motion.div>

          </motion.div>
        )}

        {/* CHALLENGES TAB */}
        {tab === 'challenges' && (
          <motion.div variants={stagger} initial="hidden" animate="show" className="p-4 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Weekly Challenges</h4>
              <span className="text-[10px] font-bold text-[#FF9933] bg-[#FF9933]/10 border border-[#FF9933]/20 px-2.5 py-1 rounded-full">Ends in 2 days</span>
            </div>

            {CHALLENGES.map((c, i) => (
              <motion.div key={i} variants={fadeUp}
                className={`bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4 ${c.done ? 'opacity-70' : ''}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${c.done ? 'bg-[#138808]/15' : 'bg-[#FF9933]/15'}`}>
                      <span className={`material-symbols-outlined font-light ${c.done ? 'text-[#138808]' : 'text-[#FF9933]'}`}>
                        {c.done ? 'check_circle' : 'flag'}
                      </span>
                    </div>
                    <p className="text-[13px] font-bold text-slate-900 dark:text-white leading-snug">{c.title}</p>
                  </div>
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-xl border shrink-0 ${c.done ? 'text-[#138808] bg-[#138808]/10 border-[#138808]/20' : 'text-[#FF9933] bg-[#FF9933]/10 border-[#FF9933]/20'}`}>
                    {c.done ? 'Done ✓' : `+${c.pts} pts`}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-black/10 dark:bg-white/10 h-2.5 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${c.progress}%` }} transition={{ duration: 1, delay: i * 0.1 }}
                      className="h-full rounded-full" style={{ background: c.done ? '#138808' : '#FF9933' }} />
                  </div>
                  <span className="text-[11px] font-bold text-slate-400 dark:text-gray-500 shrink-0">{c.text}</span>
                </div>
              </motion.div>
            ))}

            {/* Monthly challenge teaser */}
            <motion.div variants={fadeUp}
              className="bg-gradient-to-br from-[#8B5CF6]/12 to-[#8B5CF6]/5 border border-[#8B5CF6]/20 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-[#8B5CF6] text-lg">event</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-[#8B5CF6]">Monthly Challenge</span>
              </div>
              <p className="text-[13px] font-bold text-slate-900 dark:text-white">Resolve 10 issues in March</p>
              <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-1">Reward: <span className="font-bold text-[#8B5CF6]">+500 pts + District Badge</span></p>
              <div className="mt-3 bg-black/10 dark:bg-white/10 h-2 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-[#8B5CF6]" style={{ width: '40%' }} />
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">4 / 10 resolved</p>
            </motion.div>
          </motion.div>
        )}

        {/* LEADERBOARD TAB */}
        {tab === 'leaderboard' && (
          <motion.div variants={stagger} initial="hidden" animate="show" className="p-4 space-y-3">
            <h4 className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">{district} District Leaderboard</h4>

            {/* Top 3 podium */}
            <motion.div variants={fadeUp} className="grid grid-cols-3 gap-2 pt-2 pb-4">
              {[LEADERBOARD[1], LEADERBOARD[0], LEADERBOARD[2]].map((u, i) => {
                const heights = ['h-20', 'h-28', 'h-16'];
                const medals = ['🥈', '🥇', '🥉'];
                return (
                  <div key={u.rank} className="flex flex-col items-center gap-1.5">
                    <div className="size-12 rounded-full bg-gradient-to-br from-[#FF9933] to-amber-600 flex items-center justify-center text-white font-black text-lg border-2 border-white dark:border-[#0a1628] shadow">
                      {u.initials}
                    </div>
                    <span className="text-[11px] font-bold text-slate-800 dark:text-white truncate max-w-full">{u.name.split(' ')[0]}</span>
                    <span className="text-lg">{medals[i]}</span>
                    <div className={`w-full ${heights[i]} bg-[#FF9933]/20 border border-[#FF9933]/30 rounded-t-xl flex items-end justify-center pb-2`}>
                      <span className="text-[11px] font-black text-[#FF9933]">{u.score.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                );
              })}
            </motion.div>

            {/* Full list */}
            {LEADERBOARD.map((u, i) => {
              const lbScore = u.isYou ? karmaScore : u.score;
              return (
                <motion.div key={i} variants={fadeUp}>
                  {u.isYou && (
                    <div className="flex justify-center py-2">
                      <span className="text-[10px] text-slate-400 dark:text-gray-500 font-medium">• • •</span>
                    </div>
                  )}
                  <div className={`flex items-center gap-3 p-3.5 rounded-2xl border ${u.isYou ? 'bg-[#FF9933]/10 border-[#FF9933]/30' : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10'}`}>
                    <div className={`size-9 rounded-full flex items-center justify-center font-black text-sm border-2 shrink-0 ${u.isYou ? 'bg-[#FF9933] text-white border-[#FF9933]' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-transparent'}`}>
                      {u.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-bold truncate ${u.isYou ? 'text-[#FF9933]' : 'text-slate-900 dark:text-white'}`}>{u.name}</p>
                      <p className="text-[10px] text-slate-400 dark:text-gray-500 font-medium">{u.isYou ? tInfo.label : u.tier}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-[13px] font-black ${u.isYou ? 'text-[#FF9933]' : 'text-slate-900 dark:text-white'}`}>{lbScore.toLocaleString('en-IN')}</p>
                      <p className="text-[9px] text-slate-400 uppercase font-bold">#{u.rank}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* REWARDS TAB */}
        {tab === 'rewards' && (
          <motion.div variants={stagger} initial="hidden" animate="show" className="p-4 space-y-3 relative">
            {isGeneratingPass && (
              <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-purple-500/20 via-blue-500/20 to-green-500/20 p-3 rounded-2xl border border-blue-500/30 shadow-lg backdrop-blur-md z-10 flex items-center justify-center gap-3 animate-pulse">
                <span className="material-symbols-outlined text-blue-600 animate-spin">sync</span>
                <span className="text-xs font-black text-slate-800 dark:text-blue-100 uppercase tracking-widest">Generating AI Pass...</span>
              </div>
            )}
            
            <div className={`flex items-center justify-between mb-1 ${isGeneratingPass ? 'opacity-30 pointer-events-none' : ''}`}>
              <h4 className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Karma Rewards</h4>
              <span className="text-[10px] font-bold text-slate-500 dark:text-gray-400">{karmaScore.toLocaleString()} pts available</span>
            </div>

            {REWARDS.map((r, i) => {
              const claimed = redeemedRewards.includes(r.label);
              const canClaim = karmaScore >= r.pts && !claimed;
              return (
                <motion.div key={i} variants={fadeUp}
                  className={`bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4 flex items-center gap-4 ${!r.available && !claimed ? 'opacity-50' : ''}`}>
                  <div className={`size-12 rounded-xl flex items-center justify-center shrink-0 ${claimed ? 'bg-[#138808]/15' : 'bg-[#FF9933]/15'}`}>
                    <span className={`material-symbols-outlined text-2xl font-light ${claimed ? 'text-[#138808]' : 'text-[#FF9933]'}`}>{r.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-slate-900 dark:text-white truncate">{r.label}</p>
                    <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">
                      {claimed ? '✓ Redeemed' : `${r.pts.toLocaleString()} pts`}
                      {!claimed && !canClaim && ` · Need ${(r.pts - karmaScore).toLocaleString()} more`}
                    </p>
                  </div>
                  <button
                    disabled={!canClaim || claimed || isGeneratingPass}
                    onClick={() => handleRedeem(r.pts, r.label)}
                    className={`shrink-0 min-h-[44px] px-4 rounded-xl text-[12px] font-bold transition-all active:scale-95 ${
                      claimed ? 'bg-[#138808]/10 text-[#138808] border border-[#138808]/20 cursor-default' :
                      canClaim ? 'bg-[#FF9933] text-white shadow-md shadow-[#FF9933]/25 active:scale-95' :
                      'bg-black/5 dark:bg-white/5 text-slate-400 cursor-not-allowed border border-black/10 dark:border-white/10'
                    }`}>
                    {claimed ? 'Done' : canClaim ? 'Redeem' : 'Locked'}
                  </button>
                </motion.div>
              );
            })}

            {/* Points explainer */}
            <motion.div variants={fadeUp}
              className="rounded-2xl border border-[#FF9933]/20 bg-gradient-to-br from-[#FF9933]/12 to-[#138808]/8 p-4">
              <div className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-[#FF9933] text-[22px]">info</span>
                <div>
                  <h4 className="text-[12px] font-black text-slate-900 dark:text-white">How to earn more</h4>
                  <div className="mt-2 space-y-1">
                    {[
                      ['campaign', 'File grievance', '+10'],
                      ['task_alt', 'Issue resolved', '+50'],
                      ['diversity_3', 'Help citizen', '+15'],
                      ['description', 'Apply scheme', '+20'],
                    ].map(([icon, lbl, pts]) => (
                      <div key={lbl} className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[14px] text-[#FF9933]">{icon}</span>
                          <span className="text-slate-600 dark:text-slate-300">{lbl}</span>
                        </div>
                        <span className="font-black text-[#138808]">{pts} pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

      </div>


    </div>
  );
}
