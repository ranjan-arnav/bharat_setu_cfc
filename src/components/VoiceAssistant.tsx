'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useAppStore, type AgentKey } from '@/lib/store';
import { FlagStripe, AshokaChakra } from '@/components/ui/GoiElements';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { startAzureSttCapture, type WebSttSession } from '@/lib/web-stt';

// ── Language options for STT ────────────────────────────────────────────────
// Covers all 22 scheduled languages supported in onboarding
const langOptions = [
  { code: 'hi-IN', label: 'हिन्दी', flag: '🇮🇳' },
  { code: 'en-IN', label: 'English', flag: '�🇳' },
  { code: 'bn-IN', label: 'বাংলা', flag: '🇮🇳' },
  { code: 'te-IN', label: 'తెలుగు', flag: '🇮🇳' },
  { code: 'mr-IN', label: 'मराठी', flag: '🇮🇳' },
  { code: 'ta-IN', label: 'தமிழ்', flag: '🇮🇳' },
  { code: 'gu-IN', label: 'ગુજરાતી', flag: '🇮🇳' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ', flag: '🇮🇳' },
  { code: 'ml-IN', label: 'മലയാളം', flag: '🇮🇳' },
  { code: 'pa-IN', label: 'ਪੰਜਾਬੀ', flag: '🇮🇳' },
  { code: 'or-IN', label: 'ଓଡ଼ିଆ', flag: '🇮🇳' },
  { code: 'as-IN', label: 'অসমীয়া', flag: '🇮🇳' },
  { code: 'ur-IN', label: 'اردو', flag: '🇮🇳' },
  { code: 'ne-IN', label: 'नेपाली', flag: '🇮🇳' },
  { code: 'mai-IN', label: 'मैथिली', flag: '🇮🇳' },
  { code: 'kok-IN', label: 'कोंकणी', flag: '🇮🇳' },
  { code: 'mni-IN', label: 'মৈতৈলোন্', flag: '🇮🇳' },
  { code: 'doi-IN', label: 'डोगरी', flag: '🇮🇳' },
  { code: 'sat-IN', label: 'ᱥᱟᱱᱛᱟᱲᱤ', flag: '🇮🇳' },
  { code: 'brx-IN', label: 'बड़ो', flag: '🇮🇳' },
  { code: 'ks-IN', label: 'كٲشُر', flag: '🇮🇳' },
  { code: 'sd-IN', label: 'سنڌي', flag: '🇮🇳' },
];

// ── Agent display metadata ───────────────────────────────────────────────────
const AGENT_META: Record<AgentKey, { nameEn: string; nameHi: string; icon: string; color: string; specialty: string }> = {
  nagarik_mitra: { nameEn: 'Nagarik Mitra', nameHi: 'नागरिक मित्र', icon: '🏛️', color: '#3b82f6', specialty: 'Roads, water, electricity, civic complaints' },
  swasthya_sahayak: { nameEn: 'Swasthya Sahayak', nameHi: 'स्वास्थ्य सहायक', icon: '🏥', color: '#22c55e', specialty: 'Health, hospitals, medicines, vaccination' },
  yojana_saathi: { nameEn: 'Yojana Saathi', nameHi: 'योजना साथी', icon: '📋', color: '#a855f7', specialty: 'Government schemes, subsidies, pension, ration' },
  arthik_salahkar: { nameEn: 'Arthik Salahkar', nameHi: 'अर्थिक सलाहकार', icon: '💰', color: '#f59e0b', specialty: 'Banking, loans, UPI fraud, financial guidance' },
  vidhi_sahayak: { nameEn: 'Vidhi Sahayak', nameHi: 'विधि सहायक', icon: '⚖️', color: '#ef4444', specialty: 'FIR, police, court, legal rights, disputes' },
  kisan_mitra: { nameEn: 'Kisan Mitra', nameHi: 'किसान मित्र', icon: '🌾', color: '#22c55e', specialty: 'Agriculture, crops, Mandi prices, PM-KISAN' },
};

// ── Intent keyword definitions (scored — best cumulative match wins) ─────────
const INTENT_DEFS: { keywords: string[]; agent: AgentKey; topic: string }[] = [
  {
    keywords: [
      // Transliterated
      'pani', 'water', 'nala', 'nahar', 'pipe', 'leak', 'jal', 'sewage', 'drain', 'drainage',
      // Devanagari (Hindi)
      'पानी', 'नाला', 'जल', 'नाली', 'सीवर', 'पाइप',
      // Other scripts
      'জল', 'পানি', 'নালা', 'నీళ్ళు', 'నాల', 'தண்ணீர்', 'கால்வாய்',
      'पाणी', 'ਪਾਣੀ', 'ਨਾਲਾ', 'ನೀರು', 'ಚರಂಡಿ', 'വെള്ളം',
    ], agent: 'nagarik_mitra', topic: 'Water & Drainage'
  },
  {
    keywords: [
      // Transliterated
      'sadak', 'road', 'pothole', 'garha', 'gadha', 'sarak', 'gutter', 'path',
      // Devanagari
      'सड़क', 'गड्ढा', 'रास्ता',
      // Other scripts
      'রাস্তা', 'రోడ్డు', 'சாலை', 'रस्ता', 'ਸੜਕ', 'ರಸ್ತೆ', 'റോഡ്',
    ], agent: 'nagarik_mitra', topic: 'Road Infrastructure'
  },
  {
    keywords: [
      // Transliterated
      'bijli', 'light', 'electricity', 'current', 'streetlight', 'lamp', 'power cut', 'blackout',
      // Devanagari
      'बिजली', 'लाइट', 'अंधेरा',
      // Other scripts
      'বিদ্যুৎ', 'కరెంట్', 'மின்சாரம்', 'वीज', 'ਬਿਜਲੀ', 'ವಿದ್ಯುತ್', 'വൈദ്യുതി',
    ], agent: 'nagarik_mitra', topic: 'Electricity / Lighting'
  },
  {
    keywords: [
      // Transliterated
      'safai', 'garbage', 'kachra', 'trash', 'dustbin', 'sanitation', 'sweeping', 'municipal', 'nagar nigam',
      // Devanagari
      'सफाई', 'कचरा', 'गंदगी', 'नगर निगम',
      // Other scripts
      'আবর্জনা', 'নগর',
    ], agent: 'nagarik_mitra', topic: 'Sanitation & Garbage'
  },
  {
    keywords: [
      'certificate', 'pramanpatra', 'birth certificate', 'death certificate', 'property', 'digipin',
      'प्रमाणपत्र', 'जन्म', 'मृत्यु', 'संपत्ति', 'शिकायत',
    ], agent: 'nagarik_mitra', topic: 'Civic Certificate'
  },
  {
    keywords: [
      // Transliterated
      'hospital', 'aspatal', 'dawai', 'dawa', 'medicine', 'doctor', 'beemar', 'bimar', 'health', 'swasthya',
      'ambulance', 'blood', 'fever', 'bukhar', 'sick', 'ilaj', 'treatment', 'tablet', 'dard', 'pain', 'khansi', 'ulti',
      'feel', 'feeling', 'tabiyat', 'tabeeyat', 'ajeeb', 'ghabra', 'ghabrahat', 'theek nahi', 'thik nahi',
      'sehat', 'chakkar', 'kamzori', 'weakness', 'dizziness', 'unwell', 'bura lag', 'man kharab', 'fit nahi',
      // Devanagari (Hindi) — critical for correct routing
      'डॉक्टर', 'दवा', 'दवाई', 'अस्पताल', 'बीमार', 'बुखार', 'दर्द', 'खांसी', 'उल्टी',
      'इलाज', 'स्वास्थ्य', 'तबियत', 'बीमारी', 'अजीब', 'घबराहट', 'ठीक नहीं', 'सेहत', 'चक्कर', 'कमज़ोरी',
      // Other scripts
      'হাসপাতাল', 'ডাক্তার', 'ওষুধ', 'ఆసుపత్రి', 'డాక్టర్', 'మందు',
      'மருத்துவமனை', 'டாக்டர்', 'மருந்து', 'रुग्णालय', 'औषध',
      'ਹਸਪਤਾਲ', 'ਡਾਕਟਰ', 'ਦਵਾਈ', 'ಆಸ್ಪತ್ರೆ', 'ಔಷಧ', 'ആശുപത്രി', 'ഡോക്ടർ', 'മരുന്ന്',
    ], agent: 'swasthya_sahayak', topic: 'Health Query'
  },
  {
    keywords: [
      'teeka', 'vaccine', 'vaccination', 'tika', 'covid', 'shot', 'immuniz', 'uwin', 'abdm',
      'टीका', 'वैक्सीन', 'टीकाकरण',
      'টিকা', 'టీకా', 'தடுப்பூசி', 'लस', 'ਟੀਕਾ', 'ಲಸಿಕೆ', 'വാക്സിൻ',
    ], agent: 'swasthya_sahayak', topic: 'Vaccination'
  },
  {
    keywords: [
      // Transliterated
      'yojana', 'yojna', 'scheme', 'pension', 'ration', 'kisan', 'kisaan', 'awas', 'pm kisan',
      'subsidy', 'mgnrega', 'nrega', 'ujjwala', 'fasal bima', 'labh', 'laabh', 'welfare', 'government benefit',
      // Devanagari
      'योजना', 'किसान', 'राशन', 'पेंशन', 'सब्सिडी', 'मनरेगा', 'नरेगा', 'उज्ज्वला',
      'आवास', 'फसल', 'कल्याण', 'लाभ',
      // Other scripts
      'যোজনা', 'পেনশন', 'রেশন', 'কৃষক', 'పథకం', 'పెన్షన్', 'రేషన్', 'రైతు',
      'திட்டம்', 'ஓய்வூதியம்', 'ரேஷன்', 'पेन्शन',
      'ਯੋਜਨਾ', 'ਪੈਨਸ਼ਨ', 'ਰਾਸ਼ਨ', 'ಯೋಜನೆ', 'ಪಿಂಚಣಿ', 'ರೇಷನ್', 'പദ്ധതി', 'പെൻഷൻ',
    ], agent: 'yojana_saathi', topic: 'Government Scheme'
  },
  {
    keywords: [
      // Transliterated
      'paisa', 'paise', 'money', 'loan', 'lon', 'bank', 'upi', 'rupee', 'mudra', 'invest',
      'saving', 'bachat', 'emi', 'credit', 'debit', 'financi', 'atm', 'account', 'wallet', 'payment',
      'jan dhan', 'khata', 'khulwana',
      // Devanagari (Hindi) — the main gap causing the mis-route in the screenshot
      'बैंक', 'खाता', 'पैसा', 'पैसे', 'लोन', 'ऋण', 'कर्ज़', 'कर्ज', 'बचत', 'निवेश',
      'भुगतान', 'ईएमआई', 'जन धन', 'खुलवाना', 'मुद्रा', 'बीमा',
      // Other scripts
      'ব্যাংক', 'ঋণ', 'బ్యాంకు', 'రుణం', 'வங்கி', 'கடன்',
      'बँक', 'ਬੈਂਕ', 'ਕਰਜ਼', 'ಬ್ಯಾಂಕ್', 'ಸಾಲ', 'ബാങ്ക്', 'വായ്പ',
    ], agent: 'arthik_salahkar', topic: 'Financial Services'
  },
  {
    keywords: [
      // Transliterated
      'scam', 'dhoka', 'fraud', 'otp', 'thagi', 'thug', 'loot', 'phishing', 'cyber', 'cheat',
      // Devanagari
      'धोखा', 'ठगी', 'लूट', 'साइबर', 'फ्रॉड', 'घोटाला',
      // Other scripts
      'জালিয়াতি', 'প্রতারণা', 'మోసం', 'மோசடி', 'फसवणूक', 'ਧੋਖਾ', 'ವಂಚನೆ', 'തട്ടിപ്പ്',
    ], agent: 'arthik_salahkar', topic: 'Scam / Cyber Fraud'
  },
  {
    keywords: [
      // Transliterated
      'fir', 'f.i.r', 'police', 'pulis', 'kanoon', 'law', 'court', 'vakeel', 'lawyer', 'legal',
      'arrest', 'giraftar', 'bail', 'nyaya', 'adhikar', 'right', 'case file', 'complain police',
      'consumer', 'dispute', 'domestic', 'dowry', 'thana', 'nalsa',
      'rti', 'r.t.i', 'right to information', 'suchna adhikar', 'सूचना का अधिकार', 'सूचना',
      // Land / property (legal)
      'land', 'zameen', 'zamin', 'jamin', 'jameen', 'bhumi', 'bhoomi', 'acquisition',
      'muavja', 'muavza', 'compensation', 'kabja', 'kabza', 'encroach', 'atikraman',
      'property', 'sampatti', 'tenant', 'kirayedar', 'evict', 'bedhkhal',
      // Devanagari
      'पुलिस', 'कानून', 'वकील', 'अदालत', 'एफआईआर', 'न्याय', 'अधिकार',
      'गिरफ्तार', 'जमानत', 'थाना', 'विवाद', 'दहेज',
      'ज़मीन', 'जमीन', 'भूमि', 'अधिग्रहण', 'मुआवज़ा', 'कब्ज़ा', 'संपत्ति', 'अतिक्रमण',
      'किरायेदार', 'बेदखल',
      // Other scripts
      'পুলিশ', 'আদালত', 'আইন', 'ভূমি', 'জমি', 'సম্পত্তি',
      'పోలీసు', 'న్యాయస్థానం', 'చట్టం', 'భూమి', 'ఆస్తి',
      'போலீஸ்', 'நீதிமன்றம்', 'சட்டம்', 'நிலம்', 'சொத்து',
      'पोलीस', 'न्यायालय', 'कायदा', 'जमीन', 'मालमत्ता',
      'ਪੁਲਿਸ', 'ਅਦਾਲਤ', 'ਕਾਨੂੰਨ', 'ਜ਼ਮੀਨ', 'ਜਾਇਦਾਦ',
      'ಪೊಲೀಸ್', 'ನ್ಯಾಯಾಲಯ', 'ಕಾನೂನು', 'ಭೂಮಿ', 'ಆಸ್ತಿ',
      'പോലീസ്', 'കോടതി', 'നിയമം', 'ഭൂമി', 'സ്വത്ത്',
    ], agent: 'vidhi_sahayak', topic: 'Legal Help'
  },
];

/** Score all intents â€” best cumulative keyword hit count wins */
function scoreIntents(text: string) {
  const lower = text.toLowerCase();
  return INTENT_DEFS
    .map((def) => ({
      ...def,
      score: def.keywords.reduce((acc, kw) => acc + (lower.includes(kw.toLowerCase()) ? 1 : 0), 0),
    }))
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score);
}

export default function VoiceAssistant({
  onClose,
  onOpenChat,
}: {
  onClose: () => void;
  onOpenChat: (agent: AgentKey) => void;
}) {
  const { setTranscript, setUserProfile, userProfile } = useAppStore();
  const { t } = useTranslation();

  const [listening, setListening] = useState(false);
  const [transcript, setLocalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [language, setLanguage] = useState(
    langOptions.find((l) => l.code.startsWith(userProfile.language?.split('-')[0] || 'hi'))?.code || 'hi-IN'
  );
  const [confidence, setConfidence] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [detectedIntent, setDetectedIntent] = useState<{ agent: AgentKey; topic: string } | null>(null);
  const [showManualPicker, setShowManualPicker] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [classifySource, setClassifySource] = useState<'local' | 'api' | null>(null);
  const [secondaryAgent, setSecondaryAgent] = useState<AgentKey | null>(null);

  const sttSessionRef = useRef<WebSttSession | null>(null);

  // Animated waveform bars (re-randomised each time listening starts)
  const waveHeights = useMemo(
    () => Array.from({ length: 9 }, () => ({ w: 2 + Math.random() * 3, h: 8 + Math.random() * 32 })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listening]
  );

  // ── Countdown → auto-navigate ─────────────────────────────────────────────
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      if (detectedIntent) goToAgent(detectedIntent.agent);
      return;
    }
    const timerId = setTimeout(() => setCountdown((c) => (c !== null ? c - 1 : null)), 1000);
    return () => clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  const startListening = useCallback(() => {
    setListening(true);
    setLocalTranscript('');
    setInterimTranscript('');
    setConfidence(0);
    setDetectedIntent(null);
    setShowManualPicker(false);
    setCountdown(null);
    setStatusMsg('');

    startAzureSttCapture(language, 7000)
      .then((session) => {
        sttSessionRef.current = session;
        return session.done;
      })
      .then((spokenText) => {
        const finalText = spokenText.trim();
        if (!finalText) {
          setStatusMsg(t('No speech detected. Tap mic and try again.', 'No speech detected. Tap mic and try again.'));
          return;
        }
        setLocalTranscript(finalText);
        setInterimTranscript('');
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : '';
        if (message !== 'cancelled') {
          if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('denied')) {
            setStatusMsg(t('Microphone access denied — allow it in browser settings.', 'Microphone access denied — allow it in browser settings.'));
          } else {
            setStatusMsg(message || t('No speech detected. Tap mic and try again.', 'No speech detected. Tap mic and try again.'));
          }
        }
      })
      .finally(() => {
        sttSessionRef.current = null;
        setListening(false);
      });
  }, [language, t]);

  const stopListening = useCallback(() => {
    sttSessionRef.current?.stop();
  }, []);

  // Clean up mic on unmount
  useEffect(() => () => sttSessionRef.current?.cancel(), []);

  // Trigger classification when listening stops and we have a transcript
  useEffect(() => {
    if (!listening && transcript) processTranscript(transcript);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening]);

  // ── Classification: instant local → optional API refinement ─────────────
  const processTranscript = async (text: string) => {
    setProcessing(true);
    // Sync mic language to profile so AgentChat replies in the spoken language.
    setUserProfile({ language: language.split('-')[0] });
    setTranscript(text); // save to store so AgentChat can auto-send it
    setClassifySource(null);

    // ── Pass 1: synchronous keyword scoring (instant, no network) ──────
    const scored = scoreIntents(text);
    const localBest = scored[0] ?? null;

    // ── FAST PATH: local match found → show agent card immediately ──────
    // Never block on the API when we already have a local signal.
    if (localBest) {
      setProcessing(false);
      setClassifySource('local');
      setDetectedIntent({ agent: localBest.agent, topic: localBest.topic });
      // Surface second-best agent as handoff suggestion
      const secondBest = scored.find((s) => s.agent !== localBest.agent);
      setSecondaryAgent(secondBest ? secondBest.agent : null);
      setCountdown(4);

      // Background API refinement — updates silently if it strongly disagrees
      fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          agentKey: localBest.agent,
          clientDetectedAgent: localBest.agent,
          conversationHistory: [],
          language: language.split('-')[0] || 'hi',
          classifyOnly: true,
        }),
        signal: AbortSignal.timeout(5000),
      })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (!data) return;
          const apiBest = data.resolvedAgentKey as AgentKey | null;
          // Only override if API disagrees and local score was weak (1 match)
          if (apiBest && apiBest !== localBest.agent && localBest.score < 2) {
            const topic = INTENT_DEFS.find((d) => d.agent === apiBest)?.topic || 'Your Query';
            setClassifySource('api');
            setDetectedIntent({ agent: apiBest, topic });
            // Old local result becomes the handoff secondary suggestion
            setSecondaryAgent(localBest.agent);
          }
        })
        .catch(() => { /* ignore — local result stands */ });

      return;
    }

    // ── SLOW PATH: no local match → wait for API (max 4 s) ──────────
    setStatusMsg(t('Consulting AI classifier…', 'Consulting AI classifier…'));
    let apiBest: AgentKey | null = null;
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          agentKey: 'nagarik_mitra',
          clientDetectedAgent: null,
          conversationHistory: [],
          language: language.split('-')[0] || 'hi',
          classifyOnly: true,
        }),
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const data = await res.json();
        apiBest = (data.resolvedAgentKey as AgentKey) || null;
      }
    } catch { /* fallthrough to default */ }

    setProcessing(false);
    setStatusMsg('');

    // Default to nagarik_mitra so the user always gets connected — never stall.
    const winner: AgentKey = apiBest || 'nagarik_mitra';
    const topic = apiBest
      ? (INTENT_DEFS.find((d) => d.agent === winner)?.topic || 'General Query')
      : 'General Query';
    setClassifySource(apiBest ? 'api' : 'local');
    setDetectedIntent({ agent: winner, topic });
    // Surface second-best scored agent as handoff suggestion for slow path too
    const allScored = scoreIntents(text);
    const secondBestSlow = allScored.find((s) => s.agent !== winner);
    setSecondaryAgent(secondBestSlow ? secondBestSlow.agent : null);
    setCountdown(4);
  };

  const goToAgent = (agent: AgentKey) => {
    setCountdown(null);
    onOpenChat(agent);
  };

  const cancelAndPick = () => {
    setCountdown(null);
    setShowManualPicker(true);
  };

  const reset = () => {
    setLocalTranscript('');
    setInterimTranscript('');
    setDetectedIntent(null);
    setShowManualPicker(false);
    setCountdown(null);
    setStatusMsg('');
    setConfidence(0);
    setClassifySource(null);
    setSecondaryAgent(null);
  };

  const meta = detectedIntent ? AGENT_META[detectedIntent.agent] : null;
  const isIdle = !listening && !processing && !detectedIntent && !showManualPicker;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 dark:bg-[#0a1628] flex flex-col max-w-[430px] mx-auto" style={{ animation: 'slideUp 0.3s ease-out' }}>
      <FlagStripe />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white/95 dark:bg-[#0f1f3a]/95 backdrop-blur-xl border-b border-black/10 dark:border-white/10">
        <button onClick={onClose} className="p-1">
          <span className="material-symbols-outlined text-slate-500 dark:text-gray-400">arrow_back</span>
        </button>
        <div className="flex-1 text-center">
          <div className="flex items-center justify-center gap-2">
            <AshokaChakra size={16} color="#5b8def" spin />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">{t('voiceAssistantTitle', 'Voice Assistant')}</h2>
            <AshokaChakra size={16} color="#5b8def" spin />
          </div>
          <div className="flex items-center justify-center gap-1 mt-0.5">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            <span className="text-[10px] text-slate-500 dark:text-gray-400">
              {langOptions.find((l) => l.code === language)?.label} · {t('aiClassificationActive', 'AI Classification Active')}
            </span>
          </div>
        </div>
        <button onClick={() => setShowLangPicker(!showLangPicker)} className="p-1">
          <span className="material-symbols-outlined text-slate-500 dark:text-gray-400">translate</span>
        </button>
      </div>

      {/* Language picker */}
      {showLangPicker && (
        <div className="px-4 py-2 bg-white dark:bg-[#0f1f3a] border-b border-black/10 dark:border-white/10 flex gap-2 overflow-x-auto no-scrollbar">
          {langOptions.map((l) => (
            <button
              key={l.code}
              onClick={() => { setLanguage(l.code); setShowLangPicker(false); }}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${language === l.code ? 'bg-[#FF9933] text-slate-900 dark:text-white' : 'bg-black/5 dark:bg-white/5 text-slate-600 dark:text-gray-300 border border-black/10 dark:border-white/10'
                }`}
            >
              {l.flag} {l.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-start px-6 pt-6 gap-5 overflow-y-auto no-scrollbar pb-10">

        {/* ── Mic area (shown when idle / listening / processing) ─────────── */}
        {!detectedIntent && !showManualPicker && (
          <div className="flex flex-col items-center gap-4 w-full">

            {/* Language badge */}
            <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#FF9933] text-lg">language</span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                {langOptions.find((l) => l.code === language)?.label}
              </span>
              <button onClick={() => setShowLangPicker(true)} className="text-[10px] text-slate-500 dark:text-gray-400 underline ml-1">{t('change', 'change')}</button>
            </div>

            {/* Waveform while listening */}
            {listening && (
              <div className="flex items-end justify-center h-14 gap-1">
                {waveHeights.map((h, i) => (
                  <div
                    key={i}
                    className="bg-[#FF9933] rounded-full"
                    style={{ width: `${h.w}px`, height: `${h.h}px`, animation: `wave 0.8s ease-in-out infinite`, animationDelay: `${i * 0.09}s` }}
                  />
                ))}
              </div>
            )}

            {/* Mic button */}
            <button
              onClick={listening ? stopListening : startListening}
              disabled={processing}
              className={`relative w-24 h-24 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 ${listening
                ? 'bg-gradient-to-br from-red-500 to-red-600 shadow-red-500/40 scale-110'
                : processing
                  ? 'bg-gradient-to-br from-[#FF9933]/50 to-[#E68A2E]/50 cursor-wait'
                  : 'bg-gradient-to-br from-[#FF9933] to-[#E68A2E] shadow-orange-500/30 hover:scale-105 active:scale-95'
                }`}
            >
              {listening && (
                <>
                  <span className="absolute inset-0 rounded-full border-2 border-red-400/50 animate-ping" />
                  <span className="absolute -inset-3 rounded-full border-2 border-red-400/20 animate-ping" style={{ animationDelay: '0.5s' }} />
                </>
              )}
              <span className="material-symbols-outlined text-slate-900 dark:text-white text-4xl relative z-10">
                {processing ? 'hourglass_empty' : listening ? 'stop' : 'mic'}
              </span>
            </button>

            <p className={`text-sm font-bold text-center ${listening ? 'text-red-400 animate-pulse' : processing ? 'text-[#FF9933] animate-pulse' : 'text-slate-500 dark:text-gray-400'}`}>
              {listening ? t('listeningLabel') : processing ? t('analysingLabel') : t('tapMicSpeak')}
            </p>

            {/* Hint cards */}
            {isIdle && (
              <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4 w-full">
                <p className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('trySaying')}</p>
                <div className="flex flex-col gap-1.5 text-xs text-slate-600 dark:text-gray-300">
                  <span>❝ {t('voiceSampleWaterIssue', 'Mere ghar ke paas pani nahi aa raha')} ❞</span>
                  <span>❝ {t('voiceSamplePmKisanPayment', 'Mujhe PM-KISAN ka paisa nahi mila')} ❞</span>
                  <span>❝ {t('voiceSampleFraudOtp', 'Bank se fraud call aaya, OTP le liya')} ❞</span>
                  <span>❝ {t('voiceSamplePoliceFirRefusal', 'FIR likhne se police mana kar rahi hai')} ❞</span>
                </div>
              </div>
            )}

            {confidence > 0 && (
              <div className="flex items-center gap-2 bg-black/5 dark:bg-white/5 px-3 py-1 rounded-full border border-black/10 dark:border-white/10">
                <span className="text-[10px] text-slate-500 dark:text-gray-400">{t('Speech confidence:', 'Speech confidence:')}</span>
                <span className={`text-[10px] font-bold ${confidence > 80 ? 'text-green-400' : 'text-amber-400'}`}>{confidence}%</span>
              </div>
            )}
          </div>
        )}

        {/* ── Live transcript ─────────────────────────────────────────────── */}
        {(transcript || interimTranscript) && !detectedIntent && (
          <div className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">{t('liveTranscript')}</h4>
              {listening && <span className="text-[10px] text-[#FF9933] animate-pulse">{t('capturing')}</span>}
            </div>
            <p className="text-base text-slate-900 dark:text-white leading-relaxed">
              {transcript}
              {interimTranscript && <span className="text-slate-500 dark:text-gray-400"> {interimTranscript}</span>}
            </p>
          </div>
        )}

        {/* ── Processing status pill ──────────────────────────────────────── */}
        {(processing || (statusMsg && !detectedIntent && !showManualPicker)) && (
          <div className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4 flex items-center gap-3">
            {processing && <div className="shrink-0 w-5 h-5 border-2 border-[#FF9933] border-t-transparent rounded-full animate-spin" />}
            <span className="text-xs text-slate-600 dark:text-gray-300">{statusMsg || t('classifyingIntent')}</span>
          </div>
        )}

        {/* ── Detected agent result card ──────────────────────────────────── */}
        {detectedIntent && meta && !showManualPicker && (
          <div className="w-full flex flex-col gap-4">

            {/* Transcript recap */}
            {transcript && (
              <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3">
                <span className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase">{t('youSaid')}</span>
                <p className="text-sm text-slate-900 dark:text-white mt-1 leading-snug italic">❝ {transcript} ❞</p>
              </div>
            )}

            {/* Agent card */}
            <div
              className="w-full rounded-2xl border p-5 flex flex-col gap-3"
              style={{ background: `${meta.color}12`, borderColor: `${meta.color}40` }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                  style={{ background: `${meta.color}25` }}
                >
                  {meta.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">{t('bestAgentForQuery', 'Best match for your query')}</div>
                  <div className="text-lg font-bold text-slate-900 dark:text-white truncate">{t(meta.nameEn, meta.nameEn)}</div>
                  <div className="text-sm font-semibold" style={{ color: meta.color }}>{t(meta.nameHi, meta.nameHi)}</div>
                </div>
                <span
                  className="text-[10px] font-bold px-2 py-1 rounded-full shrink-0"
                  style={{ background: `${meta.color}25`, color: meta.color }}
                >
                  {classifySource === 'api' ? t('✓ AI', '✓ AI') : t('⚡ Local', '⚡ Local')}
                </span>
              </div>

              <div className="bg-black/5 dark:bg-black/25 rounded-xl px-3 py-2">
                <span className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase">{t('topicDetected', 'Topic Detected')}</span>
                <p className="text-sm text-slate-900 dark:text-white font-semibold mt-0.5">🎯 {t(detectedIntent.topic, detectedIntent.topic)}</p>
              </div>

              <div className="bg-black/5 dark:bg-black/25 rounded-xl px-3 py-2">
                <span className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase">{t('specialisesIn', 'Specialises In')}</span>
                <p className="text-xs text-slate-600 dark:text-gray-300 mt-0.5">{t(meta.specialty, meta.specialty)}</p>
              </div>

              {/* Countdown progress */}
              {countdown !== null && countdown > 0 && (
                <div>
                  <div className="flex justify-between text-[10px] text-slate-500 dark:text-gray-400 mb-1.5">
                    <span>{t('autoConnecting', 'Auto-connecting in ')} {countdown}s…</span>
                    <button onClick={cancelAndPick} className="text-red-400 font-bold underline">{t('cancel', 'Cancel')}</button>
                  </div>
                  <div className="h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000 ease-linear"
                      style={{ width: `${(countdown / 4) * 100}%`, background: meta.color }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* CTA */}
            <button
              onClick={() => goToAgent(detectedIntent.agent)}
              className="w-full font-bold py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] text-slate-900 dark:text-white text-base transition-all"
              style={{ background: `linear-gradient(135deg, ${meta.color}ee, ${meta.color}99)` }}
            >
              <span className="material-symbols-outlined">chat</span>
              {t('talkTo')} {meta.nameEn}
            </button>

            {/* Agent handoff suggestion — mirrors chat handoff card */}
            {secondaryAgent && (
              <button
                onClick={() => goToAgent(secondaryAgent)}
                className="w-full rounded-2xl border p-4 flex items-center gap-3 active:scale-[0.98] transition-all text-left"
                style={{ background: `${AGENT_META[secondaryAgent].color}0d`, borderColor: `${AGENT_META[secondaryAgent].color}35` }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                  style={{ background: `${AGENT_META[secondaryAgent].color}25` }}
                >
                  {AGENT_META[secondaryAgent].icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">🔁 {t('alsoTry', 'Also try')}</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">{t(AGENT_META[secondaryAgent].nameEn, AGENT_META[secondaryAgent].nameEn)}</div>
                  <div className="text-[11px]" style={{ color: AGENT_META[secondaryAgent].color }}>{t(AGENT_META[secondaryAgent].nameHi, AGENT_META[secondaryAgent].nameHi)} {t('से भी बात करें?', 'से भी बात करें?')}</div>
                </div>
                <span className="material-symbols-outlined text-slate-400 shrink-0">arrow_forward</span>
              </button>
            )}

            <div className="flex gap-2">
              <button
                onClick={cancelAndPick}
                className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-slate-600 dark:text-gray-300 font-semibold py-3 rounded-xl text-sm"
              >
                {t('chooseDifferent')}
              </button>
              <button
                onClick={reset}
                className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-slate-600 dark:text-gray-300 font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">refresh</span>
                {t('reRecord')}
              </button>
            </div>
          </div>
        )}

        {/* ── Manual agent picker ─────────────────────────────────────────── */}
        {showManualPicker && (
          <div className="w-full flex flex-col gap-3">
            <div className="text-center">
              <p className="text-sm font-bold text-slate-900 dark:text-white">{t('whoCanHelp', 'Who can help you?')}</p>
              {transcript ? (
                <p className="text-[10px] text-slate-500 dark:text-gray-400 mt-0.5 italic">❝ {transcript.slice(0, 70)}{transcript.length > 70 ? '…' : ''} ❞</p>
              ) : (
                <p className="text-[10px] text-slate-500 dark:text-gray-400 mt-0.5">{t('Select the agent that best matches your query', 'Select the agent that best matches your query')}</p>
              )}
            </div>

            {(Object.keys(AGENT_META) as AgentKey[]).filter(k => k !== 'kisan_mitra').map((key) => {
              const m = AGENT_META[key];
              return (
                <button
                  key={key}
                  onClick={() => goToAgent(key)}
                  className="w-full rounded-2xl border p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-all"
                  style={{ background: `${m.color}0d`, borderColor: `${m.color}35` }}
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
                    style={{ background: `${m.color}25` }}
                  >
                    {m.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-900 dark:text-white">{t(m.nameEn, m.nameEn)}</div>
                    <div className="text-[11px] font-semibold" style={{ color: m.color }}>{t(m.nameHi, m.nameHi)}</div>
                    <div className="text-[10px] text-slate-500 dark:text-gray-400 mt-0.5 truncate">{t(m.specialty, m.specialty)}</div>
                  </div>
                  <span className="material-symbols-outlined text-gray-500 shrink-0">chevron_right</span>
                </button>
              );
            })}

            {transcript && (
              <button
                onClick={reset}
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-slate-600 dark:text-gray-300 font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">refresh</span>
                {t('reRecord')}
              </button>
            )}
          </div>
        )}

        {/* ── Error message ───────────────────────────────────────────────── */}
        {statusMsg && !processing && !detectedIntent && !showManualPicker && (
          <div className="w-full bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-600 dark:text-red-300 text-center">
            {statusMsg}
          </div>
        )}
      </div>
    </div>
  );
}
