'use client';

import { useState, useEffect, useRef } from 'react';
import { useAppStore, type CitizenProfile, type UserType } from '@/lib/store';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useTranslation } from '@/lib/i18n/useTranslation';

// Language code → English display name (for 'Ask in X' ready step label)
const LANG_DISPLAY_NAME: Record<string, string> = {
  hi: 'Hindi', en: 'English', bn: 'Bengali', te: 'Telugu', mr: 'Marathi',
  ta: 'Tamil', gu: 'Gujarati', kn: 'Kannada', ml: 'Malayalam', pa: 'Punjabi',
  or: 'Odia', as: 'Assamese', ur: 'Urdu', ne: 'Nepali', mai: 'Maithili',
  kok: 'Konkani', mni: 'Manipuri', doi: 'Dogri', sat: 'Santali',
  brx: 'Bodo', ks: 'Kashmiri', sd: 'Sindhi',
};

// ─── Demo citizens (Aadhaar mock) ───────────────────────────────────────────

// Persona 1 — Ramesh, Hindi farmer, UP
const DEMO_PROFILE: CitizenProfile = {
  name: 'Ramesh Kumar Verma',
  nameHindi: 'रमेश कुमार वर्मा',
  aadhaarMasked: 'XXXX  XXXX  8921',
  dob: '15 Aug 1985',
  gender: 'Male',
  mobile: '+91-98765 XX210',
  address: 'Village Baharpur, Post Mailani, Tehsil Mailani',
  district: 'Lakhimpur Kheri',
  state: 'Uttar Pradesh',
  pincode: '262801',
  digipin: '88-H2K-99L1',
  language: 'hi',
  occupation: 'Kisan (Farmer)',
  income: 120000,
  bplCard: true,
  rationCardType: 'Antyodaya (AAY)',
  linkedSchemes: ['PM-KISAN', 'PM Ujjwala Yojana', 'Ayushman Bharat PMJAY'],
  eligibleSchemes: [
    'PM-KISAN Samman Nidhi',
    'Ayushman Bharat PMJAY',
    'PM Ujjwala Yojana',
    'PM Awas Yojana (Gramin)',
    'MGNREGS',
    'Pradhan Mantri Fasal Bima',
    'Kisan Credit Card',
    'PM Mudra Yojana',
    'Jan Dhan Yojana',
    'Sukanya Samriddhi Yojana',
    'Atal Pension Yojana',
  ],
  aadhaarVerified: true,
  emergencyContacts: [
    { id: 'ec-1', name: 'SOS Contact 1', phone: '7061203449', relationship: 'Family', priority: 1 },
    { id: 'ec-2', name: 'SOS Contact 2', phone: '9229342174', relationship: 'Family', priority: 2 },
  ],
};

// Persona 2 — Sunita Devkar, Marathi domestic worker, Pune
const DEMO_PROFILE_SUNITA: CitizenProfile = {
  name: 'Sunita Devkar',
  nameHindi: 'सुनीता देवकर',
  aadhaarMasked: 'XXXX  XXXX  3456',
  dob: '12 Mar 1993',
  gender: 'Female',
  mobile: '+91-97654 XX321',
  address: 'Gali 7, Yerwada Nagar, Sarsenapati Hamid Ali Road',
  district: 'Pune',
  state: 'Maharashtra',
  pincode: '411006',
  digipin: '43-P7R-22M8',
  language: 'mr',
  occupation: 'Gharelu Sevika (Domestic Worker)',
  income: 72000,
  bplCard: false,
  rationCardType: 'BPL (Pink)',
  linkedSchemes: ['Jan Dhan Yojana', 'PM Awas Yojana (Urban)'],
  eligibleSchemes: [
    'PM Awas Yojana (Urban)',
    'Jan Dhan Yojana',
    'PM Ujjwala Yojana',
    'Mahila Shakti Kendra',
    'Beti Bachao Beti Padhao',
    'PM Matru Vandana Yojana',
    'Atal Pension Yojana',
    'PM Mudra Yojana',
    'e-Daakhil Consumer Forum',
  ],
  aadhaarVerified: true,
  emergencyContacts: [
    { id: 'ec-1', name: 'SOS Contact 1', phone: '7061203449', relationship: 'Family', priority: 1 },
    { id: 'ec-2', name: 'SOS Contact 2', phone: '9229342174', relationship: 'Family', priority: 2 },
  ],
};

// Persona 3 — Priya Murugan, Tamil small-business owner, Chennai
const DEMO_PROFILE_PRIYA: CitizenProfile = {
  name: 'Priya Murugan',
  nameHindi: 'प्रिया मुरुगन',
  aadhaarMasked: 'XXXX  XXXX  7812',
  dob: '5 Jun 1996',
  gender: 'Female',
  mobile: '+91-94567 XX890',
  address: '14/B, Mambalam High Road, Near Chinthamani Market',
  district: 'Chennai',
  state: 'Tamil Nadu',
  pincode: '600033',
  digipin: '62-F4T-81K3',
  language: 'ta',
  occupation: 'Siru Thozhil Udaiyavar (Small Business Owner)',
  income: 180000,
  bplCard: false,
  rationCardType: 'APL',
  linkedSchemes: ['Jan Dhan Yojana', 'PM Mudra Yojana (Shishu)'],
  eligibleSchemes: [
    'PM Mudra Yojana (Tarun)',
    'Udyam Registration (MSME)',
    'Stand Up India',
    'Jan Dhan Yojana',
    'PM SVANidhi',
    'Atal Pension Yojana',
    'PM Awas Yojana (Urban)',
    'TN NEEDS Scheme (MSME)',
  ],
  aadhaarVerified: true,
  emergencyContacts: [
    { id: 'ec-1', name: 'SOS Contact 1', phone: '7061203449', relationship: 'Family', priority: 1 },
    { id: 'ec-2', name: 'SOS Contact 2', phone: '9229342174', relationship: 'Family', priority: 2 },
  ],
};

// All personas for the onboarding picker
const DEMO_PERSONAS = [
  {
    profile: DEMO_PROFILE,
    emoji: '👨‍🌾',
    tagline: 'Kisan · किसान',
    location: 'Lakhimpur Kheri, UP',
    tags: ['PM-KISAN', 'Ayushman', '+9 schemes'],
    tagColor: '#FF9933',
    desc: "Farmer facing Scheme Fatigue — can't navigate English portals for crop insurance",
  },
  {
    profile: DEMO_PROFILE_SUNITA,
    emoji: '👩',
    tagline: 'Gharelu Sevika · घरेलू सेविका',
    location: 'Yerwada, Pune, MH',
    tags: ['सुरक्षा', 'Scam Alert', 'Zero FIR'],
    tagColor: '#10B981',
    desc: 'Domestic worker — broken streetlights, deepfake scam OTP victim, needs legal aid',
  },
  {
    profile: DEMO_PROFILE_PRIYA,
    emoji: '👩‍💼',
    tagline: 'Siru Thozhil · சிறு தொழில்',
    location: 'T. Nagar, Chennai, TN',
    tags: ['MSME Udyam', 'Mudra Loan', 'Jan Dhan'],
    tagColor: '#8B5CF6',
    desc: 'Small kirana owner — needs MSME Udyam registration and formal credit access',
  },
];

const LANGUAGES = [
  { code: 'hi', label: 'हिंदी', sub: 'Hindi' },
  { code: 'en', label: 'English', sub: 'English' },
  { code: 'bn', label: 'বাংলা', sub: 'Bengali' },
  { code: 'ta', label: 'தமிழ்', sub: 'Tamil' },
  { code: 'te', label: 'తెలుగు', sub: 'Telugu' },
  { code: 'mr', label: 'मराठी', sub: 'Marathi' },
  { code: 'gu', label: 'ગુજરાતી', sub: 'Gujarati' },
  { code: 'kn', label: 'ಕನ್ನಡ', sub: 'Kannada' },
  { code: 'ml', label: 'മലയാളം', sub: 'Malayalam' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ', sub: 'Punjabi' },
  { code: 'or', label: 'ଓଡ଼ିଆ', sub: 'Odia' },
  { code: 'as', label: 'অসমীয়া', sub: 'Assamese' },
  { code: 'ur', label: 'اردو', sub: 'Urdu' },
  { code: 'ne', label: 'नेपाली', sub: 'Nepali' },
  { code: 'mai', label: 'मैथिली', sub: 'Maithili' },
  { code: 'kok', label: 'कोंकणी', sub: 'Konkani' },
  { code: 'mni', label: 'মেইতেই', sub: 'Manipuri' },
  { code: 'doi', label: 'डोगरी', sub: 'Dogri' },
  { code: 'sat', label: 'ᱥᱟᱱᱛᱟᱲᱤ', sub: 'Santali' },
  { code: 'brx', label: 'बड़ो', sub: 'Bodo' },
  { code: 'ks', label: 'کٲشُر', sub: 'Kashmiri' },
  { code: 'sd', label: 'سنڌي', sub: 'Sindhi' },
];

type Step =
  | 'splash'
  | 'language'
  | 'signin'
  | 'aadhaar'
  | 'mobile'
  | 'otp'
  | 'fetching'
  | 'profile'
  | 'emergency-contact'
  | 'tour'
  | 'ready';

// ─── Ashoka Chakra SVG ────────────────────────────────────────────────────────
function AshokaChakra({ size = 80, spin = false, className = '' }: { size?: number; spin?: boolean; className?: string }) {
  const spokes = Array.from({ length: 24 }, (_, i) => {
    const angle = (i * 360) / 24;
    const rad = (angle * Math.PI) / 180;
    const r1 = size * 0.32;
    const r2 = size * 0.46;
    const x1 = size / 2 + r1 * Math.sin(rad);
    const y1 = size / 2 - r1 * Math.cos(rad);
    const x2 = size / 2 + r2 * Math.sin(rad);
    const y2 = size / 2 - r2 * Math.cos(rad);
    return { x1, y1, x2, y2 };
  });
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`${spin ? 'animate-spin' : ''} ${className}`}
      style={spin ? { animationDuration: '8s', animationTimingFunction: 'linear' } : undefined}
    >
      <circle cx={size / 2} cy={size / 2} r={size * 0.47} fill="none" stroke="#1a4fa3" strokeWidth={size * 0.04} />
      <circle cx={size / 2} cy={size / 2} r={size * 0.3} fill="none" stroke="#1a4fa3" strokeWidth={size * 0.03} />
      {spokes.map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#1a4fa3" strokeWidth={size * 0.025} />
      ))}
    </svg>
  );
}

// ─── India Flag stripe ─────────────────────────────────────────────────────────
function FlagStripe() {
  return (
    <div className="w-full h-1 flex">
      <div className="flex-1 bg-[#FF9933]" />
      <div className="flex-1 bg-white/80" />
      <div className="flex-1 bg-[#138808]" />
    </div>
  );
}

// ─── Verified badge ────────────────────────────────────────────────────────────
function VerifiedBadge({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
      <span className="material-symbols-outlined" style={{ fontSize: '11px', fontVariationSettings: "'FILL' 1" }}>verified</span>
      {text}
    </span>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function Onboarding() {
  const { t, lang } = useTranslation();
  const { completeOnboarding, setUserProfile, setCitizenProfile, login } = useAppStore();

  const [step, setStep] = useState<Step>('splash');
  const [selectedLang, setSelectedLang] = useState('hi');
  const [loginType, setLoginType] = useState<UserType>('citizen');
  const [aadhaar, setAadhaar] = useState('');
  const [mobileInput] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpTimer, setOtpTimer] = useState(30);
  const [fetchStage, setFetchStage] = useState(0);
  const [tourSlide, setTourSlide] = useState(0);
  const [profile, setProfile] = useState<CitizenProfile | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [demoEmoji, setDemoEmoji] = useState('👨‍🌾');
  const [shakeFailed, setShakeFailed] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Emergency contact form state
  const [ecName, setEcName] = useState('');
  const [ecPhone, setEcPhone] = useState('');
  const [ecRelation, setEcRelation] = useState('');

  // ── Auto-advance splash ─────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'splash') return;
    const timeoutId = setTimeout(() => setStep('language'), 2800);
    return () => clearTimeout(timeoutId);
  }, [step]);

  // ── OTP countdown ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'otp') return;
    setOtpTimer(30);
    const iv = setInterval(() => setOtpTimer((t) => (t > 0 ? t - 1 : 0)), 1000);
    return () => clearInterval(iv);
  }, [step]);

  // ── Fetching stages ────────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'fetching') return;
    setFetchStage(0);
    const stages = [600, 1200, 1900, 2600, 3400];
    const timers = stages.map((delay, i) =>
      setTimeout(() => {
        setFetchStage(i + 1);
        if (i === stages.length - 1) {
          setTimeout(() => {
            // Don't override if a persona was already selected (demo mode)
            if (!profile) {
              // Check if this is mobile-only flow (no Aadhaar)
              const isMobileFlow = !!mobileInput && !aadhaar;
              if (isMobileFlow) {
                // Create minimal profile for mobile-only users
                const mobileOnlyProfile: CitizenProfile = {
                  name: 'Citizen',
                  nameHindi: 'नागरिक',
                  aadhaarMasked: '',
                  dob: '',
                  gender: 'Male',
                  mobile: mobileInput,
                  address: '',
                  district: '',
                  state: 'India',
                  pincode: '',
                  digipin: '',
                  language: selectedLang,
                  occupation: '',
                  income: 0,
                  bplCard: false,
                  rationCardType: '',
                  linkedSchemes: [],
                  eligibleSchemes: [],
                  aadhaarVerified: false,
                  emergencyContacts: [],
                };
                setProfile(mobileOnlyProfile);
              } else {
                // Aadhaar flow - use demo profile
                setProfile(DEMO_PROFILE);
              }
            }
            setStep('profile');
          }, 500);
        }
      }, delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [step, mobileInput, aadhaar, selectedLang, profile]);

  // ── Format Aadhaar input ───────────────────────────────────────────────────
  const handleAadhaarChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 12);
    const formatted = digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
    setAadhaar(formatted);
  };

  // ── OTP box logic ──────────────────────────────────────────────────────────
  const handleOtpChange = (index: number, value: string) => {
    const v = value.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[index] = v;
    setOtp(next);
    if (v && index < 5) otpRefs.current[index + 1]?.focus();
  };
  const handleOtpKey = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = () => {
    const entered = otp.join('');
    // Accept any 6-digit OTP for demo — "123456" or demo clicks
    if (entered.length === 6) {
      setStep('fetching');
    } else {
      setShakeFailed(true);
      setTimeout(() => setShakeFailed(false), 600);
    }
  };

  const handleDemoMode = (personaProfile: CitizenProfile = DEMO_PROFILE, emoji = '👨‍🌾') => {
    setDemoMode(true);
    setDemoEmoji(emoji);
    setProfile(personaProfile);
    login(personaProfile.name, loginType);
    setStep('fetching');
  };

  const handleGovLogin = () => {
    const govProfile: CitizenProfile = {
      name: 'District Magistrate',
      nameHindi: 'जिलाधिकारी',
      aadhaarMasked: '',
      dob: '',
      gender: '',
      mobile: '',
      address: 'District Office',
      district: 'Lucknow',
      state: 'Uttar Pradesh',
      pincode: '226001',
      digipin: '',
      language: selectedLang,
      occupation: 'Government Officer',
      income: 0,
      bplCard: false,
      rationCardType: '',
      linkedSchemes: [],
      eligibleSchemes: [],
      aadhaarVerified: true,
      emergencyContacts: [],
    };
    // IMPORTANT: Set citizenProfile & userProfile BEFORE login(),
    // because login() sets onboardingComplete=true for govt, which unmounts Onboarding.
    setCitizenProfile(govProfile);
    setUserProfile({
      name: govProfile.name,
      digipin: govProfile.digipin,
      language: selectedLang,
      state: govProfile.state,
      occupation: govProfile.occupation,
      income: govProfile.income,
    });
    login('District Magistrate', 'government');
    completeOnboarding();
  };

  const finishOnboarding = () => {
    if (profile) {
      // Always apply the language the user selected in the language picker step,
      // not the profile default (which may be stale for non-demo auth flows).
      const finalLang = selectedLang || profile.language || 'hi';
      const finalProfile = { ...profile, language: finalLang };
      setCitizenProfile(finalProfile);
      setUserProfile({
        name: finalProfile.name,
        digipin: finalProfile.digipin,
        language: finalLang,
        state: finalProfile.state,
        occupation: finalProfile.occupation,
        income: finalProfile.income,
      });
    }
    completeOnboarding();
  };

  // ──────────────────────────────────────────────────────────────────────────
  // STEP: SPLASH
  // ──────────────────────────────────────────────────────────────────────────
  if (step === 'splash') {
    return (
      <div className="fixed inset-0 z-[200] bg-slate-50 dark:bg-navy flex flex-col items-center justify-center max-w-[430px] mx-auto overflow-hidden">
        <FlagStripe />
        <div className="absolute top-4 right-4 z-[300]"><ThemeToggle /></div>
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
          {/* National Emblem text */}
          <div className="text-center opacity-70">
            <p className="text-[10px] tracking-[0.3em] text-slate-500 dark:text-gray-400 uppercase">Government of India</p>
            <p className="text-[9px] tracking-[0.2em] text-gray-500">भारत सरकार</p>
          </div>

          {/* Ashoka Chakra */}
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-blue-500/5 animate-pulse" />
            <AshokaChakra size={110} spin={true} />
          </div>

          {/* App name */}
          <div className="text-center" style={{ animation: 'fadeInUp 0.8s ease-out 0.4s both' }}>
            <h1 className="text-4xl font-black tracking-tight">
              <span className="text-[#FF9933]">भारत</span>
              <span className="text-slate-900 dark:text-white"> सेतु</span>
            </h1>
            <p className="text-sm text-slate-500 dark:text-gray-400 mt-1 tracking-wider">Bharat Setu</p>
            <p className="text-[11px] text-gray-500 mt-0.5 italic">Bridging Citizens to Government</p>
          </div>

          {/* Tagline */}
          <div className="text-center" style={{ animation: 'fadeInUp 0.8s ease-out 0.8s both' }}>
            <p className="text-[11px] text-slate-500 dark:text-gray-400">सत्यमेव जयते</p>
          </div>
        </div>

        {/* Loading indicator */}
        <div className="pb-12 flex flex-col items-center gap-3">
          <div className="flex gap-1.5">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#FF9933]/60 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <p className="text-[10px] text-gray-600 tracking-widest uppercase">Loading</p>
        </div>
        <FlagStripe />
        <div className="absolute top-4 right-4 z-[300]"><ThemeToggle /></div>

        <style>{`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(100%); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP: LANGUAGE
  // ──────────────────────────────────────────────────────────────────────────
  if (step === 'language') {
    return (
      <div className="fixed inset-0 z-[200] bg-slate-50 dark:bg-navy flex flex-col max-w-[430px] mx-auto overflow-hidden" style={{ animation: 'slideUp 0.35s ease-out' }}>
        <FlagStripe />
        <div className="absolute top-4 right-4 z-[300]"><ThemeToggle /></div>
        <div className="flex-1 flex flex-col px-5 pt-8 pb-6 overflow-y-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-full px-3 py-1 mb-4">
              <span className="text-[10px] text-slate-500 dark:text-gray-400 tracking-wider uppercase">Step 1 of 3</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">अपनी भाषा चुनें</h2>
            <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">Select your preferred language</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => {
                  setSelectedLang(lang.code);
                  setUserProfile({ language: lang.code });
                }}
                className={`relative py-4 px-4 rounded-2xl border-2 transition-all text-left ${selectedLang === lang.code
                  ? 'border-[#FF9933] bg-[#FF9933]/10'
                  : 'border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:border-black/20 dark:border-white/20'
                  }`}
              >
                {selectedLang === lang.code && (
                  <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#FF9933] flex items-center justify-center">
                    <span className="material-symbols-outlined text-slate-900 dark:text-white" style={{ fontSize: '13px', fontVariationSettings: "'FILL' 1" }}>check</span>
                  </span>
                )}
                <p className="text-xl font-bold text-slate-900 dark:text-white">{lang.label}</p>
                <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">{lang.sub}</p>
              </button>
            ))}
          </div>

          <p className="text-center text-[10px] text-gray-500 mt-4">
            22 official languages of India supported
          </p>
        </div>

        <div className="px-5 pb-8">
          <button
            onClick={() => setStep('signin')}
            className="w-full bg-gradient-to-r from-[#FF9933] to-[#e8811a] text-slate-900 dark:text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-orange-500/20"
          >
            आगे बढ़ें · Continue
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
        <FlagStripe />
        <div className="absolute top-4 right-4 z-[300]"><ThemeToggle /></div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP: SIGN IN METHOD
  // ──────────────────────────────────────────────────────────────────────────
  if (step === 'signin') {
    return (
      <div className="fixed inset-0 z-[200] bg-slate-50 dark:bg-navy flex flex-col max-w-[430px] mx-auto overflow-hidden" style={{ animation: 'slideUp 0.35s ease-out' }}>
        <FlagStripe />
        <div className="absolute top-4 right-4 z-[300]"><ThemeToggle /></div>
        <div className="flex-1 flex flex-col px-5 pt-8 pb-6 overflow-y-auto">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-full px-3 py-1 mb-4">
              <span className="text-[10px] text-slate-500 dark:text-gray-400 tracking-wider uppercase">Step 2 of 3</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{t('whoAreYou', 'Who are you?')}</h2>
            <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">{t('howDoYouWantToUse', 'How do you want to use Bharat Setu?')}</p>
          </div>

          {/* Two big role buttons */}
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => setLoginType('citizen')}
              className={`flex-1 py-5 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 active:scale-95 ${
                loginType === 'citizen'
                  ? 'border-[#FF9933] bg-[#FF9933]/10 shadow-lg shadow-orange-500/10'
                  : 'border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5'
              }`}
            >
              <span className="material-symbols-outlined text-3xl" style={{ color: loginType === 'citizen' ? '#FF9933' : undefined }}>person</span>
              <span className={`text-sm font-bold ${
                loginType === 'citizen' ? 'text-[#FF9933]' : 'text-slate-500 dark:text-gray-400'
              }`}>{t('citizen', 'Citizen')}</span>
              <span className="text-[10px] text-slate-500 dark:text-gray-400">{t('citizenSub', 'Citizen')}</span>
            </button>
            <button
              onClick={() => setLoginType('government')}
              className={`flex-1 py-5 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 active:scale-95 ${
                loginType === 'government'
                  ? 'border-[#138808] bg-[#138808]/10 shadow-lg shadow-green-600/10'
                  : 'border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5'
              }`}
            >
              <span className="material-symbols-outlined text-3xl" style={{ color: loginType === 'government' ? '#138808' : undefined }}>account_balance</span>
              <span className={`text-sm font-bold ${
                loginType === 'government' ? 'text-[#138808]' : 'text-slate-500 dark:text-gray-400'
              }`}>{t('adminGov', 'Govt / Admin')}</span>
              <span className="text-[10px] text-slate-500 dark:text-gray-400">{t('adminGovSub', 'Govt / Admin')}</span>
            </button>
          </div>

          {/* Government quick-login */}
          {loginType === 'government' && (
            <div className="mb-6">
              <button
                onClick={handleGovLogin}
                className="w-full bg-gradient-to-r from-[#138808] to-[#0d6b06] text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-green-700/20"
              >
                <span className="material-symbols-outlined">login</span>
                {t('loginGov', 'Login as Government Official')}
              </button>
              <p className="text-[9px] text-gray-500 text-center mt-2">{t('loginGovDesc', 'Access case management, status updates, and broadcast announcements')}</p>
            </div>
          )}

          {/* Citizen persona selection */}
          {loginType === 'citizen' && (
            <div className="w-full">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
                <span className="text-[10px] text-slate-500 dark:text-gray-400 font-semibold tracking-wider uppercase">{t('selectDemoPersona', 'Select a Demo Persona')}</span>
                <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
              </div>
              <div className="flex flex-col gap-2.5">
                {DEMO_PERSONAS.map((persona, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleDemoMode(persona.profile, persona.emoji)}
                    className="w-full relative overflow-hidden bg-white/[0.04] border border-black/10 dark:border-white/10 hover:border-white/25 hover:bg-white/[0.07] rounded-2xl p-3.5 flex items-center gap-3.5 transition-all active:scale-[0.98] text-left"
                  >
                    <div className="absolute top-0 right-0 bg-[#FF9933] text-slate-900 dark:text-white text-[8px] font-black px-1.5 py-0.5 rounded-bl-lg tracking-wider">{t('demo', 'DEMO')}</div>
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl border"
                      style={{ backgroundColor: `${persona.tagColor}15`, borderColor: `${persona.tagColor}35` }}
                    >
                      {persona.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <p className="font-bold text-slate-900 dark:text-white text-sm leading-tight">{persona.profile.name}</p>
                        <span className="text-[9px] text-slate-500 dark:text-gray-400">{persona.tagline}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
                        <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>location_on</span>
                        {persona.location}
                      </p>
                      <p className="text-[10px] text-slate-600 dark:text-gray-300 mt-1 leading-snug line-clamp-2">{persona.desc}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {persona.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[8px] px-1.5 py-0.5 rounded font-semibold"
                            style={{ backgroundColor: `${persona.tagColor}25`, color: persona.tagColor }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-gray-500 flex-shrink-0" style={{ fontSize: '18px' }}>chevron_right</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-center text-[9px] text-gray-600 mt-4 leading-relaxed">
            {t('bharatSetuUsesDigilockerUidaiForSecureAuth', 'Bharat Setu uses DigiLocker & UIDAI for secure authentication.')}<br />
            {t('dataEncryptedStoredAsPerItAct2000', 'Data is encrypted and stored as per IT Act 2000.')}
          </p>
        </div>
        <FlagStripe />
        <div className="absolute top-4 right-4 z-[300]"><ThemeToggle /></div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP: AADHAAR INPUT
  // ──────────────────────────────────────────────────────────────────────────
  if (step === 'aadhaar') {
    const digits = aadhaar.replace(/\s/g, '');
    const isValid = digits.length === 12;
    return (
      <div className="fixed inset-0 z-[200] bg-slate-50 dark:bg-navy flex flex-col max-w-[430px] mx-auto overflow-hidden" style={{ animation: 'slideUp 0.35s ease-out' }}>
        <FlagStripe />
        <div className="absolute top-4 right-4 z-[300]"><ThemeToggle /></div>
        {/* UIDAI Header */}
        <div className="bg-[#003580] px-4 py-3 flex items-center gap-3">
          <AshokaChakra size={36} />
          <div>
            <p className="text-[11px] font-black text-slate-900 dark:text-white tracking-wider uppercase">UIDAI · भारत सरकार</p>
            <p className="text-[9px] text-blue-200">Unique Identification Authority of India</p>
          </div>
          <div className="ml-auto">
            <span className="text-[9px] bg-green-500 text-slate-900 dark:text-white px-2 py-0.5 rounded-full font-bold">SECURE</span>
          </div>
        </div>

        <div className="flex-1 flex flex-col px-5 pt-6 pb-4 overflow-y-auto">
          <button onClick={() => setStep('signin')} className="flex items-center gap-1 text-slate-500 dark:text-gray-400 text-sm mb-6 -ml-1">
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            {t('back', 'Back')}
          </button>

          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('enterAadhaarNumber', 'Enter Aadhaar Number')}</h2>
            <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">{t('aadhaar12DigitAsPerUidai', '12-digit Aadhaar as per UIDAI records')}</p>
          </div>

          {/* Aadhaar card preview */}
          <div className="relative w-full rounded-2xl overflow-hidden mb-6 border border-black/10 dark:border-white/10">
            {/* Card gradient */}
            <div className="bg-gradient-to-br from-[#003580] to-[#00234d] p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <AshokaChakra size={22} />
                    <div>
                      <p className="text-[9px] text-blue-200 font-semibold tracking-wider">UIDAI</p>
                      <p className="text-[8px] text-blue-300">Government of India</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-blue-200 mt-1 font-medium">आधार · Aadhaar</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-black/10 dark:bg-white/10 border border-black/20 dark:border-white/20 flex items-center justify-center">
                  <span className="text-2xl">👤</span>
                </div>
              </div>
              {/* Number display */}
              <div className="bg-black/10 dark:bg-white/10 rounded-xl px-4 py-3 text-center">
                <p className="font-mono text-lg font-bold text-slate-900 dark:text-white tracking-[0.25em]">
                  {aadhaar || '_ _ _ _  _ _ _ _  _ _ _ _'}
                </p>
                {isValid && (
                  <div className="flex justify-center mt-1">
                    <VerifiedBadge text="Valid Format" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Input */}
          <div className="mb-4">
            <input
              type="tel"
              inputMode="numeric"
              value={aadhaar}
              onChange={(e) => handleAadhaarChange(e.target.value)}
              maxLength={14}
              placeholder={t('enter12DigitAadhaar', 'Enter 12-digit Aadhaar')}
              className="w-full bg-white/8 border-2 border-black/10 dark:border-white/15 focus:border-[#003580] rounded-xl px-4 py-3.5 text-slate-900 dark:text-white text-center text-lg font-mono tracking-[0.2em] placeholder:text-slate-400 dark:placeholder:text-gray-600 placeholder:text-sm placeholder:tracking-normal outline-none transition-colors"
            />
            <p className="text-[10px] text-gray-500 text-center mt-2">
              {t('aadhaarEncryptedNeverStored', 'Your Aadhaar number is encrypted end-to-end and never stored')}
            </p>
          </div>

          {/* Notice */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex gap-2.5 mb-4">
            <span className="material-symbols-outlined text-amber-400 text-base flex-shrink-0 mt-0.5">info</span>
            <p className="text-[11px] text-amber-200 leading-relaxed">
              {t('otpWillBeSentToUidaiMobile', 'An OTP will be sent to your')} <b>{t('uidaiRegisteredMobileNumber', 'UIDAI-registered mobile number')}</b>. {t('standardSmsChargesMayApply', 'Standard SMS charges may apply.')}
            </p>
          </div>

          {/* DigiLocker integration note */}
          <div className="bg-blue-600/10 border border-blue-500/20 rounded-xl p-3 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600/20 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-blue-400" style={{ fontSize: '14px' }}>folder_open</span>
            </div>
            <div>
              <p className="text-[10px] font-bold text-blue-300">{t('digilockerAutofetchEnabled', 'DigiLocker Auto-Fetch Enabled')}</p>
              <p className="text-[9px] text-gray-500">{t('documentsSchemesProfileAutoLinked', 'Documents, schemes & profile will be auto-linked')}</p>
            </div>
            <div className="ml-auto">
              <span className="text-[9px] text-emerald-400 font-bold">✓ MeitY</span>
            </div>
          </div>
        </div>

        <div className="px-5 pb-8 flex flex-col gap-3">
          <button
            onClick={() => isValid && setStep('otp')}
            disabled={!isValid}
            className={`w-full font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all ${isValid
              ? 'bg-[#003580] hover:bg-[#004bb5] text-slate-900 dark:text-white active:scale-95 shadow-lg'
              : 'bg-black/5 dark:bg-white/5 text-gray-600 cursor-not-allowed'
              }`}
          >
            <span className="material-symbols-outlined">send_to_mobile</span>
            Send OTP via UIDAI
          </button>
          <button onClick={() => setStep('signin')} className="text-center text-xs text-gray-500 hover:text-slate-500 dark:text-gray-400">
            {t('useDemoModeInstead', 'Use Demo Mode instead')}
          </button>
        </div>
        <FlagStripe />
        <div className="absolute top-4 right-4 z-[300]"><ThemeToggle /></div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP: OTP VERIFICATION
  // ──────────────────────────────────────────────────────────────────────────
  if (step === 'otp') {
    const isMobileFlow = !!mobileInput && !aadhaar;
    const maskedMobile = isMobileFlow
      ? `+91-XXXXX X${mobileInput.slice(-4)}`
      : aadhaar
        ? `+91-XXXXX XX${aadhaar.replace(/\s/g, '').slice(-3)}`
        : '+91-XXXXX XX___';

    return (
      <div className="fixed inset-0 z-[200] bg-slate-50 dark:bg-navy flex flex-col max-w-[430px] mx-auto overflow-hidden" style={{ animation: 'slideUp 0.35s ease-out' }}>
        <FlagStripe />
        <div className="absolute top-4 right-4 z-[300]"><ThemeToggle /></div>
        <div className={`${isMobileFlow ? 'bg-green-600' : 'bg-[#003580]'} px-4 py-3 flex items-center gap-3`}>
          {isMobileFlow ? <span className="material-symbols-outlined text-green-100 text-3xl">sms</span> : <AshokaChakra size={36} />}
          <div>
            <p className="text-[11px] font-black text-slate-900 dark:text-white tracking-wider uppercase">{isMobileFlow ? 'Mobile Verification' : 'UIDAI OTP Verification'}</p>
            <p className={`text-[9px] ${isMobileFlow ? 'text-green-200' : 'text-blue-200'}`}>One Time Password · एकबारगी पासवर्ड</p>
          </div>
        </div>

        <div className="flex-1 flex flex-col px-5 pt-6 pb-4 overflow-y-auto">
          <button onClick={() => setStep(isMobileFlow ? 'mobile' : 'aadhaar')} className="flex items-center gap-1 text-slate-500 dark:text-gray-400 text-sm mb-6 -ml-1">
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            {t('back', 'Back')}
          </button>

          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-[#003580]/20 border-2 border-[#003580]/40 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-blue-400 text-3xl">sms</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">OTP भेजा गया</h2>
            <p className="text-xs text-slate-500 dark:text-gray-400 mt-1 leading-relaxed">
              6-digit OTP sent to your UIDAI registered mobile<br />
              <span className="text-slate-900 dark:text-white font-semibold">{maskedMobile}</span>
            </p>
          </div>

          {/* SMS mock */}
          <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                <span className="text-sm">📱</span>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-900 dark:text-white">{isMobileFlow ? t('bharat', 'BHARAT') : t('uidaiOtp', 'UIDAI-OTP')}</p>
                <p className="text-[9px] text-gray-500">{t('justNow', 'Just now')}</p>
              </div>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-gray-300 leading-relaxed">
              {t('yourOtpForBharatSetuVerificationIs', 'Your OTP for Bharat Setu verification is')}{' '}
              <span className="text-[#FF9933] font-black tracking-widest">1 2 3 4 5 6</span>.{' '}
              {t('validForTenMinutesDoNotShare', 'Valid for 10 minutes. DO NOT share with anyone.')}
            </p>
          </div>

          {/* OTP boxes */}
          <div className={`flex gap-2 justify-center mb-4 ${shakeFailed ? 'animate-bounce' : ''}`}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { otpRefs.current[i] = el; }}
                type="tel"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                title={`OTP digit ${i + 1}`}
                aria-label={`OTP digit ${i + 1}`}
                placeholder="·"
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKey(i, e)}
                className={`w-11 h-13 text-center text-xl font-black rounded-xl border-2 bg-black/5 dark:bg-white/5 text-slate-900 dark:text-white outline-none transition-all ${digit ? 'border-[#FF9933] bg-[#FF9933]/10' : 'border-black/20 dark:border-white/20'
                  }`}
                style={{ height: '52px' }}
              />
            ))}
          </div>

          {/* Timer */}
          <div className="text-center mb-4">
            {otpTimer > 0 ? (
              <p className="text-xs text-gray-500">
                {t('resendOtpIn', 'Resend OTP in')} <span className="text-slate-900 dark:text-white font-bold">0:{String(otpTimer).padStart(2, '0')}</span>
              </p>
            ) : (
              <button
                onClick={() => { setOtpTimer(30); setOtp(['', '', '', '', '', '']); }}
                className="text-xs text-[#FF9933] font-semibold"
              >
                {t('resendOtp', 'Resend OTP')}
              </button>
            )}
          </div>

          <p className="text-[10px] text-gray-600 text-center leading-relaxed">
            {t('forDemoUseOtp', 'For demo, use OTP:')} <span className="text-slate-500 dark:text-gray-400 font-mono font-bold">123456</span>
          </p>
        </div>

        <div className="px-5 pb-8">
          <button
            onClick={handleVerifyOtp}
            className={`w-full ${isMobileFlow ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-[#003580] hover:bg-[#004bb5] text-slate-900 dark:text-white'} font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg`}
          >
            <span className="material-symbols-outlined">verified_user</span>
            Verify &amp; Proceed
          </button>
        </div>
        <FlagStripe />
        <div className="absolute top-4 right-4 z-[300]"><ThemeToggle /></div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP: FETCHING PROFILE
  // ──────────────────────────────────────────────────────────────────────────
  if (step === 'fetching') {
    const stages = [
      { icon: 'verified_user', label: t('fetchStageAadhaar', 'Verifying Aadhaar with UIDAI...'), source: 'UIDAI', color: 'text-blue-400' },
      { icon: 'folder_open', label: t('fetchStageDigilocker', 'Fetching DigiLocker documents...'), source: 'DigiLocker · MeitY', color: 'text-indigo-400' },
      { icon: 'account_balance', label: t('fetchStageJanSamarth', 'Checking Jan Samarth schemes...'), source: t('janSamarthPortal', 'Jan Samarth Portal'), color: 'text-purple-400' },
      { icon: 'grain', label: t('fetchStagePMKisan', 'Syncing PM-KISAN beneficiary data...'), source: t('ministryOfAgriculture', 'Ministry of Agriculture'), color: 'text-green-400' },
      { icon: 'check_circle', label: t('fetchStageReady', 'Profile ready!'), source: t('bharatSetu', 'Bharat Setu'), color: 'text-[#FF9933]' },
    ];
    return (
      <div className="fixed inset-0 z-[200] bg-slate-50 dark:bg-navy flex flex-col items-center justify-center max-w-[430px] mx-auto overflow-hidden px-6">
        <FlagStripe />
        <div className="absolute top-4 right-4 z-[300]"><ThemeToggle /></div>
        <div className="flex-1 flex flex-col items-center justify-center w-full gap-8">
          {/* Animated circle */}
          <div className="relative w-24 h-24 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-4 border-[#FF9933]/20" />
            <div
              className="absolute inset-0 rounded-full border-4 border-[#FF9933] border-t-transparent"
              style={{ animation: 'spin 1s linear infinite' }}
            />
            <AshokaChakra size={48} spin />
          </div>

          <div className="text-center">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('settingUpProfile', 'Setting up your profile')}</h2>
            <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">{t('connectingGovPortals', 'Connecting to Government of India portals')}</p>
          </div>

          {/* Stage indicators */}
          <div className="w-full space-y-3">
            {stages.map((stage, i) => {
              const isDone = fetchStage > i;
              const isActive = fetchStage === i;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 transition-all duration-500 ${isDone ? 'opacity-100' : isActive ? 'opacity-100' : 'opacity-25'
                    }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDone ? 'bg-emerald-500/20' : isActive ? 'bg-black/10 dark:bg-white/10' : 'bg-black/5 dark:bg-white/5'}`}>
                    <span className={`material-symbols-outlined text-base ${isDone ? 'text-emerald-400' : stage.color}`} style={{ fontVariationSettings: isDone ? "'FILL' 1" : "'FILL' 0" }}>
                      {isDone ? 'check_circle' : stage.icon}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">{stage.label}</p>
                    <p className="text-[10px] text-gray-500">{stage.source}</p>
                  </div>
                  {isActive && (
                    <div className="flex gap-1">
                      {[0, 1, 2].map(j => (
                        <div key={j} className="w-1 h-1 rounded-full bg-[#FF9933] animate-bounce" style={{ animationDelay: `${j * 0.15}s` }} />
                      ))}
                    </div>
                  )}
                  {isDone && (
                    <span className="text-emerald-400 text-xs font-bold">✓</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <FlagStripe />
        <div className="absolute top-4 right-4 z-[300]"><ThemeToggle /></div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP: PROFILE PREVIEW
  // ──────────────────────────────────────────────────────────────────────────
  if (step === 'profile' && profile) {
    return (
      <div className="fixed inset-0 z-[200] bg-slate-50 dark:bg-navy flex flex-col max-w-[430px] mx-auto overflow-hidden" style={{ animation: 'slideUp 0.4s ease-out' }}>
        <FlagStripe />
        <div className="absolute top-4 right-4 z-[300]"><ThemeToggle /></div>
        <div className="flex-1 flex flex-col overflow-y-auto pb-4">
          {/* Header */}
          <div className="bg-gradient-to-b from-[#003580]/10 to-transparent px-5 pt-5 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <VerifiedBadge text={t('uidaiVerified', 'UIDAI Verified')} />
              {demoMode && <span className="text-[10px] bg-[#FF9933]/20 text-[#FF9933] border border-[#FF9933]/30 px-2 py-0.5 rounded-full font-bold">DEMO MODE</span>}
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-2">{t('profileRetrievedTitle', 'Profile Retrieved!')}</h2>
            <p className="text-xs text-slate-500 dark:text-gray-400">{t('profileRetrievedDesc', 'Your information has been retrieved from Government portals')}</p>
          </div>

          {/* Aadhaar card mockup */}
          <div className="mx-5 mb-4">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl">
              <div className="bg-gradient-to-br from-[#003580] via-[#00235d] to-[#001540] p-4">
                {/* Card header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <AshokaChakra size={28} />
                    <div>
                      <p className="text-[10px] font-black text-white tracking-wider">{t('govOfIndia', 'GOVERNMENT OF INDIA')}</p>
                      <p className="text-[8px] text-blue-300">{t('bharatSarkar', 'भारत सरकार')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-white">{t('aadhaarTitle', 'आधार · Aadhaar')}</p>
                    <p className="text-[8px] text-blue-300">{t('uniqueIdAuthority', 'Unique ID Authority')}</p>
                  </div>
                </div>

                {/* Profile info */}
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-16 h-20 rounded-xl bg-white/15 border-2 border-white/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-4xl">{demoEmoji}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-base font-black text-white leading-tight">{profile.name}</p>
                    <p className="text-[11px] text-blue-200 mb-2">{profile.nameHindi}</p>
                    <div className="space-y-0.5">
                      <div className="flex gap-2">
                        <span className="text-[9px] text-blue-300 w-14 flex-shrink-0">{t('dobLabel', 'DOB:')}</span>
                        <span className="text-[10px] text-white font-medium">{profile.dob}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-[9px] text-blue-300 w-14 flex-shrink-0">{t('genderLabel', 'Gender:')}</span>
                        <span className="text-[10px] text-white font-medium">{profile.gender}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-[9px] text-blue-300 w-14 flex-shrink-0">{t('mobileLabel', 'Mobile:')}</span>
                        <span className="text-[10px] text-white font-medium">{profile.mobile}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Aadhaar number */}
                <div className="mt-3 bg-white/10 rounded-xl px-3 py-2 flex items-center justify-between">
                  <p className="font-mono font-black text-white tracking-widest text-sm">{profile.aadhaarMasked}</p>
                  <VerifiedBadge text="Verified" />
                </div>

                {/* Address */}
                <div className="mt-2.5 bg-white/5 rounded-lg px-3 py-2">
                  <p className="text-[9px] text-blue-300 mb-0.5">{t('addressLabel', 'Address · पता')}</p>
                  <p className="text-[10px] text-white leading-relaxed">{profile.address}, {profile.district}, {profile.state} - {profile.pincode}</p>
                </div>
              </div>
              {/* Bottom color strip */}
              <div className="h-1.5 w-full flex">
                <div className="flex-1 bg-[#FF9933]" />
                <div className="flex-1 bg-white" />
                <div className="flex-1 bg-[#138808]" />
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div className="px-5 grid grid-cols-2 gap-3 mb-4">
            <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-3">
              <p className="text-[10px] text-slate-500 dark:text-gray-400 mb-1">{t('rationCardLabel', 'Ration Card')}</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{profile.rationCardType}</p>
              <VerifiedBadge text={t('linkedBadge', 'Linked')} />
            </div>
            <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-3">
              <p className="text-[10px] text-slate-500 dark:text-gray-400 mb-1">{t('digipinLabel', 'DIGIPIN')}</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white font-mono">{profile.digipin}</p>
              <span className="text-[10px] text-purple-400 font-semibold">{t("isroMapped", "ISRO Mapped")}</span>
            </div>
            <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-3">
              <p className="text-[10px] text-slate-500 dark:text-gray-400 mb-1">{t('activeSchemes', 'Active Schemes')}</p>
              <p className="text-2xl font-black text-[#FF9933]">{profile.linkedSchemes.length}</p>
              <p className="text-[9px] text-gray-500">{t('alreadyReceiving', 'Already receiving')}</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-3">
              <p className="text-[10px] text-slate-500 dark:text-gray-400 mb-1">{t('newEligible', 'New Eligible')}</p>
              <p className="text-2xl font-black text-emerald-400">{profile.eligibleSchemes.length}</p>
              <p className="text-[9px] text-emerald-500">{t('schemesFound', 'Schemes found!')}</p>
            </div>
          </div>

          {/* Linked schemes */}
          <div className="px-5 mb-4">
            <p className="text-xs font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('digilockerLinked', 'DigiLocker · Linked Benefits')}</p>
            <div className="space-y-2">
              {profile.linkedSchemes.map((s, i) => (
                <div key={i} className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#FF9933]/15 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[#FF9933] text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                  </div>
                  <p className="text-sm text-slate-900 dark:text-white font-semibold">{s}</p>
                  <span className="ml-auto text-[10px] text-emerald-400 font-bold">{t('activeCheck', 'Active ✓')}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Jan Samarth badge */}
          <div className="mx-5 bg-gradient-to-r from-purple-600/15 to-blue-600/15 border border-purple-500/20 rounded-2xl p-3 flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-purple-400">hub</span>
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-bold text-slate-900 dark:text-white">{t('janSamarthConnected', 'Jan Samarth Portal Connected')}</p>
              <p className="text-[9px] text-slate-500 dark:text-gray-400">{t('janSamarthAssessing', 'Credit-linked scheme eligibility being assessed')}</p>
            </div>
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
        </div>

        {/* CTA */}
        <div className="px-5 pb-8 flex flex-col gap-2">
          <button
            onClick={() => setStep('emergency-contact')}
            className="w-full bg-gradient-to-r from-[#FF9933] to-[#e8811a] text-slate-900 dark:text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-orange-500/20"
          >
            <span className="material-symbols-outlined">explore</span>
            {t('exploreEligibleSchemes', 'Explore %d Eligible Schemes').replace('%d', String(profile.eligibleSchemes.length))}
          </button>
          <button onClick={() => setStep('emergency-contact')} className="text-center text-xs text-gray-500 hover:text-slate-500 dark:text-gray-400 py-1">
            {t('skipForNow', 'Skip for now')}
          </button>
        </div>
        <FlagStripe />
        <div className="absolute top-4 right-4 z-[300]"><ThemeToggle /></div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP: EMERGENCY CONTACT
  // ──────────────────────────────────────────────────────────────────────────
  if (step === 'emergency-contact') {
    const handleSaveContact = () => {
      if (ecName && ecPhone.replace(/\D/g, '').length >= 10) {
        // Add to the profile's emergency contacts
        if (profile) {
          const updated = {
            ...profile,
            emergencyContacts: [
              ...profile.emergencyContacts,
              {
                id: `ec-${Date.now()}`,
                name: ecName,
                phone: ecPhone.replace(/\D/g, '').slice(-10),
                relationship: ecRelation || t('otherRelation', 'Other'),
                priority: (profile.emergencyContacts.length + 1) as 1 | 2,
              },
            ],
          };
          setProfile(updated);
        }
        setStep('tour');
      }
    };

    return (
      <div className="fixed inset-0 z-[200] bg-slate-50 dark:bg-navy flex flex-col max-w-[430px] mx-auto overflow-hidden" style={{ animation: 'slideUp 0.4s ease-out' }}>
        <FlagStripe />
        <div className="absolute top-4 right-4 z-[300]"><ThemeToggle /></div>
        <div className="flex-1 flex flex-col justify-center px-6 py-8 gap-6">
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="w-20 h-20 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-red-400 text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>emergency</span>
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">{t('emergencyContactTitle', 'Emergency Contact')}</h2>
              <p className="text-sm text-slate-500 dark:text-gray-400 mt-2 px-4 leading-relaxed">
                {t('emergencyContactDesc', 'Add a trusted contact who will be alerted during SOS emergencies')}
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">Contact Name</label>
              <input
                type="text"
                value={ecName}
                onChange={(e) => setEcName(e.target.value)}
                placeholder={t('contactNamePlaceholder', 'e.g. Ravi Kumar')}
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-[#FF9933]/50 transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">{t('phoneNumber', 'Phone Number')}</label>
              <input
                type="tel"
                value={ecPhone}
                onChange={(e) => setEcPhone(e.target.value)}
                placeholder={t('phonePlaceholder', 'e.g. 9876543210')}
                maxLength={10}
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-[#FF9933]/50 transition-colors font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">{t('relationship', 'Relationship')}</label>
              <div className="flex gap-2 flex-wrap">
                {['Family', 'Friend', 'Spouse', 'Neighbour', 'Other'].map((rel) => (
                  <button
                    key={rel}
                    onClick={() => setEcRelation(rel)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${ecRelation === rel
                      ? 'bg-[#FF9933] text-slate-900 dark:text-white shadow-md shadow-orange-500/30'
                      : 'bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-slate-500 dark:text-gray-400 hover:bg-black/10 dark:bg-white/10'
                      }`}
                  >
                    {t(rel, rel)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Existing contacts indicator */}
          {profile && profile.emergencyContacts.length > 0 && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
              <p className="text-[10px] text-emerald-400 font-bold">
                ✔ {profile.emergencyContacts.length} {t('emergencyContacts', 'emergency contact')}{profile.emergencyContacts.length > 1 ? 's' : ''} {t('alreadyLinked', 'already linked')}
              </p>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="px-6 pb-8 flex flex-col gap-2">
          <button
            onClick={handleSaveContact}
            disabled={!ecName || ecPhone.replace(/\D/g, '').length < 10}
            className="w-full bg-gradient-to-r from-[#FF9933] to-[#e8811a] text-slate-900 dark:text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-orange-500/20 disabled:opacity-40 disabled:active:scale-100"
          >
            <span className="material-symbols-outlined">person_add</span>
            Save Contact
          </button>
          <button
            onClick={() => setStep('tour')}
            className="text-center text-xs text-gray-500 hover:text-slate-500 dark:text-gray-400 py-1"
          >
            Skip for now
          </button>
        </div>
        <FlagStripe />
        <div className="absolute top-4 right-4 z-[300]"><ThemeToggle /></div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP: FEATURE TOUR
  // ──────────────────────────────────────────────────────────────────────────
  if (step === 'tour') {
    const slides = [
      {
        emoji: '🤖',
        title: t('tourAgentsTitle', '5 AI Agents at your service'),
        subtitle: t('tourAgentsSubtitle', 'आपकी सेवा में 5 AI सहायक'),
        agents: [
          { name: 'Nagarik Mitra', desc: t('tournmDesc', 'Civic & government services'), icon: 'account_balance', color: 'bg-blue-500/20 text-blue-400' },
          { name: 'Swasthya Sahayak', desc: t('tourssDesc', 'Health guidance & hospitals'), icon: 'medical_services', color: 'bg-red-500/20 text-red-400' },
          { name: 'Yojana Saathi', desc: t('tourysDesc', 'Welfare schemes & benefits'), icon: 'volunteer_activism', color: 'bg-green-500/20 text-green-400' },
          { name: 'Arthik Salahkar', desc: t('tourasDesc', 'Financial advice & banking'), icon: 'payments', color: 'bg-yellow-500/20 text-yellow-400' },
          { name: 'Vidhi Sahayak', desc: t('tourvsDesc', 'Legal aid & rights'), icon: 'gavel', color: 'bg-purple-500/20 text-purple-400' },
        ],
      },
      {
        emoji: '🎙️',
        title: t('tourVoiceTitle', 'Voice-first in 22 languages'),
        subtitle: t('tourVoiceSubtitle', '22 भाषाओं में बोलकर करें'),
        features: [
          { icon: 'mic', text: t('tourVoice1', 'Just speak your question — no typing needed') },
          { icon: 'translate', text: t('tourVoice2', 'Automatic Hinglish, Bhojpuri, Maithili support') },
          { icon: 'record_voice_over', text: t('tourVoice3', 'Text-to-speech replies in your language') },
          { icon: 'accessibility_new', text: t('tourVoice4', 'Designed for low-literacy users') },
        ],
      },
      {
        emoji: '🏛️',
        title: t('schemeScanner', 'Schemes Scanner'),
        subtitle: t('tourSchemesSubtitle', 'आपके लिए योजनाएं खोजें'),
        schemes: profile?.eligibleSchemes.slice(0, 5) ?? [],
        note: t('tourSchemesNote', 'more schemes found based on your Aadhaar profile').replace('%d', String(Math.max(0, (profile?.eligibleSchemes.length ?? 11) - 5))),
      },
    ];
    const slide = slides[tourSlide];
    return (
      <div className="fixed inset-0 z-[200] bg-slate-50 dark:bg-navy flex flex-col max-w-[430px] mx-auto overflow-hidden" style={{ animation: 'slideUp 0.35s ease-out' }}>
        <FlagStripe />
        <div className="absolute top-4 right-4 z-[300]"><ThemeToggle /></div>
        <div className="flex-1 flex flex-col px-5 pt-6 pb-2 overflow-y-auto">
          {/* Progress dots */}
          <div className="flex gap-2 justify-center mb-6">
            {slides.map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all ${i === tourSlide ? 'w-6 bg-[#FF9933]' : 'w-1.5 bg-black/20 dark:bg-white/20'}`} />
            ))}
          </div>

          <div className="text-center mb-6">
            <span className="text-5xl">{slide.emoji}</span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-3">{slide.title}</h2>
            {lang === 'hi' ? null : <p className="text-sm text-[#FF9933] mt-0.5">{slide.subtitle}</p>}
          </div>

          {/* Slide 0 – Agents */}
          {tourSlide === 0 && (
            <div className="space-y-2.5">
              {slides[0]?.agents?.map((a, i) => (
                <div key={i} className="flex items-center gap-3 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${a.color.split(' ')[0]}`}>
                    <span className={`material-symbols-outlined ${a.color.split(' ')[1]}`} style={{ fontVariationSettings: "'FILL' 1" }}>{a.icon}</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{a.name}</p>
                    <p className="text-[11px] text-slate-500 dark:text-gray-400">{a.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Slide 1 – Voice */}
          {tourSlide === 1 && (
            <div className="space-y-3">
              {slides[1]?.features?.map((f, i) => (
                <div key={i} className="flex items-center gap-3 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4">
                  <div className="w-10 h-10 rounded-xl bg-[#FF9933]/15 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[#FF9933]" style={{ fontVariationSettings: "'FILL' 1" }}>{f.icon}</span>
                  </div>
                  <p className="text-sm text-slate-900 dark:text-white leading-snug">{f.text}</p>
                </div>
              ))}
            </div>
          )}

          {/* Slide 2 – Schemes */}
          {tourSlide === 2 && (
            <div className="space-y-2">
              {slides[2]?.schemes?.map((s, i) => (
                <div key={i} className="flex items-center gap-3 bg-emerald-500/8 border border-emerald-500/25 rounded-xl px-3 py-2.5">
                  <span className="material-symbols-outlined text-emerald-400 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <p className="text-sm text-slate-900 dark:text-white">{s}</p>
                </div>
              ))}
              <div className="bg-[#FF9933]/10 border border-[#FF9933]/30 rounded-xl px-3 py-2 text-center">
                <p className="text-xs text-[#FF9933] font-semibold">{slides[2]?.note}</p>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 pb-8 flex flex-col gap-3 pt-2">
          {tourSlide < slides.length - 1 ? (
            <button
              onClick={() => setTourSlide((t) => t + 1)}
              className="w-full bg-gradient-to-r from-[#FF9933] to-[#e8811a] text-slate-900 dark:text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              Next
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          ) : (
            <button
              onClick={() => setStep('ready')}
              className="w-full bg-gradient-to-r from-[#FF9933] to-[#e8811a] text-slate-900 dark:text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-orange-500/20"
            >
              <span className="material-symbols-outlined">rocket_launch</span>
              Enter Bharat Setu
            </button>
          )}
          <button onClick={finishOnboarding} className="text-center text-xs text-gray-600 hover:text-slate-500 dark:text-gray-400 py-1">
            Skip tour
          </button>
        </div>
        <FlagStripe />
        <div className="absolute top-4 right-4 z-[300]"><ThemeToggle /></div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP: READY
  // ──────────────────────────────────────────────────────────────────────────
  if (step === 'ready' && profile) {
    return (
      <div className="fixed inset-0 z-[200] bg-slate-50 dark:bg-navy flex flex-col items-center justify-center max-w-[430px] mx-auto overflow-hidden px-6" style={{ animation: 'slideUp 0.4s ease-out' }}>
        <FlagStripe />
        <div className="absolute top-4 right-4 z-[300]"><ThemeToggle /></div>
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
          {/* Welcome burst */}
          <div className="relative">
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-[#FF9933]/20 to-[#138808]/20 border-2 border-[#FF9933]/40 flex items-center justify-center">
              <span className="text-5xl">🇮🇳</span>
            </div>
            <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-emerald-500 border-2 border-slate-50 dark:border-[#0a1628] flex items-center justify-center">
              <span className="material-symbols-outlined text-slate-900 dark:text-white text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
            </div>
          </div>

          <div>
            <p className="text-sm text-slate-500 dark:text-gray-400 mb-1">{t('welcomeOnboard', 'नमस्ते / Welcome')}</p>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">{profile.name}</h1>
            <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">{profile.district}, {profile.state}</p>
          </div>

          {/* Karma seed */}
          <div className="bg-gradient-to-r from-[#FF9933]/15 to-[#138808]/15 border border-[#FF9933]/30 rounded-2xl px-6 py-4">
            <p className="text-[11px] text-slate-500 dark:text-gray-400 mb-1">{t('awardedText', "You've been awarded")}</p>
            <p className="text-3xl font-black text-[#FF9933]">{t('karmaPoints', '+50 Karma')}</p>
            <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-1">{t('karmaReason', 'for completing Aadhaar verification')}</p>
          </div>

          {/* Quick links */}
          <div className="w-full grid grid-cols-3 gap-2">
            {[
              { icon: 'grain', label: t('pmKisanStatus', 'PM-KISAN Status'), color: 'text-green-400' },
              { icon: 'medical_services', label: t('ayushmanCard', 'Ayushman Card'), color: 'text-red-400' },
              { icon: 'record_voice_over', label: t('askInLang', 'Ask in %s').replace('%s', String(LANG_DISPLAY_NAME[profile?.language ?? 'hi']) || 'Hindi'), color: 'text-[#FF9933]' },
            ].map((item, i) => (
              <div key={i} className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-3 flex flex-col items-center gap-1.5">
                <span className={`material-symbols-outlined ${item.color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{item.icon}</span>
                <p className="text-[9px] text-slate-600 dark:text-gray-300 text-center leading-tight">{item.label}</p>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-gray-600 leading-relaxed max-w-[280px]">
            {t('dpiInitiative', 'Bharat Setu is a Digital Public Infrastructure initiative.')}<br />
            {t('poweredByInfo', 'Powered by Azure AI · ISRO DIGIPIN · DigiLocker · UIDAI')}
          </p>
        </div>

        <div className="w-full pb-10">
          <button
            onClick={finishOnboarding}
            className="w-full bg-gradient-to-r from-[#FF9933] to-[#138808] text-slate-900 dark:text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-xl shadow-orange-500/20 text-base"
          >
            <span className="material-symbols-outlined">rocket_launch</span>
            {t('enterBharatSetu', 'Enter Bharat Setu')}
          </button>
        </div>
        <FlagStripe />
        <div className="absolute top-4 right-4 z-[300]"><ThemeToggle /></div>
      </div>
    );
  }

  return null;
}
