'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAppStore, type AgentKey } from '@/lib/store';
import { FlagStripe, AshokaChakra } from '@/components/ui/GoiElements';
import { startAzureSttCapture, type WebSttSession } from '@/lib/web-stt';
import { motion, AnimatePresence } from 'framer-motion';

const AGENT_META: Record<AgentKey, { nameEn: string; nameHi: string; icon: string; color: string; specialty: string }> = {
  nagarik_mitra: { nameEn: 'Nagarik Mitra', nameHi: 'नागरिक मित्र', icon: '🏛️', color: '#3b82f6', specialty: 'Roads, water, electricity, civic complaints' },
  swasthya_sahayak: { nameEn: 'Swasthya Sahayak', nameHi: 'स्वास्थ्य सहायक', icon: '🏥', color: '#22c55e', specialty: 'Health, hospitals, medicines, vaccination' },
  yojana_saathi: { nameEn: 'Yojana Saathi', nameHi: 'योजना साथी', icon: '📋', color: '#a855f7', specialty: 'Government schemes, subsidies, pension, ration' },
  arthik_salahkar: { nameEn: 'Arthik Salahkar', nameHi: 'अर्थिक सलाहकार', icon: '💰', color: '#f59e0b', specialty: 'Banking, loans, UPI fraud, financial guidance' },
  vidhi_sahayak: { nameEn: 'Vidhi Sahayak', nameHi: 'विधि सहायक', icon: '⚖️', color: '#ef4444', specialty: 'FIR, police, court, legal rights, disputes' },
  kisan_mitra: { nameEn: 'Kisan Mitra', nameHi: 'किसान मित्र', icon: '🌾', color: '#84cc16', specialty: 'Crop advice, farming subsidies, tractors, weather, mandi prices' },
};

export default function OmniRouterOverlay({
  onClose,
  onRouted
}: {
  onClose: () => void;
  onRouted: (agent: AgentKey, transcript: string) => void;
}) {
  const { t, lang } = useTranslation();
  const { userProfile } = useAppStore();
  
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [detectedAgent, setDetectedAgent] = useState<AgentKey | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  
  const sttSessionRef = useRef<WebSttSession | null>(null);

  // Clean up mic on unmount
  useEffect(() => () => sttSessionRef.current?.cancel(), []);

  const handleRoute = async (input: string) => {
    if (!input.trim()) return;
    setProcessing(true);
    setStatusMsg(t('Consulting Omni-Router AI…', 'Consulting Omni-Router AI…'));

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          agentKey: 'nagarik_mitra', 
          language: userProfile.language?.split('-')[0] || 'hi',
          classifyOnly: true,
        }),
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const data = await res.json();
        const agent = (data.resolvedAgentKey as AgentKey) || 'nagarik_mitra';
        setDetectedAgent(agent);
        setStatusMsg('');
        
        // Auto-navigate after briefly showing the result
        setTimeout(() => {
          onRouted(agent, input);
        }, 2000);
      } else {
        throw new Error('Routing failed');
      }
    } catch (e) {
      // Fallback
      setDetectedAgent('nagarik_mitra');
      setTimeout(() => onRouted('nagarik_mitra', input), 1500);
    } finally {
      setProcessing(false);
    }
  };

  const startVoice = useCallback(() => {
    setListening(true);
    setStatusMsg('');
    const audioLang = userProfile.language || 'hi-IN';

    startAzureSttCapture(audioLang, 6000)
      .then(session => {
        sttSessionRef.current = session;
        return session.done;
      })
      .then(spokenText => {
        const finalText = spokenText.trim();
        if (finalText) {
          setText(finalText);
          handleRoute(finalText);
        }
      })
      .catch(e => {
        if (e.message !== 'cancelled') {
          setStatusMsg(t('Voice input failed. Please type instead.', 'Voice input failed. Please type instead.'));
        }
      })
      .finally(() => {
        sttSessionRef.current = null;
        setListening(false);
      });
  }, [userProfile.language, t]);

  const stopVoice = useCallback(() => {
    sttSessionRef.current?.stop();
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 dark:bg-[#0a1628] flex flex-col max-w-[430px] mx-auto" style={{ animation: 'slideUp 0.3s ease-out' }}>
      <FlagStripe />

      <div className="flex items-center gap-3 px-4 py-3 bg-white/95 dark:bg-[#0f1f3a]/95 backdrop-blur-xl border-b border-black/10 dark:border-white/10">
        <button onClick={onClose} className="p-1">
          <span className="material-symbols-outlined text-slate-500 dark:text-gray-400">close</span>
        </button>
        <div className="flex-1 text-center">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[#FF9933]">router</span>
            Omni-Router AI
          </h2>
        </div>
      </div>

      <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto w-full max-w-sm mx-auto">
        <div className="text-center">
          <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">{t('Grievance Draft', 'Grievance Draft')}</h3>
          <p className="text-sm text-slate-500 dark:text-gray-400">
            {t('Type or speak your issue. Our AI will automatically determine the best department and route it instantly.', 'Type or speak your issue. Our AI will automatically determine the best department and route it instantly.')}
          </p>
        </div>

        {!detectedAgent ? (
          <div className="flex flex-col gap-4">
            <textarea
              className="w-full bg-white dark:bg-[#0f1f3a] border border-black/10 dark:border-white/10 rounded-2xl p-4 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF9933] shadow-inner resize-none h-32"
              placeholder={t('E.g. The streetlights in my area are broken since yesterday...', 'E.g. The streetlights in my area are broken since yesterday...')}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={processing || listening}
            />

            <div className="flex gap-3">
              <button
                onClick={listening ? stopVoice : startVoice}
                disabled={processing}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all text-white shadow-lg ${
                  listening ? 'bg-red-500 animate-pulse' : 'bg-[#138808] active:scale-95 hover:brightness-110'
                }`}
              >
                <span className="material-symbols-outlined">{listening ? 'stop' : 'mic'}</span>
                {listening ? t('Listening...', 'Listening...') : t('Speak', 'Speak')}
              </button>
              
              <button
                onClick={() => handleRoute(text)}
                disabled={!text.trim() || processing || listening}
                className="flex-1 bg-[#FF9933] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:active:scale-100 active:scale-95 hover:brightness-110 transition-all"
              >
                <span className="material-symbols-outlined">send</span>
                {t('Route AI', 'Route AI')}
              </button>
            </div>
            
            {(processing || statusMsg) && (
               <div className="text-center text-sm font-bold text-[#FF9933] mt-2 animate-pulse flex items-center justify-center gap-2">
                 <AshokaChakra size={16} color="#FF9933" spin={true} />
                 {statusMsg || t('Routing...', 'Routing...')}
               </div>
            )}
          </div>
        ) : (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full flex-1 flex flex-col justify-center gap-6"
            >
              <div className="text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-4xl">check_circle</span>
                </div>
                <h3 className="font-black text-xl text-slate-900 dark:text-white mb-1">Routed Successfully!</h3>
                <p className="text-sm text-slate-500">Connecting you to the specialized agent...</p>
              </div>

              <div 
                className="rounded-2xl border p-5 flex items-center gap-4 bg-white/50 dark:bg-black/20 backdrop-blur-md"
                style={{ borderColor: AGENT_META[detectedAgent].color, boxShadow: `0 4px 20px -5px ${AGENT_META[detectedAgent].color}30` }}
              >
                <div 
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                  style={{ background: `${AGENT_META[detectedAgent].color}25` }}
                >
                  {AGENT_META[detectedAgent].icon}
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Routing to</div>
                  <div className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                    {AGENT_META[detectedAgent].nameEn}
                  </div>
                  <div className="text-xs font-medium" style={{ color: AGENT_META[detectedAgent].color }}>
                    Specialty: {AGENT_META[detectedAgent].specialty.split(',')[0]}
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
