'use client';
import Image from 'next/image';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAppStore } from '@/lib/store';
import { motion } from 'framer-motion';

export default function SchemeScanner() {
  const { t } = useTranslation();
  const { userProfile, citizenProfile } = useAppStore();

  const name = userProfile?.name || 'Ramesh Kumar';
  const district = citizenProfile?.district || 'Dumka';
  const state = citizenProfile?.state || 'Jharkhand';
  const income = citizenProfile?.income ? `₹${citizenProfile.income}/yr` : '₹48,000/yr';
  const occupation = citizenProfile?.occupation || 'Farmer (2.3 acres)';
  const rationType = citizenProfile?.rationCardType || 'ST (Scheduled Tribe)';

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } };
  const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

  return (
    <div className="flex flex-col min-h-full bg-slate-50 dark:bg-[#071020] text-slate-900 dark:text-slate-100 font-sans pb-24 h-full overflow-y-auto w-full absolute top-0 left-0">
      
      {/* Top Bar */}
      <header className="sticky top-0 z-50 bg-slate-50/80 dark:bg-[#071020]/80 backdrop-blur-md border-b border-slate-200 dark:border-white/10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button className="flex items-center justify-center p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
            <span className="material-symbols-outlined font-normal">arrow_back</span>
          </button>
          <h1 className="text-lg font-bold flex items-center gap-2 tracking-tight">
            <span className="material-symbols-outlined font-normal text-amber-500">fingerprint</span>
            <span>{t('dna', 'योजना DNA स्कैनर')}</span>
          </h1>
        </div>
        <button className="relative p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10">
          <span className="material-symbols-outlined font-normal text-slate-600 dark:text-slate-300">notifications</span>
          <span className="absolute top-1.5 right-1.5 size-2.5 bg-red-500 rounded-full border-2 border-slate-50 dark:border-[#071020]"></span>
        </button>
      </header>

      <main className="flex-1 px-4 pb-24 space-y-6">
        
        {/* Score Ring */}
        <div className="py-8 flex flex-col items-center">
          <div className="relative size-48 flex items-center justify-center rounded-full" style={{ background: 'conic-gradient(#f59e0b 0% 73%, rgba(245,158,11,0.1) 73% 100%)' }}>
            <div className="size-[85%] bg-slate-50 dark:bg-[#071020] rounded-full flex flex-col items-center justify-center shadow-inner">
              <span className="text-5xl font-black text-amber-500 tracking-tighter">73%</span>
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">{t('score', 'Score')}</span>
            </div>
          </div>
          <div className="mt-6 text-center max-w-xs">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">{t('yourBenefitScore', 'Your Benefit Score')}</p>
            <p className="text-xs text-slate-500 leading-relaxed font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 px-3 py-2 rounded-lg border border-amber-500/20">
              {t('youAreReceiving73', 'You are receiving 73% of benefits you\'re eligible for. 4 unclaimed schemes found!')}
            </p>
          </div>
        </div>

        {/* Profile Details Card */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white dark:bg-slate-800/80 rounded-2xl p-5 border border-slate-200 dark:border-white/5 shadow-sm relative overflow-hidden">
          <div className="flex items-center gap-4">
            <div className="size-16 rounded-full border-2 border-amber-500/30 p-1 bg-amber-500/10">
              <Image src="https://lh3.googleusercontent.com/aida-public/AB6AXuAFIWk5k2cLkEQuZJwq3VZQbX8Vopb8wOL4pcg3gP8wgL6sKBoVsLRVl11b9b5Vr-RkylKrZUsxezvcTijzSdxUkBvAYjaeXdBLvaKiGF8SmJFtNaa_Fiv36YQ58wdzRPT1MkxxtpNpk3tCPkJoarsIqNI0adwRVUDfSjwrz67N2laXk79zdz_0PS_je3_sWos4xEK18sVQvOeeC2jXVkxbx4y_oT1gGETCSvCdlj-1iD20QMyXCARw-fYf7_8E1pdE11ZLOV5d9d4" alt="Profile" width={56} height={56} unoptimized className="size-full rounded-full object-cover" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">{name}</h2>
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-mono tracking-tighter bg-amber-500/10 inline-block px-1.5 py-0.5 rounded border border-amber-500/20">{t('aadhaarXxxxxxxx4521', 'Aadhaar XXXX-XXXX-4521')}</p>
            </div>
          </div>
          
          <div className="mt-5 grid grid-cols-2 gap-y-4 gap-x-4 border-t border-slate-100 dark:border-white/5 pt-4">
            <div>
              <p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold mb-0.5">{t('location', 'Location')}</p>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{district}, {state}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold mb-0.5">{t('income', 'Income')}</p>
              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{income}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold mb-0.5">{t('occupation', 'Occupation')}</p>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{occupation}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold mb-0.5">{t('category', 'Category')}</p>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{rationType}</p>
            </div>
          </div>
        </motion.div>

        {/* Schemes List */}
        <div className="flex items-center justify-between mb-2 px-1">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">{t('eligibleSchemes', 'Eligible Schemes')}</h3>
          <span className="text-xs text-amber-600 dark:text-amber-400 font-bold cursor-pointer hover:underline">{t('viewAll', 'View All')}</span>
        </div>

        <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
          
          {/* PM-KISAN */}
          <motion.div variants={item} className="bg-white dark:bg-slate-800/80 rounded-2xl p-4 flex gap-4 border border-slate-200 dark:border-white/5 shadow-sm">
            <div className="size-12 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500 shrink-0 border border-green-500/20">
              <span className="material-symbols-outlined text-2xl font-light">agriculture</span>
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-white leading-tight">{t('pmkisan', 'PM-KISAN')}</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">प्रधानमंत्री किसान सम्मान निधि</p>
                </div>
                <span className="bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-[9px] font-black tracking-widest px-2 py-0.5 rounded-full uppercase">{t('active', 'ACTIVE')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded-md">{t('6000Year', '₹6,000 / year')}</span>
                <span className="text-[10px] font-black text-green-500 tracking-wider">{t('98Match', '98% Match')}</span>
              </div>
            </div>
          </motion.div>

          {/* PMFBY */}
          <motion.div variants={item} className="bg-amber-500/5 dark:bg-amber-500/10 rounded-2xl p-4 flex gap-4 border-l-4 border-l-amber-500 border-y border-r border-slate-200 dark:border-white/5 shadow-sm">
            <div className="size-12 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-500 shrink-0">
              <span className="material-symbols-outlined text-2xl font-light">grass</span>
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-white leading-tight">{t('pmfbyCropInsurance', 'PMFBY Crop Insurance')}</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">{t('pm', 'PM फसल बीमा योजना')}</p>
                </div>
                <span className="bg-amber-500/20 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-[9px] font-black tracking-widest px-2 py-0.5 rounded-full uppercase">{t('unclaimed', 'UNCLAIMED')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 px-2 py-1 rounded-md">{t('fullCoverage', 'Full Coverage')}</span>
                <button className="bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-transform active:scale-95">{t('tapToAutoapply', 'Tap to auto-apply')}</button>
              </div>
            </div>
          </motion.div>

          {/* Ayushman Bharat */}
          <motion.div variants={item} className="bg-white dark:bg-slate-800/80 rounded-2xl p-4 flex gap-4 border border-slate-200 dark:border-white/5 shadow-sm">
            <div className="size-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0 border border-blue-500/20">
              <span className="material-symbols-outlined text-2xl font-light">medical_services</span>
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-white leading-tight">{t('ayushmanBharat', 'Ayushman Bharat')}</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">आयुष्मान भारत योजना</p>
                </div>
                <span className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[9px] font-black tracking-widest px-2 py-0.5 rounded-full uppercase">{t('unclaimed', 'UNCLAIMED')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded-md">{t('5LakhCover', '₹5 Lakh Cover')}</span>
                <span className="text-[10px] font-black text-amber-500 tracking-wider">{t('92Match', '92% Match')}</span>
              </div>
            </div>
          </motion.div>

          {/* PM Awas Yojana */}
          <motion.div variants={item} className="bg-white dark:bg-slate-800/80 rounded-2xl p-4 flex gap-4 border border-slate-200 dark:border-white/5 shadow-sm">
            <div className="size-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500 shrink-0 border border-purple-500/20">
              <span className="material-symbols-outlined text-2xl font-light">cottage</span>
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-white leading-tight">{t('pmAwasYojana', 'PM Awas Yojana')}</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">प्रधानमंत्री आवास योजना</p>
                </div>
                <span className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[9px] font-black tracking-widest px-2 py-0.5 rounded-full uppercase">{t('unclaimed', 'UNCLAIMED')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded-md">{t('housingGrant', 'Housing Grant')}</span>
                <span className="text-[10px] font-black text-slate-400 tracking-wider">{t('87Match', '87% Match')}</span>
              </div>
            </div>
          </motion.div>

          {/* MGNREGA */}
          <motion.div variants={item} className="bg-white dark:bg-slate-800/80 rounded-2xl p-4 flex gap-4 border border-slate-200 dark:border-white/5 shadow-sm opacity-80">
            <div className="size-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-600 shrink-0 border border-orange-500/20">
              <span className="material-symbols-outlined text-2xl font-light">work_history</span>
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-white leading-tight">{t('mgnrega', 'MGNREGA')}</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">मनरेगा</p>
                </div>
                <span className="bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-[9px] font-black tracking-widest px-2 py-0.5 rounded-full uppercase">{t('active', 'ACTIVE')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded-md">{t('100DaysWork', '100 Days Work')}</span>
                <span className="text-[10px] font-black text-slate-400 tracking-wider">85% Match</span>
              </div>
            </div>
          </motion.div>

        </motion.div>
      </main>

      {/* Floating Action Button */}
      <div className="fixed bottom-20 left-4 right-4 z-40">
        <button className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold py-3.5 rounded-xl shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2 group transition-transform active:scale-95">
          <span className="material-symbols-outlined font-normal group-hover:scale-110 transition-transform">smart_toy</span>
          <span>{t('autoapplyAllUnclaimedSchemes', 'Auto-Apply All Unclaimed Schemes')}</span>
          <span className="absolute -top-1.5 -right-1.5 size-5 bg-white text-orange-600 rounded-full flex items-center justify-center text-[10px] font-black shadow-md border border-orange-500">4</span>
        </button>
      </div>

    </div>
  );
}
