'use client';

import { ScreenKey } from '@/lib/screens';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAppStore } from '@/lib/store';

interface BottomNavProps {
  activeTab: string;
  onNavigate: (screen: ScreenKey) => void;
  onServicesOpen: () => void;
}

export default function BottomNav({ activeTab, onNavigate, onServicesOpen }: BottomNavProps) {
  const { t } = useTranslation();
  const trackBadge = useAppStore(state => state.trackBadge);

  const tabs = [
    { key: 'home', icon: 'home', label: t('navHome', 'Home'), screen: 'home' as ScreenKey },
    { key: 'services', icon: 'apps', label: t('navServices', 'Services'), screen: null },
    { key: 'cases', icon: 'assignment', label: t('navTrack', 'Track'), screen: 'cases' as ScreenKey },
    { key: 'community', icon: 'groups', label: t('navCommunity', 'Community'), screen: 'community' as ScreenKey },
    { key: 'profile', icon: 'person', label: t('navProfile', 'Profile'), screen: 'profile' as ScreenKey },
  ];

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50">
      {/* Tricolor GoI stripe at top of nav */}
      <div className="w-full h-[2px] flex">
        <div className="flex-1 bg-[#FF9933]" />
        <div className="flex-1 bg-white/40" />
        <div className="flex-1 bg-[#138808]" />
      </div>
      {/* Frost glass background with safe area adjustment padding */}
      <div className="bg-slate-50/90 dark:bg-[#0a1628]/90 backdrop-blur-2xl border-t border-black/10 dark:border-white/10 px-2 pb-[calc(env(safe-area-inset-bottom,8px)+4px)] pt-2">
        <div className="flex items-center justify-between w-full">
          {tabs.map((tab) => {
            const isActive = activeTab === (tab.screen || tab.key);

            return (
              <button
                key={tab.key}
                onClick={() => {
                  if (tab.key === 'services') {
                    onServicesOpen();
                  } else if (tab.screen) {
                    onNavigate(tab.screen);
                  }
                }}
                className={`flex-1 relative flex flex-col items-center justify-center gap-1 py-1 px-1 rounded-xl transition-all duration-300 ${
                  isActive 
                    ? 'text-[#FF9933] scale-105' 
                    : 'text-gray-400 hover:text-slate-600 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[24px] transition-all ${isActive ? 'font-bold' : ''}`}
                  style={isActive ? { fontVariationSettings: "'FILL' 1, 'wght' 700" } : {}}
                >
                  {tab.icon}
                </span>
                <span className={`text-[10px] tracking-wide transition-all ${isActive ? 'font-bold' : 'font-medium'}`}>
                  {tab.label}
                </span>

                {/* Active indicator dot */}
                {isActive && (
                  <span className="absolute -bottom-1 w-6 h-[3px] rounded-t-full bg-[#FF9933] shadow-[0_0_8px_rgba(255,153,51,0.5)]"></span>
                )}
                {/* Notification Badge */}
                {tab.key === 'cases' && trackBadge > 0 && (
                  <div className="absolute top-0.5 right-1.5 min-w-[16px] h-[16px] rounded-full bg-red-500 border-2 border-slate-50 dark:border-[#0a1628] flex items-center justify-center text-[9px] font-bold text-white px-1 shadow-[0_2px_4px_rgba(239,68,68,0.4)] animate-pulse">
                    {trackBadge}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
