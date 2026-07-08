'use client';

import { useState, useRef, useEffect } from 'react';
import { useAppStore, type AgentKey } from '@/lib/store';

interface GovChip {
  icon: string;
  label: string;
  sublabel?: string;
  badge?: string;
  color: string;         // Tailwind bg color
  status: 'verified' | 'active' | 'pending' | 'nearby' | 'none';
  portal?: string;
}

const CHIP_YEAR = new Date().getFullYear();

const GOV_CHIPS: Record<AgentKey, GovChip[]> = {
  nagarik_mitra: [
    { icon: 'folder_open', label: 'DigiLocker', sublabel: '7 docs', badge: '✓', color: '#3B82F6', status: 'verified', portal: 'digilocker.gov.in' },
    { icon: 'article', label: 'e-District', sublabel: 'UP', color: '#6366F1', status: 'active', portal: 'edistrict.up.gov.in' },
    { icon: 'support_agent', label: 'PGPortal', sublabel: 'PM-GRIEVANCE', color: '#14B8A6', status: 'none', portal: 'pgportal.gov.in' },
    { icon: 'privacy_tip', label: 'RTI Online', sublabel: 'File RTI', color: '#F59E0B', status: 'none', portal: 'rtionline.gov.in' },
    { icon: 'location_on', label: 'DIGIPIN', sublabel: 'Not set', badge: '●', color: '#10B981', status: 'active' },
  ],
  swasthya_sahayak: [
    { icon: 'favorite', label: 'ABHA ID', sublabel: '14558 ••• ••••', badge: '✓', color: '#EF4444', status: 'verified', portal: 'healthid.ndhm.gov.in' },
    { icon: 'health_and_safety', label: 'Ayushman', sublabel: '₹5L cover', badge: '✓', color: '#10B981', status: 'active', portal: 'pmjay.gov.in' },
    { icon: 'vaccines', label: 'U-WIN', sublabel: '3 due', badge: '3', color: '#3B82F6', status: 'pending', portal: 'uwin.mohfw.gov.in' },
    { icon: 'local_pharmacy', label: 'Jan Aushadhi', sublabel: '0.8 km', badge: '→', color: '#F59E0B', status: 'nearby', portal: 'janaushadhi.gov.in' },
    { icon: 'emergency', label: '108 Ambulance', sublabel: 'Tap to call', color: '#EF4444', status: 'none' },
  ],
  yojana_saathi: [
    { icon: 'agriculture', label: 'PM-KISAN', sublabel: '₹2000 in 14d', badge: '⏰', color: '#F59E0B', status: 'pending', portal: 'pmkisan.gov.in' },
    { icon: 'account_balance', label: 'Jan Samarth', sublabel: 'Loan linkage', color: '#8B5CF6', status: 'none', portal: 'jansamarth.in' },
    { icon: 'monetization_on', label: 'DBT Tracker', sublabel: '₹8,000 received', badge: '✓', color: '#10B981', status: 'verified', portal: 'dbtbharat.gov.in' },
    { icon: 'corporate_fare', label: 'MGNREGA', sublabel: '24 days due', badge: '!', color: '#EF4444', status: 'pending', portal: 'nrega.nic.in' },
    { icon: 'grass', label: 'Fasal Bima', sublabel: `Kharif ${CHIP_YEAR}`, badge: '✓', color: '#14B8A6', status: 'active', portal: 'pmfby.gov.in' },
  ],
  arthik_salahkar: [
    { icon: 'account_balance', label: 'Jan Dhan', sublabel: 'SBI ••4821', badge: '✓', color: '#8B5CF6', status: 'verified', portal: 'pmjdy.gov.in' },
    { icon: 'shield', label: 'PMJJBY', sublabel: '₹2L life cover', badge: '✓', color: '#10B981', status: 'active', portal: 'jansuraksha.gov.in' },
    { icon: 'trending_up', label: 'Mudra Loan', sublabel: 'Check eligibility', color: '#F59E0B', status: 'none', portal: 'mudra.org.in' },
    { icon: 'report', label: '1930 Cyber', sublabel: 'Report fraud', color: '#EF4444', status: 'none' },
    { icon: 'savings', label: 'SSY / NSC', sublabel: 'Post office', color: '#3B82F6', status: 'none', portal: 'indiapost.gov.in' },
  ],
  vidhi_sahayak: [
    { icon: 'gavel', label: 'NALSA', sublabel: 'Free legal aid', badge: '✓', color: '#EF4444', status: 'active', portal: 'nalsa.gov.in' },
    { icon: 'balance', label: 'eCourts', sublabel: 'Case tracker', color: '#8B5CF6', status: 'none', portal: 'ecourts.gov.in' },
    { icon: 'record_voice_over', label: 'Tele-Law', sublabel: 'Video consult', color: '#3B82F6', status: 'none', portal: 'tele-law.in' },
    { icon: 'local_police', label: 'Zero FIR', sublabel: 'Any police station', color: '#F59E0B', status: 'none' },
    { icon: 'groups', label: 'Consumer', sublabel: 'File complaint', color: '#14B8A6', status: 'none', portal: 'consumerhelpline.gov.in' },
  ],
  kisan_mitra: [
    { icon: 'grass', label: 'PM-Kisan', sublabel: '₹2000 in 14d', badge: '⏰', color: '#84CC16', status: 'pending', portal: 'pmkisan.gov.in' },
    { icon: 'credit_card', label: 'KCC', sublabel: 'Credit Limit', badge: '✓', color: '#8B5CF6', status: 'verified' },
    { icon: 'storefront', label: 'e-NAM', sublabel: 'Mandi Prices', color: '#3B82F6', status: 'active', portal: 'enam.gov.in' },
    { icon: 'water_drop', label: 'PMKSY', sublabel: 'Micro Irrigation', color: '#10B981', status: 'none', portal: 'pmksy.gov.in' },
    { icon: 'science', label: 'Soil Health', sublabel: 'Card valid', badge: '✓', color: '#F59E0B', status: 'verified', portal: 'soilhealth.dac.gov.in' },
  ],
};

const STATUS_DOT: Record<GovChip['status'], string> = {
  verified: 'bg-green-400',
  active: 'bg-green-400',
  pending: 'bg-amber-400 animate-pulse',
  nearby: 'bg-blue-400',
  none: 'bg-transparent',
};

import { useTranslation } from '@/lib/i18n/useTranslation';

export default function GovStatusBar({ agentKey }: { agentKey: AgentKey }) {
  const { userProfile } = useAppStore();
  const { t } = useTranslation();
  const rawChips = GOV_CHIPS[agentKey] || [];

  // Overlay live profile data onto the static chip definitions
  const chips = rawChips.map((chip) => {
    if (chip.label === 'DIGIPIN' && userProfile.digipin) {
      return { ...chip, sublabel: userProfile.digipin.slice(0, 10) };
    }
    if (chip.label === 'ABHA ID' && userProfile.name) {
      return { ...chip, sublabel: `${userProfile.name.slice(0, 8)} · ABHA` };
    }
    if (chip.label === 'Jan Dhan' && userProfile.name) {
      return { ...chip, sublabel: `${userProfile.name.split(' ')[0]}'s account` };
    }
    if (chip.label === 'e-District' && userProfile.state) {
      return { ...chip, sublabel: userProfile.state.slice(0, 2).toUpperCase() };
    }
    return chip;
  });
  const [tooltip, setTooltip] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dismiss tooltip on outside click
  useEffect(() => {
    if (!tooltip) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setTooltip(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tooltip]);

  return (
    <div ref={containerRef} className="px-3 py-2 border-b border-black/5 dark:border-white/5 bg-slate-50/80 dark:bg-[#0a1628]/80">
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
        {chips.map((chip) => (
          <button
            key={chip.label}
            onClick={() => setTooltip(tooltip === chip.label ? null : chip.label)}
            className="shrink-0 flex items-center gap-1.5 bg-black/5 dark:bg-white/5 border border-white/8 rounded-full px-2.5 py-1 hover:bg-black/10 dark:bg-white/10 active:scale-95 transition-all relative"
          >
            {/* Status dot */}
            {chip.status !== 'none' && (
              <span
                className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-50 dark:border-[#0a1628] ${STATUS_DOT[chip.status]}`}
              />
            )}

            {/* Icon */}
            <span
              className="material-symbols-outlined text-[14px] shrink-0"
              style={{ color: chip.color }}
            >
              {chip.icon}
            </span>

            {/* Label */}
            <span className="text-[10px] text-slate-600 dark:text-gray-300 font-medium whitespace-nowrap">
              {t(chip.label, chip.label)}
            </span>

            {/* Badge */}
            {chip.badge && (
              <span
                className="text-[9px] font-bold rounded-full px-1 leading-tight"
                style={{ color: chip.color }}
              >
                {chip.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tooltip / Popover */}
      {tooltip && (() => {
        const chip = chips.find(c => c.label === tooltip);
        if (!chip) return null;
        return (
          <div
            className="mt-2 mx-1 bg-white dark:bg-[#0f1f3a] border border-black/10 dark:border-white/10 rounded-xl p-3 flex items-center gap-3 shadow-xl"
            style={{ animation: 'fadeIn 0.15s ease-out' }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: chip.color + '26' }}
            >
              <span className="material-symbols-outlined text-lg" style={{ color: chip.color }}>
                {chip.icon}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                <span className="font-semibold">{t(chip.label, chip.label)}</span>
                {(chip.sublabel || chip.status === 'pending') && (
                  <span className="opacity-80 mx-1">•</span>
                )}
                {chip.sublabel && (
                  <span className="opacity-90 max-w-[100px] truncate">{t(chip.sublabel, chip.sublabel)}</span>
                )}
              </div>
              {chip.portal && (
                <div className="text-[9px] text-gray-500 mt-0.5">🔗 {chip.portal}</div>
              )}
            </div>
            <div
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${chip.status === 'verified' || chip.status === 'active'
                  ? 'border-green-500/30 text-green-400 bg-green-500/10'
                  : chip.status === 'pending'
                    ? 'border-amber-500/30 text-amber-400 bg-amber-500/10'
                    : chip.status === 'nearby'
                      ? 'border-blue-500/30 text-blue-400 bg-blue-500/10'
                      : 'border-black/10 dark:border-white/10 text-slate-500 dark:text-gray-400'
                }`}
            >
              {chip.status === 'verified' ? 'Linked' : chip.status === 'active' ? 'Active' : chip.status === 'pending' ? 'Pending' : chip.status === 'nearby' ? 'Nearby' : 'Tap'}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
