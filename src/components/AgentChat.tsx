'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useAppStore, type AgentKey, type ActiveForm } from '@/lib/store';
import { agentConfigs } from '@/lib/gemini-config';
import { DEMO_AGENT_RESPONSES, getTypingDelay } from '@/lib/demo-data';
import type { TrackedItem } from '@/lib/store';
import GovStatusBar from './GovStatusBar';
import RichChatCard, { type ParsedCard } from './RichChatCard';
import { FlagStripe, GoiBadge } from '@/components/ui/GoiElements';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { startAzureSttCapture, type WebSttSession } from '@/lib/web-stt';
import { buildBackendUserId, buildConversationId } from '@/lib/backend-identity';

/** Returns a localised "added to Track tab" toast message */
function getTrackAddedMsg(language?: string): string {
  const lang = (language || 'hi').split('-')[0];
  const msgs: Record<string, string> = {
    hi: '✓ Track tab में जोड़ा गया',
    en: '✓ Added to Track tab',
    mr: '✓ Track tab ला जोडले',
    ta: '✓ Track tab-ல் சேர்க்கப்பட்டது',
    te: '✓ Track tab కి జోడించబడింది',
    bn: '✓ Track tab-এ যোগ করা হয়েছে',
    gu: '✓ Track tab માં ઉમેર્યું',
    kn: '✓ Track tab ಗೆ ಸೇರಿಸಲಾಗಿದೆ',
    ml: '✓ Track tab-ൽ ചേർത്തു',
    pa: '✓ Track tab ਵਿੱਚ ਜੋੜਿਆ',
    ur: '✓ Track tab میں شامل کیا',
  };
  return msgs[lang] || msgs.hi;
}

/** Parse an agent reply for structured ticket metadata to enrich a tracked item. */
function parseReplyForTrackData(reply: string): {
  refId?: string;
  eta?: string;
  status?: 'Active' | 'Under Review' | 'In Progress' | 'Resolved' | 'Pending';
  portal?: string;
  title?: string;
  neighbourhood?: number;
  amount?: string;
} {
  const out: ReturnType<typeof parseReplyForTrackData> = {};

  // Ref ID — "Ticket: GRV-2026-4521" or bare ID patterns
  const refMatch = reply.match(/(?:Ticket|Ref(?:erence)?|No\.?|ID|#)\s*[:.]?\s*([A-Z][A-Z0-9\/\-]{4,25})/i)
    || reply.match(/\b(GRV-[A-Z0-9\-]+|TKT-[A-Z0-9\-]+|KISAN-TKT-[A-Z0-9\-]+|PMJAY-[A-Z0-9\-]+|WTR-[A-Z0-9\-]+|FIR-[A-Z0-9\-]+|CYBER-[A-Z0-9\-]+)\b/);
  if (refMatch) out.refId = (refMatch[1] || refMatch[0]).trim();

  // ETA
  const etaMatch = reply.match(/(?:Expected\s+resolution|ETA|within(?:\s+next)?|in)\s*[:.–-]?\s*(\d+\s+hours?|\d+[-–]\d+\s+(?:hours?|days?|working\s+days?)|\d+\s+(?:working\s+)?days?)/i);
  if (etaMatch) out.eta = etaMatch[1].trim();

  // Status
  if (/\b(forwarded|registered|submitted|processing|in\s+progress)\b/i.test(reply)) out.status = 'In Progress';
  else if (/\b(under\s+review|reviewing|being\s+reviewed)\b/i.test(reply)) out.status = 'Under Review';
  else if (/\b(resolved|completed|fixed|done|closed)\b/i.test(reply)) out.status = 'Resolved';
  else if (/\b(pending|waiting|queued)\b/i.test(reply)) out.status = 'Pending';

  // Portal URL
  const portalMap: [RegExp, string][] = [
    [/pgportal\.gov\.in/i, 'pgportal.gov.in'],
    [/pmkisan\.gov\.in/i, 'pmkisan.gov.in'],
    [/pmjay\.gov\.in/i, 'pmjay.gov.in'],
    [/jansamarth/i, 'jansamarth.in'],
    [/umang|mygov/i, 'umang.gov.in'],
    [/myscheme/i, 'myscheme.gov.in'],
    [/1930|cybercrime\.gov/i, 'cybercrime.gov.in'],
    [/nalsa/i, 'nalsa.gov.in'],
  ];
  for (const [pattern, portal] of portalMap) {
    if (pattern.test(reply)) { out.portal = portal; break; }
  }

  // Neighbourhood count — "+12 same issue" or "12 others"
  const nbMatch = reply.match(/[+\+](\d+)\s+(?:same\s+issue|others?|neighbou?rs?)/i);
  if (nbMatch) out.neighbourhood = parseInt(nbMatch[1], 10);

  // Amount — ₹2,000 or Rs. 2000
  const amtMatch = reply.match(/[₹Rs\.]+\s?([\d,]+(?:\.\d{2})?)/);
  if (amtMatch) out.amount = `₹${amtMatch[1]}`;

  // Title — first meaningful non-emoji line from reply (under 65 chars)
  const titleLine = reply
    .split('\n')
    .map(l => l.replace(/^[\s\uD83D\uDD26\uD83D\uDCA1\uD83D\uDEB0\uD83C\uDF3E\uD83D\uDC8A\u2696\uFE0F\uD83C\uDFE5\uD83D\uDCB0\uD83D\uDCCB\uD83D\uDEA8\u2705\u26A0\uFE0F\uD83C\uDF1F\uD83C\uDFDB\uFE0F]+/, '').replace(/\*\*/g, '').trim())
    .find(l => l.length > 8 && l.length < 65 && !/^(Hello|Hi|I am|Namaskar|नमस्ते)/i.test(l));
  if (titleLine) out.title = titleLine;

  return out;
}

const agents: { key: AgentKey; name: string; nameHi: string; icon: string; color: string; shortName: string }[] = [
  { key: 'nagarik_mitra', name: 'Nagarik Mitra', nameHi: 'नागरिक मित्र', icon: 'account_balance', color: '#3B82F6', shortName: 'NM' },
  { key: 'swasthya_sahayak', name: 'Swasthya Sahayak', nameHi: 'स्वास्थ्य सहायक', icon: 'health_and_safety', color: '#10B981', shortName: 'SS' },
  { key: 'yojana_saathi', name: 'Yojana Saathi', nameHi: 'योजना साथी', icon: 'volunteer_activism', color: '#F59E0B', shortName: 'YS' },
  { key: 'arthik_salahkar', name: 'Arthik Salahkar', nameHi: 'आर्थिक सलाहकार', icon: 'account_balance_wallet', color: '#8B5CF6', shortName: 'AS' },
  { key: 'vidhi_sahayak', name: 'Vidhi Sahayak', nameHi: 'विधि सहायक', icon: 'gavel', color: '#EF4444', shortName: 'VS' },
];

// Keyword → Agent intent detection for smart routing
// Includes phonetic/transliterated Hindi variants and common typos
const AGENT_KEYWORDS: Record<AgentKey, RegExp> = {
  kisan_mitra: /(crop|fasal|kisan|kisaan|farmer|farming|agriculture|mandi|price|bhav|seed|tractor|subsidy|pm-kisan|fertilizer|pest|soil|harvest|फसल|किसान|मंडी|खेती|बीज|ट्रैक्टर|खाद|मिट्टी|कटाई|ফসল|কৃষক|মন্ডি|চাষ|বীজ|ট্রাক্টর|সার|মাটি|কাটা)/i,
  nagarik_mitra: /(street\s?light|road|sadak|सड़क|paani|pani|पानी|water|bijli|bijlee|बिजली|electric|safai|safaai|सफाई|garbage|kachra|nagar\s?nigam|municipal|birth\s?cert|death\s?cert|property|ration\s?card|rashan|digipin|infrastr|sewage|drain|nalaa|nala|pothole|gadha|complaint|shikayat|shikaayat|शिकायत|pramanpatra|praman\s?patra|प्रमाणपत्र|sampatti|संपत्ति|राशन|sadak|bijli|sewer|light\s?pole|lamp\s?post|জল|পানি|রাস্তা|বিদ্যুৎ|নালা|আবর্জনা|নগর|నీళ్ళు|రోడ్డు|కరెంట్|వీధి|తాగునీరు|தண்ணீர்|சாலை|மின்சாரம்|கால்வாய்|குப்பை|पाणी|रस्ता|वीज|ड्रेनेज|ಕುಡಿಯುವ ನೀರು|ರಸ್ತೆ|ವಿದ್ಯುತ್|ಚರಂಡಿ|ಕಸ|വെള്ളം|റോഡ്|വൈദ്യുതി|ഡ്രൈനേജ്|ਪਾਣੀ|ਸੜਕ|ਬਿਜਲੀ|ਨਾਲਾ)/i,
  swasthya_sahayak: /(hospital|hosptl|aspatal|aspataal|doctor|daktar|doktar|health|helth|স্বাস্থ্য|swasthya|vaccin|vaxin|vaksin|vakcin|tika|teeka|teekaa|टीका|medicin|dawai|dawa|davai|दवाई|ayushman|aayushman|আয়ুষ্মান|ambulance|ambulans|এম্বুলেন্স|blood|khoon|বীমার|bimar|beemar|sick|fever|bukhar|bukhaar|বুখার|covid|pregnan|garbh|গর্ভ|abdm|u-?win|uwin|ilaj|ilaaj|treatment|checkup|check-?up|rog|rogi|bimari|bimaari|দবা|sehat|tablet|injection|clinic|tabiyat|tabeeyat|तबियत|thik\s?nahi?|ठीक नहीं|unwell|not\s?well|not\s?feeling|feeling\s?(sick|ill|bad|unwell|dizzy)|feel\s?(sick|bad|ill|unwell)|i.?m\s+(sick|ill|unwell)|body\s?(pain|ache)|headache|sore\s?throat|high\s?temp|ill\b|feel\s?nahi?|dard|দর্দ|স্বাস্থ্য|ডাক্তার|ওষুধ|অসুস্থ|টিকা|জ্বর|ఆసుపత్రి|డాక్టర్|మందు|జబ్బు|టీకా|జ్వరం|மருத்துவமனை|டாக்டர்|மருந்து|நோய்|தடுப்பூசி|காய்ச்சல்|रुग्णालय|औषध|आजारी|लस|ताप|ಆಸ್ಪತ್ರೆ|ವೈದ್ಯ|ಔಷಧ|ಜ್ವರ|ആശുപത്രി|ഡോക്ടർ|മരുന്ന്|പനി|ਹਸਪਤਾਲ|ਡਾਕਟਰ|ਦਵਾਈ|ਬਿਮਾਰ|eating|khaana|khana|khana\s?nahi|khana\s?nahi?|not\s?eating|loss\s?of\s?appetite|bhookh\s?nahi|bhojan|poop|stool|latrine|motion|loose\s?motion|diarrhea|diarrhoea|daast|dast|दस्त|ulti|ultee|vomit|उल्टी|nausea|ghbrahat|nauzia|digest|digestive|pet\s?kharab|khana\s?nahi\s?pa|peena|drinking\s?problem|pain\s?eating|khana\s?khaane\s?mein|pina|पेट खराब|dysentr|cholera|dehydr|kamzori|weakness|dizziness|chakkar|चक्कर|weight\s?loss|vajan\s?kam|appetite|bhookh|भूख|पीना|खाना|addict|addiction|obsess|craving|paglu|naasha|nasha|नशा|alcohol|smoking|cigaret|drug\s?habit|junk\s?food|diet\s?coke|mental\s?health|anxiety|depress|stress|phobia|aadat|adat|आदत|latt|lat)/i,
  yojana_saathi: /(scheme|skeem|yojana|yojna|योजना|pm[\s-]?kisan|kisan|kisaan|কিষান|subsidy|subsidi|sabsidi|সাবসিডি|awas|aavas|awaas|housing|makan|makaan|মাকান|mgnrega|mnrega|narega|nrega|নরেগা|ujjwala|ujwala|ujala|গ্যাস|gas|fasal\s?bima|crop|fasal|ফসল|enroll|patrata|paatrata|পাত্রতা|eligib|registr|panjikaran|panjikran|পঞ্জিকরণ|welfare|sarkari|government\s?scheme|labh|laabh|pension|ration|ayushman|ayushmann|ayushmaan|pmjay|pm-?jay|আয়ুষ্মান|যোজনা|প্রকল্প|পেনশন|রেশন|ভর্তুকি|কৃষক|పథకం|యోజన|పెన్షన్|రేషన్|సబ్సిడీ|రైతు|திட்டம்|யோஜனை|ஓய்வூதியம்|ரேஷன்|மானியம்|விவசாயி|योजना|पेन्शन|रेशन|शेतकरी|ಯೋಜನೆ|ಪಿಂಚಣಿ|ರೇಷನ್|ರೈತ|പദ്ധതി|പെൻഷൻ|ਯੋਜਨਾ|ਪੈਨਸ਼ਨ|ਰਾਸ਼ਨ|ਕਿਸਾਨ)/i,
  arthik_salahkar: /(scam|skam|fraud|frod|dhokha|धोखा|otp|upi|loan|lon|লোন|mudra|মুদ্রা|bank|baink|বাইংক|jan\s?dhan|saving|bachat|বচত|invest|nivesh|নিবেশ|money|paisa|paise|পাইসা|payment|paymnt|financi|emi|credit|debit|digital\s?pay|phishing|cyber\s?fraud|mulehunter|cheat|thug|thagi|thagee|ঠগি|loot|rupay|rupee|atm|wallet|account|khata|খাতা|ব্যাংক|ঋণ|জালিয়াতি|প্রতারণা|ইউপিআই|బ్యాంకు|రుణం|మోసం|సైబర్|வங்கி|கடன்|மோசடி|சைபர்|बँक|कर्ज|फसवणूक|ਬੈਂਕ|ਕਰਜ਼|ਧੋਖਾ|ಬ್ಯಾಂಕ್|ಸಾಲ|ವಂಚನೆ|ಸೈಬರ್|ബാങ്ക്|വായ്പ|തട്ടിപ്പ്|സൈബർ)/i,
  vidhi_sahayak: /(rti|r\.t\.i|right\s?to\s?info|सूचना\s?का\s?अधिकार|suchna\s?ka\s?adhikar|fir|f\.i\.r|police|pulis|pulice|পুলিশ|court|kort|আদালত|legal|legl|kanoon|kानून|কানুন|law|adhikar|অধিকার|right|arrest|giraftar|giraftaar|গ্রেফতার|bail|zamanat|jamanat|জামানত|nalsa|nyaya|nyay|ন্যায়|consumer|upbhokta|উপভোক্তা|lawyer|vakil|vakeel|বাকিল|magistrate|dispute|vivad|vivaad|বিবাদ|domestic\s?violen|domestic\s?abuse|abuse|harassment|assault|rape|molest|stalk|dowry|dahej|দাহেজ|zero\s?fir|thana|chauki|case\s?file|complain\s?police|kanuni|घरेलू\s*हिंसा|मारपीट|उत्पीड़न|छेड़छाड़|बलात्कार|महिला\s*सुरक्षा|पति.*मार|पति.*पीट|পুলিশ|আদালত|আইন|অধিকার|এফআইআর|పోలీసు|న్యాయస్థానం|చట్టం|హక్కు|போலீஸ்|நீதிமன்றம்|சட்டம்|உரிமை|पोलीस|न्यायालय|कायदा|हक्क|ਪੁਲਿਸ|ਅਦਾਲਤ|ਕਾਨੂੰਨ|ਅਧਿਕਾਰ|ಪೊಲೀಸ್|ನ್ಯಾಯಾಲಯ|ಕಾನೂನು|ಹಕ್ಕು|പോലീസ്|കോടതി|നിയമം|അവകാശം)/i,
};

/** Score all agents against a pre-normalised message string. Shared by detectBestAgent and
 *  the clientDetectedAgent IIFE so we iterate AGENT_KEYWORDS only once per message send. */
function scoreAgentKeywords(normalized: string): Partial<Record<AgentKey, number>> {
  const scores: Partial<Record<AgentKey, number>> = {};
  for (const [agent, pattern] of Object.entries(AGENT_KEYWORDS)) {
    const matches = normalized.match(new RegExp(pattern, 'gi'));
    if (matches) scores[agent as AgentKey] = matches.length;
  }
  return scores;
}

/** Detect the best-fit agent for a user message. Returns null if current agent is fine. */
function detectBestAgent(message: string, currentAgent: AgentKey): AgentKey | null {
  // Normalize: lowercase, collapse whitespace, strip punctuation for fuzzy matching
  const normalized = message.toLowerCase().replace(/[.,!?;:'"()]/g, ' ').replace(/\s+/g, ' ').trim();

  // Safety rule: if user is already in Vidhi and message has clear legal cues, do not hand off.
  if (
    currentAgent === 'vidhi_sahayak' &&
    /(rera|builder|possession|flat|tenant|landlord|evict|fir|police|court|law|legal|rights|consumer|cyber\s*fraud|cheque|bounce|rti|domestic\s*violence|harass|abuse)/i.test(
      normalized
    )
  ) {
    return null;
  }

  const scores = scoreAgentKeywords(normalized);
  // Find highest scoring agent
  let best: AgentKey | null = null;
  let bestScore = 0;
  for (const [agent, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      best = agent as AgentKey;
    }
  }
  // Only redirect if best agent is different from current AND has high enough confidence
  if (best && best !== currentAgent && bestScore >= 2) {
    // Check if current agent also matched — if so, don't redirect
    if (scores[currentAgent] && scores[currentAgent]! >= bestScore) return null;
    return best;
  }
  return null;
}

const quickActions: Record<AgentKey, { label: string; query: string }[]> = {
  nagarik_mitra: [
    { label: '🔦 Broken streetlight', query: 'streetlight' },
    { label: '💧 Water problem', query: 'water' },
    { label: '📋 RTI file करें', query: 'default' },
  ],
  swasthya_sahayak: [
    { label: '💉 Vaccination schedule', query: 'vaccination' },
    { label: '🏥 Nearest hospital', query: 'default' },
    { label: '💊 Ayushman Bharat', query: 'default' },
  ],
  yojana_saathi: [
    { label: '🌾 PM-KISAN Info', query: 'kisan' },
    { label: '🔍 Scheme Scanner', query: 'default' },
    { label: '📊 My eligibility', query: 'default' },
  ],
  arthik_salahkar: [
    { label: '🚨 Scam report', query: 'scam' },
    { label: '💳 Mudra Loan', query: 'default' },
    { label: '📱 UPI help', query: 'default' },
  ],
  vidhi_sahayak: [
    { label: '🚨 Zero FIR', query: 'zerofir' },
    { label: '⚖️ Free legal aid', query: 'default' },
    { label: '🛡️ Consumer rights', query: 'default' },
  ],
  kisan_mitra: [
    { label: '🌾 Crop diagnosis', query: 'diagnosis' },
    { label: '📊 Mandi prices', query: 'market' },
    { label: '🚜 PM-Kisan status', query: 'status' },
  ],
};

/** Find TrackedItems relevant to a quick-action button click */
function findRelatedTrackedItems(
  query: string,
  label: string,
  items: TrackedItem[],
): TrackedItem[] {
  const combined = (query + ' ' + label).toLowerCase();
  const rules: Array<{ re: RegExp; check: (it: TrackedItem) => boolean }> = [
    {
      re: /streetlight|street.?light|lamp|bulb|broken.?light/,
      check: it =>
        it.type === 'grievance' &&
        /streetlight|light|lamp|bulb/i.test(it.title + ' ' + it.description),
    },
    {
      re: /water|paani|pani/,
      check: it =>
        it.type === 'grievance' &&
        /water|paani|pani|supply/i.test(it.title + ' ' + it.description),
    },
    {
      re: /road|pothole|sadak/,
      check: it =>
        it.type === 'grievance' &&
        /road|pothole|sadak/i.test(it.title + ' ' + it.description),
    },
    {
      re: /kisan|pm.?kisan|farmer|crop/,
      check: it =>
        it.type === 'scheme' && /kisan/i.test(it.title + ' ' + it.description),
    },
    { re: /scam|fraud|upi|otp|cyber/, check: it => it.type === 'finance' },
    { re: /zerofir|zero.?fir|fir|court|legal/, check: it => it.type === 'legal' },
    {
      re: /vaccin|health|hospital|ayushman/,
      check: it => it.type === 'health',
    },
    { re: /scheme|yojana|pension/, check: it => it.type === 'scheme' },
  ];
  for (const { re, check } of rules) {
    if (re.test(combined)) {
      const found = items.filter(check);
      if (found.length) return found;
    }
  }
  return [];
}

function inferLegalDomainFromContext(text: string): string {
  const value = (text || '').toLowerCase();
  if (/land|property|encroach|encroachment|kabza|trespass|plot|boundary|title\s*deed|mutation|zameen/.test(value)) return 'Property/Land Dispute';
  if (/rera|builder|possession|flat|apartment|real\s*estate/.test(value)) return 'RERA';
  if (/fir|police|thana|arrest|bail|zero\s*fir/.test(value)) return 'FIR/Police';
  if (/domestic|violence|harass|abuse|dowry|dv/.test(value)) return 'Family/DV';
  if (/cyber|otp|upi|fraud|phishing|1930/.test(value)) return 'Cyber';
  if (/cheque|bounce|dishonou?r|ni\s*act|138/.test(value)) return 'Cheque Bounce';
  if (/tenant|landlord|rent|evict|lease/.test(value)) return 'Tenant/Landlord';
  if (/labou?r|salary|wage|employee|termination/.test(value)) return 'Labour';
  if (/rti|right\s*to\s*information|pio/.test(value)) return 'RTI';
  if (/consumer|refund|defect|warranty|e-?commerce/.test(value)) return 'Consumer';
  return 'Other';
}

function getLatestUserContext(messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'user' && message.content && !message.content.startsWith('📷')) {
      return message.content.trim();
    }
  }
  return '';
}

export default function AgentChat({ onClose }: { onClose: () => void }) {
  const { 
    activeAgent, setActiveAgent, setOverlay, chatHistory, 
    addMessage, setAgentMessages, addTrackedItem, enrichTrackedItem,
    activeForm, setActiveForm, formData, setFormData
  } = useAppStore();
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [pendingHandoff, setPendingHandoff] = useState<{ agent: AgentKey; userMsg: string } | null>(null);
  const [multiAgentCard, setMultiAgentCard] = useState<{ userMsg?: string; consulted: { agent: AgentKey; label: string; confidence: number; reason: string }[] } | null>(null);
  const [trackToast, setTrackToast] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [attachedPreview, setAttachedPreview] = useState<string | null>(null);
  const [attachedAnalysis, setAttachedAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isCallHandoffing, setIsCallHandoffing] = useState(false);
  const sendMessageRef = useRef<(text: string, demoKey?: string, skipAutoTrack?: boolean, skipAddUserMsg?: boolean) => Promise<void>>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sttSessionRef = useRef<WebSttSession | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingTrackId = useRef<string | null>(null);
  const [isGeneratingForm, setIsGeneratingForm] = useState(false);

  const isFormSubmittable = (form: ActiveForm | null, data: Record<string, string>) => {
    if (!form) return false;
    const requiredFields = form.fields.filter((field) => field.required);
    if (!requiredFields.length) {
      return Object.values(data).some((value) => String(value || '').trim().length > 0);
    }
    return requiredFields.every((field) => String(data[field.name] || '').trim().length > 0);
  };

  const getEligibilityCheck = (form: ActiveForm | null, index: number, data: Record<string, string>) => {
    if (!form?.formKey) return false;

    const getVal = (key: string) => String(data[key] || '').trim().toLowerCase();
    const age = Number(data.age || data.dobOrAge || 0);

    switch (form.formKey) {
      case 'pm_kisan': {
        const hasAddress = !!(getVal('state') && (getVal('fullAddress') || getVal('village')));
        const hasLand = ['owner', 'joint owner'].includes(getVal('landOwnershipType')) && !!getVal('landRecordNumber');
        const notTaxPayer = getVal('incomeTaxPayer') === 'no';
        const notGovEmployee = getVal('governmentEmployee') === 'no';
        const checks = [hasAddress, hasLand, notTaxPayer && notGovEmployee];
        return checks[index] ?? false;
      }

      case 'ayushman_bharat_pmjay': {
        const seccIncluded = getVal('seccIncluded') === 'yes';
        const vulnerable = seccIncluded || ['sc', 'st'].includes(getVal('category')) || getVal('housingType').includes('kutcha');
        return [seccIncluded, vulnerable, vulnerable, vulnerable][index] ?? false;
      }

      case 'pmay_g': {
        const ruralPoorOrHomeless = !!(getVal('village') || getVal('gramPanchayat')) && ['kutcha', 'homeless'].includes(getVal('currentHouseType'));
        const kutchaOwner = getVal('currentHouseType') === 'kutcha' && getVal('landOwnership') === 'yes';
        const seccIdentified = getVal('seccIncluded') === 'yes';
        return [ruralPoorOrHomeless, kutchaOwner, seccIdentified][index] ?? false;
      }

      case 'mgnrega': {
        const ruralHousehold = !!(getVal('address') || getVal('village'));
        const adult = Number.isFinite(age) && age >= 18;
        return [ruralHousehold, adult][index] ?? false;
      }

      case 'pm_mudra': {
        const businessReady = !!(getVal('businessName') && getVal('natureOfBusiness'));
        const entrepreneur = businessReady && Number(data.loanAmountRequired || 0) > 0;
        return [businessReady, entrepreneur][index] ?? false;
      }

      case 'pm_fasal_bima': {
        const notifiedCrop = !!getVal('cropType');
        const landStake = Number(data.landAreaHectares || 0) > 0;
        return [notifiedCrop, landStake][index] ?? false;
      }

      case 'pm_ujjwala_2': {
        const woman18Plus = ['female', 'f'].includes(getVal('gender')) && Number.isFinite(age) && age >= 18;
        const noLpg = getVal('existingLpgConnection') === 'no';
        return [woman18Plus && getVal('bplHousehold') === 'yes', noLpg][index] ?? false;
      }

      default:
        return false;
    }
  };

  const currentAgent = agents.find((a) => a.key === activeAgent) || agents[0];
  const messages = chatHistory[activeAgent];

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  // Load chat from backend per agent; fallback to welcome message for fresh conversations
  useEffect(() => {
    let welcomeTimer: NodeJS.Timeout;
    let cancelled = false;

    const sendPendingVoice = () => {
      const voiceText = useAppStore.getState().lastTranscript;
      if (voiceText) {
        useAppStore.getState().setTranscript('');
        welcomeTimer = setTimeout(() => sendMessage(voiceText), 400);
      }
    };

    const sendWelcomeMessage = () => {
      const userLang = useAppStore.getState().userProfile?.language || 'hi';
      const lang = userLang.split('-')[0];
      const WELCOME_FALLBACK: Record<string, string> = {
        hi: 'नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?',
        mr: 'नमस्कार! मी तुम्हाला कशी मदत करू शकतो?',
        ta: 'வணக்கம்! நான் உங்களுக்கு எப்படி உதவலாம்?',
        te: 'నమస్కారం! నేను మీకు ఎలా సహాయం చేయగలను?',
        bn: 'নমস্কার! আমি আপনাকে কীভাবে সাহায্য করতে পারি?',
        gu: 'નમસ્તે! હું તમારી કેવી રીતે મદદ કરી શકું?',
        kn: 'ನಮಸ್ಕಾರ! ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?',
        ml: 'നമസ്കാരം! ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കട്ടെ?',
        pa: 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ?',
        ur: 'السلام علیکم! میں آپ کی کیسے مدد کر سکتا ہوں؟',
        en: 'Hello! How can I help you today?',
      };
      const ENGLISH_AGENT_WELCOME: Partial<Record<AgentKey, string>> = {
        nagarik_mitra: `🏛️ Hello! I'm **Nagarik Mitra**, your civic services assistant.\n\nI can help you with:\n• 🔦 Broken streetlights, potholes, road repairs\n• 💧 Water supply & drainage complaints\n• 📋 Birth/death certificates, ration card\n• 📍 DIGIPIN address verification\n• 📝 RTI filing & municipal complaints\n\nWhat can I help you with today?`,
        swasthya_sahayak: `🏥 Hello! I'm **Swasthya Sahayak**, your health assistant.\n\nI can help you with:\n• 🩺 Symptoms, medicines & health guidance\n• 🏨 Nearest hospitals & PHCs\n• 💉 Vaccination schedule (U-WIN)\n• 💊 Ayushman Bharat PM-JAY health cover\n• 🆘 Emergency: call **108** for ambulance\n\nHow are you feeling today?`,
        yojana_saathi: `📋 Hello! I'm **Yojana Saathi**, your government schemes guide.\n\nI can help you find and apply for:\n• 🌾 PM-KISAN, MGNREGA, PM-Awas\n• 🏥 Ayushman Bharat card\n• 🛒 Ration card & PDS benefits\n• 🎓 Scholarships & pensions\n• 800+ central & state schemes\n\nTell me about yourself to find eligible schemes!`,
        arthik_salahkar: `💰 Hello! I'm **Arthik Salahkar**, your financial guide.\n\nI can help with:\n• 🚨 UPI fraud & cyber scam reporting\n• 🏦 Bank account & Jan Dhan issues\n• 💳 MUDRA loan guidance\n• 📱 Digital payment problems\n• 🔐 OTP & phishing protection\n\nWhat financial issue can I assist you with?`,
        vidhi_sahayak: `⚖️ Hello! I'm **Vidhi Sahayak**, your legal rights assistant.\n\nI can help you with:\n• 🚔 Filing FIR or Zero FIR\n• 🆓 Free legal aid (NALSA)\n• 🛡️ Consumer court complaints\n• 🏡 Land & property disputes\n• 📜 RTI filing & rights violations\n\nWhat legal matter do you need help with?`,
      };
      const welcome = (lang === 'hi' || lang.startsWith('hi-'))
        ? (DEMO_AGENT_RESPONSES[activeAgent]?.default || WELCOME_FALLBACK.hi)
        : (lang === 'en' || lang.startsWith('en-'))
          ? (ENGLISH_AGENT_WELCOME[activeAgent] || WELCOME_FALLBACK.en)
          : (WELCOME_FALLBACK[lang] || WELCOME_FALLBACK.hi);

      setIsTyping(true);
      welcomeTimer = setTimeout(() => {
        addMessage(activeAgent, {
          id: `welcome-${Date.now()}`,
          role: 'assistant',
          content: welcome,
          timestamp: Date.now(),
          agentKey: activeAgent,
        });
        setIsTyping(false);
        sendPendingVoice();
      }, 1200);
    };

    const hydrateMessages = async () => {
      if (messages.length > 0) {
        sendPendingVoice();
        return;
      }

      const state = useAppStore.getState();
      const userId = buildBackendUserId(state);
      const conversationId = buildConversationId(userId, activeAgent);

      try {
        const response = await fetch(`/api/backend/messages?conversationId=${encodeURIComponent(conversationId)}&limit=100`);
        if (cancelled) return;

        if (response.ok) {
          const data = await response.json() as {
            messages?: Array<{ id?: string; role?: 'user' | 'assistant' | 'system'; content?: string; createdAt?: number }>;
          };

          const backendMessages = (data.messages || [])
            .filter((message) => typeof message.content === 'string' && message.content.trim().length > 0)
            .map((message, index) => {
              const role: 'user' | 'assistant' | 'system' =
                message.role === 'assistant' || message.role === 'system' ? message.role : 'user';
              return {
                id: message.id || `backend-${activeAgent}-${index}`,
                role,
                content: message.content as string,
                timestamp: typeof message.createdAt === 'number' ? message.createdAt : Date.now(),
                agentKey: activeAgent,
              };
            });

          if (backendMessages.length > 0) {
            setAgentMessages(activeAgent, backendMessages);
            sendPendingVoice();
            return;
          }
        }
      } catch {
        // fallback to welcome path
      }

      sendWelcomeMessage();
    };

    void hydrateMessages();

    return () => {
      cancelled = true;
      clearTimeout(welcomeTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAgent]);

  // Listen for inject-chat-message event (from scheme application flow)
  useEffect(() => {
    const handleInjectMessage = (e: Event) => {
      const customEvent = e as CustomEvent;
      const message = customEvent.detail?.message;
      if (message && typeof message === 'string') {
        // Wait a bit for the agent to be fully open
        setTimeout(() => {
          setInput(message);
          // Auto-send after setting the input
          setTimeout(() => sendMessageRef.current?.(message), 100);
        }, 100);
      }
    };

    window.addEventListener('inject-chat-message', handleInjectMessage);
    return () => window.removeEventListener('inject-chat-message', handleInjectMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleImageAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      addMessage(activeAgent, { id: `err-${Date.now()}`, role: 'system', content: t('errorImageSize') || '⚠️ Image must be under 5 MB. Please choose a smaller photo.', timestamp: Date.now(), agentKey: activeAgent });
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setAttachedPreview(reader.result as string);
    reader.readAsDataURL(file);
    setIsAnalyzing(true);
    setAttachedAnalysis(null);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch('/api/vision-chat', { method: 'POST', body: fd, signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json() as { analysis?: string };
        setAttachedAnalysis(data.analysis || '');
      }
    } catch { setAttachedAnalysis(''); }
    setIsAnalyzing(false);
    e.target.value = '';
  };

  /** Text-to-Speech: speaks agent responses using Azure TTS */
  const speakText = useCallback(async (text: string) => {
    if (!ttsEnabled || isSpeaking) return;
    
    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // Strip markdown and formatting for clean speech
    const cleanText = text
      .replace(/\*\*(.*?)\*\*/g, '$1')  // Remove bold
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')  // Remove links
      .replace(/[•📋🏥⚖️💰🌾🔦💧📍🆘]/g, '')  // Remove icons/bullets
      .replace(/\n+/g, '. ')  // Convert newlines to pauses
      .trim();

    if (!cleanText) return;

    setIsSpeaking(true);
    try {
      const lang = useAppStore.getState().userProfile.language || 'hi';
      const langCode = lang.startsWith('hi') ? 'hi-IN' : 
                       lang.startsWith('en') ? 'en-IN' :
                       lang.startsWith('bn') ? 'bn-IN' :
                       lang.startsWith('te') ? 'te-IN' :
                       lang.startsWith('mr') ? 'mr-IN' :
                       lang.startsWith('ta') ? 'ta-IN' :
                       lang.startsWith('gu') ? 'gu-IN' :
                       lang.startsWith('kn') ? 'kn-IN' :
                       lang.startsWith('ml') ? 'ml-IN' : 'hi-IN';

      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tts', text: cleanText, language: langCode }),
      });

      if (res.ok) {
        const audioBlob = await res.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
        };

        audio.onerror = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
        };

        await audio.play();
      } else {
        setIsSpeaking(false);
      }
    } catch (err) {
      console.error('[TTS] Failed:', err);
      setIsSpeaking(false);
    }
  }, [ttsEnabled, isSpeaking]);

  // Stop TTS when component unmounts
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const sendMessage = async (text: string, demoKey?: string, skipAutoTrack = false, skipAddUserMsg = false) => {
    if (!text.trim() && !attachedPreview) return;

    // Capture image state before clearing
    const imgPreview = attachedPreview;
    const imgAnalysis = attachedAnalysis;

    // ── Re-read fresh state at call time ──────────────────────────────────────
    // sendMessage can be invoked from stale closures (e.g. after agent handoff),
    // so we always pull activeAgent + chatHistory directly from the store.
    const { activeAgent: currentAgent, chatHistory: freshHistory } = useAppStore.getState();
    const currentMessages = freshHistory[currentAgent];

    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user' as const,
      content: text || '📷 Image sent',
      timestamp: Date.now(),
      ...(imgPreview ? { imageUrl: imgPreview } : {}),
    };
    if (!skipAddUserMsg) {
      addMessage(currentAgent, userMsg);
    }
    setInput('');
    setAttachedPreview(null);
    setAttachedAnalysis(null);
    setIsTyping(true);

    // Action Form trigger check
    const FORM_TRIGGER = /\b(file\s?complaint|complain|shikayat\s?darj|apply\s?scheme|scheme\s?form|submit\s?request|register\s?complaint|naya\s?form|apply|loan|kcc)\b/i;
    // We purposefully ignore generalized "complaint" because it overrides tracking logic without explicit intent.
    if (FORM_TRIGGER.test(text) && !demoKey && !skipAutoTrack && !skipAddUserMsg) {
      setIsGeneratingForm(true);
      setTimeout(() => scrollToBottom(), 100);

      // Async LLM context generation
      fetch('/api/generate-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, agentKey: currentAgent, userProfile: useAppStore.getState().userProfile })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.form && data.form.fields) {
          setActiveForm(data.form);
          
          // Pre-fill formData natively based on the userProfile mapping.
          const initialData: Record<string, string> = {};
          const stateSnapshot = useAppStore.getState();
          const profile = stateSnapshot.userProfile;
          const citizenProfile = stateSnapshot.citizenProfile;

          const setIfValue = (fieldName: string, value: string | number | undefined | null) => {
            if (value === undefined || value === null) return;
            const cast = String(value).trim();
            if (!cast) return;
            initialData[fieldName] = cast;
          };

          if (profile || citizenProfile) {
            data.form.fields.forEach((f: { name: string; autofillSource?: string }) => {
              const fn = f.name.toLowerCase();
              const defaultLocation = `${profile.state} (PIN: ${profile.digipin})`.trim();

              if (fn === 'name' || fn.includes('name')) {
                setIfValue(f.name, citizenProfile?.name || profile.name);
              } else if (fn.includes('aadhaar')) {
                setIfValue(f.name, citizenProfile?.aadhaarMasked);
              } else if (fn.includes('mobile')) {
                setIfValue(f.name, citizenProfile?.mobile);
              } else if (fn.includes('state')) {
                setIfValue(f.name, citizenProfile?.state || profile.state);
              } else if (fn.includes('district')) {
                setIfValue(f.name, citizenProfile?.district);
              } else if (fn.includes('pin')) {
                setIfValue(f.name, citizenProfile?.pincode || profile.digipin);
              } else if (fn.includes('address') || fn.includes('location')) {
                setIfValue(f.name, citizenProfile?.address || defaultLocation);
              } else if (fn.includes('gender')) {
                setIfValue(f.name, citizenProfile?.gender);
              } else if (fn.includes('dob')) {
                setIfValue(f.name, citizenProfile?.dob);
              } else if (fn.includes('occ') || fn.includes('job')) {
                setIfValue(f.name, citizenProfile?.occupation || profile.occupation);
              } else if (fn.includes('inc')) {
                setIfValue(f.name, citizenProfile?.income || profile.income);
              } else if (fn.includes('ration')) {
                setIfValue(f.name, citizenProfile?.rationCardType);
              } else if (fn.includes('ekyc') || fn.includes('aadhaarverified')) {
                setIfValue(f.name, citizenProfile?.aadhaarVerified ? 'Completed' : 'Pending');
              } else if (fn.includes('bpl')) {
                setIfValue(f.name, citizenProfile?.bplCard ? 'Yes' : 'No');
              } else if (f.autofillSource) {
                setIfValue(f.name, 'Verified Record');
              }
            });
          }

          const extracted = (data.structuredAction || {}) as {
            issue?: string;
            location?: string;
            department?: string;
            person?: string;
            category?: string;
          };

          data.form.fields.forEach((f: { name: string }) => {
            const fieldName = f.name.toLowerCase();
            if (!initialData[f.name]) {
              if (extracted.location && (fieldName.includes('loc') || fieldName.includes('address') || fieldName.includes('area') || fieldName.includes('place'))) {
                initialData[f.name] = extracted.location;
              } else if (extracted.issue && (fieldName.includes('issue') || fieldName.includes('problem') || fieldName.includes('complaint') || fieldName.includes('detail') || fieldName.includes('description'))) {
                initialData[f.name] = extracted.issue;
              } else if (extracted.department && (fieldName.includes('department') || fieldName.includes('dept') || fieldName.includes('office'))) {
                initialData[f.name] = extracted.department;
              } else if (extracted.person && (fieldName.includes('person') || fieldName.includes('name') || fieldName.includes('officer') || fieldName.includes('contact'))) {
                initialData[f.name] = extracted.person;
              } else if (extracted.category && (fieldName.includes('category') || fieldName.includes('type'))) {
                initialData[f.name] = extracted.category;
              }
            }
          });

          setFormData(initialData);

        } else {
          throw new Error('Invalid schema from LLM');
        }
      })
      .catch(e => {
        console.warn('LLM contextual form fallback triggered:', e);
        const fallbackType = currentAgent === 'swasthya_sahayak' ? 'health' : currentAgent === 'yojana_saathi' ? 'scheme' : 'grievance';
        setActiveForm({
          type: fallbackType,
          title: String(t('structuredRequestTitle', 'Structured Request')),
          fields: [
            { name: 'name', label: String(t('fullName', 'Full Name')) },
            { name: 'location', label: String(t('locationAddress', 'Location / Address')) },
            { name: 'details', label: String(t('caseDetails', 'Case Details')) }
          ]
        });
      })
      .finally(() => {
        setIsGeneratingForm(false);
        setTimeout(() => scrollToBottom(), 100);
      });

      addMessage(currentAgent, {
        id: `sys-form-${Date.now()}`,
        role: 'system',
        content: String(t('generatingFormMsg', `📝 **Generating Request Form...**\n\nI am dynamically creating a context-specific form for your issue. Please fill it out securely below.`)),
        timestamp: Date.now(),
        agentKey: currentAgent,
      });
      setIsTyping(false);
      return;
    }

    // Auto-track complaints / health / legal into Track tab (skip on handoff replays)
    const COMPLAINT_KW = /\b(pothole|gadha|sadak|street\s?light|paani|pani|water|sewage|nala|nalaa|kachra|garbage|bijli|safai|complaint|shikayat|FIR|zero\s?fir|court|vakil|vakeel|hospital|doctor|beemar|ambulance|108|1930|PM-?KISAN|kisan|yojana|pension|ration|scholarship|chhatravritti|ayushman|pmjay|mgnrega|narega|subsidy|scheme|UPI|fraud|scam|loan)\b/i;
    if (!skipAutoTrack && COMPLAINT_KW.test(text)) {
      const trackedType: TrackedItem['type'] =
        /\b(FIR|court|vakil|vakeel|legal|kanoon|arrest|bail|RTI)\b/i.test(text) ? 'legal' :
        /\b(hospital|doctor|health|beemar|sick|108|ambulance|ayushman|pmjay|abdm)\b/i.test(text) ? 'health' :
        /\b(PM-?KISAN|yojana|pension|ration|scholarship|chhatravritti|mgnrega|narega|subsidy|scheme)\b/i.test(text) ? 'scheme' :
        /\b(UPI|fraud|scam|loan|bank|OTP|cyber)\b/i.test(text) ? 'finance' :
        'grievance';
      const trackId = `auto-${Date.now()}`;
      pendingTrackId.current = trackId;
      const autoItem: TrackedItem = {
        id: trackId,
        type: trackedType,
        title: text.length > 55 ? text.slice(0, 55) + '…' : text,
        description: `Via ${agents.find(a => a.key === currentAgent)?.name || 'Agent'}`,
        status: 'Active',
        createdAt: Date.now(),
        agentKey: currentAgent,
        emoji: trackedType === 'grievance' ? '📋' : trackedType === 'health' ? '🏥' : trackedType === 'scheme' ? '🌾' : trackedType === 'finance' ? '💳' : '⚖️',
      };
      addTrackedItem(autoItem);
      setTrackToast(getTrackAddedMsg(useAppStore.getState().userProfile.language));
      setTimeout(() => setTrackToast(null), 3000);
    }

    // --- SMART AGENT ROUTING ---
    // Check if user's message belongs to a different agent
    const bestAgent = detectBestAgent(text, currentAgent);
    if (bestAgent && !demoKey && !skipAddUserMsg) {
      const targetInfo = agents.find((a) => a.key === bestAgent);
      const currentInfo = agents.find((a) => a.key === currentAgent);

      if (!targetInfo || !currentInfo) {
        console.warn('[AgentChat] Unable to resolve agent metadata for handoff:', { bestAgent, currentAgent });
      } else {

        const specializations: Record<string, string> = {
          'Nagarik Mitra': 'civic services & grievances',
          'Swasthya Sahayak': 'health & medical assistance',
          'Yojana Saathi': 'government schemes & welfare',
          'Arthik Salahkar': 'finance & banking',
          'Vidhi Sahayak': 'legal aid & rights',
        };

        const baseRedirect = String(t('betterAgentMsg', `🔁 **Better Agent for You**\n\nYour question is best handled by **{target}**.\n\nI am **{current}** — I specialise in {specialization}.\n\n👇 Tap below to connect:`));
        const redirectMsg = baseRedirect
          .replace('{target}', targetInfo.name)
          .replace('{current}', currentInfo.name)
          .replace('{specialization}', specializations[currentInfo.name] || 'general queries');

        setTimeout(() => {
          addMessage(currentAgent, {
            id: `redirect-${Date.now()}`,
            role: 'system',
            content: redirectMsg,
            timestamp: Date.now(),
            agentKey: currentAgent,
          });
          setPendingHandoff({ agent: bestAgent, userMsg: text });
          setIsTyping(false);
        }, 1200);
        return;
      }
    }

    // Detect which agent client-side keywords point to (even if same as current agent).
    // Reuses scoreAgentKeywords() so AGENT_KEYWORDS is only iterated once per message send.
    // This is sent to the server so Phi skips re-classification when client is confident.
    const clientDetectedAgent = (() => {
      const normalized = text.toLowerCase().replace(/[.,!?;:'"()]/g, ' ').trim();
      const scores = scoreAgentKeywords(normalized);
      let best: AgentKey | null = null;
      let bestScore = 0;
      for (const [agent, score] of Object.entries(scores)) {
        if ((score as number) > bestScore) { bestScore = score as number; best = agent as AgentKey; }
      }
      return best;
    })();

    // Content Safety check — fire-and-forget, non-blocking. Block only high-severity content.
    try {
      const safetyRes = await fetch('/api/content-safety', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 500) }),
        signal: AbortSignal.timeout(4000),
      });
      if (safetyRes.ok) {
        const safetyData = await safetyRes.json() as { safe: boolean; source?: string };
        if (!safetyData.safe) {
          addMessage(currentAgent, {
            id: `safety-${Date.now()}`,
            role: 'system',
            content: t('errorSafetyFailure') || '⚠️ आपका संदेश सुरक्षा जाँच में विफल रहा। कृपया संदेश संशोधित करें。\n\n⚠️ Your message was flagged by our safety check. Please revise and resend.',
            timestamp: Date.now(),
            agentKey: currentAgent,
          });
          setIsTyping(false);
          return;
        }
      }
    } catch { /* safety bypass on timeout/error — don't block user */ }

    // Translate to English for better Phi-4 classification if user's language is not English
    let textForRouting = text;
    const userLang = useAppStore.getState().userProfile.language || 'hi';
    
    if (!userLang.startsWith('en')) {
      try {
        const translateRes = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: text,
            sourceLang: userLang.split('-')[0], // Extract language code (e.g., 'hi' from 'hi-IN')
            targetLang: 'en',
          }),
          signal: AbortSignal.timeout(5000),
        });

        if (translateRes.ok) {
          const translateData = await translateRes.json();
          textForRouting = translateData.translated || text;
          console.log('[Routing Translation]', { original: text, translated: textForRouting });
        }
      } catch (err) {
        console.warn('[Routing Translation] Failed, using original text:', err);
        // Continue with original text if translation fails
      }
    }

    // Collect last N messages across ALL agents except the current one to form "Shared Context"
    const sharedContext = Object.entries(freshHistory)
      .filter(([agentKey]) => agentKey !== currentAgent)
      .flatMap(([agentKey, msgs]) => msgs.map(m => ({ ...m, agentKey })))
      .sort((a, b) => a.timestamp - b.timestamp)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-8) // Keep last 8 cross-agent interactions to prevent context bloat
      .map(m => `[${agents.find(a => a.key === m.agentKey)?.name || m.agentKey}] ${m.role === 'user' ? 'Citizen' : 'Agent'}: ${m.content}`)
      .join('\n');

    // Try real API first, then fallback to demo
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: imgAnalysis
            ? `[Image analysis: ${imgAnalysis}]\n${text || 'Please describe what you see in this image and how it may relate to civic or government services in India.'}`
            : text,
          userText: textForRouting, // translated to English for better routing — used for Phi-4 classification
          agentKey: currentAgent,
          clientDetectedAgent: clientDetectedAgent, // null = let server classify
          // Only send user/assistant turns — filter out system handoff messages,
          // welcome messages, and anything Azure would reject mid-conversation.
          conversationHistory: currentMessages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .filter((m) => !(m.id?.startsWith('welcome-')))
            .slice(-6)
            .map((m) => ({ role: m.role, content: m.content })),
          sharedContext,
          language: useAppStore.getState().userProfile.language || 'hi',
          digipin: useAppStore.getState().userProfile.digipin || '',
          citizenProfile: useAppStore.getState().citizenProfile,
        }),
        signal: AbortSignal.timeout(35000), // 35s — allows for Azure + GitHub fallback
      });

      if (res.ok) {
        const data = await res.json();
        if (data.reply && !data.reply.includes('कृपया पुनः प्रयास करें')) {
          const swasthyaAutoSos = /~~SWASTHYA_SOS_TRIGGER~~/i.test(String(data.reply || ''));
          const swasthyaAutoCall = /~~SWASTHYA_CALL:(\d{3,})~~/i.exec(String(data.reply || ''));
          const swasthyaAutoNotify = /~~SWASTHYA_NOTIFY:([^~]+)~~/i.exec(String(data.reply || ''));
          // Check if server routed to a different agent
          const resolvedKey = (data.resolvedAgentKey || currentAgent) as AgentKey;
          const wasRerouted = resolvedKey !== currentAgent;
          const targetAgent = wasRerouted ? agents.find((a) => a.key === resolvedKey) : null;

          setTimeout(() => {
            if (wasRerouted && targetAgent && !skipAddUserMsg) {
              // Auto-switch: store response in the resolved agent's history and switch to it
              addMessage(resolvedKey, {
                id: `agent-${Date.now()}`,
                role: 'assistant',
                content: data.reply,
                timestamp: Date.now(),
                agentKey: resolvedKey,
              });
              const baseRouting = String(t('routingToMsg', `🤖 Routing to **{target}** — connecting now...`));
              // Show handoff notification in current chat
              addMessage(currentAgent, {
                id: `handoff-${Date.now()}`,
                role: 'system',
                content: baseRouting.replace('{target}', targetAgent.name),
                timestamp: Date.now(),
              });
              setIsTyping(false);
              // Auto-execute handoff after brief delay
              setTimeout(() => {
                setPendingHandoff({ agent: resolvedKey, userMsg: imgPreview
                  ? `[Image analysis: ${imgAnalysis || ''}]\n${text || 'Please describe what you see in this image.'}` 
                  : text });
              }, 800);
            } else {
              addMessage(currentAgent, {
                id: `agent-${Date.now()}`,
                role: 'assistant',
                content: data.reply,
                timestamp: Date.now(),
                agentKey: currentAgent,
              });

              if (currentAgent === 'swasthya_sahayak' && swasthyaAutoSos) {
                setTimeout(() => setOverlay('sos-active'), 220);
                if (swasthyaAutoCall?.[1]) {
                  setTimeout(() => {
                    try {
                      window.open(`tel:${swasthyaAutoCall[1]}`);
                    } catch {
                      // Ignore browser restrictions; CTA cards still allow manual call.
                    }
                  }, 480);
                }

                if (swasthyaAutoNotify?.[1]) {
                  // Contact notification is represented through rich cards; no extra bubble needed.
                }
              }

              setIsTyping(false);
              // Enrich the pending tracked item with ticket details from the reply
              if (pendingTrackId.current) {
                const patch = parseReplyForTrackData(data.reply);
                if (Object.keys(patch).length > 0) enrichTrackedItem(pendingTrackId.current, patch);
                pendingTrackId.current = null;
              }

              // ── Multi-Agent Collaboration Detection (Phi-4 AI) ──
              fetch('/api/intelligence/multi-agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, currentAgent })
              }).then(r => r.json()).then(multiResult => {
                if (multiResult.isMultiAgent && multiResult.consulted?.length > 0) {
                  setTimeout(() => {
                    setMultiAgentCard({ consulted: multiResult.consulted, userMsg: text });
                    // Auto-dismiss after 15 seconds
                    setTimeout(() => setMultiAgentCard(null), 15000);
                  }, 1200);
                }
              }).catch(e => console.warn('[MULTI-AGENT] detection failed:', e));

              // Handle server-side agent handoff suggestion (fallback keyword-based)
              if (data.suggestedAgent && data.suggestedAgent !== currentAgent && !wasRerouted && !skipAddUserMsg) {
                const sTarget = agents.find((a) => a.key === data.suggestedAgent);
                if (sTarget) {
                  const baseAlsoTry = String(t('alsoTryMsg', `🔁 Also try **{target}** — they may be able to help better.`));
                  setTimeout(() => {
                    addMessage(currentAgent, {
                      id: `handoff-${Date.now()}`,
                      role: 'system',
                      content: baseAlsoTry.replace('{target}', sTarget.name),
                      timestamp: Date.now(),
                    });
                    setPendingHandoff({ agent: data.suggestedAgent as AgentKey, userMsg: text });
                  }, 500);
                }
              }
            }
          }, 800);
          return;
        }
      } else {
        addMessage(currentAgent, {
          id: `err-${Date.now()}`,
          role: 'system',
          content: t('errorApiConnection') || '⚠️ Error connecting to server. Using offline fallback response.',
          timestamp: Date.now(),
          agentKey: currentAgent,
        });
      }
    } catch {
      // API failed, log to chat silently and use demo data
        addMessage(currentAgent, {
          id: `err-${Date.now()}`,
          role: 'system',
          content: t('errorApiConnection') || '⚠️ Network issue. Using offline fallback response.',
          timestamp: Date.now(),
          agentKey: currentAgent,
        });
    }

    // Demo fallback with realistic typing delay
    const responses = DEMO_AGENT_RESPONSES[currentAgent] || {};
    const responseKey = demoKey || 'default';
    const reply = responses[responseKey] || responses.default || 'I understand. Let me help you. · मैं समझ गया। मैं इसमें आपकी मदद करूँगा।';
    const delay = getTypingDelay(reply);

    setTimeout(() => {
      addMessage(currentAgent, {
        id: `agent-${Date.now()}`,
        role: 'assistant',
        content: reply,
        timestamp: Date.now(),
        agentKey: currentAgent,
      });
      setIsTyping(false);
      // Enrich the pending tracked item with ticket details from the demo reply
      if (pendingTrackId.current) {
        const patch = parseReplyForTrackData(reply);
        if (Object.keys(patch).length > 0) enrichTrackedItem(pendingTrackId.current, patch);
        pendingTrackId.current = null;
      }
      // Speak the response if TTS is enabled
      if (ttsEnabled) speakText(reply);
    }, delay);
  };

  /** Execute handoff: switch to the suggested agent and replay the user's message */
  const executeHandoff = () => {
    if (!pendingHandoff) return;
    const { agent, userMsg } = pendingHandoff;
    const target = agents.find((a) => a.key === agent);
    if (!target) {
      setPendingHandoff(null);
      return;
    }

    // Add system message in current chat
    addMessage(activeAgent, {
      id: `sys-handoff-${Date.now()}`,
      role: 'system',
      content: `✅ Connecting to **${target.name}** · **${target.nameHi}** से connect हो रहे हैं...`,
      timestamp: Date.now(),
    });

    setPendingHandoff(null);

    // Switch agent after small delay
    setTimeout(() => {
      setActiveAgent(agent);

      // If agent has no messages yet, the welcome will fire from useEffect.
      // After welcome, send the original user message to get a contextual reply.
      // Translation for routing happens automatically in sendMessage.
      // skipAutoTrack=true prevents creating a duplicate tracked item (was already tracked on first send).
      setTimeout(() => {
        sendMessage(userMsg, undefined, true);
      }, 2000);
    }, 600);
  };

  sendMessageRef.current = sendMessage;

  const handleVoiceToggle = useCallback(async () => {
    if (isListening) {
      sttSessionRef.current?.stop();
      return;
    }

    try {
      const lang = useAppStore.getState().userProfile.language || 'hi';
      const session = await startAzureSttCapture(lang, 7000);
      sttSessionRef.current = session;
      setIsListening(true);

      session.done
        .then((spokenText) => {
          const text = spokenText.trim();
          if (!text) return;
          setInput(text);
          sendMessage(text);
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : 'Voice capture failed.';
          if (message !== 'cancelled') {
            alert(message);
          }
        })
        .finally(() => {
          sttSessionRef.current = null;
          setIsListening(false);
        });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('voiceNotSupportedInBrowser', 'Voice not supported in this browser.');
      alert(message);
      setIsListening(false);
    }
  }, [isListening, sendMessage, t]);

  useEffect(() => {
    return () => {
      sttSessionRef.current?.cancel();
      sttSessionRef.current = null;
    };
  }, []);

  const handleQuickAction = (query: string, label: string) => {
    // Strip leading emoji and whitespace
    const cleanLabel = label.replace(/^[^\w\u0900-\u097F]+/, '').trim();

    if (/scheme\s*scanner/i.test(cleanLabel)) {
      setOverlay('scheme-scanner');
      return;
    }

    // If there are matching items in the Track tab, show a rich status response
    const relatedItems = findRelatedTrackedItems(
      query,
      label,
      useAppStore.getState().trackedItems,
    );
    if (relatedItems.length > 0) {
      const item = relatedItems[0];
      const sEmoji: Record<string, string> = {
        Active: '\uD83D\uDD35',
        'Under Review': '\uD83D\uDFE1',
        'In Progress': '\uD83D\uDFE0',
        Resolved: '\u2705',
        Pending: '\u23F3',
      };
      const lines: string[] = [
        `${item.emoji || '\uD83D\uDCCB'} **${item.title}** Track tab \u092e\u0947\u0902 \u0926\u0930\u094d\u091c \u0939\u0948\u0964`,
        `Your case is already being tracked.`,
        ``,
        `**Status:** ${sEmoji[item.status] ?? '\uD83D\uDD35'} ${item.status}`,
      ];
      if (item.refId) lines.push(`**Ticket ID:** \`${item.refId}\``);
      if (item.eta) lines.push(`**ETA:** ${item.eta}`);
      if (item.neighbourhood)
        lines.push(`**+${item.neighbourhood}** neighbours in your area filed the same issue`);
      if (item.amount) lines.push(`**Amount:** ${item.amount}`);
      if (item.portal) lines.push(`**Portal:** ${item.portal}`);
      if (relatedItems.length > 1)
        lines.push(
          ``,
          `+${relatedItems.length - 1} more related case${
            relatedItems.length > 2 ? 's' : ''
          } in your Track tab`,
        );
      lines.push(``, `~~TRACK_TAB~~`);

      const { activeAgent: curAgent } = useAppStore.getState();
      addMessage(curAgent, {
        id: `user-${Date.now()}`,
        role: 'user',
        content: cleanLabel || label,
        timestamp: Date.now(),
      });
      setIsTyping(true);
      setTimeout(() => {
        addMessage(curAgent, {
          id: `track-rich-${Date.now()}`,
          role: 'assistant',
          content: lines.join('\n'),
          timestamp: Date.now(),
          agentKey: curAgent,
        });
        setIsTyping(false);
      }, 700);
      return;
    }

    sendMessage(cleanLabel || label, query);
  };

  const switchAgent = (key: AgentKey) => {
    setActiveAgent(key);
    setShowAgentPicker(false);
    setPendingHandoff(null);
  };

  const handleCallHandoff = async () => {
    if (isCallHandoffing) return;
    setIsCallHandoffing(true);

    const state = useAppStore.getState();
    const mobile = state.citizenProfile?.mobile || '';
    const recentConversation = (state.chatHistory[state.activeAgent] || [])
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-10)
      .map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      }));

    try {
      const response = await fetch('/api/call/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          continuationMode: 'call_only',
          agentKey: state.activeAgent,
          language: state.userProfile.language || 'hi',
          digipin: state.userProfile.digipin || '',
          mobile,
          userName: state.userProfile.name || state.citizenProfile?.name || 'Citizen',
          conversation: recentConversation,
        }),
      });

      const payload = await response.json().catch(() => ({})) as {
        ringDispatched?: boolean;
        callId?: string;
        continuationToken?: string;
        joinDeepLink?: string;
        fallbackDialNumber?: string;
        warning?: string;
        error?: string;
      };

      if (!response.ok) {
        const errorText = payload.error || t('callHandoffFailed', 'Unable to start call handoff right now.');
        addMessage(activeAgent, {
          id: `call-fail-${Date.now()}`,
          role: 'system',
          content: `⚠️ ${errorText}`,
          timestamp: Date.now(),
          agentKey: activeAgent,
        });
        return;
      }

      const ringStatus = payload.ringDispatched
        ? t('mobileRingingNow', '📞 Ringing your mobile app now...')
        : t('ringWebhookUnavailable', '📞 Mobile ring service unavailable, using fallback call route.');
      const tokenText = payload.continuationToken
        ? `\n\nContinuation Token: \`${payload.continuationToken}\``
        : '';
      const callText = payload.callId ? `\nCall ID: \`${payload.callId}\`` : '';
      const warnText = payload.warning ? `\n${payload.warning}` : '';

      addMessage(activeAgent, {
        id: `call-ok-${Date.now()}`,
        role: 'system',
        content: `${ringStatus}${callText}${tokenText}${warnText}\n\n${t('switchingToCallMode', 'Switching from chat to call mode now...')}`,
        timestamp: Date.now(),
        agentKey: activeAgent,
      });

      if (payload.joinDeepLink) {
        window.open(payload.joinDeepLink, '_blank', 'noopener,noreferrer');
        setTimeout(() => onClose(), 350);
      } else if (!payload.ringDispatched && payload.fallbackDialNumber) {
        window.location.href = `tel:${payload.fallbackDialNumber}`;
        setTimeout(() => onClose(), 350);
      }
    } catch {
      addMessage(activeAgent, {
        id: `call-err-${Date.now()}`,
        role: 'system',
        content: t('callHandoffNetworkError', '⚠️ Network error while trying to ring the mobile app.'),
        timestamp: Date.now(),
        agentKey: activeAgent,
      });
    } finally {
      setIsCallHandoffing(false);
    }
  };

  /** Lightweight markdown renderer: **bold**, line breaks preserved */
  // NOTE: kept as utility for potential future use — currently RichChatCard handles formatting

  const renderMessage = (msg: typeof messages[0]) => {
    if (msg.role === 'system') {
      const isCollab = msg.content.includes('Multi-Agent Intelligence');
      const isHandoff = msg.content.includes('Better Agent') || msg.content.includes('Also try');
      
      const containerClass = isCollab 
        ? "bg-gradient-to-r from-[#8B5CF6]/15 via-[#8B5CF6]/5 to-transparent border-l-[3px] border-[#8B5CF6]"
        : isHandoff
        ? "bg-gradient-to-r from-[#FF9933]/15 via-[#FF9933]/5 to-transparent border-l-[3px] border-[#FF9933]"
        : "bg-slate-100 dark:bg-[#162a4a]/80 border border-slate-300 dark:border-white/10";

      const icon = isCollab ? "psychology" : isHandoff ? "sync_alt" : "info";
      const iconColor = isCollab ? "text-[#8B5CF6]" : isHandoff ? "text-[#FF9933]" : "text-slate-500";
      
      return (
        <div key={msg.id} className="flex justify-center my-4 mx-3" style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <div className={`rounded-xl px-4 py-3.5 w-full shadow-sm rounded-l-md ${containerClass}`}>
            <div className="flex items-start gap-3">
              <span className={`material-symbols-outlined mt-0.5 ${iconColor} bg-white dark:bg-black/20 rounded-lg p-1 shadow-sm`}>{icon}</span>
              <div className="flex-1 text-[11.5px] text-slate-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap pt-1">
                {msg.content.split('\n').map((line, lIdx) => (
                   <div key={lIdx} className={line.trim() === '' ? 'h-2' : ''}>
                     {line.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((part, idx) => {
                       if (part.startsWith('**') && part.endsWith('**')) return <strong key={idx} className="text-slate-900 dark:text-white font-bold">{part.slice(2, -2)}</strong>;
                       if (part.startsWith('_') && part.endsWith('_')) return <span key={idx} className="bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded text-[10px] text-slate-600 dark:text-gray-400 font-medium">{part.slice(1, -1)}</span>;
                       return <span key={idx}>{part}</span>;
                     })}
                   </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    const isUser = msg.role === 'user';
    return (
      <div key={msg.id} className={`flex gap-2 mb-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {!isUser && (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-1"
            style={{ backgroundColor: currentAgent.color }}
          >
            {currentAgent.shortName}
          </div>
        )}
        <div
          className={`${isUser ? 'max-w-[80%]' : 'flex-1 min-w-0'} rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? 'bg-gradient-to-br from-[#FF9933] to-[#E68A2E] text-white rounded-br-md'
              : 'bg-slate-100 dark:bg-[#162a4a] border border-slate-300 dark:border-white/10 text-slate-800 dark:text-gray-200 rounded-bl-md'
          }`}
        >
          <div>
            {isUser && msg.imageUrl && (
              <Image src={msg.imageUrl} alt="Attached" width={320} height={160} unoptimized className="max-w-full rounded-xl mb-2 max-h-40 object-cover h-auto" />
            )}
            {isUser ? (msg.imageUrl && !msg.content.startsWith('📷') ? msg.content || null : (msg.content === '📷 Image sent' ? null : msg.content)) : (
              <RichChatCard
                content={msg.content}
                agentKey={activeAgent}
                onAction={(card: ParsedCard) => {
                  // 1. Open URL / dial phone based on card type
                  const phoneMatch = card.subtitle?.match(/\b(108|112|102|1930|181|1098|14567)\b/);
                  if (card.type === 'emergency' && (card.actionUrl || phoneMatch)) {
                    window.open(card.actionUrl || `tel:${phoneMatch![0]}`);
                  } else if (card.type === 'legal-contact' && card.actionUrl) {
                    window.open(card.actionUrl);
                  } else if (card.type === 'finance-contact' && card.actionUrl) {
                    window.open(card.actionUrl);
                  } else if (card.type === 'legal-map' && card.actionUrl) {
                    window.open(card.actionUrl, '_blank');
                  } else if (card.type === 'legal-resource' && card.actionUrl) {
                    window.open(card.actionUrl, '_blank');
                  } else if (card.type === 'finance-resource' && card.actionUrl) {
                    window.open(card.actionUrl, '_blank');
                  } else if (card.type === 'health-sos') {
                    setOverlay('sos-active');
                  } else if (card.type === 'health-timeline') {
                    if (card.refId) {
                      try {
                        sessionStorage.setItem('track-live-popup-ref', card.refId);
                      } catch {
                        // ignore storage failures
                      }
                      window.dispatchEvent(new CustomEvent('open-live-track-popup', { detail: { refId: card.refId } }));
                    }
                    setOverlay('track');
                  } else if (card.type === 'health-notify') {
                    setOverlay('emergency-contacts');
                  } else if (card.type === 'grievance' || card.type === 'nagar_samwad') {
                    setOverlay('track');
                  } else if (card.type === 'legal-complaint') {
                    const stateSnapshot = useAppStore.getState();
                    const profile = stateSnapshot.userProfile;
                    const citizen = stateSnapshot.citizenProfile;
                    const contextSummary = getLatestUserContext(messages);
                    const inferredDomain = inferLegalDomainFromContext(contextSummary);

                    setActiveForm({
                      formKey: 'legal_complaint_in_app',
                      type: 'legal',
                      title: 'In-App Legal Complaint Form',
                      subtitle: 'Submit your complaint directly for legal guidance and tracking.',
                      ministry: 'Legal Aid / Police / Consumer Authority',
                      fields: [
                        { name: 'fullName', label: 'Full Name', section: 'Applicant', inputType: 'text', required: true },
                        { name: 'mobile', label: 'Mobile Number', section: 'Applicant', inputType: 'text', required: true },
                        { name: 'state', label: 'State', section: 'Applicant', inputType: 'text', required: true },
                        { name: 'district', label: 'District', section: 'Applicant', inputType: 'text', required: true },
                        { name: 'address', label: 'Address', section: 'Applicant', inputType: 'textarea', required: true },
                        {
                          name: 'legalDomain',
                          label: 'Legal Domain',
                          section: 'Complaint Details',
                          inputType: 'select',
                          required: true,
                          options: ['Property/Land Dispute', 'RERA', 'Consumer', 'FIR/Police', 'Family/DV', 'Cyber', 'Cheque Bounce', 'Tenant/Landlord', 'Labour', 'RTI', 'Other'],
                        },
                        { name: 'incidentDate', label: 'Incident Date', section: 'Complaint Details', inputType: 'date', required: true },
                        { name: 'complaintSummary', label: 'Complaint Summary', section: 'Complaint Details', inputType: 'textarea', required: true },
                        { name: 'againstWhom', label: 'Against Whom (Person/Entity)', section: 'Complaint Details', inputType: 'text', required: false },
                        { name: 'documentProof', label: 'Upload Evidence (Optional)', section: 'Attachments', inputType: 'file', required: false },
                      ],
                      documents: ['ID proof', 'Relevant agreement/invoice/notice', 'Chats/emails/photos as evidence'],
                    });

                    setFormData({
                      fullName: citizen?.name || profile.name || '',
                      mobile: citizen?.mobile || '',
                      state: citizen?.state || profile.state || '',
                      district: citizen?.district || '',
                      address: citizen?.address || '',
                      legalDomain: inferredDomain,
                      incidentDate: '',
                      complaintSummary: contextSummary,
                      againstWhom: '',
                      documentProof: '',
                    });

                    addMessage(activeAgent, {
                      id: `legal-form-open-${Date.now()}`,
                      role: 'system',
                      content: '📝 Legal complaint form is ready below. Fill and submit to file directly from the app.',
                      timestamp: Date.now(),
                      agentKey: activeAgent,
                    });
                    setTimeout(() => scrollToBottom(), 120);
                    return;
                  } else if (card.type === 'health' && card.actionLabel?.toLowerCase().includes('navigate')) {
                    const snapshot = useAppStore.getState();
                    const citizen = snapshot.citizenProfile;
                    const aadhaarSuffix = String(citizen?.aadhaarMasked || '').replace(/\D/g, '').slice(-4) || '0000';
                    const abhaId = `14${aadhaarSuffix} ••• ••••`;
                    const linkedHealthRecords = Array.isArray(citizen?.linkedSchemes)
                      ? citizen.linkedSchemes.filter((scheme) => /ayushman|pmjay|abha|health|abdm|vaccin/i.test(String(scheme || ''))).slice(0, 3)
                      : [];
                    const healthSummary = [
                      citizen?.name ? `Name: ${citizen.name}` : '',
                      citizen?.dob ? `DOB: ${citizen.dob}` : '',
                      citizen?.gender ? `Gender: ${citizen.gender}` : '',
                      linkedHealthRecords.length ? `Linked health records: ${linkedHealthRecords.join(', ')}` : 'Linked health records: Basic emergency profile',
                    ].filter(Boolean).join(' | ');

                    const abhaShareMarker = encodeURIComponent(JSON.stringify({
                      abhaId,
                      healthSummary,
                      status: 'ABHA ID with health report sent for reference.',
                    }));

                    addMessage(activeAgent, {
                      id: `abha-share-${Date.now()}`,
                      role: 'assistant',
                      content: `🔐 ABHA secure share completed for hospital response.\n~~SWASTHYA_ABHA_SHARE:${abhaShareMarker}~~`,
                      timestamp: Date.now(),
                      agentKey: activeAgent,
                    });
                    window.open(card.actionUrl || 'https://www.bing.com/maps?q=primary+health+centre+near+me', '_blank');
                  } else if (card.type === 'abha') {
                    window.open('https://healthid.ndhm.gov.in', '_blank');
                  } else if (card.type === 'legal') {
                    window.open('https://nalsa.gov.in', '_blank');
                  } else if (card.type === 'dbt') {
                    window.open('https://dbtbharat.gov.in', '_blank');
                  } else if (card.type === 'scheme') {
                    window.open('https://jansamarth.in', '_blank');
                  } else if (card.type === 'track-tab') {
                    setOverlay('track');
                  } else if (card.actionUrl) {
                    window.open(card.actionUrl, card.actionUrl.startsWith('tel:') ? undefined : '_blank');
                  }

                  // 2. Also track the card if it has a refId
                  if (card.refId) {
                    const typeToEmoji: Record<string, string> = {
                      grievance: '📋', health: '🏥', 'health-timeline': '🚑', legal: '⚖️', scheme: '📜',
                      dbt: '💰', finance: '💳', default: '📌',
                    };
                    addTrackedItem({
                      id: `card-${card.refId}-${Date.now()}`,
                      type: card.type === 'grievance'
                        ? 'grievance'
                        : card.type === 'health' || card.type === 'health-timeline' || card.type === 'health-sos' || card.type === 'health-notify'
                          ? 'health'
                          : card.type === 'legal'
                            ? 'legal'
                            : card.type === 'dbt' || card.type === 'finance'
                              ? 'finance'
                              : 'scheme',
                      title: card.title,
                      description: card.subtitle || '',
                      status: 'Active',
                      createdAt: Date.now(),
                      agentKey: activeAgent,
                      refId: card.refId,
                      emoji: typeToEmoji[card.type] || typeToEmoji.default,
                    });
                    setTrackToast(getTrackAddedMsg(useAppStore.getState().userProfile.language));
                    setTimeout(() => setTrackToast(null), 3000);
                  }
                }}
              />
            )}
          </div>
          <div className={`text-[9px] mt-1.5 ${isUser ? 'text-white/60' : 'text-slate-500 dark:text-gray-500'}`}>
            {new Date(msg.timestamp).toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] bg-white dark:bg-[#0a1628] flex flex-col max-w-[430px] mx-auto" style={{ animation: 'slideUp 0.3s ease-out' }}>
      <FlagStripe />
      {/* Header */}
      <div className="relative flex items-center gap-3 px-4 py-3 bg-slate-100/95 dark:bg-[#0f1f3a]/95 backdrop-blur-xl border-b border-slate-300 dark:border-white/10">
        <button onClick={onClose} className="p-1">
          <span className="material-symbols-outlined text-gray-400">arrow_back</span>
        </button>
        <button
          onClick={() => setShowAgentPicker(!showAgentPicker)}
          className="flex items-center gap-2 flex-1"
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs"
            style={{ backgroundColor: currentAgent.color }}
          >
            <span className="material-symbols-outlined text-lg">{currentAgent.icon}</span>
          </div>
          <div className="text-left">
            <div className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-1">
              {currentAgent.name}
              <span className="material-symbols-outlined text-sm text-gray-500 dark:text-gray-400">expand_more</span>
            </div>
            <div className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-600 dark:bg-green-400"></span>
              AutoGen 0.4 • Online
            </div>
          </div>
        </button>
        <button onClick={() => { 
          if (messages.length > 0) setShowClearConfirm(true);
        }} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10" title={t('clearChat', 'Clear chat')}>
          <span className="material-symbols-outlined text-gray-600 dark:text-gray-400 text-xl">delete_sweep</span>
        </button>
        <button
          onClick={handleCallHandoff}
          disabled={isCallHandoffing}
          className={`p-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 ${isCallHandoffing ? 'opacity-60 cursor-not-allowed' : ''}`}
          title={t('continueOnCall', 'Continue on call')}
        >
          <span className={`material-symbols-outlined text-xl ${isCallHandoffing ? 'animate-pulse text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
            {isCallHandoffing ? 'ring_volume' : 'call'}
          </span>
        </button>
        <button 
          onClick={() => {
            setTtsEnabled(!ttsEnabled);
            // Stop any playing audio when disabled
            if (ttsEnabled && audioRef.current) {
              audioRef.current.pause();
              audioRef.current = null;
              setIsSpeaking(false);
            }
          }} 
          className={`p-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 ${ttsEnabled ? 'bg-green-100 dark:bg-green-900/30' : ''}`} 
          title={ttsEnabled ? t('ttsEnabled', 'TTS Enabled') : t('enableTts', 'Enable TTS')}
        >
          <span className={`material-symbols-outlined text-xl ${
            isSpeaking ? 'animate-pulse text-green-600 dark:text-green-400' :
            ttsEnabled ? 'text-green-600 dark:text-green-400' : 
            'text-gray-600 dark:text-gray-400'
          }`}>
            {isSpeaking ? 'volume_up' : ttsEnabled ? 'record_voice_over' : 'voice_over_off'}
          </span>
        </button>
        <GoiBadge className="mr-0.5" />
        {showClearConfirm && (
          <div className="absolute top-14 right-4 z-50 bg-white dark:bg-[#1a0a3a] border border-slate-300 dark:border-white/10 rounded-xl p-3 shadow-2xl flex flex-col gap-2 min-w-[160px]">
            <p className="text-xs text-slate-700 dark:text-gray-300">{t('clearChatHistoryPrompt', 'Clear chat history?')}</p>
            <div className="flex gap-2">
              <button onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-1 text-xs rounded-lg bg-slate-200 dark:bg-white/5 text-slate-700 dark:text-gray-300 hover:bg-slate-300 dark:hover:bg-white/10">
                {t('cancel', 'Cancel')}
              </button>
              <button onClick={() => { const { clearChat } = useAppStore.getState(); clearChat(activeAgent); setShowClearConfirm(false); }}
                className="flex-1 py-1 text-xs rounded-lg bg-red-600/80 text-white hover:bg-red-600">
                {t('clear', 'Clear')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Agent Handoff Trace */}
      <div className="px-4 py-2 bg-slate-50/90 dark:bg-[#0a1628]/90 border-b border-slate-200 dark:border-white/5 flex items-center gap-2 overflow-x-auto no-scrollbar">
        {agents.map((a, i) => (
          <div key={a.key} className="flex items-center shrink-0">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold border-2 cursor-pointer transition-all ${
                a.key === activeAgent
                  ? 'border-white/50 scale-110'
                  : 'border-transparent opacity-50 hover:opacity-80'
              }`}
              style={{ backgroundColor: a.color }}
              onClick={() => switchAgent(a.key)}
              title={a.name}
            >
              {a.shortName}
            </div>
            {i < agents.length - 1 && (
              <div className="w-4 h-[1px] bg-white/20 mx-0.5"></div>
            )}
          </div>
        ))}
      </div>

      {/* GoI Ecosystem Bar */}
      <GovStatusBar agentKey={activeAgent} />

      {/* Agent Picker Dropdown */}
      {showAgentPicker && (
        <div className="absolute top-[60px] left-0 right-0 z-50 bg-slate-100/98 dark:bg-[#0f1f3a]/98 backdrop-blur-xl border-b border-slate-300 dark:border-white/10 p-3 space-y-1" style={{ animation: 'fadeIn 0.2s ease-out' }}>
          {agents.map((a) => (
            <button
              key={a.key}
              onClick={() => switchAgent(a.key)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                a.key === activeAgent ? 'bg-slate-200 dark:bg-white/10' : 'hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white"
                style={{ backgroundColor: a.color }}
              >
                <span className="material-symbols-outlined text-lg">{a.icon}</span>
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-slate-800 dark:text-white">{a.name}</div>
                <div className="text-[10px] text-slate-600 dark:text-gray-400">{agentConfigs[a.key].role}</div>
              </div>
              {a.key === activeAgent && (
                <span className="material-symbols-outlined text-green-400 ml-auto">check_circle</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Track toast */}
      {trackToast && (
        <div className="flex justify-center px-4 py-1.5 bg-green-500/15 border-b border-green-500/20">
          <span className="text-[11px] text-green-400 font-semibold">{trackToast}</span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.map(renderMessage)}

        {/* Multi-Agent Collaboration Card */}
        {multiAgentCard && !isTyping && (
          <div className="my-3 rounded-2xl overflow-hidden border border-[#8B5CF6]/25 shadow-lg shadow-[#8B5CF6]/5" style={{ animation: 'fadeIn 0.4s ease-out' }}>
            {/* Header */}
            <div className="bg-gradient-to-r from-[#8B5CF6]/20 via-[#6366F1]/15 to-[#3B82F6]/20 px-4 py-3 flex items-center gap-2.5 border-b border-[#8B5CF6]/15">
              <div className="w-8 h-8 rounded-full bg-[#8B5CF6]/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-[#8B5CF6] text-lg">psychology</span>
              </div>
              <div className="flex-1">
                <h4 className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-wider">{t('multiAgentIntelligence', 'Multi-Agent Intelligence')}</h4>
                <p className="text-[9px] text-slate-500 dark:text-gray-400">{t('crossDomainAnalysisDetected', 'Cross-domain analysis detected')}</p>
              </div>
              <button onClick={() => setMultiAgentCard(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-gray-300">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            {/* Agent Rows */}
            <div className="bg-white/80 dark:bg-white/[0.03] divide-y divide-black/5 dark:divide-white/5">
              {multiAgentCard.consulted.map((c, i) => {
                const agentInfo = agents.find(a => a.key === c.agent);
                const color = agentInfo?.color || '#8B5CF6';
                const icon = agentInfo?.icon || 'smart_toy';
                return (
                  <button 
                    key={i} 
                    onClick={() => { 
                      switchAgent(c.agent); 
                      if (multiAgentCard.userMsg) {
                        addMessage(c.agent, {
                          id: `sys-${Date.now()}`,
                          role: 'system',
                          content: `✅ ${t('connectedFrom', 'Connected from')} ${agents.find(a => a.key === activeAgent)?.name || activeAgent}. ${t('howCanIHelp', 'How can I help?')}`,
                          timestamp: Date.now(),
                        });
                        setTimeout(() => {
                          if (multiAgentCard.userMsg) {
                            sendMessage(multiAgentCard.userMsg, undefined, true, true);
                          }
                        }, 500);
                      }
                      setMultiAgentCard(null); 
                    }}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer" 
                    style={{ animation: `fadeIn 0.3s ease-out ${i * 0.15}s both` }}
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: color + '18' }}>
                      <span className="material-symbols-outlined text-[18px]" style={{ color }}>{icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-bold text-slate-900 dark:text-white">{c.label}</span>
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ color, backgroundColor: color + '15' }}>{c.confidence}%</span>
                      </div>
                      {/* Confidence bar */}
                      <div className="h-1 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden mb-1.5">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${c.confidence}%`, backgroundColor: color }} />
                      </div>
                      {/* Matched keywords */}
                      <div className="flex flex-wrap gap-1">
                        {c.reason.replace('Matched: ', '').split(', ').map((kw, j) => (
                          <span key={j} className="text-[8px] px-1.5 py-0.5 rounded-full border font-medium" style={{ color, borderColor: color + '30', backgroundColor: color + '08' }}>{kw}</span>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer tip */}
            <div className="bg-[#8B5CF6]/5 px-4 py-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#8B5CF6] text-xs">lightbulb</span>
              <span className="text-[9px] text-slate-500 dark:text-gray-400">{t('tapAgentToSwitchHelp', 'Tap an agent above to switch and get specialized assistance')}</span>
            </div>
          </div>
        )}

        {/* Handoff Button */}
        {pendingHandoff && !isTyping && (() => {
          const target = agents.find((a) => a.key === pendingHandoff.agent);
          if (!target) return null;
          return (
            <div className="flex flex-col items-center gap-2 my-3">
              <button
                onClick={executeHandoff}
                className="flex items-center gap-2.5 bg-gradient-to-r from-[#FF9933]/20 to-[#138808]/20 border border-[#FF9933]/40 rounded-2xl px-5 py-3 hover:from-[#FF9933]/30 hover:to-[#138808]/30 transition-all active:scale-95"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: target.color }}
                >
                  <span className="material-symbols-outlined text-base">{target.icon}</span>
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold text-slate-800 dark:text-white">Talk to {target.name}</div>
                  <div className="text-[10px] text-slate-600 dark:text-gray-400">Tap to switch → {target.name}</div>
                </div>
                <span className="material-symbols-outlined text-[#FF9933] ml-1">arrow_forward</span>
              </button>
              <button
                onClick={() => {
                  const stayMsg = pendingHandoff.userMsg;
                  setPendingHandoff(null);
                  addMessage(activeAgent, {
                    id: `stay-${Date.now()}`,
                    role: 'system',
                    content: `✅ Continuing with ${currentAgent.name}`,
                    timestamp: Date.now(),
                  });
                  // Get current agent's answer to the original query (don't re-add user msg)
                  setTimeout(() => sendMessage(stayMsg, undefined, true, true), 300);
                }}
                className="text-[10px] text-slate-600 dark:text-gray-500 hover:text-slate-800 dark:hover:text-gray-300 transition-colors"
              >
                Stay with {currentAgent.name}
              </button>
            </div>
          );
        })()}

        {isTyping && (
          <div className="flex gap-2 mb-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
              style={{ backgroundColor: currentAgent.color }}
            >
              {currentAgent.shortName}
            </div>
            <div className="bg-slate-100 dark:bg-[#162a4a] border border-slate-300 dark:border-white/10 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-slate-400 dark:bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2 h-2 bg-slate-400 dark:bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 bg-slate-400 dark:bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          </div>
        )}

        {/* Form Loading Shimmer */}
        {isGeneratingForm && (
          <div className="bg-slate-50 dark:bg-[#162a4a] border border-[#FF9933]/40 p-4 rounded-xl mb-3 shadow-md mx-2 animate-pulse">
            <div className="h-4 bg-slate-200 dark:bg-white/10 rounded w-1/2 mb-4"></div>
            <div className="space-y-3">
              <div>
                <div className="h-2 bg-slate-200 dark:bg-white/10 rounded w-1/4 mb-1"></div>
                <div className="h-8 bg-white dark:bg-[#0f1f3a] rounded-lg"></div>
              </div>
              <div>
                <div className="h-2 bg-slate-200 dark:bg-white/10 rounded w-1/3 mb-1"></div>
                <div className="h-8 bg-white dark:bg-[#0f1f3a] rounded-lg"></div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <div className="h-8 flex-1 bg-slate-200 dark:bg-white/10 rounded-lg"></div>
              <div className="h-8 flex-1 bg-slate-300 dark:bg-white/20 rounded-lg"></div>
            </div>
          </div>
        )}

        {/* Action Form Card */}
        {activeForm && (
          <div className="bg-white/90 dark:bg-[#0f1f3a]/90 backdrop-blur-xl border border-[#FF9933]/40 p-6 rounded-2xl mb-3 shadow-[0_10px_24px_rgba(15,23,42,0.12)] dark:shadow-[#FF9933]/10 mx-2 animate-in slide-in-from-bottom-2">
            <h3 className="font-bold text-lg text-slate-800 dark:text-white mb-5 flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[#FF9933] text-2xl">edit_document</span>
              {activeForm.title}
            </h3>
            {(activeForm.subtitle || activeForm.ministry) && (
              <div className="mb-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-[#162a4a]/70 p-3">
                {activeForm.subtitle && <div className="text-sm font-semibold text-slate-700 dark:text-gray-200">{activeForm.subtitle}</div>}
                {activeForm.ministry && <div className="text-xs mt-1 text-slate-500 dark:text-gray-400">{activeForm.ministry}</div>}
              </div>
            )}
            
            <div className="space-y-4 mb-6">
              {activeForm.fields.map((f, idx) => {
                const previousSection = idx > 0 ? activeForm.fields[idx - 1].section : undefined;
                const showSection = !!f.section && f.section !== previousSection;
                const selectedValues = String(formData[f.name] || '').split('|').filter(Boolean);
                const inputType = f.inputType || 'text';

                const renderInput = () => {
                  if (inputType === 'textarea') {
                    return (
                      <textarea
                        readOnly={!!f.autofillSource}
                        value={formData[f.name] || ''}
                        onChange={(e) => setFormData({ ...formData, [f.name]: e.target.value })}
                        rows={4}
                        className={`w-full bg-slate-50 dark:bg-[#162a4a] border ${f.autofillSource ? 'border-emerald-500/30 text-emerald-900 dark:text-emerald-100' : 'border-slate-200 dark:border-white/10 text-slate-800 dark:text-white'} rounded-xl px-4 py-3 text-base outline-none focus:border-[#FF9933]/60 focus:ring-2 focus:ring-[#FF9933]/15 transition-all`}
                        placeholder={f.autofillSource ? t('securelyAutoFilled', 'Securely auto-filled') : t('enterSpecificDetails', 'Enter specific details...')}
                      />
                    );
                  }

                  if (inputType === 'select') {
                    return (
                      <select
                        value={formData[f.name] || ''}
                        onChange={(e) => setFormData({ ...formData, [f.name]: e.target.value })}
                        className="w-full min-h-[52px] bg-slate-50 dark:bg-[#162a4a] border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white rounded-xl px-4 py-3 text-base outline-none focus:border-[#FF9933]/60 focus:ring-2 focus:ring-[#FF9933]/15 transition-all"
                      >
                        <option value="">{t('selectOption', 'Select an option')}</option>
                        {(f.options || []).map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    );
                  }

                  if (inputType === 'radio') {
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(f.options || []).map((opt) => {
                          const selected = formData[f.name] === opt;
                          return (
                            <button
                              type="button"
                              key={opt}
                              onClick={() => setFormData({ ...formData, [f.name]: opt })}
                              className={`min-h-[48px] rounded-xl border px-3 py-2 text-left text-sm font-medium transition-all ${selected ? 'border-[#FF9933] bg-[#FF9933]/10 text-slate-900 dark:text-white' : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#162a4a] text-slate-700 dark:text-gray-200'}`}
                            >
                              <span className="mr-2">{selected ? '☑' : '☐'}</span>{opt}
                            </button>
                          );
                        })}
                      </div>
                    );
                  }

                  if (inputType === 'checkboxGroup') {
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(f.options || []).map((opt) => {
                          const selected = selectedValues.includes(opt);
                          return (
                            <button
                              type="button"
                              key={opt}
                              onClick={() => {
                                const next = selected
                                  ? selectedValues.filter((value) => value !== opt)
                                  : [...selectedValues, opt];
                                setFormData({ ...formData, [f.name]: next.join('|') });
                              }}
                              className={`min-h-[48px] rounded-xl border px-3 py-2 text-left text-sm font-medium transition-all ${selected ? 'border-[#FF9933] bg-[#FF9933]/10 text-slate-900 dark:text-white' : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#162a4a] text-slate-700 dark:text-gray-200'}`}
                            >
                              <span className="mr-2">{selected ? '☑' : '☐'}</span>{opt}
                            </button>
                          );
                        })}
                      </div>
                    );
                  }

                  if (inputType === 'file') {
                    const inputId = `file-${f.name}`;
                    return (
                      <div className="space-y-2">
                        <input
                          id={inputId}
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const filename = e.target.files?.[0]?.name || '';
                            setFormData({ ...formData, [f.name]: filename });
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => document.getElementById(inputId)?.click()}
                          className="w-full min-h-[52px] rounded-xl border border-dashed border-slate-300 dark:border-white/20 bg-slate-50 dark:bg-[#162a4a] px-4 py-3 text-left text-sm font-medium text-slate-700 dark:text-gray-200"
                        >
                          <span className="material-symbols-outlined align-middle mr-2 text-base">upload_file</span>
                          {formData[f.name] ? `Uploaded: ${formData[f.name]}` : (t('uploadDocument', 'Upload Document'))}
                        </button>
                      </div>
                    );
                  }

                  return (
                    <input
                      type={inputType === 'number' ? 'number' : inputType === 'date' ? 'date' : 'text'}
                      readOnly={!!f.autofillSource}
                      value={formData[f.name] || ''}
                      onChange={(e) => setFormData({ ...formData, [f.name]: e.target.value })}
                      className={`w-full min-h-[52px] bg-slate-50 dark:bg-[#162a4a] border ${f.autofillSource ? 'border-emerald-500/30 text-emerald-900 dark:text-emerald-100 placeholder:text-emerald-700/50' : 'border-slate-200 dark:border-white/10 text-slate-800 dark:text-white'} rounded-xl px-4 py-3 text-base outline-none focus:border-[#FF9933]/60 focus:ring-2 focus:ring-[#FF9933]/15 transition-all ${f.autofillSource ? 'opacity-90' : ''}`}
                      placeholder={f.autofillSource ? t('securelyAutoFilled', 'Securely auto-filled') : t('enterSpecificDetails', 'Enter specific details...')}
                    />
                  );
                };

                return (
                  <div key={f.name} className="relative">
                    {showSection && (
                      <div className="mt-2 mb-2 text-xs font-bold uppercase tracking-wide text-[#FF9933] dark:text-orange-300">
                        {f.section}
                      </div>
                    )}
                    <div className="flex justify-between items-end mb-1.5">
                      <label className="block text-sm font-semibold text-slate-700 dark:text-gray-300">{f.label}{f.required ? ' *' : ''}</label>
                      {f.autofillSource && (
                        <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1 bg-emerald-100 dark:bg-emerald-500/15 px-2 py-1 rounded-md">
                          <span className="material-symbols-outlined text-xs">verified</span>
                          {f.autofillSource}
                        </span>
                      )}
                    </div>
                    {renderInput()}
                    {f.helpText && (
                      <p className="mt-1.5 text-xs text-slate-500 dark:text-gray-400">👉 {f.helpText}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {activeForm.documents && activeForm.documents.length > 0 && (
              <div className="mb-6 bg-[#FF9933]/5 dark:bg-[#FF9933]/10 border border-[#FF9933]/20 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-1.5 mb-2.5">
                  <span className="material-symbols-outlined text-base text-[#138808]">inventory_2</span>
                  {t('requiredDocuments', 'Required Documents')}
                </h4>
                <ul className="space-y-1.5">
                  {activeForm.documents.map((doc, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-gray-300 font-medium min-h-[28px]">
                      <span className="material-symbols-outlined text-base text-slate-400 mt-0.5">check_circle</span>
                      {doc}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {activeForm.eligibility && activeForm.eligibility.length > 0 && (
              <div className="mb-4 rounded-xl border border-slate-200 dark:border-white/10 p-4 bg-slate-50/70 dark:bg-[#162a4a]/60">
                <h4 className="text-sm font-semibold text-slate-800 dark:text-white mb-2">{t('eligibility', 'Eligibility')}</h4>
                <ul className="space-y-1.5">
                  {activeForm.eligibility.map((item, idx) => (
                    <li key={idx} className="text-sm text-slate-600 dark:text-gray-300 flex items-start gap-2">
                      <span className={getEligibilityCheck(activeForm, idx, formData) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-gray-500'}>
                        {getEligibilityCheck(activeForm, idx, formData) ? '☑' : '☐'}
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {activeForm.benefits && activeForm.benefits.length > 0 && (
              <div className="mb-6 rounded-xl border border-emerald-200 dark:border-emerald-500/30 p-4 bg-emerald-50 dark:bg-emerald-500/10">
                <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 mb-2">{t('benefits', 'Benefits')}</h4>
                <ul className="space-y-1.5">
                  {activeForm.benefits.map((item, idx) => (
                    <li key={idx} className="text-sm text-emerald-800 dark:text-emerald-100 flex items-start gap-2">
                      <span className="text-emerald-600 dark:text-emerald-300">✔</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-3">
              <button 
                onClick={() => { setActiveForm(null); setFormData({}); }} 
                className="flex-1 min-h-[48px] py-3 text-sm font-semibold rounded-xl bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-gray-200 hover:bg-slate-200 dark:hover:bg-white/10 active:scale-95 transition-all"
              >
                {t('cancel', 'Cancel')}
              </button>
              <button 
                onClick={() => {
                  const trackId = `BS-${Math.floor(10000 + Math.random() * 90000)}`;
                  const typeToEmoji: Record<string, string> = { grievance: '📋', health: '🏥', legal: '⚖️', scheme: '📜', finance: '💳' };
                  
                  // Auto track
                  addTrackedItem({
                    id: `form-${Date.now()}`,
                    type: (['grievance', 'scheme', 'health', 'legal', 'finance'].includes(activeForm.type)
                      ? activeForm.type
                      : 'grievance') as TrackedItem['type'],
                    title: formData.details ? (formData.details.length > 30 ? formData.details.slice(0, 30) + '...' : formData.details) : activeForm.title,
                    description: `Submitted by ${formData.name || 'Citizen'} • Location: ${formData.location || 'Unknown'}`,
                    status: 'Active',
                    createdAt: Date.now(),
                    agentKey: activeAgent,
                    refId: trackId,
                    emoji: typeToEmoji[activeForm.type] || '📌',
                  });

                  // Inject success message directly to chat
                  addMessage(activeAgent, {
                    id: `sys-success-${Date.now()}`,
                    role: 'assistant',
                    content: `✅ **Success!**\n\nYour ${activeForm.title.toLowerCase()} has been securely submitted to the respective department.\n\n**Reference ID:** \`${trackId}\`\n\nYou will receive updates via SMS, and you can track real-time progress in the **Track** tab.`,
                    timestamp: Date.now(),
                    agentKey: activeAgent,
                  });

                  setActiveForm(null);
                  setFormData({});
                  setTrackToast(String(t('formSubmittedSecurely', 'Form submitted securely')));
                  setTimeout(() => setTrackToast(null), 3000);
                }} 
                disabled={!isFormSubmittable(activeForm, formData)}
                className="flex-1 min-h-[48px] py-3 text-sm font-semibold rounded-xl bg-gradient-to-r from-[#FF9933] to-[#E68A2E] text-white disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
              >
                {t('submitSecurely', 'Submit Securely')}
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      {messages.length <= 1 && (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
          {quickActions[activeAgent]?.map((action) => (
            <button
              key={action.label}
              onClick={() => handleQuickAction(action.query, action.label)}
              className="shrink-0 bg-slate-100 dark:bg-[#162a4a] border border-slate-300 dark:border-white/10 rounded-full px-4 py-2 text-xs text-slate-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-[#1a3a5a] transition-all"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 bg-slate-100/95 dark:bg-[#0f1f3a]/95 border-t border-slate-300 dark:border-white/10">
        {/* Image preview strip */}
        {attachedPreview && (
          <div className="flex items-center gap-2 mb-2 bg-slate-50 dark:bg-[#162a4a] border border-slate-300 dark:border-white/10 rounded-xl px-3 py-2">
            <Image src={attachedPreview} alt="Preview" width={48} height={48} unoptimized className="w-12 h-12 rounded-lg object-cover shrink-0" />
            <div className="flex-1 min-w-0">
              {isAnalyzing ? (
                <p className="text-[11px] text-blue-400 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                  {t('analyzingWithAzureVision', 'Analyzing with Azure Vision...')}
                </p>
              ) : attachedAnalysis ? (
                <p className="text-[11px] text-green-600 dark:text-green-400 truncate">✓ {attachedAnalysis.slice(0, 60)}{attachedAnalysis.length > 60 ? '…' : ''}</p>
              ) : (
                <p className="text-[11px] text-slate-600 dark:text-gray-400">{t('imageReadyToSend', 'Image ready to send')}</p>
              )}
            </div>
            <button onClick={() => { setAttachedPreview(null); setAttachedAnalysis(null); }} className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg">
              <span className="material-symbols-outlined text-slate-600 dark:text-gray-400 text-base">close</span>
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center bg-slate-50 dark:bg-[#162a4a] border border-slate-300 dark:border-white/10 rounded-2xl px-4 py-2.5">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage(input)}
              placeholder={isListening ? t('listening', '🎙️ Listening...') : t('chatPlaceholder')}
              className="flex-1 bg-transparent text-sm text-slate-800 dark:text-white placeholder:text-slate-500 dark:placeholder:text-gray-500 outline-none"
              disabled={isTyping}
            />
            {/* Image attach button (inside input box) */}
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={isTyping || isAnalyzing}
              className="ml-1 p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 transition-all disabled:opacity-40"
              title={t('attachImageForVisionAnalysis', 'Attach image for Vision analysis')}
            >
              <span className="material-symbols-outlined text-slate-600 dark:text-gray-400 text-xl">attach_file</span>
            </button>
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageAttach} aria-label={t('attachImage', 'Attach image')} />
          </div>
          {/* Voice mic button */}
          <button
            onClick={handleVoiceToggle}
            className={`w-11 h-11 rounded-full flex items-center justify-center border transition-all active:scale-95 ${
              isListening
                ? 'bg-red-500/20 border-red-500/50 animate-pulse'
                : 'bg-slate-200 dark:bg-[#162a4a] border-slate-300 dark:border-white/10 hover:bg-slate-300 dark:hover:bg-[#1a3a5a]'
            }`}
            title={isListening ? 'Stop listening' : 'Speak your message'}
          >
            <span
              className="material-symbols-outlined text-xl"
              style={{ color: isListening ? '#EF4444' : 'var(--icon-color)', fontVariationSettings: isListening ? "'FILL' 1" : "'FILL' 0" }}
            >
              mic
            </span>
          </button>
          <button
            onClick={() => sendMessage(input)}
            disabled={(!input.trim() && !attachedPreview) || isTyping || isAnalyzing}
            className="w-11 h-11 rounded-full bg-gradient-to-br from-[#FF9933] to-[#E68A2E] flex items-center justify-center shadow-lg shadow-orange-500/20 disabled:opacity-40 transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-white text-xl">send</span>
          </button>
        </div>
      </div>
    </div>
  );
}
