'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface NeighbourIssue {
  emoji: string;
  label: string;
  count: number;
  trend: 'up' | 'down' | 'stable';
  pressure: number; // 0–100 LokPal-O-Meter
  refId?: string;
  color: string;
}

const THIS_YEAR = new Date().getFullYear();

const NEIGHBOURHOOD_ISSUES: NeighbourIssue[] = [
  { emoji: '🔦', label: 'Broken Streetlights', count: 18, trend: 'up', pressure: 72, color: '#F59E0B', refId: `GRV-NM-${THIS_YEAR}-0847` },
  { emoji: '💧', label: 'Water Supply Irregular', count: 31, trend: 'up', pressure: 88, color: '#3B82F6', refId: `WTR-NM-${THIS_YEAR}-0311` },
  { emoji: '🕳️', label: 'Potholes — Sector 12', count: 12, trend: 'stable', pressure: 51, color: '#EF4444', refId: `RD-NM-${THIS_YEAR}-0194` },
  { emoji: '🗑️', label: 'Garbage Not Collected', count: 9, trend: 'down', pressure: 38, color: '#10B981', refId: `ENV-NM-${THIS_YEAR}-0076` },
  { emoji: '⚡', label: 'Power Outages', count: 6, trend: 'stable', pressure: 44, color: '#8B5CF6' },
];

/**
 * LokPal-O-Meter: animated horizontal pressure bar
 * Red zone ≥ 80%, Amber 50–79%, Green < 50%
 */
function LokPalMeter({ value }: { value: number }) {
  const meterColor =
    value >= 80 ? '#EF4444' :
      value >= 50 ? '#F59E0B' :
        '#10B981';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, backgroundColor: meterColor }}
        />
      </div>
      <span
        className="text-[9px] font-bold tabular-nums"
        style={{ color: meterColor }}
      >
        {value}%
      </span>
    </div>
  );
}

const TREND_ICON: Record<NeighbourIssue['trend'], string> = {
  up: '↑',
  down: '↓',
  stable: '→',
};
const TREND_COLOR: Record<NeighbourIssue['trend'], string> = {
  up: 'text-red-400',
  down: 'text-green-400',
  stable: 'text-yellow-400',
};

export default function NagarPulse() {
  const { t } = useTranslation();
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const { userProfile, citizenProfile } = useAppStore();
  const digipinZone = (userProfile.digipin || '88-H2K').slice(0, 6);
  const locationLabel = citizenProfile?.district
    ? `${citizenProfile.district}, ${citizenProfile.state || 'India'}`
    : 'Your Area';

  const handleJoin = (label: string) => {
    setJoined(prev => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  return (
    <div className="rounded-2xl bg-black/3 dark:bg-white/3 border border-black/5 dark:border-white/8 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-[#FF9933]/10 to-[#138808]/10 border-b border-black/5 dark:border-white/8 flex items-center gap-2.5">
        <div className="relative">
          <div className="w-9 h-9 rounded-full bg-[#FF9933]/15 flex items-center justify-center">
            <span className="material-symbols-outlined text-[#FF9933] text-[18px]">location_city</span>
          </div>
          {/* Live pulse dot */}
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5">
            <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-60"></span>
            <span className="absolute inset-0 rounded-full bg-green-400"></span>
          </span>
        </div>
        <div>
          <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            {t('NagarSamwad Pulse', 'NagarSamwad Pulse')}
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">{t("live")}</span>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-gray-400">{t('DIGIPIN Zone:', 'DIGIPIN Zone:')} {digipinZone} · {locationLabel}</div>
        </div>
      </div>

      {/* Collective complaint gauge — total */}
      <div className="px-4 py-2.5 bg-[#FF9933]/5 border-b border-black/5 dark:border-white/5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-slate-500 dark:text-gray-400">{t("zoneActivityMeter")}</span>
          <span className="text-[10px] font-semibold text-[#FF9933]">76 {t("activeComplaintsCount")}</span>
        </div>
        <div className="h-2 bg-black/5 dark:bg-white/8 rounded-full overflow-hidden">
          <div className="h-full w-[76%] bg-gradient-to-r from-[#FF9933] to-[#EF4444] rounded-full relative">
            <span className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow shadow-orange-500/50 -mr-1.5"></span>
          </div>
        </div>
        <div className="text-[9px] text-gray-500 mt-1">⚡ {t('High activity — collective action boosts resolution 5×', 'High activity — collective action boosts resolution 5×')}</div>
      </div>

      {/* Issue list */}
      <div className="divide-y divide-black/5 dark:divide-white/5">
        {NEIGHBOURHOOD_ISSUES.map((issue) => {
          const isJoined = joined.has(issue.label);
          const isExpanded = expanded === issue.label;

          return (
            <div key={issue.label}>
              <button
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-black/3 dark:hover:bg-white/3 transition-colors active:bg-black/5 dark:active:bg-white/5 text-left"
                onClick={() => setExpanded(isExpanded ? null : issue.label)}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                  style={{ backgroundColor: issue.color + '18' }}
                >
                  {issue.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-700 dark:text-gray-200 leading-tight truncate">{t(issue.label, issue.label)}</div>
                  <LokPalMeter value={issue.pressure} />
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                  <span
                    className={`text-[11px] font-bold ${TREND_COLOR[issue.trend]}`}
                  >
                    {TREND_ICON[issue.trend]} {issue.count}
                  </span>
                  <span className="text-[9px] text-gray-500">{t('neighbours', 'neighbours')}</span>
                </div>
              </button>

              {/* Expanded action panel */}
              {isExpanded && (
                <div
                  className="mx-3 mb-3 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/8"
                  style={{ animation: 'fadeIn 0.2s ease-out' }}
                >
                  {issue.refId && (
                    <div className="text-[10px] text-slate-500 dark:text-gray-400 mb-2">
                      📋 {t('Ref:', 'Ref:')} <span className="text-slate-900 dark:text-white font-semibold">{issue.refId}</span>
                    </div>
                  )}
                  <div className="text-[10px] text-slate-500 dark:text-gray-400 mb-3">
                    {issue.count} {t('residents in', 'residents in')} {digipinZone} {t('zone have raised', 'zone have raised')} <strong className="text-slate-900 dark:text-white">{t(issue.label, issue.label)}</strong>. {t('Joining makes it', 'Joining makes it')}{' '}
                    <strong className="text-[#FF9933]">{t('5× more likely to resolve', '5× more likely to resolve')}</strong> {t('in 48 hrs.', 'in 48 hrs.')}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleJoin(issue.label); }}
                    className={`w-full py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${isJoined
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-[#FF9933]/15 text-[#FF9933] border border-[#FF9933]/30 hover:bg-[#FF9933]/25'
                      }`}
                  >
                    {isJoined
                      ? `✓ ${t('आप जुड़ गए —', 'आप जुड़ गए —')} ${issue.count + 1} ${t('collective voices', 'collective voices')}`
                      : `🤝 ${t('Join', 'Join')} ${issue.count} ${t('Neighbours', 'Neighbours')}`}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-black/5 dark:border-white/5 flex items-center justify-between">
        <span className="text-[10px] text-gray-500">{t("poweredByDigipin")}</span>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
          <span className="text-[10px] text-green-400">{t('Live sync', 'Live sync')}</span>
        </div>
      </div>
    </div>
  );
}
