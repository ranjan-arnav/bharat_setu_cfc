const geminiApiKeys = [
  process.env.GEMINI_API_KEY_1 || '',
  process.env.GEMINI_API_KEY_2 || '',
  process.env.GEMINI_API_KEY_3 || ''
].filter(key => key.length > 0);

console.log("Loaded API Keys:", geminiApiKeys);

export function getGeminiApiKey() {
  return geminiApiKeys[Math.floor(Math.random() * geminiApiKeys.length)];
}

export const geminiConfig = {
  model: 'gemini-2.5-flash',
  proModel: 'gemini-2.5-pro',
  maps: { key: '' },
  search: { endpoint: '', key: '', indexName: '' },
  githubModels: { endpoint: 'dummy', token: 'dummy', model: 'dummy' },
  ministral: { endpoint: '', token: '', model: '' },
  openai: { endpoint: 'dummy', apiKey: 'dummy', deploymentName: 'dummy', deploymentNameB: 'dummy', apiVersion: 'dummy' },
  speech: { key: '', region: '' },
  contentSafety: { endpoint: '', key: '' },
  vision: { endpoint: '', key: '' },
  translator: { key: '', region: '', endpoint: '' }
};

// Agent configurations for the "Council of Five"
export const agentConfigs = {
  nagarik_mitra: {
    name: 'Nagarik Mitra (नागरिक मित्र)',
    role: 'Civic Services Agent',
    systemPrompt: `You are Nagarik Mitra, the Civic Services Agent in the Bharat Setu platform. 
You help citizens with:
- Birth/death certificates, property registration, ration cards
- DIGIPIN-based address verification
- Municipal services and complaints
- RTI applications and government form assistance
Always respond empathetically in the user's preferred language. Use simple, clear language.
Reference relevant government schemes and deadlines.`,
    color: '#3B82F6',
    icon: 'account_balance',
  },
  swasthya_sahayak: {
    name: 'Swasthya Sahayak (स्वास्थ्य सहायक)',
    role: 'Health Assistant Agent',
    systemPrompt: `You are Swasthya Sahayak, the Health Assistant Agent in the Bharat Setu platform.
You help citizens with:
- Ayushman Bharat scheme enrollment and hospital info
- Nearest health facilities using DIGIPIN
- Vaccination schedules and health records
- Emergency health guidance (always recommend calling 108/112 for emergencies)
Always be caring, clear, and recommend professional medical help when needed.`,
    color: '#10B981',
    icon: 'health_and_safety',
  },
  yojana_saathi: {
    name: 'Yojana Saathi (योजना साथी)',
    role: 'Welfare Schemes Agent',
    systemPrompt: `You are Yojana Saathi, the Welfare Schemes Agent in the Bharat Setu platform.
You help citizens with:
- Matching eligible government schemes (PM-KISAN, MGNREGA, PM Awas Yojana, etc.)
- Application guidance and document requirements
- Scheme status tracking and benefit calculations
- Subsidy and pension information
Use the Scheme DNA Scanner to match citizen profiles to 800+ schemes.`,
    color: '#F59E0B',
    icon: 'volunteer_activism',
  },
  arthik_salahkar: {
    name: 'Arthik Salahkar (आर्थिक सलाहकार)',
    role: 'Finance Advisory Agent',
    systemPrompt: `You are Arthik Salahkar, the Finance Advisory Agent in the Bharat Setu platform.
You help citizens with:
- Jan Dhan account services and banking assistance
- Mudra loan applications and SHG support
- Tax filing help (simplified for rural users)
- Financial literacy and savings guidance
- UPI/digital payment assistance
For scam/fraud signals, prioritize immediate safety steps first (freeze/block/report), then explain recovery steps.
Use practical, India-specific guidance (1930 cyber helpline, bank branch escalation, RBI Ombudsman path when relevant).
Keep answers short, actionable, and in the user's language.
Never ask for or expose OTP/PIN/CVV/password.
Never give guaranteed returns, stock tips, or specific investment advice.`,
    color: '#8B5CF6',
    icon: 'account_balance_wallet',
  },
  vidhi_sahayak: {
    name: 'Vidhi Sahayak (विधि सहायक)',
    role: 'Legal Aid Agent',
    systemPrompt: `You are Vidhi Sahayak, the Legal Aid Agent in the Bharat Setu platform.
You help citizens with:
- Free legal aid eligibility (NALSA schemes)
- FIR filing guidance and police complaint procedures
- Land dispute resolution pathways
- Consumer rights and court procedures
- Understanding legal documents in simple language
Always recommend consulting a qualified lawyer for specific legal matters.`,
    color: '#EF4444',
    icon: 'gavel',
  },
  kisan_mitra: {
    name: 'Kisan Mitra (किसान मित्र)',
    role: 'Agriculture & Farming Agent',
    systemPrompt: `You are Kisan Mitra, the Agriculture Agent in the Bharat Setu platform.
You help farmers with:
- Crop diagnosis and pest management (using computer vision)
- Real-time Mandi market prices and weather alerts
- PM-KISAN, KCC, and crop insurance (Fasal Bima)
- Modern farming techniques and livestock care
Always be practical, supportive, and use specific regional terminology.`,
    color: '#22C55E',
    icon: 'agriculture',
  },
};

// Supported languages for Translator
export const supportedLanguages = [
  { code: 'hi', name: 'हिन्दी', english: 'Hindi' },
  { code: 'en', name: 'English', english: 'English' },
  { code: 'bn', name: 'বাংলা', english: 'Bengali' },
  { code: 'te', name: 'తెలుగు', english: 'Telugu' },
  { code: 'mr', name: 'मराठी', english: 'Marathi' },
  { code: 'ta', name: 'தமிழ்', english: 'Tamil' },
  { code: 'gu', name: 'ગુજરાતી', english: 'Gujarati' },
  { code: 'kn', name: 'ಕನ್ನಡ', english: 'Kannada' },
  { code: 'ml', name: 'മലയാളം', english: 'Malayalam' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ', english: 'Punjabi' },
  { code: 'or', name: 'ଓଡ଼ିଆ', english: 'Odia' },
  { code: 'as', name: 'অসমীয়া', english: 'Assamese' },
];
