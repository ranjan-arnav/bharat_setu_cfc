'use client';

import { ScreenKey } from '@/lib/screens';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface ScreenDrawerProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (screen: ScreenKey) => void;
  activeScreen: ScreenKey;
}

export default function ScreenDrawer({ open, onClose, onNavigate, activeScreen }: ScreenDrawerProps) {
  const { t } = useTranslation();

  const serviceGroups = [
    {
      title: t('aiAgents'),
      items: [
        { key: 'civic' as ScreenKey, icon: 'account_balance', label: 'Nagarik Mitra', desc: t('civicServices'), color: '#3B82F6' },
        { key: 'health' as ScreenKey, icon: 'health_and_safety', label: 'Swasthya Sahayak', desc: t('healthAssistant'), color: '#10B981' },
        { key: 'welfare' as ScreenKey, icon: 'volunteer_activism', label: 'Yojana Saathi', desc: t('welfareSchemes'), color: '#F59E0B' },
        { key: 'finance' as ScreenKey, icon: 'account_balance_wallet', label: 'Arthik Salahkar', desc: t('financeAdvisor'), color: '#8B5CF6' },
        { key: 'legal' as ScreenKey, icon: 'gavel', label: 'Vidhi Sahayak', desc: t('legalAid'), color: '#EF4444' },
      ],
    },
    {
      title: t('smartTools'),
      items: [
        { key: 'kisan-mitra' as ScreenKey, icon: 'agriculture', label: 'Kisan Mitra', desc: 'Mandi, crop advisor, diagnosis', color: '#16A34A' },
        { key: 'help-neighbour' as ScreenKey, icon: 'description', label: t('documentExplainer', 'Document Explainer'), desc: t('documentExplainerDesc', 'Read letters and explain simply'), color: '#F43F5E' },
        { key: 'scheme-scanner' as ScreenKey, icon: 'qr_code_scanner', label: t('schemeDNAScanner'), desc: t('schemeScanDesc'), color: '#FF9933' },
        { key: 'xray-tracker' as ScreenKey, icon: 'track_changes', label: t('bureaucracyXRay'), desc: t('trackApplications'), color: '#06B6D4' },
        { key: 'karma' as ScreenKey, icon: 'military_tech', label: t('civicKarma'), desc: t('yourImpactScore'), color: '#FFD700' },
      ],
    },
  ];

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed bottom-[72px] left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50 px-3 pb-2"
        style={{ animation: 'slideUp 0.3s ease-out' }}
      >
        <div className="bg-slate-50/95 dark:bg-[#0f1f3a]/95 backdrop-blur-2xl rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden max-h-[60vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-slate-50/95 dark:bg-[#0f1f3a]/95 backdrop-blur-xl px-4 py-3 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#FF9933]">apps</span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('allServices')}</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-full hover:bg-black/10 dark:bg-white/10 transition-colors"
            >
              <span className="material-symbols-outlined text-slate-500 dark:text-gray-400 text-xl">close</span>
            </button>
          </div>

          {/* Service groups */}
          {serviceGroups.map((group) => (
            <div key={group.title} className="px-4 py-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400 mb-2">
                {group.title}
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {group.items.map((item) => {
                  const isActive = activeScreen === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => onNavigate(item.key)}
                      className={`
                        flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all duration-200
                        ${isActive
                          ? 'bg-black/10 dark:bg-white/10 border border-black/20 dark:border-white/20 scale-[1.02]'
                          : 'hover:bg-black/5 dark:bg-white/5 border border-transparent'
                        }
                      `}
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: `${item.color}20`, border: `1px solid ${item.color}40` }}
                      >
                        <span
                          className="material-symbols-outlined text-lg"
                          style={{ color: item.color }}
                        >
                          {item.icon}
                        </span>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] font-semibold text-slate-900 dark:text-white leading-tight">
                          {item.label}
                        </p>
                        <p className="text-[8px] text-slate-500 dark:text-gray-400 mt-0.5">{item.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
