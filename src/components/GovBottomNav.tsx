'use client';

import { useAppStore } from '@/lib/store';
import { useTranslation } from '@/lib/i18n/useTranslation';

export type GovTab = 'home' | 'cases' | 'analytics' | 'twin' | 'alerts' | 'admin';

interface GovBottomNavProps {
  activeTab: GovTab;
  onNavigate: (screen: GovTab) => void;
}

export default function GovBottomNav({ activeTab, onNavigate }: GovBottomNavProps) {
  const trackBadge = useAppStore(state => state.trackBadge);
  const { t } = useTranslation();

  const tabs = [
    { key: 'home', icon: 'hub', label: t('govNavDashboard', 'Dashboard') },
    { key: 'cases', icon: 'assignment', label: t('govNavCases', 'Cases') },
    { key: 'analytics', icon: 'query_stats', label: t('govNavAnalytics', 'Analytics') },
    { key: 'twin', icon: 'psychology', label: t('govNavTwin', 'Twin') },
    { key: 'alerts', icon: 'campaign', label: t('govNavAlerts', 'Alerts') },
    { key: 'admin', icon: 'shield_person', label: t('govNavAdmin', 'Admin') },
  ] as const;

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50">
      {/* Green gov stripe */}
      <div className="w-full h-[2px] flex">
        <div className="flex-1 bg-[#138808]" />
        <div className="flex-1 bg-black/10 dark:bg-white/20" />
        <div className="flex-1 bg-[#138808]" />
      </div>
      <div className="bg-white/95 dark:bg-[#050d1a]/95 backdrop-blur-2xl border-t border-[#138808]/20 px-1 pb-[calc(env(safe-area-inset-bottom,8px)+4px)] pt-1.5">
        <div className="flex items-center justify-between w-full">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => onNavigate(tab.key)}
                className={`flex-1 relative flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl transition-all duration-300 ${
                  isActive
                    ? 'text-[#138808] scale-105'
                    : 'text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300'
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[22px] transition-all ${isActive ? 'font-bold' : ''}`}
                  style={isActive ? { fontVariationSettings: "'FILL' 1, 'wght' 700" } : {}}
                >
                  {tab.icon}
                </span>
                <span className={`text-[9px] tracking-wide transition-all ${isActive ? 'font-bold' : 'font-medium'}`}>
                  {tab.label}
                </span>
                {isActive && (
                  <span className="absolute -bottom-0.5 w-5 h-[2px] rounded-t-full bg-[#138808] shadow-[0_0_6px_rgba(19,136,8,0.4)]" />
                )}
                {tab.key === 'cases' && trackBadge > 0 && (
                  <div className="absolute top-0 right-1 min-w-[14px] h-[14px] rounded-full bg-red-500 border-2 border-white dark:border-[#050d1a] flex items-center justify-center text-[8px] font-bold text-white px-0.5 shadow-[0_2px_4px_rgba(239,68,68,0.4)] animate-pulse">
                    {trackBadge}
                  </div>
                )}
                {tab.key === 'alerts' && (
                  <div className="absolute top-0 right-2 w-2 h-2 rounded-full bg-red-500 border border-white dark:border-[#050d1a] animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
