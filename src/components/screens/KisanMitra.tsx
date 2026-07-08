'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CropRecommendation from './kisan/CropRecommendation';
import CropDiagnosis from './kisan/CropDiagnosis';
import InputFinder from './kisan/InputFinder';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { FlagStripe } from '@/components/ui/GoiElements';

export default function KisanMitraScreen() {
  const [tab, setTab] = useState<'advisor' | 'diagnosis' | 'inputs'>('advisor');
  const { t } = useTranslation();

  const tabs = [
    { id: 'advisor', label: t('cropRecommendation.title', 'Crop Advisor'), icon: 'eco' },
    { id: 'diagnosis', label: t('dashboard.cropDiagnosis.title', 'Crop Diagnosis'), icon: 'psychiatry' },
    { id: 'inputs', label: t('inputFinder.title', 'Input Finder'), icon: 'storefront' },
  ] as const;

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-[#071020] text-slate-900 dark:text-slate-100 font-sans pb-24 w-full">
      <FlagStripe />
      
      {/* Top Bar - Sticky Glassmorphic Header */}
      <header className="sticky top-0 z-30 bg-slate-50 dark:bg-[#071020] border-b border-slate-200 dark:border-white/10 px-4 pt-6 pb-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button 
              className="flex items-center justify-center p-2 -ml-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              onClick={() => window.dispatchEvent(new MessageEvent('message', {
                data: { source: 'bharat-setu-iframe', action: 'navigate', screen: 'home' }
              }))}
            >
              <span className="material-symbols-outlined font-normal text-slate-700 dark:text-slate-300">arrow_back</span>
            </button>
            <div className="flex flex-col">
              <h1 className="text-xl font-black flex items-center gap-2 tracking-tight text-[#138808] dark:text-[#28a745]">
                <span className="material-symbols-outlined font-normal">agriculture</span>
                <span>Kisan Mitra</span>
              </h1>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-none mt-1 ml-8">
                AI Powered Smart Farming
              </p>
            </div>
          </div>
        </div>

        {/* Animated Segmented Control */}
        <div className="relative flex p-1 bg-slate-200/50 dark:bg-slate-800/80 rounded-2xl w-full">
          {tabs.map((t) => {
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as typeof tab)}
                className={`relative flex-1 flex flex-col items-center justify-center py-2 z-10 transition-colors duration-300 ${
                  isActive ? 'text-[#138808] dark:text-[#28a745]' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabKisan"
                    className="absolute inset-0 bg-white dark:bg-slate-900 shadow-sm border border-black/5 dark:border-white/5 rounded-xl -z-10"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="material-symbols-outlined text-[20px] mb-1">{t.icon}</span>
                <span className="text-[10px] font-bold tracking-tight px-1 text-center leading-tight">
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 px-4 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {tab === 'advisor' && <CropRecommendation />}
            {tab === 'diagnosis' && <CropDiagnosis darkMode={false} />}
            {tab === 'inputs' && <InputFinder />}
          </motion.div>
        </AnimatePresence>
      </main>

    </div>
  );
}
