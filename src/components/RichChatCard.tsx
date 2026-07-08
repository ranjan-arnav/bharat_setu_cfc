'use client';

import React, { useEffect, useRef } from 'react';
import { useAppStore, type AgentKey, type TrackedItem } from '@/lib/store';

// ─── Pattern matchers ──────────────────────────────────────────────────────────
const GRIEVANCE_ID_RE = /\b(GRV|WTR|ELC|RD|SWT|ENV)[-–]\w{1,4}[-–]\d{4}[-–]\d{2,6}\b/i;
const KISAN_TKT_RE = /\b(KISAN[-–]TKT|PM[-–]KISAN|PMJAY|PMFBY|MGNREGA|ABDM)[-–]?[A-Z0-9-]{3,12}\b/i;
const PHONE_108_RE = /\b(108|112|1930|102|181|1098|14567)\b/;
const RUPEE_RE = /₹\s?[\d,]+/;
const HOSPITAL_RE = /\b(hospital|aspatal|clinic|dispensary|PHC|CHC|primary health)\b/i;
const FIR_RE = /\b(FIR|zero fir|vakil|vakeel|court|case\s?file|NALSA|bail|arrest)\b/i;
const SCHEME_FOUND_RE = /\b(PM[-–]?KISAN|MGNREGA|NREGA|Ayushman|PMJAY|PMFBY|Ujjwala|PMAY|Jan\s?Dhan|Mudra|PMJJBY|Fasal\s?Bima|Sukanya)\b/i;
const NOT_ELIGIBLE_RE = /\b(not eligible|ineligible|patr nahi|पात्र नहीं|qualify nahi|does not qualify|cannot apply)\b/i;
const ABHA_RE = /\bABHA\b|abdm|health\s?id|हेल्थ\s?आईडी/i;
const DBT_RE = /\b(DBT|direct benefit|kist|installment|₹[\d,]+\s?(transfer|credited|bhej|diya|aaya))/i;
const VIDHI_LOCAL_POLICE_RE = /~~VIDHI_LOCAL_POLICE:(\d{3,})~~/i;
const VIDHI_BING_MAP_RE = /~~VIDHI_BING_MAP:(https?:\/\/[^\s~]+)~~/i;
const VIDHI_RESOURCE_URL_RE = /~~VIDHI_RESOURCE_URL:(https?:\/\/[^\s~]+)~~/i;
const VIDHI_FILE_COMPLAINT_RE = /~~VIDHI_FILE_COMPLAINT~~/i;
const ARTHIK_CALL_RE = /~~ARTHIK_CALL:(\d{3,})~~/i;
const ARTHIK_RESOURCE_URL_RE = /~~ARTHIK_RESOURCE_URL:(https?:\/\/[^\s~]+)~~/i;
const SWASTHYA_CALL_RE = /~~SWASTHYA_CALL:(\d{3,})~~/i;
const SWASTHYA_HOSPITAL_MAP_RE = /~~SWASTHYA_HOSPITAL_MAP:(https?:\/\/[^\s~]+)~~/i;
const SWASTHYA_HOSPITAL_INFO_RE = /~~SWASTHYA_HOSPITAL_INFO:([^~]+)~~/i;
const SWASTHYA_TIMELINE_RE = /~~SWASTHYA_TIMELINE:([A-Z0-9-]+)\|(\d{1,3})~~/i;
const SWASTHYA_NOTIFY_RE = /~~SWASTHYA_NOTIFY:([^~]+)~~/i;
const SWASTHYA_SOS_RE = /~~SWASTHYA_SOS_TRIGGER~~/i;
const SWASTHYA_ABHA_SHARE_RE = /~~SWASTHYA_ABHA_SHARE:([^~]+)~~/i;

export interface ParsedCard {
  type: 'grievance' | 'scheme' | 'emergency' | 'legal' | 'health' | 'finance' | 'nagar_samwad' | 'abha' | 'dbt' | 'track-tab' | 'legal-contact' | 'legal-map' | 'legal-resource' | 'legal-complaint' | 'finance-contact' | 'finance-resource' | 'health-sos' | 'health-timeline' | 'health-notify';
  icon: string;
  color: string;
  title: string;
  subtitle: string;
  actionLabel?: string;
  refId?: string;
  meta?: string;
  actionUrl?: string;
}

export interface UserProfile {
  name?: string;
  digipin?: string;
  abhaId?: string;
  healthSummary?: string;
}

export function parseCards(content: string, agentKey: AgentKey, profile?: UserProfile): ParsedCard[] {
  const cards: ParsedCard[] = [];
  const hasSwasthyaEmergencyMarkers =
    agentKey === 'swasthya_sahayak' &&
    (SWASTHYA_CALL_RE.test(content) || SWASTHYA_HOSPITAL_MAP_RE.test(content) || SWASTHYA_SOS_RE.test(content));

  // Grievance ID card
  const grvMatch = content.match(GRIEVANCE_ID_RE) || content.match(KISAN_TKT_RE);
  if (grvMatch && (agentKey === 'nagarik_mitra' || agentKey === 'yojana_saathi')) {
    cards.push({
      type: 'grievance',
      icon: 'confirmation_number',
      color: '#3B82F6',
      title: 'शिकायत दर्ज हुई',
      subtitle: grvMatch[0],
      actionLabel: 'Track करें',
      refId: grvMatch[0],
      meta: '📍 Estimated: 48–72 hours',
    });
  }

  // NagarSamwad — community count (injected when neighbourhood complaint detected)
  const complaintKw = /\b(pothole|streetlight|sadak|paani|sewage|nalaa|kachra|garbage|complaint|shikayat)\b/i;
  if (complaintKw.test(content) && agentKey === 'nagarik_mitra') {
    // Use content length for a stable O(1) deterministic count.
    const count = 8 + (content.length % 18); // 8–25
    const digipinZone = (profile?.digipin || '88-H2K').slice(0, 6);
    cards.push({
      type: 'nagar_samwad',
      icon: 'groups',
      color: '#F59E0B',
      title: `🏨 ${count} neighbours filed same`,
      subtitle: `in your ${digipinZone} DIGIPIN zone`,
      actionLabel: 'Collective View',
      meta: `Collective complaints resolve 5× faster!`,
    });
  }

  // Emergency helpline card
  const phoneMatch = content.match(PHONE_108_RE);
  if (
    phoneMatch &&
    !(agentKey === 'vidhi_sahayak' && VIDHI_LOCAL_POLICE_RE.test(content)) &&
    !(agentKey === 'swasthya_sahayak' && hasSwasthyaEmergencyMarkers)
  ) {
    const HELPLINES: Record<string, string> = {
      '108': '🚑 Emergency Ambulance',
      '112': '🚔 Emergency Police / Fire',
      '102': '🤰 Janani Suraksha (Maternity)',
      '1930': '💻 Cyber Crime Helpline',
      '181': '👩 Mahila Helpline',
      '1098': '🧒 Childline',
      '14567': '👴 Elder Helpline',
    };
    cards.push({
      type: 'emergency',
      icon: 'call',
      color: '#EF4444',
      title: HELPLINES[phoneMatch[0]] || `Helpline ${phoneMatch[0]}`,
      subtitle: `Call: ${phoneMatch[0]}`,
      actionLabel: `Call ${phoneMatch[0]}`,
    });
  }

  // Scheme eligibility / not-eligible card
  const schemeMatch = content.match(SCHEME_FOUND_RE);
  if (schemeMatch) {
    const notEligible = NOT_ELIGIBLE_RE.test(content);
    cards.push({
      type: 'scheme',
      icon: notEligible ? 'cancel' : 'verified',
      color: notEligible ? '#EF4444' : '#10B981',
      title: notEligible ? `${schemeMatch[0]} — Not Eligible` : `${schemeMatch[0]} Eligible ✓`,
      subtitle: notEligible
        ? 'कारण: आय सीमा / दस्तावेज़ अधूरे'
        : 'Apply via Jan Samarth portal',
      actionLabel: notEligible ? 'Scheme DNA देखें' : 'Apply करें',
      meta: notEligible ? '3 criteria did not match' : 'Success probability: 87%',
    });
  }

  // ABHA share card (explicit structured marker preferred)
  const swasthyaAbhaShareMatch = content.match(SWASTHYA_ABHA_SHARE_RE);
  if (swasthyaAbhaShareMatch && agentKey === 'swasthya_sahayak') {
    let abhaDisplay = profile?.abhaId || '14558 ••• ••••';
    const nameDisplay = profile?.name || 'Citizen';
    let statusDisplay = 'ABHA ID with health report sent for reference.';
    let summaryDisplay = profile?.healthSummary || 'Linked health records synced for emergency context.';

    try {
      const parsed = JSON.parse(decodeURIComponent(swasthyaAbhaShareMatch[1])) as {
        abhaId?: string;
        healthSummary?: string;
        status?: string;
      };
      if (parsed.abhaId?.trim()) abhaDisplay = parsed.abhaId.trim();
      if (parsed.healthSummary?.trim()) summaryDisplay = parsed.healthSummary.trim();
      if (parsed.status?.trim()) statusDisplay = parsed.status.trim();
    } catch {
      // Keep profile-derived fallback values when marker payload fails to decode.
    }

    cards.push({
      type: 'abha',
      icon: 'health_and_safety',
      color: '#EF4444',
      title: 'ABHA Share Status',
      subtitle: `ABHA ID: ${abhaDisplay} · ${nameDisplay}`,
      actionLabel: 'Health Timeline',
      meta: `${statusDisplay}||${summaryDisplay}`,
    });
  } else if (ABHA_RE.test(content) && agentKey === 'swasthya_sahayak') {
    // Fallback for older responses that only include plain ABHA text.
    const abhaDisplay = profile?.abhaId || '14558 ••• ••••';
    const nameDisplay = profile?.name || 'Citizen';
    const summaryDisplay = profile?.healthSummary || 'ABHA ID with health report sent for reference';
    cards.push({
      type: 'abha',
      icon: 'health_and_safety',
      color: '#EF4444',
      title: 'ABHA Share Status',
      subtitle: `ABHA ID: ${abhaDisplay} · ${nameDisplay}`,
      actionLabel: 'Health Timeline',
      meta: `ABHA ID with health report sent for reference.||${summaryDisplay}`,
    });
  }

  // DBT / money transfer card
  const dbtMatch = content.match(DBT_RE);
  const rupeeMatch = content.match(RUPEE_RE);
  if ((dbtMatch || rupeeMatch) && (agentKey === 'yojana_saathi' || agentKey === 'arthik_salahkar')) {
    const bankDisplay = profile?.name ? 'Via PFMS → your bank account' : 'Via PFMS → DBT';
    cards.push({
      type: 'dbt',
      icon: 'account_balance_wallet',
      color: '#8B5CF6',
      title: 'DBT Transfer',
      subtitle: rupeeMatch ? `${rupeeMatch[0]} — Installment` : 'Direct benefit transfer',
      actionLabel: 'DBT Timeline',
      meta: bankDisplay,
    });
  }

  // Nearest hospital card
  if (HOSPITAL_RE.test(content) && agentKey === 'swasthya_sahayak' && !hasSwasthyaEmergencyMarkers) {
    cards.push({
      type: 'health',
      icon: 'local_hospital',
      color: '#10B981',
      title: 'Nearest PHC',
      subtitle: 'Sector 12 Primary Health Centre — 1.2 km',
      actionLabel: 'Navigate',
      meta: 'Open 24×7 · Ayushman accepted · 🔒 ABHA health profile will be shared with hospital for ease',
    });
  }

  // Legal card
  if (FIR_RE.test(content) && agentKey === 'vidhi_sahayak') {
    cards.push({
      type: 'legal',
      icon: 'gavel',
      color: '#EF4444',
      title: 'Free Legal Aid',
      subtitle: 'NALSA — any citizen can request',
      actionLabel: 'File via NALSA',
      meta: 'Zero cost · 48 hr lawyer assign',
    });
  }

  // Vidhi rich action markers (injected from API footer)
  const localPoliceMatch = content.match(VIDHI_LOCAL_POLICE_RE);
  if (localPoliceMatch) {
    cards.push({
      type: 'legal-contact',
      icon: 'local_police',
      color: '#2563EB',
      title: 'Local Police Contact',
      subtitle: `Call: ${localPoliceMatch[1]}`,
      actionLabel: `Call ${localPoliceMatch[1]}`,
      actionUrl: `tel:${localPoliceMatch[1]}`,
      meta: 'District police control room',
    });
  }

  const bingMapMatch = content.match(VIDHI_BING_MAP_RE);
  if (bingMapMatch) {
    cards.push({
      type: 'legal-map',
      icon: 'map',
      color: '#0EA5E9',
      title: 'Nearest Police Station',
      subtitle: 'Open route on Bing Maps',
      actionLabel: 'Open Bing Maps',
      actionUrl: bingMapMatch[1],
    });
  }

  const resourceUrlMatch = content.match(VIDHI_RESOURCE_URL_RE);
  if (resourceUrlMatch) {
    cards.push({
      type: 'legal-resource',
      icon: 'menu_book',
      color: '#0F766E',
      title: 'Official Legal Resource',
      subtitle: 'Open authority portal/document',
      actionLabel: 'Open Resource',
      actionUrl: resourceUrlMatch[1],
    });
  }

  if (VIDHI_FILE_COMPLAINT_RE.test(content) && agentKey === 'vidhi_sahayak') {
    cards.push({
      type: 'legal-complaint',
      icon: 'edit_note',
      color: '#7C3AED',
      title: 'File Complaint in App',
      subtitle: 'Submit your legal complaint with guided fields',
      actionLabel: 'Start Complaint Form',
      meta: 'No need to leave the app',
    });
  }

  const financeCallMatch = content.match(ARTHIK_CALL_RE);
  if (financeCallMatch && agentKey === 'arthik_salahkar') {
    cards.push({
      type: 'finance-contact',
      icon: 'call',
      color: '#8B5CF6',
      title: 'Financial Fraud Helpline',
      subtitle: `Call: ${financeCallMatch[1]}`,
      actionLabel: `Call ${financeCallMatch[1]}`,
      actionUrl: `tel:${financeCallMatch[1]}`,
      meta: 'Use immediately for suspicious/fraud transactions',
    });
  }

  const financeResourceMatch = content.match(ARTHIK_RESOURCE_URL_RE);
  if (financeResourceMatch && agentKey === 'arthik_salahkar') {
    cards.push({
      type: 'finance-resource',
      icon: 'account_balance',
      color: '#6D28D9',
      title: 'Official Financial Resource',
      subtitle: 'Open trusted portal for next steps',
      actionLabel: 'Open Resource',
      actionUrl: financeResourceMatch[1],
    });
  }

  const swasthyaCallMatch = content.match(SWASTHYA_CALL_RE);
  if (swasthyaCallMatch && agentKey === 'swasthya_sahayak') {
    cards.push({
      type: 'emergency',
      icon: 'call',
      color: '#EF4444',
      title: '🚑 Ambulance Dispatch',
      subtitle: `Call: ${swasthyaCallMatch[1]}`,
      actionLabel: 'Call',
      actionUrl: `tel:${swasthyaCallMatch[1]}`,
      meta: 'Emergency line ready',
    });
  }

  const swasthyaHospitalMapMatch = content.match(SWASTHYA_HOSPITAL_MAP_RE);
  if (swasthyaHospitalMapMatch && agentKey === 'swasthya_sahayak') {
    const infoMatch = content.match(SWASTHYA_HOSPITAL_INFO_RE);
    let hospitalName = 'Nearest Emergency Hospital';
    let hospitalType = 'Emergency Care Facility';
    let hospitalPhone = '108';
    let hospitalDistance = '2.4 km';
    let hospitalEta = '10 min';

    if (infoMatch?.[1]) {
      const [name, type, phone, distance, eta] = decodeURIComponent(infoMatch[1]).split('|');
      hospitalName = name || hospitalName;
      hospitalType = type || hospitalType;
      hospitalPhone = phone || hospitalPhone;
      hospitalDistance = distance || hospitalDistance;
      hospitalEta = eta || hospitalEta;
    }

    cards.push({
      type: 'health',
      icon: 'local_hospital',
      color: '#10B981',
      title: hospitalName,
      subtitle: `Route + ETA ${hospitalEta}`,
      actionLabel: 'Navigate',
      actionUrl: swasthyaHospitalMapMatch[1],
      meta: `${hospitalDistance} · ${hospitalType} · Contact: ${hospitalPhone}`,
    });
  }

  if (SWASTHYA_SOS_RE.test(content) && agentKey === 'swasthya_sahayak') {
    cards.push({
      type: 'health-sos',
      icon: 'sos',
      color: '#DC2626',
      title: 'SOS Emergency Console',
      subtitle: 'Emergency controls',
      actionLabel: 'SOS',
      meta: 'High-priority protocol',
    });
  }

  const swasthyaTimelineMatch = content.match(SWASTHYA_TIMELINE_RE);
  if (swasthyaTimelineMatch && agentKey === 'swasthya_sahayak') {
    cards.push({
      type: 'health-timeline',
      icon: 'schedule',
      color: '#F59E0B',
      title: 'Live Ambulance Timeline',
      subtitle: `${swasthyaTimelineMatch[1]} · ETA ${swasthyaTimelineMatch[2]}m`,
      actionLabel: 'Timeline',
      refId: swasthyaTimelineMatch[1],
      meta: 'Dispatch updates',
    });
  }

  const swasthyaNotifyMatch = content.match(SWASTHYA_NOTIFY_RE);
  if (swasthyaNotifyMatch && agentKey === 'swasthya_sahayak') {
    const contactName = decodeURIComponent(swasthyaNotifyMatch[1] || 'Primary family contact');
    cards.push({
      type: 'health-notify',
      icon: 'contact_phone',
      color: '#2563EB',
      title: 'Emergency Contact Notified',
      subtitle: `${contactName} · alert sent`,
      actionLabel: 'Contacts',
      meta: 'Route + status shared',
    });
  }

  // Track Tab CTA — injected by quick-action rich responses
  if (/~~TRACK_TAB~~/i.test(content)) {
    cards.push({
      type: 'track-tab',
      icon: 'assignment_turned_in',
      color: '#6366F1',
      title: 'Track Tab में देखें • View Status',
      subtitle: 'Live updates, ETA & full ticket history',
      actionLabel: 'Open Track Tab',
    });
  }

  return cards;
}

// ─── Card Component ────────────────────────────────────────────────────────────
function InlineCard({ card, onTrack }: { card: ParsedCard; onTrack?: (card: ParsedCard) => void }) {
  const isCompactEmergencyCard = ['health-sos', 'health-timeline', 'health-notify', 'emergency', 'health'].includes(card.type);
  const BG: Record<ParsedCard['type'], string> = {
    grievance: 'from-blue-500/10   to-blue-500/5   border-blue-500/20',
    scheme: 'from-green-500/10  to-green-500/5  border-green-500/20',
    emergency: 'from-red-500/10    to-red-500/5    border-red-500/20',
    legal: 'from-red-500/10    to-red-500/5    border-red-500/20',
    health: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/20',
    finance: 'from-purple-500/10 to-purple-500/5 border-purple-500/20',
    nagar_samwad: 'from-amber-500/10  to-amber-500/5  border-amber-500/20',
    abha: 'from-red-500/10    to-red-500/5    border-red-500/20',
    dbt: 'from-purple-500/10 to-purple-500/5 border-purple-500/20',
    'track-tab': 'from-indigo-500/15 to-indigo-500/5 border-indigo-500/30',
    'legal-contact': 'from-blue-500/10 to-blue-500/5 border-blue-500/20',
    'legal-map': 'from-cyan-500/10 to-cyan-500/5 border-cyan-500/20',
    'legal-resource': 'from-teal-500/10 to-teal-500/5 border-teal-500/20',
    'legal-complaint': 'from-violet-500/10 to-violet-500/5 border-violet-500/20',
    'finance-contact': 'from-purple-500/10 to-purple-500/5 border-purple-500/20',
    'finance-resource': 'from-violet-500/10 to-violet-500/5 border-violet-500/20',
    'health-sos': 'from-red-500/15 to-red-500/5 border-red-500/30',
    'health-timeline': 'from-amber-500/15 to-amber-500/5 border-amber-500/30',
    'health-notify': 'from-blue-500/15 to-blue-500/5 border-blue-500/30',
  };

  if (card.type === 'abha') {
    const [statusLine, summaryLine] = String(card.meta || '').split('||');
    const summaryPoints = (summaryLine || '')
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 5);

    return (
      <div
        className="mt-2 rounded-xl border border-red-500/25 bg-gradient-to-r from-red-500/10 via-red-500/5 to-transparent px-3 py-3"
        style={{ animation: 'fadeIn 0.3s ease-out' }}
      >
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: '#EF444425' }}>
            <span className="material-symbols-outlined text-base" style={{ color: '#EF4444' }}>{card.icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="font-bold text-slate-900 dark:text-white text-xs leading-tight">{card.title}</div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-red-600 dark:text-red-300 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">
                Secure Handoff
              </span>
            </div>
            <div className="text-[11px] text-slate-600 dark:text-gray-200 mt-1 leading-relaxed">{card.subtitle}</div>
            {statusLine && (
              <div className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-700 dark:text-gray-200 leading-relaxed">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF9933] mt-1 shrink-0" />
                <span>{statusLine}</span>
              </div>
            )}
            {summaryPoints.length > 0 && (
              <div className="mt-1.5 space-y-1">
                {summaryPoints.map((point, index) => (
                  <div key={`${point}-${index}`} className="flex items-start gap-1.5 text-[11px] text-slate-700 dark:text-gray-200 leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FF9933] mt-1 shrink-0" />
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            )}
            {card.actionLabel && (
              <button
                onClick={() => onTrack?.(card)}
                className="mt-2.5 text-[11px] px-3 py-1.5 font-semibold rounded-full border transition-all active:scale-95 hover:opacity-90"
                style={{
                  color: card.color,
                  borderColor: card.color + '40',
                  backgroundColor: card.color + '12',
                }}
              >
                {card.actionLabel} →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`mt-2 rounded-xl bg-gradient-to-br border px-3 py-2.5 ${BG[card.type]}`}
      style={{ animation: 'fadeIn 0.3s ease-out' }}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
          style={{ backgroundColor: card.color + '25' }}
        >
          <span className="material-symbols-outlined text-base" style={{ color: card.color }}>
            {card.icon}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-bold text-slate-900 dark:text-white leading-tight ${isCompactEmergencyCard ? 'text-xs' : 'text-xs'}`}>{card.title}</div>
          <div className={`text-slate-600 dark:text-gray-300 mt-0.5 leading-relaxed ${isCompactEmergencyCard ? 'text-[11px]' : 'text-[11px]'}`}>{card.subtitle}</div>
          {card.meta && (
            <div className={`text-slate-500 dark:text-gray-400 mt-0.5 leading-relaxed ${isCompactEmergencyCard ? 'text-[10px]' : 'text-[10px]'}`}>{card.meta}</div>
          )}
          {card.actionLabel && (
            <button
              onClick={() => onTrack?.(card)}
              className={`mt-2 font-semibold rounded-full border transition-all active:scale-95 hover:opacity-90 ${isCompactEmergencyCard ? 'text-[11px] px-3 py-1.5' : 'text-[11px] px-3 py-1.5'}`}
              style={{
                color: card.color,
                borderColor: card.color + '40',
                backgroundColor: card.color + '12',
              }}
            >
              {card.actionLabel} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Inline parser: **bold**, *italic*, `code` ────────────────────────────────
function inlineParse(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="font-semibold text-slate-900 dark:text-white">{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
      return <em key={i} className="italic text-orange-600 dark:text-orange-200">{part.slice(1, -1)}</em>;
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} className="font-mono text-[10px] bg-black/10 dark:bg-white/10 text-[#FF9933] px-1 py-0.5 rounded">{part.slice(1, -1)}</code>;
    return <span key={i}>{part}</span>;
  });
}

// ─── Full markdown-to-JSX renderer ────────────────────────────────────────────
function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const t = raw.trim();

    // ── Blank line → small gap ────────────────────────────────────────────────
    if (!t) {
      elements.push(<div key={`gap-${i}`} className="h-1.5" />);
      i++; continue;
    }

    // ── Horizontal rule ───────────────────────────────────────────────────────
    if (t === '---' || t === '***' || t === '___') {
      elements.push(<div key={`hr-${i}`} className="border-t border-black/10 dark:border-white/10 my-2" />);
      i++; continue;
    }

    // ── H1 heading (# text) ───────────────────────────────────────────────────
    if (t.startsWith('# ') && !t.startsWith('## ')) {
      elements.push(
        <div key={`h1-${i}`} className="font-bold text-slate-900 dark:text-white text-[13px] mt-2 mb-1 pb-1 border-b border-black/10 dark:border-white/10">
          {inlineParse(t.slice(2))}
        </div>
      );
      i++; continue;
    }

    // ── H2 heading (## text) ──────────────────────────────────────────────────
    if (t.startsWith('## ')) {
      elements.push(
        <div key={`h2-${i}`} className="flex items-center gap-1.5 mt-2.5 mb-1">
          <span className="w-1 h-4 rounded-full bg-[#FF9933] shrink-0" />
          <span className="font-bold text-slate-900 dark:text-white text-[12px]">{inlineParse(t.slice(3))}</span>
        </div>
      );
      i++; continue;
    }

    // ── H3 heading (### text) ─────────────────────────────────────────────────
    if (t.startsWith('### ')) {
      elements.push(
        <div key={`h3-${i}`} className="font-semibold text-orange-600 dark:text-orange-300 text-[11px] mt-1.5 mb-0.5">
          {inlineParse(t.slice(4))}
        </div>
      );
      i++; continue;
    }

    // ── Table block ───────────────────────────────────────────────────────────
    if (t.startsWith('|')) {
      const rows: string[][] = [];
      let isFirstDataRow = true;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const row = lines[i].trim();
        // Skip separator lines like |---|---|---|
        if (/^\|[\s\-|:]+\|$/.test(row)) { i++; isFirstDataRow = false; continue; }
        const cells = row.split('|').slice(1, -1).map((c) => c.trim());
        rows.push(cells);
        if (isFirstDataRow) isFirstDataRow = false;
        i++;
      }
      if (rows.length > 0) {
        elements.push(
          <div key={`tbl-${i}`} className="mt-2 mb-1.5 rounded-xl overflow-hidden border border-black/10 dark:border-white/10 text-[11px]">
            {rows.map((row, ri) => (
              <div key={ri} className={`flex divide-x divide-black/5 dark:divide-white/5 ${ri === 0 ? 'bg-blue-50 dark:bg-[#1a4fa3]/25' : ri % 2 === 1 ? 'bg-black/3 dark:bg-white/3' : ''}`}>
                {row.map((cell, ci) => (
                  <div key={ci} className={`flex-1 px-2.5 py-1.5 min-w-0 ${ri === 0 ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-gray-300'}`}>
                    {inlineParse(cell)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      }
      continue;
    }

    // ── Unordered list ────────────────────────────────────────────────────────
    if (/^[-•*]\s/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^[-•*]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-•*]\s/, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="mt-1 mb-1 space-y-1">
          {items.map((item, ii) => (
            <li key={ii} className="flex items-start gap-2 text-[12px] text-slate-700 dark:text-gray-200 leading-relaxed">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF9933] mt-1.5 shrink-0" />
              <span>{inlineParse(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // ── Ordered list ──────────────────────────────────────────────────────────
    if (/^\d+[.)\s]/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)\s]/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)\s]+/, ''));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="mt-1 mb-1 space-y-1">
          {items.map((item, ii) => (
            <li key={ii} className="flex items-start gap-2 text-[12px] text-slate-700 dark:text-gray-200 leading-relaxed">
              <span className="w-[18px] h-[18px] rounded-full bg-[#FF9933]/20 text-[#FF9933] text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                {ii + 1}
              </span>
              <span className="flex-1">{inlineParse(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // ── Regular paragraph ─────────────────────────────────────────────────────
    elements.push(
      <p key={`p-${i}`} className="text-[12.5px] text-slate-700 dark:text-gray-200 leading-relaxed">
        {inlineParse(t)}
      </p>
    );
    i++;
  }

  return elements;
}

// ─── Main export ───────────────────────────────────────────────────────────────
interface RichChatCardProps {
  content: string;
  agentKey: AgentKey;
  /** called when a card action is tapped (e.g. track complaint) */
  onAction?: (card: ParsedCard) => void;
}

export default function RichChatCard({ content, agentKey, onAction }: RichChatCardProps) {
  const { addTrackedItem, userProfile } = useAppStore();
  const citizenProfile = useAppStore((state) => state.citizenProfile);
  const healthPrograms = Array.isArray(citizenProfile?.linkedSchemes)
    ? citizenProfile.linkedSchemes.filter((scheme) => /ayushman|pmjay|abha|health|abdm|vaccin/i.test(String(scheme || ''))).slice(0, 3)
    : [];
  const abhaSuffix = String(citizenProfile?.aadhaarMasked || '').replace(/\D/g, '').slice(-4) || '0000';
  const profile = {
    name: citizenProfile?.name || userProfile.name,
    digipin: userProfile.digipin,
    abhaId: `14${abhaSuffix} ••• ••••`,
    healthSummary:
      healthPrograms.length > 0
        ? `Linked health records: ${healthPrograms.join(', ')}`
        : 'ABHA ID with health report sent for reference',
  };
  const cards = parseCards(content, agentKey, profile);
  const trackedRef = useRef<Set<string>>(new Set());

  // Auto-track grievance cards when first rendered
  useEffect(() => {
    cards.forEach((card) => {
      if (
        (card.type === 'grievance' || card.type === 'health' || card.type === 'legal') &&
        card.refId &&
        !trackedRef.current.has(card.refId)
      ) {
        trackedRef.current.add(card.refId);
        const item: TrackedItem = {
          id: `auto-${card.refId}-${Date.now()}`,
          type: card.type === 'grievance' ? 'grievance' : card.type === 'health' ? 'health' : 'legal',
          title: card.title,
          description: card.subtitle || '',
          status: 'Active',
          createdAt: Date.now(),
          agentKey,
          refId: card.refId,
          emoji: card.type === 'grievance' ? '📋' : card.type === 'health' ? '🏥' : '⚖️',
        };
        addTrackedItem(item);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCardAction = (card: ParsedCard) => {
    onAction?.(card);
  };

  const hasSwasthyaEmergencyCards =
    agentKey === 'swasthya_sahayak' &&
    cards.some((card) => ['emergency', 'health', 'health-sos', 'health-timeline', 'health-notify'].includes(card.type));

  const cardContainerClass = hasSwasthyaEmergencyCards
    ? 'grid grid-cols-1 gap-2 mt-2 items-start'
    : '';

  return (
    <div>
      <div className="space-y-0.5">
        {renderMarkdown(
          content
            .replace(/\n?ABHA Share Status:\s*(?:\n[-•*].*){1,6}/gi, '')
            .replace(/\n?~~TRACK_TAB~~/gi, '')
            .replace(/\s*~~VIDHI_LOCAL_POLICE:\d{3,}~~/gi, '')
            .replace(/\s*~~VIDHI_BING_MAP:https?:\/\/[^\s~]+~~/gi, '')
            .replace(/\s*~~VIDHI_RESOURCE_URL:https?:\/\/[^\s~]+~~/gi, '')
            .replace(/\s*~~VIDHI_FILE_COMPLAINT~~/gi, '')
            .replace(/\s*~~ARTHIK_CALL:\d{3,}~~/gi, '')
            .replace(/\s*~~ARTHIK_RESOURCE_URL:https?:\/\/[^\s~]+~~/gi, '')
            .replace(/\s*~~SWASTHYA_CALL:\d{3,}~~/gi, '')
            .replace(/\s*~~SWASTHYA_HOSPITAL_MAP:https?:\/\/[^\s~]+~~/gi, '')
            .replace(/\s*~~SWASTHYA_HOSPITAL_INFO:[^~]+~~/gi, '')
            .replace(/\s*~~SWASTHYA_TIMELINE:[A-Z0-9-]+\|\d{1,3}~~/gi, '')
            .replace(/\s*~~SWASTHYA_NOTIFY:[^~]+~~/gi, '')
            .replace(/\s*~~SWASTHYA_SOS_TRIGGER~~/gi, '')
            .replace(/\s*~~SWASTHYA_ABHA_SHARE:[^~]+~~/gi, '')
            .replace(/Actions:\s*/gi, '')
            .replace(/^Nearest Police \(Bing Maps\):.*$/gim, '')
            .replace(/^Local Police Contact:.*$/gim, '')
            .replace(/^Official Legal Resource:.*$/gim, '')
            .replace(/^Resource Link:.*$/gim, '')
            .replace(/^Official Financial Resource:.*$/gim, '')
            .replace(/^https?:\/\/www\.bing\.com\/maps\?[^\s]*$/gim, '')
            .replace(/\n{3,}/g, '\n\n')
        )}
      </div>
      <div className={cardContainerClass}>
        {cards.map((card, i) => (
          <InlineCard key={i} card={card} onTrack={handleCardAction} />
        ))}
      </div>
    </div>
  );
}
