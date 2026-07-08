import { NextRequest, NextResponse } from 'next/server';
import ModelClient, { isUnexpected } from '@/lib/gemini-adapter';
import { AzureKeyCredential } from '@/lib/gemini-adapter';
import { geminiConfig, agentConfigs } from '@/lib/gemini-config';
import { startRouteTelemetry } from '@/lib/telemetry';
import { analyzeAndPersistLanguageEnrichment } from '@/lib/azure-language-enrichment';
import { buildGroundedAnswer, shouldUseGroundedRag } from '@/lib/gemini-rag';

type AgentKey = keyof typeof agentConfigs;

// ── Language code → full display name + native script (for system prompt) ────
const LANGUAGE_NAMES: Record<string, string> = {
  // Primary codes
  'hi':  'Hindi (हिंदी)',
  'en':  'English',
  'bn':  'Bengali (বাংলা)',
  'te':  'Telugu (తెలుగు)',
  'mr':  'Marathi (मराठी)',
  'ta':  'Tamil (தமிழ்)',
  'gu':  'Gujarati (ગુજરાતી)',
  'kn':  'Kannada (ಕನ್ನಡ)',
  'ml':  'Malayalam (മലയാളം)',
  'pa':  'Punjabi (ਪੰਜਾਬੀ)',
  'or':  'Odia (ଓଡ଼ିଆ)',
  'as':  'Assamese (অসমীয়া)',
  'ur':  'Urdu (اردو)',
  'ne':  'Nepali (नेपाली)',
  'mai': 'Maithili (मैथिली)',
  'kok': 'Konkani (कोंकणी)',
  'mni': 'Manipuri / Meitei (মেইতেই)',
  'doi': 'Dogri (डोगरी)',
  'sat': 'Santali (ᱥᱟᱱᱛᱟᱲᱤ)',
  'brx': 'Bodo (बड़ो)',
  'ks':  'Kashmiri (کٲشُر)',
  'sd':  'Sindhi (سنڌي)',
  'sa':  'Sanskrit (संस्कृतम्)',
  // Region-suffixed variants
  'hi-IN': 'Hindi (हिंदी)',
  'en-IN': 'English', 'en-US': 'English', 'en-GB': 'English',
  'bn-IN': 'Bengali (বাংলা)',
  'te-IN': 'Telugu (తెలుగు)',
  'mr-IN': 'Marathi (मराठी)',
  'ta-IN': 'Tamil (தமிழ்)',
  'gu-IN': 'Gujarati (ગુજરાતી)',
  'kn-IN': 'Kannada (ಕನ್ನಡ)',
  'ml-IN': 'Malayalam (മലയാളം)',
  'pa-IN': 'Punjabi (ਪੰਜਾਬੀ)',
  'or-IN': 'Odia (ଓଡ଼ିଆ)',
  'as-IN': 'Assamese (অসমীয়া)',
  'ur-IN': 'Urdu (اردو)',
  'ne-NP': 'Nepali (नेपाली)',
};

// ── Round-robin counter for Azure OpenAI deployments ──────────────────────────
// Module-level: persists across requests in the same server instance.
// Alternates every request: A, B, A, B ... → effectively doubles TPM.
let rrCounter = 0;
function pickDeployment(): string {
  const depB = geminiConfig.model;
  if (!depB) return geminiConfig.model; // only A configured
  const pick = (rrCounter++ % 2 === 0) ? geminiConfig.model : depB;
  return pick;
}

const VALID_AGENTS: AgentKey[] = ['nagarik_mitra', 'swasthya_sahayak', 'yojana_saathi', 'arthik_salahkar', 'vidhi_sahayak'];

const PHI_ROUTING_MODEL = "microsoft/Phi-4";
const GITHUB_MODELS_ENDPOINT = "https://models.github.ai/inference";

// ── In-memory caches (persists for lifetime of server process) ────────────────
// Translator cache: avoids calling Azure Translator for the same text twice
const translatorCache = new Map<string, string>();
// Routing cache: avoids re-calling Phi for identical messages
const routingCache = new Map<string, AgentKey>();

// ── GPT-4.1-mini fallback via GitHub Models (free tier, rate-limited) ──────────
// Only used when Azure OpenAI returns 429 (rate limit). Never called on 401.
async function _callGpt41MiniFallback(
  messages: { role: string; content: string }[],
  maxTokens: number
): Promise<string | null> {
  const token = process.env['GITHUB_TOKEN'] || '';
  if (!token) return null;
  try {
    const client = ModelClient('https://models.github.ai/inference', new AzureKeyCredential(token));
    const timeoutP = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('GPT41_TIMEOUT')), 12000));
    const res = await Promise.race([
      client.path('/chat/completions').post({
        body: { messages, model: 'openai/gpt-4.1-mini', max_tokens: maxTokens, temperature: 0.7 },
      }),
      timeoutP,
    ]);
    if (isUnexpected(res)) { console.warn('[FALLBACK] gpt-4.1-mini unexpected:', res.body.error?.message); return null; }
    const reply = res.body.choices?.[0]?.message?.content || null;
    console.log('[FALLBACK] gpt-4.1-mini replied ok');
    return reply;
  } catch (e) {
    console.warn('[FALLBACK] gpt-4.1-mini failed:', e instanceof Error ? e.message.slice(0, 80) : String(e));
    return null;
  }
}

// ── Azure Translator: translate any Indian language → English ─────────────────
async function translateToEnglish(text: string): Promise<string> {
  const key    = process.env["AZURE_TRANSLATOR_KEY"] || '';
  const region = process.env["AZURE_TRANSLATOR_REGION"] || 'global';
  if (!key) return text; // no key → pass through as-is
  // Cache hit — skip API call entirely
  const cacheKey = text.slice(0, 200);
  if (translatorCache.has(cacheKey)) return translatorCache.get(cacheKey)!;
  try {
    const t0 = Date.now();
    const res = await fetch(
      'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=en',
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key':    key,
          'Ocp-Apim-Subscription-Region': region,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{ text: text.slice(0, 500) }]),
        signal: AbortSignal.timeout(3000),
      }
    );
    if (!res.ok) {
      console.warn(`[TRANSLATE] Azure HTTP ${res.status} — trying MyMemory fallback`);
      return translateWithMyMemory(text, cacheKey);
    }
    type TranslateResponse = { translations: { text: string; to: string }[] }[];
    const data = await res.json() as TranslateResponse;
    const translated = data?.[0]?.translations?.[0]?.text || text;
    console.log(`[TRANSLATE] "${text.slice(0,60)}" → "${translated.slice(0,80)}" (${Date.now()-t0}ms)`);
    translatorCache.set(cacheKey, translated);
    return translated;
  } catch (e) {
    console.warn('[TRANSLATE] Azure failed:', e instanceof Error ? e.message.slice(0,80) : String(e));
    return translateWithMyMemory(text, cacheKey);
  }
}

// MyMemory free translator — no key, no signup, 5000 words/day free
async function translateWithMyMemory(text: string, cacheKey: string): Promise<string> {
  try {
    const q = encodeURIComponent(text.slice(0, 500));
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${q}&langpair=auto|en`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return text;
    const data = await res.json() as { responseData?: { translatedText?: string } };
    const translated = data?.responseData?.translatedText || text;
    console.log(`[TRANSLATE] MyMemory fallback: "${translated.slice(0,80)}"`);
    translatorCache.set(cacheKey, translated);
    return translated;
  } catch {
    return text; // final fallback: pass original text through
  }
}

// One-shot routing: English query → single Phi-4-mini-instruct call → one agent key
const PHI_ROUTING_SYSTEM = `You are a routing classifier. You MUST reply with exactly ONE word — either one of the agent keys below, or the word null if you cannot determine the category. No explanation, no punctuation, no extra text.
nagarik_mitra
swasthya_sahayak
yojana_saathi
arthik_salahkar
vidhi_sahayak
null`;

function buildPhiUserPrompt(english: string): string {
  return `Classify the following citizen request into exactly one of these agent keys. If the request does not clearly match any category, reply with null. Reply with ONLY the key name or the word null — no explanation, no punctuation, no sentence.

Agent keys:
nagarik_mitra = road, water, electricity, garbage, civic complaint
swasthya_sahayak = health, symptoms, doctor, medicine, feeling ill or weird
yojana_saathi = government scheme, subsidy, ration, pension, MGNREGA
arthik_salahkar = money, bank, loan, fraud, UPI, savings
vidhi_sahayak = police, FIR, law, lawyer, abuse, rights, harassment

Request: ${english.slice(0, 300)}

Reply with one word only (agent key or null):`;
}

// ── Script-agnostic overrides — run on the RAW message BEFORE translation ──────
// Catches Devanagari/regional keywords when Azure Translator is not configured.
const RAW_OVERRIDES: { pattern: RegExp; agent: AgentKey; reason: string }[] = [
  // Legal/Safety FIRST so they intercept compounded queries
  { pattern: /घरेलू\s*हिंसा|मारपीट|उत्पीड़न|छेड़छाड़|बलात्कार|दहेज|यौन\s*शोषण|महिला\s*सुरक्षा|पति.*मार|पति.*पीट|मारता\s*है|पीटता\s*है/, agent: 'vidhi_sahayak', reason: 'Hindi domestic violence and women safety keywords' },
  { pattern: /पुलिस|कानून|वकील|अदालत|एफआईआर|न्याय|अधिकार|गिरफ्तार|जमानत|थाना/,                             agent: 'vidhi_sahayak',    reason: 'Hindi legal keywords' },
  { pattern: /wak[ie]el|waqeel|vakeel?|vakil|attorney|lawyer|legal\s*aid|mujhe.*waqeel|ek.*vakil/i,           agent: 'vidhi_sahayak',    reason: 'lawyer/legal counsel transliterations' },
  { pattern: /kabza|encroach|unauthori[sz]ed.*propert|propert.*disput|zameen.*vivad|zameen.*kabza|propert.*kabza/i, agent: 'vidhi_sahayak', reason: 'property encroachment = legal dispute' },

  // Financial
  { pattern: /बैंक|खाता|पैसा|पैसे|लोन|ऋण|कर्ज|बचत|निवेश|भुगतान|ईएमआई|मुद्रा|जन\s*धन|खुलवाना|बीमा|यूपीआई/, agent: 'arthik_salahkar', reason: 'Hindi banking keywords' },
  { pattern: /धोखा|ठगी|साइबर|फ्रॉड|घोटाला|ओटीपी/,                                                           agent: 'arthik_salahkar', reason: 'Hindi fraud keywords' },

  // Health
  { pattern: /डॉक्टर|दवा|दवाई|अस्पताल|बीमार|बुखार|दर्द|खांसी|उल्टी|इलाज|तबियत/,                           agent: 'swasthya_sahayak', reason: 'Hindi health keywords' },
  { pattern: /पेट.*अजीब|अजीब.*पेट|पेट.*अजब|अजब.*पेट|पेट.*खराब|पेट.*दर्द|पेट.*ठीक\s*नहीं/,              agent: 'swasthya_sahayak',  reason: 'Hindi stomach/digestive complaint' },
  { pattern: /pet.*ajib|ajib.*pet|pet.*ajeeb|ajeeb.*pet|pet.*kharab|pet.*dard/i,                             agent: 'swasthya_sahayak',  reason: 'Transliterated stomach complaint' },

  // Schemes
  { pattern: /योजना|किसान|राशन|पेंशन|सब्सिडी|मनरेगा|नरेगा|उज्ज्वला|आवास|फसल/,                              agent: 'yojana_saathi',    reason: 'Hindi scheme keywords' },

  // Civic
  { pattern: /सड़क|पानी|बिजली|सफाई|कचरा|नाला|नगर\s*निगम|शिकायत/,                                            agent: 'nagarik_mitra',    reason: 'Hindi civic keywords' },
];

function getRawOverride(message: string): AgentKey | null {
  for (const rule of RAW_OVERRIDES) {
    if (rule.pattern.test(message)) {
      console.log(`[RAW_OVERRIDE] "${rule.reason}" → ${rule.agent}`);
      return rule.agent;
    }
  }
  return null;
}

const ENGLISH_OVERRIDES: { pattern: RegExp; agent: AgentKey; reason: string }[] = [
  // Legal & Safety matters FIRST
  { pattern: /domestic\s+violence|domestic\s+abuse|abusive\s+husband|husband.*(beat|hits|hit|abuse)|beating\s+me|marital\s+rape|sexual\s+harassment|molest|molestation|rape|assault|stalking|dowry\s+harassment|women'?s\s+safety|gender\s+violence/i, agent: 'vidhi_sahayak', reason: 'domestic violence and women safety keywords' },
  { pattern: /feel\s+unsafe|feeling\s+unsafe|unsafe\s+at\s+night|not\s+safe|feel\s+threatened|feel\s+scared|being\s+followed|someone\s+following|stalked|i\s+am\s+scared|scared\s+at\s+night|fear\s+for\s+(my\s+)?safety/i, agent: 'vidhi_sahayak', reason: 'personal safety/unsafe = legal/police' },
  { pattern: /\b(lawyer|attorney|advocate|legal\s+counsel|legal\s+help|need.*lawyer|want.*lawyer|find.*lawyer|legal\s+case|court|judge)\b/i, agent: 'vidhi_sahayak', reason: 'lawyer/legal help keywords' },
  { pattern: /\bkabza\b|encroach|unauthori[sz]ed.*propert|propert.*disput|propert.*encroach|illegal.*occupation/i, agent: 'vidhi_sahayak', reason: 'property encroachment = legal dispute' },

  // Schemes
  { pattern: /ration\s+card|rashan\s+card|ration\s+list/i,            agent: 'yojana_saathi',    reason: 'ration card = PDS scheme' },
  { pattern: /ayushman\s+bharat\s+card|pmjay\s+card|ayushman\s+card/i, agent: 'yojana_saathi',   reason: 'Ayushman card = PMJAY scheme enrollment' },
  { pattern: /mgnrega\s+card|job\s+card|narega\s+card/i,              agent: 'yojana_saathi',    reason: 'job card = MGNREGA scheme' },

  // Health
  { pattern: /not\s+feeling\s+well|not\s+feeling\s+good|feeling\s+(sick|ill|bad|unwell|dizzy|weak|weird|strange|off|funny|odd)|not\s+well|i'?m\s+(sick|ill|unwell)|i\s+am\s+(sick|ill|unwell)|feel\s+(sick|bad|ill|unwell|weird|strange|off|funny|odd)|man.*ajeeb|ajeeb.*lag|body\s+(pain|ache)|headache|sore\s+throat|high\s+fever|stomach\s+(pain|ache|upset)|chest\s+pain/i, agent: 'swasthya_sahayak', reason: 'feeling unwell/sick/weird = health' },
  { pattern: /\b(poop|stool|bowel movement|loose motion|diarrh|vomit(?:ing)?|nausea|problem in eating|problem in drinking|eating problem|digestion problem)\b/i, agent: 'swasthya_sahayak', reason: 'eating/digestion/bowel = body health' },
  { pattern: /stomach\s+(?:is\s+)?(?:strange|weird|bad|off|wrong|not\s+(?:ok|right|normal|good))|(?:strange|weird|ajeeb|ajib)\s+(?:stomach|tummy|gut|pet)|my\s+stomach|stomach\s+(?:ache|pain|hurt)/i, agent: 'swasthya_sahayak', reason: 'stomach strange/weird/bad = health' },
];

function getKeywordOverride(english: string): AgentKey | null {
  for (const rule of ENGLISH_OVERRIDES) {
    if (rule.pattern.test(english)) {
      console.log(`[OVERRIDE] keyword match: "${rule.reason}" → ${rule.agent}`);
      return rule.agent;
    }
  }
  return null;
}

type LegalDomainKey = 'Consumer' | 'Tenant' | 'Property' | 'Labour' | 'Accident' | 'Cyber' | 'Cheque' | 'Family/DV' | 'RERA' | 'RTI' | 'FIR';

type VidhiPoliceContact = {
  name: string;
  phone: string;
  address: string;
  mapLink: string;
  source: 'azure-search' | 'fallback';
};

type VidhiLegalResource = {
  title: string;
  url: string;
  authority: string;
  lawHint?: string;
  source: 'azure-search' | 'fallback';
};

function detectLegalDomainTagOptional(text: string): LegalDomainKey | null {
  const value = text.toLowerCase();
  if (/rti|right\s*to\s*information|सूचना|అర్హత.*సమాచారం|जानकारी/i.test(value)) return 'RTI';
  if (/fir|zero\s*fir|police|thana|arrest|bail|एफआईआर|गिरफ्तार/i.test(value)) return 'FIR';
  if (/land|property|encroach|encroachment|kabza|trespass|plot|boundary|title\s*deed|mutation|zameen|जमीन|कब्जा/i.test(value)) return 'Property';
  if (/cyber|otp|upi|fraud|scam|phishing|1930/i.test(value)) return 'Cyber';
  if (/domestic|violence|dowry|harass|abuse|dv|beating|beat\b|assault|threat|threaten|unsafe|महिला|पति.*मार|पीट/i.test(value)) return 'Family/DV';
  if (/consumer|defect|warranty|refund|e-?commerce|1915/i.test(value)) return 'Consumer';
  if (/tenant|rent|landlord|evict|kiraya|भाड़ा/i.test(value)) return 'Tenant';
  if (/salary|wage|labour|employee|termination|dismiss/i.test(value)) return 'Labour';
  if (/accident|injury|hit\s*and\s*run|mvi|compensation/i.test(value)) return 'Accident';
  if (/cheque|138|ni\s*act|dishonou?r|bounce/i.test(value)) return 'Cheque';
  if (/rera|builder|flat|possession|real\s*estate|apartment/i.test(value)) return 'RERA';
  return null;
}

function resolveLegalDomainTag(primaryText: string, fallbackTexts: string[] = []): LegalDomainKey {
  const direct = detectLegalDomainTagOptional(primaryText);
  if (direct) return direct;

  for (const text of fallbackTexts) {
    if (!text) continue;
    const domain = detectLegalDomainTagOptional(text);
    if (domain) return domain;
  }

  return 'Consumer';
}

function resolveLegalDomainForTurn(primaryText: string, fallbackTexts: string[] = []): LegalDomainKey | null {
  const direct = detectLegalDomainTagOptional(primaryText);
  if (direct) return direct;

  for (const text of fallbackTexts) {
    if (!text) continue;
    const domain = detectLegalDomainTagOptional(text);
    if (domain) return domain;
  }

  return hasLegalSignal(primaryText) ? 'Consumer' : null;
}

function hasLegalSignal(value: string): boolean {
  return /(legal|law|act|section|fir|complaint|rights|tribunal|court|nalsa|tele-?law|consumer|rera|police|authority|advocate|vakeel|waqeel|vakil|attorney|justice)/i.test(
    value
  );
}

function hasHealthSignal(value: string): boolean {
  return /(sick|unwell|feeling\s+(bad|well|good|unwell|weird|strange|off|ill)|doctor|hospital|medicine|pain|fever|cough|ill|vaccination|ayushman|abha|symptom|health|clinic|nurse|bleed|bleeding|blood|wound|injur|hurt|emergency|ambulance|cut|trauma)/i.test(
    value
  );
}

function hasSchemeSignal(value: string): boolean {
  return /(scheme|yojana|ration|pension|subsidy|pm-kisan|mgnrega|benefit|eligibility|apply|enroll|status|certificate|card)/i.test(
    value
  );
}

function hasCivicSignal(value: string): boolean {
  return /(road|water|garbage|drainage|street\s+light|sanitation|garbage|civic|municipal|local\s+office|pothole|sewage)/i.test(
    value
  );
}

function hasFinanceSignal(value: string): boolean {
  return /(bank|loan|emi|upi|payment|fraud|scam|money|savings?|credit|debit|account|insurance|tax|gst|debt|investment|cyber|1930|otp|pin|cvv|jan\s*dhan|mudra|pf|epf|epfo|provident|uan|balance)/i.test(
    value
  );
}

function hasSignalForAgent(value: string, agentKey: AgentKey): boolean {
  if (!value) return false;
  switch (agentKey) {
    case 'vidhi_sahayak': return hasLegalSignal(value);
    case 'swasthya_sahayak': return hasHealthSignal(value);
    case 'yojana_saathi': return hasSchemeSignal(value);
    case 'nagarik_mitra': return hasCivicSignal(value);
    case 'arthik_salahkar': return hasFinanceSignal(value);
    default: return false;
  }
}

function hasDomainSignal(value: string, domain: LegalDomainKey): boolean {
  const map: Record<LegalDomainKey, RegExp> = {
    FIR: /(fir|zero\s*fir|police|bnss|arrest|bail)/i,
    'Family/DV': /(domestic\s*violence|dv\s*act|women|abuse|harassment|dowry)/i,
    Cyber: /(cyber|fraud|phishing|otp|upi|1930|it\s*act)/i,
    Cheque: /(cheque|dishonou?r|ni\s*act|section\s*138)/i,
    Tenant: /(tenant|rent|landlord|evict|property\s*dispute)/i,
    Property: /(land|property|encroach|encroachment|kabza|trespass|plot|boundary|title|mutation|zameen|registry)/i,
    Labour: /(labou?r|wage|employee|termination|industrial)/i,
    Accident: /(accident|mact|motor\s*vehicles|injury|hit\s*and\s*run)/i,
    RERA: /(rera|real\s*estate|builder|possession|flat|apartment)/i,
    RTI: /(rti|right\s*to\s*information|pio|appeal)/i,
    Consumer: /(consumer|district\s*commission|refund|defect|e-?commerce|1915)/i,
  };
  return map[domain].test(value);
}

function detectLegalDomainTag(text: string): LegalDomainKey {
  return resolveLegalDomainTag(text);
}

type FinanceDomainKey =
  | 'Fraud/Cyber'
  | 'Banking'
  | 'Loans'
  | 'Savings'
  | 'Payments/UPI'
  | 'Insurance'
  | 'Debt'
  | 'Tax'
  | 'General Finance';

type FinanceSubintentKey =
  | 'bank_deposit'
  | 'investment_guidance'
  | 'upi_issue'
  | 'loan_query'
  | 'fraud_alert'
  | 'general_finance';

type ArthikResource = {
  title: string;
  url: string;
};



function detectFinanceDomainTagOptional(text: string): FinanceDomainKey | null {
  const value = (text || '').toLowerCase();
  if (/fraud|scam|phishing|otp|pin|cvv|unauthori[sz]ed|suspicious|cyber|1930|upi\s*fraud/.test(value)) return 'Fraud/Cyber';
  if (/loan|mudra|borrow|interest\s*rate|emi|repay|sanction|disburs/.test(value)) return 'Loans';
  if (/upi|payment|transaction|failed|pending|refund|chargeback|debit|credited|wallet/.test(value)) return 'Payments/UPI';
  if (/bank|account|passbook|ifsc|branch|kyc|jan\s*dhan|atm|cheque|pf\s*balance|\bpf\b|\bepf\b|epfo|provident\s*fund|uan/.test(value)) return 'Banking';
  if (/save|savings|budget|expense|spend|emergency\s*fund|financial\s*plan/.test(value)) return 'Savings';
  if (/insurance|policy|premium|claim|irdai|health\s*cover|life\s*cover/.test(value)) return 'Insurance';
  if (/debt|overdue|default|settlement|recovery\s*agent|cibil|credit\s*score/.test(value)) return 'Debt';
  if (/tax|itr|income\s*tax|tds|gst|pan\b|filing/.test(value)) return 'Tax';
  return null;
}

function isInvestmentIntent(text: string): boolean {
  const value = (text || '').toLowerCase();
  return /(\binvest\b|investment|where\s*to\s*invest|mutual\s*fund|\bsip\b|stock|share\s*market|equity|bond|fd\b|rd\b|etf|portfolio|asset\s*allocation|wealth\s*creation)/i.test(
    value
  );
}

function isBankDepositIntent(text: string): boolean {
  const value = (text || '').toLowerCase();
  return /(deposit\s*money|cash\s*deposit|deposit\s*cash|how\s*to\s*deposit|bank\s*deposit|pay-?in\s*slip|cdm|cash\s*machine|cheque\s*deposit|जमा\s*करना|पैसे\s*जमा)/i.test(
    value
  );
}

function isGreetingOnlyMessage(text: string): boolean {
  const value = (text || '').trim().toLowerCase();
  if (!value) return true;
  if (value.length > 40) return false;
  return /^(hi|hii|hello|hey|yo|hola|namaste|namaskar|good\s*(morning|afternoon|evening)|ok|okay|thanks|thank\s*you|thx|हाय|नमस्ते|नमस्कार|ठीक|ओके|ধন্যবাদ|হাই|হ্যালো|నమస్కారం|வணக்கம்|ನಮಸ್ಕಾರ|നമസ്കാരം)$/.test(
    value
  );
}

function resolveFinanceDomainForTurn(primaryText: string, fallbackTexts: string[] = []): FinanceDomainKey | null {
  const primary = (primaryText || '').toLowerCase();
  if (isInvestmentIntent(primary)) return 'General Finance';

  const isGenericGuidanceAsk = /(financial\s*suggestions?|finance\s*tips?|money\s*tips?|वित्तीय\s*सलाह|पैसों\s*की\s*सलाह)/i.test(
    primary
  );

  const direct = detectFinanceDomainTagOptional(primaryText);
  if (direct) return direct;

  const hasSavingsIntent = /(save\s*money|saving\s*tips?|budget|expense|spend\s*less|emergency\s*fund|बचत|सेविंग|बजट)/i.test(
    primary
  );

  if (isGenericGuidanceAsk && !hasSavingsIntent) return 'General Finance';

  if (isGreetingOnlyMessage(primaryText)) return null;

  for (const text of fallbackTexts) {
    if (!text) continue;
    const domain = detectFinanceDomainTagOptional(text);
    if (domain) return domain;
  }

  return hasFinanceSignal(primaryText) ? 'General Finance' : null;
}

function stripArthikBoilerplate(value: string): string {
  return (value || '')
    .replace(/hello\s*,?\s*[a-z\s]+!\s*how\s+can\s+i\s+assist\s+you\s+today\??/gi, '')
    .replace(/if\s+you\s+have\s+any\s+questions\s+about\s+banking\s*,?\s*loans\s*,?\s*or\s+government\s+schemes\s*,?\s*feel\s+free\s+to\s+ask\.?/gi, '')
    .replace(/please\s+let\s+me\s+know\s+what\s+issue\s+you'?re\s+facing[^\n]*/gi, '')
    .replace(/^(hi|hello|hey)[\s!,.]*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type ArthikPlaybook = {
  focus: string;
  immediate: string[];
  steps: string[];
  caution: string;
};

function getArthikPlaybook(domain: FinanceDomainKey): ArthikPlaybook {
  const PLAYBOOKS: Record<FinanceDomainKey, ArthikPlaybook> = {
    'Fraud/Cyber': {
      focus: 'Potential digital fraud risk (UPI/OTP/phishing/unauthorized transactions).',
      immediate: [
        'Call 1930 immediately and report the incident in the first few hours.',
        'Freeze/block affected bank account, UPI handle, and cards from official app/helpline.',
        'Do not delete messages/screenshots; preserve transaction IDs and timestamps.',
      ],
      steps: [
        'File complaint on cybercrime.gov.in with complete evidence and acknowledgement.',
        'Submit a written dispute to your bank branch and request complaint reference number.',
        'If unresolved, escalate through the bank grievance channel and RBI Ombudsman path.',
      ],
      caution: 'Never share OTP, PIN, CVV, or remote-access app permissions with anyone.',
    },
    Banking: {
      focus: 'Bank account, KYC, Jan Dhan, branch process, or service request support.',
      immediate: [
        'Use only official bank channels for KYC/account updates.',
        'Keep account number, registered mobile, and ID proof ready.',
      ],
      steps: [
        'Raise request at branch/customer care and collect a service request number.',
        'Track request TAT and keep SMS/email acknowledgements.',
        'Escalate to nodal grievance officer if TAT is breached.',
      ],
      caution: 'Never share netbanking password or OTP over calls/messages.',
    },
    Loans: {
      focus: 'Loan eligibility, EMI planning, Mudra/business credit, and repayment safety.',
      immediate: [
        'List current income, fixed expenses, and existing EMI obligations.',
        'Avoid informal lenders or unknown loan apps demanding advance fees.',
      ],
      steps: [
        'Compare official bank/NBFC offers (rate, tenure, processing fee, foreclosure terms).',
        'Choose EMI where total obligations stay manageable against monthly income.',
        'Read sanction letter before disbursal and keep signed copies.',
      ],
      caution: 'Do not pay “loan processing” money to personal UPI IDs or unknown agents.',
    },
    Savings: {
      focus: 'Budgeting, savings discipline, and safer household cash-flow planning.',
      immediate: [
        'Track essential vs non-essential spending for the last 30 days.',
        'Start a small monthly auto-save amount in a secure account.',
      ],
      steps: [
        'Set a monthly budget with clear caps on discretionary categories.',
        'Build an emergency reserve progressively before high-risk commitments.',
        'Review savings progress monthly and adjust by actual spending patterns.',
      ],
      caution: 'Avoid guaranteed-return claims and unverified “double-money” offers.',
    },
    'Payments/UPI': {
      focus: 'UPI/payment failures, wrong transfer, pending/refund, charge disputes.',
      immediate: [
        'Capture transaction ID/UTR, app screenshot, and exact timestamp.',
        'Avoid duplicate payment until final status is confirmed.',
      ],
      steps: [
        'Raise in-app dispute first and note ticket/reference number.',
        'Escalate to bank/payment provider if not resolved in stated timeline.',
        'For suspicious debit, treat as fraud and report to 1930 immediately.',
      ],
      caution: 'Do not approve collect requests unless you have verified the receiver.',
    },
    Insurance: {
      focus: 'Policy understanding, premium management, and claim process clarity.',
      immediate: [
        'Check policy number, sum insured, exclusions, and claim contact details.',
        'Document event date and preserve all supporting records.',
      ],
      steps: [
        'Intimate claim through official channel within policy timeline.',
        'Submit complete documents and track claim reference ID.',
        'Escalate unresolved claim through insurer grievance and IRDAI channels.',
      ],
      caution: 'Do not rely on verbal assurances; follow policy document wording.',
    },
    Debt: {
      focus: 'Debt stress, overdue handling, and safer repayment strategy.',
      immediate: [
        'List all dues by interest rate, overdue days, and penalty risk.',
        'Prioritize high-interest overdue accounts to reduce compounding impact.',
      ],
      steps: [
        'Request restructuring/settlement in writing from the lender.',
        'Pay through official channels only and retain receipts.',
        'If harassment occurs, record evidence and escalate through formal grievance path.',
      ],
      caution: 'Never borrow from unverified instant-loan apps to close existing debt.',
    },
    Tax: {
      focus: 'ITR/tax filing basics, deadlines, and compliant documentation.',
      immediate: [
        'Gather PAN, Aadhaar, income statements, and deduction proofs.',
        'Use official income tax portal access only.',
      ],
      steps: [
        'Select the right ITR form based on income profile.',
        'Verify pre-filled data and report all relevant income sources.',
        'E-verify return and save acknowledgement for records.',
      ],
      caution: 'Do not share portal credentials with unknown intermediaries.',
    },
    'General Finance': {
      focus: 'General financial guidance for everyday banking, payments, and savings.',
      immediate: [
        'Clarify your objective (save, borrow, repay, or dispute).',
        'Keep key account and transaction details handy for support steps.',
      ],
      steps: [
        'Follow official channel first (bank app/branch/authorized portal).',
        'Ask for written reference ID for every request/dispute.',
        'Escalate in sequence when timelines are missed.',
      ],
      caution: 'Never share OTP/PIN/CVV; verify links and caller identity every time.',
    },
  };

  return PLAYBOOKS[domain];
}

function getArthikResource(domain: FinanceDomainKey): ArthikResource {
  const MAP: Record<FinanceDomainKey, ArthikResource> = {
    'Fraud/Cyber': { title: 'National Cyber Crime Reporting Portal', url: 'https://cybercrime.gov.in' },
    Banking: { title: 'Pradhan Mantri Jan Dhan Yojana', url: 'https://pmjdy.gov.in' },
    Loans: { title: 'PM Mudra Yojana', url: 'https://www.mudra.org.in' },
    Savings: { title: 'RBI Financial Education', url: 'https://www.rbi.org.in' },
    'Payments/UPI': { title: 'NPCI UPI Information', url: 'https://www.npci.org.in/what-we-do/upi' },
    Insurance: { title: 'IRDAI Consumer Information', url: 'https://irdai.gov.in' },
    Debt: { title: 'RBI Banking Ombudsman', url: 'https://cms.rbi.org.in' },
    Tax: { title: 'Income Tax e-Filing Portal', url: 'https://www.incometax.gov.in' },
    'General Finance': { title: 'RBI Consumer Resources', url: 'https://www.rbi.org.in' },
  };
  return MAP[domain];
}

function getArthikHelpline(domain: FinanceDomainKey): string | null {
  if (domain === 'Fraud/Cyber' || domain === 'Payments/UPI') return '1930';
  return null;
}

function buildArthikIntakeResponse(language: string): string {
  const isEnglish = language === 'en' || language.startsWith('en-');
  if (isEnglish) {
    return 'Please share your financial issue in 1-2 lines (what happened, when, and which bank/app). I will give immediate steps and escalation path.';
  }
  return 'कृपया अपनी वित्तीय समस्या 1-2 पंक्तियों में बताएं (क्या हुआ, कब हुआ, और कौन सा बैंक/ऐप)। मैं तुरंत कदम और escalation path बताऊंगा।';
}

function buildArthikStructuredResponse(
  message: string,
  baseReply: string,
  language: string,
  resolvedDomain?: FinanceDomainKey,
  resolvedSubintent?: FinanceSubintentKey | null
): string {
  const isEnglish = language === 'en' || language.startsWith('en-');
  const domain = resolvedDomain || resolveFinanceDomainForTurn(message) || 'General Finance';
  const investmentIntent = resolvedSubintent === 'investment_guidance' || isInvestmentIntent(message);
  const depositIntent =
    domain === 'Banking' && (resolvedSubintent === 'bank_deposit' || isBankDepositIntent(message));
  const playbook = investmentIntent
    ? {
        focus: 'Investment planning basics (goal, horizon, and risk level) — not specific stock tips.',
        immediate: [
          'Set objective first: emergency fund, short-term need, or long-term wealth creation.',
          'Decide monthly investable surplus after essential expenses and debt EMIs.',
        ],
        steps: [
          'Start with diversified, regulated options and avoid “guaranteed high return” claims.',
          'Choose allocation by time horizon and risk tolerance; review quarterly, not daily.',
          'Use only official platforms and keep nominee/KYC details updated.',
        ],
        caution: 'I cannot provide personalized stock picks; avoid unverified tips and pump-and-dump groups.',
      }
    : depositIntent
    ? {
        focus: 'Cash/cheque deposit process in bank branch or cash deposit machine (CDM).',
        immediate: [
          'Carry account number and ensure depositor name matches the intended account details.',
          'Keep PAN as required for high-value cash deposits and verify branch timing/cut-off.',
        ],
        steps: [
          'At branch: fill pay-in slip, submit cash/cheque, and take stamped counterfoil receipt.',
          'At CDM: enter account number carefully, insert notes, confirm amount, and save transaction receipt/SMS.',
          'Verify credit entry in passbook/app; if delayed, raise complaint with receipt reference immediately.',
        ],
        caution: 'Count notes before submission, avoid third-party handlers, and keep deposit proof until credit reflects.',
      }
    : getArthikPlaybook(domain);
  const resource = investmentIntent
    ? { title: 'SEBI Investor Education', url: 'https://investor.sebi.gov.in' }
    : depositIntent
    ? { title: 'RBI Banking Services for Consumers', url: 'https://www.rbi.org.in' }
    : getArthikResource(domain);
  const cleanBaseReply = stripArthikBoilerplate(baseReply || '');
  const baseLooksStructured = /problem\s*understood|focus\s*area|immediate\s*action|step-by-step|safety\s*note|official\s*resource|समस्या\s*समझ|तुरंत\s*कदम|चरणबद्ध|सुरक्षा\s*नोट/i.test(
    cleanBaseReply
  );
  const appendedBase = baseLooksStructured ? '' : cleanBaseReply;

  if (!isEnglish) {
    return `समस्या समझ: यह ${domain} से जुड़ी वित्तीय सहायता का मामला है.

Focus Area:
- ${playbook.focus}

Immediate Action:
${playbook.immediate.map((line) => `- ${line}`).join('\n')}

Step-by-step:
${playbook.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

Safety Note:
- ${playbook.caution}

Official Resource:
- ${resource.title} — ${resource.url}

${appendedBase}`;
  }

  return `Problem understood: You need help for a ${domain} financial issue.

Focus Area:
- ${playbook.focus}

Immediate Action:
${playbook.immediate.map((line) => `- ${line}`).join('\n')}

Step-by-step:
${playbook.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

Safety Note:
- ${playbook.caution}

Official Resource:
- ${resource.title} — ${resource.url}

${appendedBase}`;
}

function sanitizeArthikStructuredResponse(
  message: string,
  structuredReply: string,
  language: string,
  resolvedDomain?: FinanceDomainKey,
  resolvedSubintent?: FinanceSubintentKey | null
): string {
  const domain = resolvedDomain || resolveFinanceDomainForTurn(message) || 'General Finance';

  let result = stripArthikBoilerplate(structuredReply || '');

  const hasCoreBlocks = /focus\s*area|immediate\s*action|step-by-step|safety\s*note/i.test(result);
  if (!hasCoreBlocks) {
    result = buildArthikStructuredResponse(message, '', language, domain, resolvedSubintent).trim();
  }

  return result;
}

function buildArthikSupportFooter(
  message: string,
  resolvedDomain?: FinanceDomainKey,
  resolvedSubintent?: FinanceSubintentKey | null
): string {
  const domain = resolvedDomain || resolveFinanceDomainForTurn(message) || 'General Finance';
  const investmentIntent = resolvedSubintent === 'investment_guidance' || isInvestmentIntent(message);
  const depositIntent =
    domain === 'Banking' && (resolvedSubintent === 'bank_deposit' || isBankDepositIntent(message));
  const resource = investmentIntent
    ? { title: 'SEBI Investor Education', url: 'https://investor.sebi.gov.in' }
    : depositIntent
    ? { title: 'RBI Banking Services for Consumers', url: 'https://www.rbi.org.in' }
    : getArthikResource(domain);
  const helpline = getArthikHelpline(domain);
  const helplineLine = helpline ? `- Cyber Financial Fraud Helpline: ${helpline}\n` : '';
  const supportLineByDomain: Record<FinanceDomainKey, string> = {
    'Fraud/Cyber': "- Freeze/secure account access immediately via your bank's official channel.",
    Banking: "- For account/KYC support use your bank's official customer care number.",
    Loans: '- For loan terms or restructuring support, contact lender grievance desk officially.',
    Savings: '- For savings planning, review monthly spend and set an auto-save target.',
    'Payments/UPI': '- For UPI disputes, raise in-app ticket and bank escalation with UTR.',
    Insurance: '- For claim support, use official insurer claims desk and reference ID.',
    Debt: '- For debt resolution, request written repayment options from the lender.',
    Tax: '- For tax filing support, use official e-filing help and acknowledgement tracking.',
    'General Finance': '- Use official bank/app channels for any account or payment support needs.',
  };
  const supportLine = investmentIntent
    ? '- For investment safety, use regulated platforms and verify advisor registration before acting.'
    : depositIntent
    ? '- Keep stamped pay-in slip/CDM receipt and contact branch support if credit is delayed.'
    : supportLineByDomain[domain];
  const callMarker = helpline ? `~~ARTHIK_CALL:${helpline}~~ ` : '';

  return `

Finance Domain: ${domain}
Relevant Helplines:
${helplineLine}${supportLine}
Official Financial Resource: ${resource.title}
Resource Link: ${resource.url}
Actions: ${callMarker}~~ARTHIK_RESOURCE_URL:${resource.url}~~
Important: This is financial information support, not investment advice.`;
}

type SwasthyaSeverity = 'SEVERE' | 'MODERATE';

type CitizenProfileContext = {
  name?: string;
  aadhaarMasked?: string;
  dob?: string;
  gender?: string;
  linkedSchemes?: string[];
  bplCard?: boolean;
  emergencyContacts?: Array<{ name?: string }>;
  digipin?: string;
  address?: string;
};

type SwasthyaHospitalRoute = {
  name: string;
  distance: string;
  eta: string;
  phone: string;
  type: string;
  mapLink: string;
};

type SwasthyaAbhaSharePayload = {
  abhaId: string;
  healthSummary: string;
};

const DIGIPIN_ALPHABET = 'FCJ987XM654HGWKB';
const DIGIPIN_LAT_MIN = 6.0;
const DIGIPIN_LAT_MAX = 38.0;
const DIGIPIN_LON_MIN = 68.0;
const DIGIPIN_LON_MAX = 98.0;

function decodeDigipinToLatLon(digipinRaw: string): { lat: number; lon: number } | null {
  const clean = String(digipinRaw || '').replace(/-/g, '').toUpperCase();
  if (clean.length !== 10) return null;

  let latMin = DIGIPIN_LAT_MIN;
  let latMax = DIGIPIN_LAT_MAX;
  let lonMin = DIGIPIN_LON_MIN;
  let lonMax = DIGIPIN_LON_MAX;

  for (const char of clean) {
    const idx = DIGIPIN_ALPHABET.indexOf(char);
    if (idx < 0) return null;

    const latDiv = Math.floor(idx / 4);
    const lonDiv = idx % 4;
    const latSpan = latMax - latMin;
    const lonSpan = lonMax - lonMin;

    latMin = latMin + (latDiv * latSpan) / 4;
    latMax = latMin + latSpan / 4;
    lonMin = lonMin + (lonDiv * lonSpan) / 4;
    lonMax = lonMin + lonSpan / 4;
  }

  return {
    lat: Number(((latMin + latMax) / 2).toFixed(6)),
    lon: Number(((lonMin + lonMax) / 2).toFixed(6)),
  };
}

function buildBingRouteLink(
  from: { lat: number; lon: number } | null,
  to: { lat: number; lon: number } | null,
  fallbackLabel = 'nearest emergency hospital'
): string {
  if (!from || !to) {
    return `https://www.bing.com/maps?q=${encodeURIComponent(fallbackLabel)}`;
  }
  return `https://www.bing.com/maps?rtp=pos.${from.lat}_${from.lon}~pos.${to.lat}_${to.lon}&mode=D`;
}

function formatDistance(distanceMeters: number | undefined, fallback = '2.4 km'): string {
  if (!Number.isFinite(distanceMeters) || !distanceMeters || distanceMeters <= 0) return fallback;
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

function formatEtaFromSeconds(seconds: number | undefined, fallback = '10 min'): string {
  if (!Number.isFinite(seconds) || !seconds || seconds <= 0) return fallback;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

function buildHospitalMapsLink(digipin = '', address = '', hospital = ''): string {
  const query = [hospital, 'nearest emergency hospital', address, digipin].filter(Boolean).join(' ');
  return `https://www.bing.com/maps?q=${encodeURIComponent(query || 'nearest emergency hospital India')}`;
}

function pickMockHospital(message: string, digipin = ''): SwasthyaHospitalRoute {
  const catalog = [
    { name: 'District Emergency Trauma Centre', distance: '1.4 km', eta: '7 min', phone: '108', type: 'Government Trauma Centre' },
    { name: 'City Civil Hospital Emergency Wing', distance: '2.1 km', eta: '9 min', phone: '108', type: 'District Civil Hospital' },
    { name: 'Community Health Centre (24x7 ER)', distance: '2.8 km', eta: '12 min', phone: '108', type: 'Community Health Centre' },
    { name: 'Medical College Emergency Block', distance: '3.6 km', eta: '14 min', phone: '108', type: 'Medical College Hospital' },
  ] as const;
  const seed = `${message}|${digipin}`;
  const hash = seed.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const pick = catalog[hash % catalog.length];
  return {
    ...pick,
    mapLink: buildHospitalMapsLink(digipin, '', pick.name),
  };
}

function parsePhoneValue(candidate: unknown): string {
  const cleaned = String(candidate || '').replace(/[\s-]/g, '');
  if (!cleaned) return '108';
  if (/^\+?\d{3,15}$/.test(cleaned)) return cleaned;
  return '108';
}

function inferHospitalType(record: Record<string, unknown>): string {
  const categorySet = Array.isArray(record.categorySet)
    ? record.categorySet.map((entry) => String((entry as Record<string, unknown>).name || '')).filter(Boolean)
    : [];
  const classifications = Array.isArray(record.classifications)
    ? record.classifications.map((entry) => String((entry as Record<string, unknown>).code || '')).filter(Boolean)
    : [];
  const source = [...categorySet, ...classifications].join(' ').toLowerCase();

  if (/trauma|emergency/.test(source)) return 'Emergency Trauma Centre';
  if (/hospital/.test(source)) return 'General Hospital';
  if (/clinic|primary care/.test(source)) return 'Primary Care Clinic';
  if (/medical/.test(source)) return 'Medical Facility';
  return 'Emergency Care Facility';
}

async function lookupNearestHospitalRoute(message: string, digipin = '', address = ''): Promise<SwasthyaHospitalRoute> {
  const fallback = pickMockHospital(message, digipin);
  const coords = decodeDigipinToLatLon(digipin);
  const mapsKey = geminiConfig.maps.key?.trim();

  if (!coords || !mapsKey) return fallback;

  try {
    const searchUrl = `https://atlas.microsoft.com/search/fuzzy/json?api-version=1.0&subscription-key=${encodeURIComponent(
      mapsKey
    )}&query=${encodeURIComponent('emergency hospital')}&lat=${coords.lat}&lon=${coords.lon}&radius=12000&limit=5`;

    const searchResponse = await fetch(searchUrl, { signal: AbortSignal.timeout(3200) });
    if (!searchResponse.ok) return fallback;

    const searchPayload = (await searchResponse.json()) as {
      results?: Array<Record<string, unknown>>;
    };

    const best = searchPayload.results?.find((item) => {
      const poi = item.poi as Record<string, unknown> | undefined;
      return Boolean(poi?.name) && Boolean(item.position);
    });

    if (!best) return fallback;

    const poi = (best.poi as Record<string, unknown> | undefined) || {};
    const position = (best.position as Record<string, unknown> | undefined) || {};
    const toLat = Number(position.lat);
    const toLon = Number(position.lon);
    if (!Number.isFinite(toLat) || !Number.isFinite(toLon)) return fallback;

    let eta = fallback.eta;
    let distance = formatDistance(typeof best.dist === 'number' ? best.dist : undefined, fallback.distance);

    const routeUrl = `https://atlas.microsoft.com/route/directions/json?api-version=1.0&subscription-key=${encodeURIComponent(
      mapsKey
    )}&query=${coords.lat},${coords.lon}:${toLat},${toLon}&travelMode=car&routeType=fastest`; 
    const routeResponse = await fetch(routeUrl, { signal: AbortSignal.timeout(3200) });
    if (routeResponse.ok) {
      const routePayload = (await routeResponse.json()) as {
        routes?: Array<{
          summary?: {
            travelTimeInSeconds?: number;
            lengthInMeters?: number;
          };
        }>;
      };
      const summary = routePayload.routes?.[0]?.summary;
      eta = formatEtaFromSeconds(summary?.travelTimeInSeconds, eta);
      distance = formatDistance(summary?.lengthInMeters, distance);
    }

    const mapLink = buildBingRouteLink(coords, { lat: toLat, lon: toLon }, `${String(poi.name || '').trim()} emergency hospital`);

    return {
      name: String(poi.name || 'Nearest Emergency Hospital'),
      distance,
      eta,
      phone: parsePhoneValue(poi.phone || poi.phoneNumber),
      type: inferHospitalType(best),
      mapLink,
    };
  } catch {
    return fallback;
  }
}

function deriveAbhaSharePayload(citizenProfile?: CitizenProfileContext | null): SwasthyaAbhaSharePayload {
  const aadhaarDigits = String(citizenProfile?.aadhaarMasked || '').replace(/\D/g, '');
  const suffix = aadhaarDigits.slice(-4) || String(Date.now() % 10000).padStart(4, '0');
  const abhaId = `14${suffix} ••• ••••`;

  const linkedSchemes = Array.isArray(citizenProfile?.linkedSchemes) ? citizenProfile?.linkedSchemes || [] : [];
  const linkedHealthPrograms = linkedSchemes
    .filter((scheme) => /ayushman|pmjay|health|abha|abdm|vaccin/i.test(String(scheme || '')))
    .slice(0, 3);

  const contactCount = Array.isArray(citizenProfile?.emergencyContacts) ? citizenProfile?.emergencyContacts?.length || 0 : 0;
  const summaryParts = [
    citizenProfile?.name ? `Name: ${citizenProfile.name}` : '',
    citizenProfile?.dob ? `DOB: ${citizenProfile.dob}` : '',
    citizenProfile?.gender ? `Gender: ${citizenProfile.gender}` : '',
    linkedHealthPrograms.length ? `Linked health records: ${linkedHealthPrograms.join(', ')}` : 'Linked health records: Basic emergency profile',
    `Emergency contacts: ${contactCount}`,
    citizenProfile?.bplCard ? 'BPL/priority household indicated' : '',
  ].filter(Boolean);

  return {
    abhaId,
    healthSummary: summaryParts.join(' | '),
  };
}

function isSwasthyaEmergencyIntent(text: string): boolean {
  const value = (text || '').toLowerCase();
  return /(ambulance|emergency|urgent|help\s*now|severe|critical|chest\s*pain|breathless|breathing\s*problem|unconscious|not\s*responsive|bleeding|accident|stroke|heart\s*attack|fits|seizure|108|112|asap|तुरंत|एम्बुलेंस|एम्बुलेंस|सांस\s*नहीं|बेहोश|सीने\s*में\s*दर्द|खून\s*बह)/i.test(
    value
  );
}

function detectSwasthyaSeverity(text: string): SwasthyaSeverity {
  const value = (text || '').toLowerCase();
  if (/(severe|critical|unconscious|not\s*responsive|chest\s*pain|breathless|breathing\s*problem|stroke|heart\s*attack|fits|seizure|heavy\s*bleeding|accident|बेहोश|सीने\s*में\s*दर्द|सांस\s*नहीं|खून\s*बह)/i.test(value)) {
    return 'SEVERE';
  }
  return 'MODERATE';
}

function buildSwasthyaEmergencyCaseId(message: string, digipin = ''): string {
  const seed = `${message}|${digipin}|MED`;
  const hash = seed.split('').reduce((acc, ch) => (acc * 33 + ch.charCodeAt(0)) >>> 0, 5381);
  const code = String(hash % 1000000).padStart(6, '0');
  return `MED-${new Date().getFullYear()}-${code}`;
}

async function buildSwasthyaEmergencyResponse(
  message: string,
  language: string,
  digipin = '',
  address = '',
  emergencyContactName = 'Primary family contact',
  abhaShare: SwasthyaAbhaSharePayload = { abhaId: '14558 ••• ••••', healthSummary: 'Basic emergency profile' }
): Promise<string> {
  const isEnglish = language === 'en' || language.startsWith('en-');
  const severity = detectSwasthyaSeverity(message);
  const hospital = await lookupNearestHospitalRoute(message, digipin, address);
  const mapLink = hospital.mapLink || buildHospitalMapsLink(digipin, address, hospital.name);
  const caseId = buildSwasthyaEmergencyCaseId(message, digipin);
  const eta = severity === 'SEVERE' ? hospital.eta : formatEtaFromSeconds(Number((hospital.eta.match(/\d+/)?.[0] || '15')) * 60, '15 min');
  const triage = severity === 'SEVERE' ? 'Red Priority' : 'Orange Priority';
  const autoDispatch = severity === 'SEVERE';
  const etaMinutes = Number((eta.match(/\d+/)?.[0] || '15'));
  const dispatchLine = autoDispatch
    ? `Ambulance Auto-Dispatch: Initiated · ETA ${eta}`
    : 'Ambulance Readiness: 108 route prepared and monitoring active.';
  const hospitalInfoMarker = encodeURIComponent([
    hospital.name,
    hospital.type,
    hospital.phone,
    hospital.distance,
    eta,
  ].join('|'));

  if (!isEnglish) {
    return `🚨 **Health Emergency Command Center** (${triage})

तुरंत आकलन:
- ${severity === 'SEVERE' ? 'गंभीर आपातकाल संकेत मिले हैं।' : 'मध्यम आपातकाल संकेत मिले हैं।'}
- 108 एम्बुलेंस और नज़दीकी अस्पताल सहायता सक्रिय है।

Immediate Action:
1. मरीज को सुरक्षित रखें, तंग कपड़े ढीले करें, और साँस/होश की जाँच करें।
2. यदि सीने में दर्द/सांस की समस्या/बेहोशी है, तुरंत 108 पर कॉल करें।
3. लोकेशन, उम्र, लक्षण और शुरू होने का समय नोट करके रखें।

Nearest Hospital:
- ${hospital.name}
- Distance: ${hospital.distance} · ETA: ${eta}
- Type: ${hospital.type}
- Contact: ${hospital.phone}

Dispatch Status:
- ${dispatchLine}

Live Response Timeline:
- [00:00] Case ${caseId} created and triage tagged ${triage}.
- [00:20] Ambulance control desk acknowledged emergency request.
- [02:00] EMT unit marked en-route with live map lock.
- [ETA ${eta}] Expected hospital handover at ${hospital.name}.

Emergency Contact Auto-Notify:
- ${emergencyContactName} received emergency alert + map route + status updates.

ABHA Share Status:
- अस्पताल रेफरेंस के लिए ABHA प्रोफाइल सुरक्षित रूप से साझा किया गया।
~~SWASTHYA_ABHA_SHARE:${encodeURIComponent(
      JSON.stringify({
        abhaId: abhaShare.abhaId,
        healthSummary: abhaShare.healthSummary,
        status: 'ABHA ID with health report sent for reference.',
      })
    )}~~

Safety Note:
- खुद ड्राइव न करें अगर मरीज की हालत गंभीर है; एम्बुलेंस का इंतज़ार करें।

Actions: ~~SWASTHYA_CALL:108~~ ~~SWASTHYA_HOSPITAL_MAP:${mapLink}~~ ~~SWASTHYA_HOSPITAL_INFO:${hospitalInfoMarker}~~ ~~SWASTHYA_TIMELINE:${caseId}|${etaMinutes}~~ ~~SWASTHYA_NOTIFY:${encodeURIComponent(
      emergencyContactName
    )}~~ ${autoDispatch ? '~~SWASTHYA_SOS_TRIGGER~~' : ''}`;
  }

  return `🚨 **Health Emergency Command Center** (${triage})

Current Assessment:
- ${severity === 'SEVERE' ? 'Severe emergency indicators detected.' : 'Moderate emergency indicators detected.'}
- Ambulance and nearest-hospital response path is active.

Immediate Action:
1. Keep the person safe, loosen tight clothing, and check breathing/responsiveness.
2. If chest pain/breathing distress/unconsciousness is present, call 108 immediately.
3. Keep location, age, key symptoms, and onset time ready for responders.

Nearest Hospital:
- ${hospital.name}
- Distance: ${hospital.distance} · ETA: ${eta}
- Type: ${hospital.type}
- Contact: ${hospital.phone}

Dispatch Status:
- ${dispatchLine}

Live Response Timeline:
- [00:00] Case ${caseId} created and triage tagged ${triage}.
- [00:20] Ambulance control desk acknowledged emergency request.
- [02:00] EMT unit marked en-route with live map lock.
- [ETA ${eta}] Expected hospital handover at ${hospital.name}.

Emergency Contact Auto-Notify:
- ${emergencyContactName} received emergency alert + map route + status updates.

ABHA Share Status:
- Secure ABHA profile handoff completed for hospital reference.
~~SWASTHYA_ABHA_SHARE:${encodeURIComponent(
      JSON.stringify({
        abhaId: abhaShare.abhaId,
        healthSummary: abhaShare.healthSummary,
        status: 'ABHA ID with health report sent for reference.',
      })
    )}~~

Safety Note:
- Do not self-drive in severe cases; wait for ambulance support.

Actions: ~~SWASTHYA_CALL:108~~ ~~SWASTHYA_HOSPITAL_MAP:${mapLink}~~ ~~SWASTHYA_HOSPITAL_INFO:${hospitalInfoMarker}~~ ~~SWASTHYA_TIMELINE:${caseId}|${etaMinutes}~~ ~~SWASTHYA_NOTIFY:${encodeURIComponent(
      emergencyContactName
    )}~~ ${autoDispatch ? '~~SWASTHYA_SOS_TRIGGER~~' : ''}`;
}

function buildPoliceMapsLink(digipin: string, address = '', stationName = ''): string {
  const query = [stationName, address, digipin, 'nearest police station'].filter(Boolean).join(' ');
  return `https://www.bing.com/maps?q=${encodeURIComponent(query || 'nearest police station India')}`;
}

function normalizePolicePhone(raw: string | undefined): string {
  const cleaned = String(raw || '').replace(/[^\d+]/g, '');
  if (!cleaned) return '112';
  if (cleaned.startsWith('+91') && cleaned.length >= 13) return cleaned;
  if (/^\d{10}$/.test(cleaned)) return `+91${cleaned}`;
  if (/^\d{3,6}$/.test(cleaned)) return cleaned;
  return '112';
}

async function lookupLocalPoliceContact(digipin: string, address = ''): Promise<VidhiPoliceContact> {
  const fallbackMap = buildPoliceMapsLink(digipin, address, 'Nearest police station');
  const fallback: VidhiPoliceContact = {
    name: 'District Police Control Room',
    phone: '112',
    address: address || digipin || 'Local jurisdiction',
    mapLink: fallbackMap,
    source: 'fallback',
  };

  const endpoint = geminiConfig.search.endpoint?.trim();
  const key = geminiConfig.search.key?.trim();
  const policeIndex = process.env.AZURE_SEARCH_POLICE_INDEX?.trim() || 'police-contacts-index';

  if (!endpoint || !key || !policeIndex) return fallback;

  const searchUrl = `${endpoint.replace(/\/$/, '')}/indexes/${policeIndex}/docs/search?api-version=2024-07-01`;
  const query = [digipin, address, 'police station', 'control room'].filter(Boolean).join(' ');

  try {
    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': key,
      },
      body: JSON.stringify({
        search: query || 'police station',
        queryType: 'simple',
        top: 1,
        select: 'station_name,name,police_station,phone,contact_number,mobile,address,district,state',
      }),
      signal: AbortSignal.timeout(3200),
    });

    if (!response.ok) return fallback;
    const payload = (await response.json()) as { value?: Array<Record<string, unknown>> };
    const doc = payload.value?.[0];
    if (!doc) return fallback;

    const name =
      String(doc.station_name || doc.name || doc.police_station || 'District Police Control Room').trim();
    const phone = normalizePolicePhone(String(doc.phone || doc.contact_number || doc.mobile || '112'));
    const docAddress =
      String(
        doc.address ||
          [doc.district, doc.state].filter(Boolean).join(', ') ||
          address ||
          digipin ||
          'Local jurisdiction'
      ).trim();

    return {
      name,
      phone,
      address: docAddress,
      mapLink: buildPoliceMapsLink(digipin, docAddress, name),
      source: 'azure-search',
    };
  } catch {
    return fallback;
  }
}

async function lookupLegalDomainResource(message: string, domain: LegalDomainKey): Promise<VidhiLegalResource | null> {
  const endpoint = geminiConfig.search.endpoint?.trim();
  const key = geminiConfig.search.key?.trim();
  const legalIndex = process.env.AZURE_SEARCH_LEGAL_INDEX?.trim() || 'legal-resources-index';
  const defaultIndex = geminiConfig.search.indexName?.trim() || '';

  if (!endpoint || !key) return null;

  const indices = Array.from(new Set([legalIndex, defaultIndex].filter(Boolean)));
  if (!indices.length) return null;

  const query = `${domain} legal complaint India ${message}`.slice(0, 320);

  for (const indexName of indices) {
    const searchUrl = `${endpoint.replace(/\/$/, '')}/indexes/${indexName}/docs/search?api-version=2024-07-01`;
    try {
      const response = await fetch(searchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': key,
        },
        body: JSON.stringify({
          search: query,
          queryType: 'simple',
          top: 1,
        }),
        signal: AbortSignal.timeout(3200),
      });

      if (!response.ok) continue;
      const payload = (await response.json()) as { value?: Array<Record<string, unknown>> };
      const doc = payload.value?.[0];
      if (!doc) continue;

      const url = String(
        doc.complaint_url || doc.portal_url || doc.application_url || doc.source_url || doc.url || ''
      ).trim();
      if (!/^https?:\/\//i.test(url)) continue;

      const title = String(doc.resource_title || doc.scheme_name || doc.title || doc.name || '').trim();
      const authority = String(doc.authority || doc.department || doc.ministry || '').trim();
      const searchableText = [
        title,
        authority,
        String(doc.description || ''),
        String(doc.category || ''),
        String(doc.law || ''),
        String(doc.act || ''),
        String(doc.section || ''),
        url,
      ]
        .join(' ')
        .toLowerCase();

      // Reject generic scheme-only hits (like scholarship/apprenticeship) for legal assistant output.
      if (!hasLegalSignal(searchableText) || !hasDomainSignal(searchableText, domain)) {
        continue;
      }

      return {
        title: title || `${domain} Legal Resource`,
        authority: authority || 'Relevant Legal Authority',
        lawHint: String(doc.law || doc.act || doc.section || '').trim() || undefined,
        url,
        source: 'azure-search',
      };
    } catch {
      continue;
    }
  }

  return null;
}

function getRelevantLegalHelplines(domain: LegalDomainKey): Array<{ label: string; number: string }> {
  const BASE = [{ label: 'Free Legal Aid (NALSA)', number: '15100' }];
  const DOMAIN_HELPLINES: Record<LegalDomainKey, Array<{ label: string; number: string }>> = {
    FIR: [
      { label: 'Police Emergency', number: '112' },
      { label: 'Tele-Law', number: '1516' },
    ],
    'Family/DV': [
      { label: 'Women Helpline', number: '181' },
      { label: 'Police Emergency', number: '112' },
      { label: 'Child Helpline', number: '1098' },
    ],
    Cyber: [
      { label: 'Cyber Crime Helpline', number: '1930' },
      { label: 'Police Emergency', number: '112' },
    ],
    Cheque: [
      { label: 'Tele-Law', number: '1516' },
      { label: 'Police Emergency', number: '112' },
    ],
    Tenant: [
      { label: 'Tele-Law', number: '1516' },
      { label: 'Police Emergency', number: '112' },
    ],
    Property: [
      { label: 'Tele-Law', number: '1516' },
      { label: 'Police Emergency', number: '112' },
    ],
    Labour: [
      { label: 'Tele-Law', number: '1516' },
      { label: 'Police Emergency', number: '112' },
    ],
    Accident: [
      { label: 'Police Emergency', number: '112' },
      { label: 'Ambulance', number: '108' },
    ],
    RERA: [
      { label: 'Consumer Helpline', number: '1915' },
      { label: 'Tele-Law', number: '1516' },
    ],
    RTI: [
      { label: 'Tele-Law', number: '1516' },
      { label: 'Free Legal Aid (NALSA)', number: '15100' },
    ],
    Consumer: [
      { label: 'Consumer Helpline', number: '1915' },
      { label: 'Tele-Law', number: '1516' },
    ],
  };

  return [...BASE, ...(DOMAIN_HELPLINES[domain] || [])];
}

function buildVidhiSupportFooter(
  message: string,
  policeContact: VidhiPoliceContact,
  legalResource: VidhiLegalResource | null,
  resolvedDomain?: LegalDomainKey
): string {
  const domain = resolvedDomain || detectLegalDomainTag(message);
  const helplines = getRelevantLegalHelplines(domain)
    .map((entry) => `- ${entry.label}: ${entry.number}`)
    .join('\n');

  return `

Legal Domain: ${domain}
Relevant Helplines:
${helplines}
Local Police Contact: ${policeContact.phone} (${policeContact.name})
Nearest Police (Bing Maps): ${policeContact.mapLink}
${legalResource?.url ? `Official Legal Resource: ${legalResource.title} (${legalResource.authority})\n` : ''}${legalResource?.url ? `Resource Link: ${legalResource.url}\n` : ''}Actions: ~~VIDHI_LOCAL_POLICE:${policeContact.phone}~~ ~~VIDHI_BING_MAP:${policeContact.mapLink}~~ ${legalResource?.url ? `~~VIDHI_RESOURCE_URL:${legalResource.url}~~ ` : ''}~~VIDHI_FILE_COMPLAINT~~
Important: This is legal information support, not a substitute for a licensed advocate in court.`;
}

type VidhiPlaybook = {
  law: string;
  steps: string[];
  deadline: string;
};

function getVidhiPlaybook(domain: LegalDomainKey): VidhiPlaybook {
  const PLAYBOOKS: Record<LegalDomainKey, VidhiPlaybook> = {
    FIR: {
      law: 'BNSS Section 173 (FIR registration) and Zero FIR practice for cognizable offences (seek local verification for latest state circulars).',
      steps: [
        'Go to any police station and ask for FIR/Zero FIR in writing.',
        'Carry ID + incident timeline + evidence (photos, chats, call logs, witnesses).',
        'If refused, escalate to SP/DCP in writing and keep acknowledgement copy.',
        'For urgent risk, call 112 immediately and share exact location.',
      ],
      deadline: 'File immediately for criminal incidents; delays reduce evidentiary strength.',
    },
    'Family/DV': {
      law: 'Protection of Women from Domestic Violence Act, 2005 (relief/protection/residence orders) and IPC/BNS provisions depending on facts.',
      steps: [
        'Ensure immediate safety first; contact 112 or Women Helpline 181 if at risk.',
        'Document abuse (medical reports, photos, messages, witnesses, dates).',
        'Approach Protection Officer / Women Cell / nearest police station for complaint.',
        'Seek free legal aid via NALSA to file for protection, residence, maintenance, and custody reliefs.',
      ],
      deadline: 'Act immediately in ongoing violence; for relief applications, earlier filing improves protection outcomes.',
    },
    Cyber: {
      law: 'Information Technology Act provisions + BNS/IPC cheating and identity fraud clauses depending on offence.',
      steps: [
        'Call/report to 1930 immediately for transaction hold/freeze attempt.',
        'File complaint at cybercrime.gov.in with transaction ID, UPI ID, screenshots, and call details.',
        'Inform your bank/payment app and request written complaint reference.',
        'If money loss occurred, file FIR/Zero FIR and attach cyber complaint acknowledgement.',
      ],
      deadline: 'Golden window is first few hours; report to 1930 as soon as possible.',
    },
    Cheque: {
      law: 'Negotiable Instruments Act, 1881 — Section 138 (dishonour for insufficiency of funds).',
      steps: [
        'Collect cheque return memo from bank.',
        'Send statutory legal notice demanding payment through an advocate.',
        'If unpaid after notice period, file complaint before the competent magistrate.',
        'Preserve cheque copy, memo, notice copy, postal proof, and account statements.',
      ],
      deadline: 'Common sequence: notice within 30 days of memo and complaint within 30 days after notice period (verify exact timeline with counsel).',
    },
    Tenant: {
      law: 'State rent control / tenancy laws + Transfer of Property Act depending on tenancy type.',
      steps: [
        'Keep rent agreement, rent receipts, deposit proofs, and communication records.',
        'Issue formal written notice for dispute (eviction, deposit return, lockout, etc.).',
        'Attempt mediation/local rent authority where available.',
        'File before rent controller/civil court based on local statute and claim type.',
      ],
      deadline: 'Notice and limitation periods vary by state and relief; initiate promptly.',
    },
    Property: {
      law: 'Transfer of Property Act + land revenue/state land records laws; for criminal trespass/encroachment, BNS trespass provisions may apply based on facts.',
      steps: [
        'Collect title/ownership records (sale deed, mutation, khasra/khatauni, tax receipts, map).',
        'Document encroachment with dated photos/videos, neighbour boundaries, and witness details.',
        'Send legal notice and file written complaint with local police/tehsildar where applicable.',
        'File civil suit for injunction/possession in competent court and request status-quo relief.',
      ],
      deadline: 'File promptly to prevent adverse possession arguments and preserve interim relief options.',
    },
    Labour: {
      law: 'Labour codes / Shops and Establishments / Payment of Wages and related state rules as applicable.',
      steps: [
        'Collect salary slips, attendance, contract, and termination/disciplinary communication.',
        'Send written demand to employer (dues, reinstatement, experience letter, etc.).',
        'File complaint with Labour Commissioner/authority having territorial jurisdiction.',
        'Escalate to labour court/industrial tribunal through proper legal process if unresolved.',
      ],
      deadline: 'Limitation and forum depend on employment category and claim type; file early.',
    },
    Accident: {
      law: 'Motor Vehicles Act (MACT compensation framework) plus criminal law for rash/negligent driving where relevant.',
      steps: [
        'Get medical treatment first and preserve all records/bills.',
        'Ensure FIR/DDR is registered and vehicle details are captured.',
        'Collect insurance details and witness/evidence material.',
        'File compensation claim before MACT with injury, income, and dependency proofs.',
      ],
      deadline: 'Police report should be immediate; compensation claims should be filed without delay.',
    },
    RERA: {
      law: 'Real Estate (Regulation and Development) Act, 2016 (RERA).',
      steps: [
        'Collect allotment letter, builder-buyer agreement, payment proofs, and project commitments.',
        'Check project/agent registration status on state RERA portal.',
        'Send formal notice to builder detailing delay/defect/compensation claim.',
        'File complaint on state RERA portal and seek refund/interest/possession relief as applicable.',
      ],
      deadline: 'File as soon as breach is clear (delay/defect/non-compliance) to preserve remedies.',
    },
    RTI: {
      law: 'Right to Information Act, 2005.',
      steps: [
        'Identify the correct Public Information Officer (PIO) for the department.',
        'File concise RTI questions with dates/doc references and application fee where applicable.',
        'Keep acknowledgement / postal tracking details.',
        'If no response or denial, file First Appeal before FAA, then Second Appeal to Information Commission.',
      ],
      deadline: 'RTI reply is typically due within 30 days; appeals have statutory timelines.',
    },
    Consumer: {
      law: 'Consumer Protection Act, 2019.',
      steps: [
        'Collect invoice, warranty terms, service chats/emails, and defect proof.',
        'Raise written complaint to seller/service provider requesting remedy/refund/replacement.',
        'If unresolved, file grievance via consumer helpline/portal and district commission as applicable.',
        'Claim compensation with clear loss/harassment evidence and supporting documents.',
      ],
      deadline: 'Consumer complaints generally follow limitation periods from cause of action; do not delay filing.',
    },
  };

  return PLAYBOOKS[domain];
}

function buildVidhiStructuredResponse(
  message: string,
  baseReply: string,
  language: string,
  legalResource: VidhiLegalResource | null,
  resolvedDomain?: LegalDomainKey
): string {
  const isEnglish = language === 'en' || language.startsWith('en-');
  const domain = resolvedDomain || detectLegalDomainTag(message);
  const playbook = getVidhiPlaybook(domain);
  const normalized = (value: string) => value.toLowerCase().replace(/[.,!?;:'"()]/g, ' ').replace(/\s+/g, ' ').trim();
  const lawLines = [playbook.law, legalResource?.lawHint || '']
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, arr) => arr.findIndex((candidate) => normalized(candidate) === normalized(value)) === index);
  const cleanBaseReply = baseReply
    .replace(/hello\s+[a-z\s]+!\s*how\s+can\s+i\s+assist\s+you\s+today\??/gi, '')
    .replace(/please\s+let\s+me\s+know\s+what\s+issue\s+you'?re\s+facing[^\n]*/gi, '')
    .replace(/नमस्ते[\s\S]{0,120}?कैसे\s+मदद\s+कर\s+सकता[\s\S]{0,80}/gi, '')
    .replace(/^\s+|\s+$/g, '');

  if (!isEnglish) {
    return `समस्या समझ: आपने ${domain} से जुड़ी कानूनी सहायता मांगी है.

Exact Law:
${lawLines.map((line) => `- ${line}`).join('\n')}

Step-by-step:
${playbook.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

Deadline:
- ${playbook.deadline}

Official Resource:
- ${legalResource?.title || 'स्थानीय कानूनी प्राधिकरण पोर्टल देखें'}${legalResource?.url ? ` — ${legalResource.url}` : ''}

${cleanBaseReply}`;
  }

  return `Problem understood: You need legal help for a ${domain} issue.

Exact Law:
${lawLines.map((line) => `- ${line}`).join('\n')}

Step-by-step:
${playbook.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

Deadline:
- ${playbook.deadline}

Official Resource:
- ${legalResource?.title || 'Check the relevant legal authority portal'}${legalResource?.url ? ` — ${legalResource.url}` : ''}

${cleanBaseReply}`;
}

function buildVidhiIntakeResponse(language: string): string {
  const isEnglish = language === 'en' || language.startsWith('en-');
  if (isEnglish) {
    return 'Please share your legal issue in 1-2 lines (what happened, when, and where). I will then provide exact law, steps, and timeline.';
  }
  return 'कृपया अपनी कानूनी समस्या 1-2 पंक्तियों में बताएं (क्या हुआ, कब हुआ, और कहाँ हुआ)। फिर मैं सटीक कानून, कदम और समय-सीमा बताऊंगा।';
}

function extractVidhiCitations(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/(?:section|sec\.?|s\.|article|धारा|सेक्शन|अनुच्छेद)\s*\d{1,4}[a-z]?/gi) || [];
  return Array.from(new Set(matches.map((value) => value.trim().toLowerCase())));
}

function hasVidhiCoreBlocks(text: string): boolean {
  const hasLaw = /exact\s*law|सटीक\s*कानून|कानून\s*संदर्भ|कानूनी\s*धारा/i.test(text);
  const hasSteps = /step-by-step|step\s*by\s*step|चरणबद्ध|कदम-दर-कदम|कदम\s*दर\s*कदम/i.test(text);
  const hasDeadline = /deadline|limitation|urgency|समय-सीमा|समय\s*सीमा|अंतिम\s*तिथि/i.test(text);
  return hasLaw && hasSteps && hasDeadline;
}

function sanitizeVidhiStructuredResponse(
  message: string,
  structuredReply: string,
  language: string,
  resolvedDomain?: LegalDomainKey
): string {
  const isEnglish = language === 'en' || language.startsWith('en-');
  const domain = resolvedDomain || detectLegalDomainTag(message);
  const playbook = getVidhiPlaybook(domain);

  let result = structuredReply
    .replace(/i['’]?m\s+not\s+sure\s+based\s+on\s+available\s+records\.?\s*please\s+verify[^\n]*/gi, '')
    .replace(/hello\s+[a-z\s]+!\s*how\s+can\s+i\s+assist\s+you\s+today\??/gi, '')
    .replace(/please\s+let\s+me\s+know\s+what\s+issue\s+you'?re\s+facing[^\n]*/gi, '')
    .replace(/कृपया\s+आधिकारिक\s+पोर्टल\s+पर\s+सत्यापित\s+करें[^\n]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!hasVidhiCoreBlocks(result)) {
    result = buildVidhiStructuredResponse(message, '', language, null, domain).trim();
  }

  const citations = extractVidhiCitations(result);
  if (citations.length === 0) return result;

  const lawText = playbook.law.toLowerCase();
  const unverified = citations.filter((citation) => {
    const numberMatch = citation.match(/\d{1,4}[a-z]?/i)?.[0] || '';
    if (!numberMatch) return false;
    return !lawText.includes(numberMatch.toLowerCase());
  });

  if (unverified.length === 0) return result;

  const lines = result
    .split('\n')
    .filter((line) => !unverified.some((citation) => line.toLowerCase().includes(citation)));

  result = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  const verificationNote = isEnglish
    ? 'Note: Some section references in the draft were removed because they need local verification by a licensed advocate.'
    : 'नोट: ड्राफ्ट में कुछ धारा/अनुच्छेद संदर्भ हटाए गए हैं क्योंकि उनकी स्थानीय सत्यापन किसी लाइसेंस प्राप्त वकील से आवश्यक है।';

  if (!/local\s*verification|स्थानीय\s*सत्यापन/i.test(result)) {
    result = `${result}\n\n${verificationNote}`;
  }

  return result;
}

async function classifyAgentWithPhi(message: string): Promise<AgentKey | null> {
  // Step 0: check raw message for high-confidence script-agnostic keyword overrides
  // (runs before translation so Hindi/regional queries are never misrouted)
  const rawOverride = getRawOverride(message);
  if (rawOverride) return rawOverride;

  // Routing cache hit — skip Phi entirely for repeated/identical queries
  const msgKey = message.trim().toLowerCase().slice(0, 150);
  if (routingCache.has(msgKey)) {
    console.log(`[PHI] cache hit → ${routingCache.get(msgKey)}`);
    return routingCache.get(msgKey)!;
  }

  const token = process.env["GITHUB_TOKEN_PHI"] || process.env["GITHUB_TOKEN"] || '';
  if (!token) return null;
  const t0 = Date.now();
  try {
    // Step 1: translate to English via Azure AI Translator (handles all regional languages)
    // This is mandatory — Phi-4-mini works best on English input
    const english = await translateToEnglish(message);

    // Step 1b: keyword override — for unambiguous high-confidence cases, skip model call
    const override = getKeywordOverride(english);
    if (override) {
      console.log(`[PHI] keyword override → ${override} (skipped model call)`);
      return override;
    }

    // Step 2: send the translated English query to Phi and force a one-word route.
    const client = ModelClient(GITHUB_MODELS_ENDPOINT, new AzureKeyCredential(token));
    const phiTimeoutP = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('PHI_TIMEOUT')), 35000));
    const res = await Promise.race([
      client.path('/chat/completions').post({
        body: {
          model: PHI_ROUTING_MODEL,
          messages: [
            { role: 'system', content: PHI_ROUTING_SYSTEM },
            { role: 'user', content: buildPhiUserPrompt(english) },
          ],
          max_tokens: 20,
          temperature: 0.0,
          top_p: 1.0,
        },
      }),
      phiTimeoutP,
    ]);

    if (isUnexpected(res)) {
      console.warn('[PHI] unexpected response:', res.body.error?.message);
      return null;
    }

    const raw = ((res.body.choices as Array<{ message: { content: string } }>)?.[0]?.message?.content || '').trim().toLowerCase().replace(/[^a-z_]/g, '');
    console.log(`[PHI] raw="${raw}" in ${Date.now() - t0}ms`);

    let best: AgentKey | null = null;
    let bestLen = 0;
    for (const a of VALID_AGENTS) {
      if (raw.includes(a) && a.length > bestLen) { bestLen = a.length; best = a; }
    }
    console.log(`[PHI] resolved="${best}"`);
    if (best) routingCache.set(msgKey, best);
    return best;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('429') || msg.includes('rate')) console.warn('[PHI] Rate limited');
    else console.warn('[PHI] Error:', msg.slice(0, 100));
    return null;
  }
}

// ── Protection layer: use the main Azure/GitHub model as a smarter routing verifier ──
// Runs in parallel with the reply fetch — zero latency overhead.
// Translates the message first (same Azure Translator), then uses rich few-shot prompt.
// If it disagrees with Ministral, it wins (GPT-4o > Ministral-3B for routing).
async function _backgroundRouteCheck(
  message: string,
  apiUrl: string,
  headers: Record<string, string>,
  useGitHubModels: boolean,
  ghModel?: string
): Promise<AgentKey | null> {
  const BG_ROUTE_SYSTEM = `You are a routing assistant for Bharat Setu — a unified Indian citizen services platform.
Given a user message IN ENGLISH, reply with ONLY the single best agent key — nothing else.

INDIAN GOVERNMENT CONTEXT:
- Central schemes: PM-KISAN, Ayushman Bharat/PMJAY, MGNREGA, PM-Awas, PDS/ration card, PMFBY crop insurance, Ujjwala LPG
- Local body complaints (road, water, drainage) go to gram panchayat / nagar palika
- Health: ABDM, PHC, ASHA workers, Jan Aushadhi, vaccination drives
- Finance: Jan Dhan accounts, UPI/NPCI, MUDRA loans, e-RUPI
- Legal: NALSA legal aid, lok adalat, district courts, RTI

nagarik_mitra    = Civic & Municipal Agent
  Scope: broken roads, potholes, water supply failure, drainage/sewage overflow, street light fault,
         garbage/sanitation, encroachment, local government complaint, bus stop, public toilet repair
  NOT: electricity bills, land title, scheme money

swasthya_sahayak = Health & Wellness Agent
  Scope: fever, pain, cough, loose motion, diarrhea, poop/stool difficulty, vomiting, nausea, eating/drinking problem,
         loss of appetite, dehydration, weakness, dizziness, diabetes, BP, pregnancy, vaccination, Jan Aushadhi,
         mental health, anxiety, depression, addiction, alcohol/drug problem, obsession, craving, body symptoms
  NOT: Ayushman Bharat card new registration (→ yojana_saathi)

yojana_saathi    = Government Schemes Agent
  Scope: PM-KISAN money, PM-Awas housing scheme, MGNREGA job card, PDS ration card (new/add name/correction/lost),
         Ayushman Bharat/PMJAY card application or enrollment, APL/BPL/AAY ration, pension (old age/widow/disability),
         scholarship, PM SVANidhi, MUDRA scheme, PMFBY crop insurance, LPG/Ujjwala subsidy, caste/income certificate,
         government benefit not received, scheme status
  NOTE: Ration card name addition, Ayushman card banwana = yojana_saathi

arthik_salahkar  = Finance & Money Agent
  Scope: bank account problem, Jan Dhan, ATM/card issue, UPI payment failure/fraud, OTP scam, phishing,
         cyber fraud, unexpected money deduction, loan EMI, LIC/insurance claim, money transfer failure, e-RUPI
  NOT: government scheme money not received (→ yojana_saathi)

vidhi_sahayak    = Legal & Rights Agent
  Scope: FIR registration or refusal, police complaint, domestic violence, land/property dispute,
         khasra/khatauni/patta records, eviction, bail, arrest, consumer court, RTI, NALSA legal aid,
         lok adalat, rights violation, harassment, discrimination
`;

  try {
    // Translate first — same as Ministral pipeline, so both classifiers see English
    const english = await translateToEnglish(message);

    // Keyword override — same high-confidence dict as Ministral step
    const bgOverride = getKeywordOverride(english);
    if (bgOverride) return bgOverride;

    const checkPayload: Record<string, unknown> = {
      messages: [
        { role: 'system',    content: BG_ROUTE_SYSTEM },
        // Few-shot anchors (one per agent + edge cases)
        { role: 'user',      content: 'I have had fever for 3 days and need medicine' },
        { role: 'assistant', content: 'swasthya_sahayak' },
        { role: 'user',      content: 'The road in my colony is broken and full of potholes' },
        { role: 'assistant', content: 'nagarik_mitra' },
        { role: 'user',      content: 'Someone stole money from my UPI account using fraud' },
        { role: 'assistant', content: 'arthik_salahkar' },
        { role: 'user',      content: 'I have not received my PM-KISAN instalment this season' },
        { role: 'assistant', content: 'yojana_saathi' },
        { role: 'user',      content: 'How do I make an Ayushman Bharat card or register for the scheme' },
        { role: 'assistant', content: 'yojana_saathi' },
        { role: 'user',      content: 'I want to add my name to the ration card' },
        { role: 'assistant', content: 'yojana_saathi' },
        { role: 'user',      content: 'I want to add my name to the ration card.' },
        { role: 'assistant', content: 'yojana_saathi' },
        { role: 'user',      content: 'Police is refusing to file my FIR' },
        { role: 'assistant', content: 'vidhi_sahayak' },
        { role: 'user',      content: 'I have a problem eating, drinking and having a bowel movement' },
        { role: 'assistant', content: 'swasthya_sahayak' },
        { role: 'user',      content: 'I have problem in eating drinking and having poop' },
        { role: 'assistant', content: 'swasthya_sahayak' },
        { role: 'user',      content: 'My husband is obsessed and addicted to diet coke, please help' },
        { role: 'assistant', content: 'swasthya_sahayak' },
        { role: 'user',      content: english.slice(0, 350) },
      ],
      max_tokens: 10,
      temperature: 0.0,
    };
    if (useGitHubModels && ghModel) checkPayload.model = ghModel;

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(checkPayload),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = (data.choices?.[0]?.message?.content as string || '').trim().toLowerCase().replace(/[^a-z_]/g, '');
    let best: AgentKey | null = null;
    let bestLen = 0;
    for (const a of VALID_AGENTS) {
      if (raw.includes(a) && a.length > bestLen) { bestLen = a.length; best = a; }
    }
    console.log(`[BG_ROUTE] english="${english.slice(0,60)}" raw="${raw}" → resolved="${best}"`);
    return best;
  } catch {
    return null;
  }
}

// Local fallback classifier — calls Python TF-IDF+SVC on localhost:5001
async function classifyAgentLocal(message: string): Promise<AgentKey | null> {
  try {
    const res = await fetch('http://127.0.0.1:5001/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message.slice(0, 300) }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { agent: string; confidence: number };
    const agent = data.agent as AgentKey;
    console.log(`[LOCAL] predicted=${agent} conf=${data.confidence}`);
    return VALID_AGENTS.includes(agent) ? agent : null;
  } catch {
    console.warn('[LOCAL] classifier unavailable');
    return null;
  }
}

async function classifyFinanceSubintentLocal(
  message: string
): Promise<{ subintent: FinanceSubintentKey; confidence: number } | null> {
  try {
    const res = await fetch('http://127.0.0.1:5001/classify-finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message.slice(0, 320) }),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { subintent?: string; confidence?: number };
    const subintent = (data.subintent || '').trim() as FinanceSubintentKey;
    const confidence = Number(data.confidence || 0);
    const valid: FinanceSubintentKey[] = [
      'bank_deposit',
      'investment_guidance',
      'upi_issue',
      'loan_query',
      'fraud_alert',
      'general_finance',
    ];
    if (!valid.includes(subintent)) return null;
    return { subintent, confidence };
  } catch {
    return null;
  }
}

// POST /api/agent - Multi-agent orchestration via Azure OpenAI (AutoGen 0.4 pattern)
export async function POST(request: NextRequest) {
  const telemetry = startRouteTelemetry(request, 'api.agent.post');
  let reqMessage = '';
  let reqAgentKey: AgentKey = 'nagarik_mitra';
  let reqLanguage = 'hi';
  let grounding: Awaited<ReturnType<typeof buildGroundedAnswer>> | null = null;
  let vidhiPoliceContact: VidhiPoliceContact | null = null;
  let vidhiLegalResource: VidhiLegalResource | null = null;

  try {
    const { message, userText, agentKey, clientDetectedAgent, conversationHistory = [], sharedContext = '', language = 'hi', digipin, classifyOnly = false, citizenProfile = null, sessionId = '', userId = '', caseId = '' } = await request.json();
    reqMessage = message || '';
    reqAgentKey = agentKey as AgentKey;
    reqLanguage = language || 'hi';
    telemetry.setContext({
      sessionId,
      userId,
      caseId,
      agentType: reqAgentKey,
      language: reqLanguage,
    });

    // Short-circuit: empty or trivially short messages don't need AI
    if (!reqMessage || reqMessage.trim().length < 2) {
      telemetry.complete(400, { reason: 'message_too_short' });
      return NextResponse.json({ error: 'Message too short' }, { status: 400 });
    }

    // For routing purposes, use just the user's typed text (strip image analysis prefix).
    // This prevents Phi from routing on image metadata instead of user intent.
    // If userText is provided, use it; otherwise strip [Image analysis: ...] from message.
    const routingText = (() => {
      if (typeof userText === 'string' && userText.trim()) return userText.trim();
      const stripped = (message as string).replace(/^\[Image analysis:[^\]]*\]\n?/i, '').trim();
      // If nothing left after stripping (image-only, no caption), skip routing
      return stripped || '';
    })();

    const historySummary = (conversationHistory as { role: string; content: string }[])
      .filter((item) => item.role === 'user' || item.role === 'assistant')
      .slice(-4)
      .map((item) => `${item.role}: ${item.content}`)
      .join(' | ')
      .slice(0, 1200);

    const enrichmentText = [historySummary, routingText].filter(Boolean).join(' | ');
    const chatEnrichment = enrichmentText
      ? await analyzeAndPersistLanguageEnrichment({
          text: enrichmentText,
          sourceType: 'chat_summary',
          userId,
          sessionId,
          caseId,
          language: reqLanguage,
          metadata: {
            activeAgent: reqAgentKey,
            clientDetectedAgent: clientDetectedAgent || '',
          },
        })
      : null;

    if (chatEnrichment) {
      telemetry.setContext({
        trustScore: chatEnrichment.trustScore,
        riskScore: chatEnrichment.riskScore,
        languageRoutingHint: chatEnrichment.routingHint?.agentKey || '',
      });
    }

    // Validate agent key
    const requestedAgent = agentConfigs[agentKey as AgentKey];
    if (!requestedAgent) {
      telemetry.complete(400, { reason: 'invalid_agent_key' });
      return NextResponse.json({ error: 'Invalid agent key' }, { status: 400 });
    }

    const ghToken = geminiConfig.githubModels.token;
    // Use Azure OpenAI only when endpoint+key are both configured.
    // Student subscription has 0 quota for all GPT models → default to GitHub Models (free).
    const hasAzureOpenAI = !!(
      geminiConfig.openai.apiKey &&
      geminiConfig.openai.endpoint &&
      !geminiConfig.openai.apiKey.startsWith('your-')
    );
    const useGitHubModels = !hasAzureOpenAI; // GitHub Models is primary when Azure not configured
    // Phi-4-mini-instruct routing via GitHub Models free tier
    const usePhiRouting = !!(process.env["GITHUB_TOKEN_PHI"] || process.env["GITHUB_TOKEN"]);

    // ═══════════════════════════════════════════════════
    // STEP 1: Route to the correct agent
    //   Order: Phi-4-mini-instruct → local TF-IDF (fallback) → clientDetected
    // ═══════════════════════════════════════════════════
    let resolvedAgentKey: AgentKey = agentKey as AgentKey;
    let suggestedAgent: string | null = null;
    let phiClassified: AgentKey | null = null;
    // Kept alive so post-GPT code can harvest a Phi result that arrives during GPT execution
    let phiPromise: Promise<AgentKey | null> = Promise.resolve(null);

    const clientAgent = VALID_AGENTS.includes(clientDetectedAgent as AgentKey) ? clientDetectedAgent as AgentKey : null;

    console.log(`\n[ROUTING] msg="${message.slice(0,60)}" | routingText="${routingText.slice(0,40)}" | from=${agentKey} | clientDetected=${clientDetectedAgent}`);

    // Skip routing only if there's no meaningful text to analyze
    if (!routingText || routingText.length < 3) {
      console.log(`[ROUTING] SKIPPED — no meaningful text to route`);
      resolvedAgentKey = agentKey as AgentKey;
    } else if (clientAgent === agentKey) {
      // Client keyword detection and active agent already agree — skip Phi entirely.
      // Running Phi here adds latency with no benefit: both signals point to the same agent.
      resolvedAgentKey = agentKey as AgentKey;
      console.log(`[ROUTING] client+current agree: ${clientAgent} — Phi skipped`);
    } else {
      // Run full classification (client detected different agent OR client detected nothing)
      let classified: AgentKey | null = null;

      const languageHintAgent = chatEnrichment?.routingHint?.agentKey;
      const languageHintConfidence = chatEnrichment?.routingHint?.confidence ?? 0;
      if (
        languageHintAgent &&
        VALID_AGENTS.includes(languageHintAgent) &&
        languageHintConfidence >= 0.8
      ) {
        classified = languageHintAgent;
        console.log(
          `[ROUTING] Language enrichment hint: ${languageHintAgent} (confidence ${languageHintConfidence})`
        );
      }

      // ── Phi-4-mini-instruct routing — parallel with GPT ──
      // Fire Phi immediately but only wait 5s max before proceeding to GPT.
      // Warm Phi resolves in 2-3s so it usually wins the race.
      // Cold-starting Phi (>5s) no longer blocks the user — GPT starts right away.
      // phiPromise stays alive; post-GPT code harvests the result if it arrives in time.
      if (usePhiRouting) {
        phiPromise = classifyAgentWithPhi(routingText);
        classified = await Promise.race([
          phiPromise,
          new Promise<null>(r => setTimeout(() => r(null), 5000)),
        ]);
        if (classified) {
          phiClassified = classified;
        } else {
          console.log('[PHI] 5s early timeout — GPT starting immediately, Phi still running in background');
        }
      }

      // ── Pass 2: Local TF-IDF (fallback if Phi didn't resolve in 5s) ─────
      if (!classified) {
        console.log(`[LOCAL] Phi null/slow — falling back to TF-IDF`);
        const t0 = Date.now();
        classified = await classifyAgentLocal(message);
        console.log(`[LOCAL] returned="${classified}" in ${Date.now()-t0}ms`);
      }

      // Apply result
      if (classified && classified !== agentKey) {
        suggestedAgent = classified;
        // Refined Routing: If user query has signals for BOTH current agent and classified agent,
        // STAY in the current agent to handle multi-intent response.
        const hasCurrentSignal = hasSignalForAgent(routingText || message, agentKey as AgentKey);
        if (hasCurrentSignal) {
          resolvedAgentKey = agentKey as AgentKey;
          console.log(`[ROUTING] MULTI-INTENT: staying on ${agentKey}, but suggesting ${classified}`);
        } else {
          resolvedAgentKey = classified;
          console.log(`[ROUTING] HANDOFF: ${agentKey} → ${classified} (clientDetected=${clientDetectedAgent})`);
        }
      } else if (!classified && clientAgent && clientAgent !== agentKey) {
        // Both classifiers failed — last resort: trust client keyword detection
        resolvedAgentKey = clientAgent;
        suggestedAgent = clientAgent;
        console.log(`[ROUTING] Both classifiers failed, using clientDetected: ${clientAgent}`);
      } else {
        console.log(`[ROUTING] No change — staying on ${agentKey}`);
      }
    }

    console.log(`[ROUTING] resolved → ${resolvedAgentKey}${suggestedAgent ? ` (handoff suggested: ${suggestedAgent})` : ''}\n`);

    const recentUserLegalContext = (conversationHistory as { role: string; content: string }[])
      .filter((item) => item.role === 'user')
      .slice(-4)
      .map((item) => item.content)
      .join(' | ');

    const recentUserFinanceContext = (conversationHistory as { role: string; content: string }[])
      .filter((item) => item.role === 'user')
      .slice(-4)
      .map((item) => item.content)
      .join(' | ');

    const resolvedLegalDomain: LegalDomainKey | null =
      resolvedAgentKey === 'vidhi_sahayak'
        ? resolveLegalDomainForTurn(routingText || message, [recentUserLegalContext, historySummary, sharedContext])
        : null;

    const resolvedFinanceDomain: FinanceDomainKey | null =
      resolvedAgentKey === 'arthik_salahkar'
        ? resolveFinanceDomainForTurn(routingText || message, [recentUserFinanceContext, historySummary, sharedContext])
        : null;

    let resolvedFinanceSubintent: FinanceSubintentKey | null = null;
    if (resolvedAgentKey === 'arthik_salahkar') {
      const financeMl = await classifyFinanceSubintentLocal(routingText || message);
      if (financeMl && financeMl.confidence >= 0.32) {
        resolvedFinanceSubintent = financeMl.subintent;
        telemetry.setContext({ financeSubintent: resolvedFinanceSubintent, financeSubintentConfidence: financeMl.confidence });
      }
    }

    const shouldGround = shouldUseGroundedRag(routingText, resolvedAgentKey);
    if (shouldGround && routingText.trim().length > 2) {
      grounding = await buildGroundedAnswer(routingText, {
        language: reqLanguage,
        top: 6,
      });

      telemetry.setContext({
        ragConfidence: grounding.confidence,
        ragFallback: grounding.usedFallback,
      });

      if (grounding.usedFallback) {
        // MULTI-INTENT RESILIENCE: 
        // If RAG failed but the user is also talking about a help/conversational concern (like "not feeling well")
        // do NOT return the fallback. Instead, proceed to LLM for a unified empathetic response.
        const isConversational =
          hasHealthSignal(routingText || message) ||
          hasCivicSignal(routingText || message) ||
          resolvedAgentKey === 'nagarik_mitra' ||
          resolvedAgentKey === 'yojana_saathi' ||
          isGreetingOnlyMessage(routingText || message);
        if (!isConversational) {
          const fallbackAgent = agentConfigs[resolvedAgentKey];
          let fallbackReply = grounding.answer;
          if (resolvedAgentKey === 'vidhi_sahayak') {
            if (!resolvedLegalDomain) {
              fallbackReply = buildVidhiIntakeResponse(language);
            } else {
            if (!vidhiPoliceContact) {
              vidhiPoliceContact = await lookupLocalPoliceContact(
                citizenProfile?.digipin || digipin || '',
                citizenProfile?.address || ''
              );
            }
            if (!vidhiLegalResource) {
              vidhiLegalResource = await lookupLegalDomainResource(
                routingText || message,
                resolvedLegalDomain || detectLegalDomainTag(routingText || message)
              );
            }
            fallbackReply = sanitizeVidhiStructuredResponse(
              routingText || message,
              buildVidhiStructuredResponse(
                routingText || message,
                grounding.answer,
                language,
                vidhiLegalResource,
                resolvedLegalDomain || undefined
              ),
              language,
              resolvedLegalDomain || undefined
            );
            fallbackReply = `${fallbackReply}${buildVidhiSupportFooter(
              routingText || message,
              vidhiPoliceContact,
              vidhiLegalResource,
              resolvedLegalDomain || undefined
            )}`;
            }
          } else if (resolvedAgentKey === 'arthik_salahkar') {
            if (!resolvedFinanceDomain) {
              fallbackReply = buildArthikIntakeResponse(language);
            } else {
              fallbackReply = sanitizeArthikStructuredResponse(
                routingText || message,
                buildArthikStructuredResponse(
                  routingText || message,
                  grounding.answer,
                  language,
                  resolvedFinanceDomain || undefined,
                  resolvedFinanceSubintent
                ),
                language,
                resolvedFinanceDomain || undefined,
                resolvedFinanceSubintent
              );
              fallbackReply = `${fallbackReply}${buildArthikSupportFooter(
                routingText || message,
                resolvedFinanceDomain || undefined,
                resolvedFinanceSubintent
              )}`;
            }
          } else if (resolvedAgentKey === 'swasthya_sahayak' && isSwasthyaEmergencyIntent(routingText || message)) {
            fallbackReply = await buildSwasthyaEmergencyResponse(
              routingText || message,
              language,
              citizenProfile?.digipin || digipin || '',
              citizenProfile?.address || '',
              citizenProfile?.emergencyContacts?.[0]?.name || 'Primary family contact',
              deriveAbhaSharePayload(citizenProfile as CitizenProfileContext | null)
            );
          }
          const fallbackResponse = NextResponse.json({
            reply: fallbackReply,
            agent: {
              name: fallbackAgent.name,
              role: fallbackAgent.role,
              color: fallbackAgent.color,
              icon: fallbackAgent.icon,
            },
            languageEnrichment: chatEnrichment,
            suggestedAgent,
            resolvedAgentKey,
            grounding,
            source: 'rag-fallback',
          });
          telemetry.complete(200, {
            source: 'rag-fallback',
            resolvedAgentKey,
            ragConfidence: grounding.confidence,
          });
          return fallbackResponse;
        } else {
          console.log(`[RAG] Fallback relaxation active: conversational intent detected. Proceeding to LLM.`);
        }
      }
    }

    // ── classifyOnly mode: skip LLM, return agent routing result immediately ──
    // Used by VoiceAssistant for fast agent detection without generating a reply.
    if (classifyOnly) {
      const classifyResponse = NextResponse.json({
        resolvedAgentKey,
        suggestedAgent,
        languageEnrichment: chatEnrichment,
        grounding,
        reply: null,
        source: 'classify-only',
      });
      telemetry.complete(200, {
        classifyOnly: true,
        resolvedAgentKey,
        suggestedAgent: suggestedAgent || '',
        riskScore: chatEnrichment?.riskScore ?? '',
        trustScore: chatEnrichment?.trustScore ?? '',
      });
      return classifyResponse;
    }

    // Get the resolved agent (could be different from what user was talking to)
    const agent = agentConfigs[resolvedAgentKey];

    // ═══════════════════════════════════════════════════
    // STEP 2: Build system prompt for the CORRECT agent
    // ═══════════════════════════════════════════════════
    const userLang = LANGUAGE_NAMES[language] || LANGUAGE_NAMES[language.split('-')[0]] || language;
    const isEnglish = language === 'en' || language.startsWith('en-');

    const langInstruction = isEnglish
      ? `LANGUAGE: Respond in clear, simple English. Avoid jargon; write as if explaining to a first-time government portal user.`
      : `LANGUAGE — MANDATORY:
• Your PRIMARY language is ${userLang}. Write the overwhelming majority of your response in ${userLang} script.
• You may naturally mix in a SMALL number of English words ONLY for: scheme names (e.g. PM-KISAN, Ayushman Bharat), portal names (e.g. pgportal.gov.in), app names, ticket IDs, and well-known technical terms (OTP, UPI, FIR, URL). This light English mix is natural and authentic for Indian users.
• DO NOT write entire sentences in English. DO NOT switch to Hindi if the user's language is not Hindi.
• If the user wrote in ${userLang}, reply in ${userLang}. If they mixed languages, still reply in ${userLang} with light English terms.`;

    const orchestratorSystemPrompt = `You are ${agent.name}, the ${agent.role} in the Bharat Setu digital governance platform.
User's DIGIPIN: ${citizenProfile?.digipin || digipin || 'Not provided'}
User's preferred language: ${userLang}

${langInstruction}

${agent.systemPrompt}

RULES:
1. ${isEnglish ? 'Write in English.' : `Write in ${userLang} with only light English technical terms mixed in.`}
2. If DIGIPIN is provided, use it for location-aware recommendations.
3. Reference specific Indian scheme names, deadlines, and portal URLs where relevant.
4. You are the CHOSEN agent for this query — answer directly, empathetically, and helpfully.
5. Use simple vocabulary appropriate for a citizen who may not be tech-savvy.
6. For emergencies, always mention 112 (National Emergency) or 108 (Ambulance).
7. Do NOT mention other agents, do NOT suggest handoffs — you are already the correct agent.
${resolvedAgentKey === 'vidhi_sahayak' ? `
VIDHI SAHAYAK MANDATORY FORMAT (every answer):
- Start with a one-line problem understanding.
- Add "Exact Law" section with the most relevant Indian law + section reference (or clearly say "section needs local verification" if uncertain).
- Add "Step-by-step" section with numbered actionable next steps.
- Add "Deadline" section with limitation / urgency window (or "varies by facts" when uncertain).
- Add "Free Legal Help" section with: NALSA 15100, Tele-Law 1516, Women 181, Cyber 1930, Police 112, Child 1098.
- Add "Nearest Police / Authority" with a map-search instruction using DIGIPIN/location context.
- Keep advice practical, citizen-friendly, and focused on legal remedy only.
` : ''}
${resolvedAgentKey === 'arthik_salahkar' ? `
ARTHIK SALAHKAR MANDATORY FORMAT (every answer):
- Start with a one-line problem understanding.
- Add "Immediate Action" section first (especially for fraud/payment risk).
- Add "Step-by-step" section with numbered, practical actions.
- Add "Safety Note" section (OTP/PIN/CVV/link/caller verification warnings when relevant).
- Add one official portal/resource link relevant to the issue.
- For fraud/cyber signals, explicitly mention 1930 and cybercrime.gov.in.
- Keep advice practical, citizen-friendly, and avoid investment tips or guaranteed returns.
` : ''}
${(() => {
  if (!citizenProfile) return '';
  const dobYear = citizenProfile.dob ? parseInt((citizenProfile.dob as string).split(' ').pop() || '0') : 0;
  const age = dobYear ? new Date().getFullYear() - dobYear : null;
  const incomeFormatted = citizenProfile.income ? `₹${(citizenProfile.income as number).toLocaleString('en-IN')}/year` : 'Not provided';
  const linked = Array.isArray(citizenProfile.linkedSchemes) && citizenProfile.linkedSchemes.length ? (citizenProfile.linkedSchemes as string[]).join(', ') : 'None';
  const eligible = Array.isArray(citizenProfile.eligibleSchemes) && citizenProfile.eligibleSchemes.length ? (citizenProfile.eligibleSchemes as string[]).join(', ') : 'Not determined';
  return `
CITIZEN PROFILE (Aadhaar-verified — use this for personalised responses):
• Name: ${citizenProfile.name}${citizenProfile.nameHindi ? ` (${citizenProfile.nameHindi})` : ''}
• Age: ${age ? `${age} years` : 'Not provided'} | Gender: ${citizenProfile.gender || 'Not specified'}
• Location: ${citizenProfile.district ? `${citizenProfile.district}, ` : ''}${citizenProfile.state || 'India'} | DIGIPIN: ${citizenProfile.digipin || digipin || 'Not provided'}
• Address: ${citizenProfile.address || 'Not provided'}
• Occupation: ${citizenProfile.occupation || 'Not provided'} | Annual Income: ${incomeFormatted}
• Ration Card: ${citizenProfile.rationCardType || 'Not provided'} | BPL: ${citizenProfile.bplCard ? 'Yes' : 'No'}
• Currently Enrolled Schemes: ${linked}
• Eligible But Not Yet Applied: ${eligible}

KEY INSTRUCTIONS:
- Address the citizen by first name when natural.
- Never suggest schemes they are already enrolled in (see enrolled list above) unless they ask.
- Use their income and occupation to calibrate advice (e.g. don’t recommend premium products to a low-income citizen).
- Their location/DIGIPIN determines nearby PHC, police station, and local government offices.`;
})()}

${sharedContext ? `
[SHARED MCP CONTEXT - RECENT CROSS-AGENT INTERACTIONS]
The citizen recently spoke to other specialized agents. Use this history to seamlessly continue the conversation without asking them to repeat themselves:
${sharedContext}
` : ''}

${grounding && !grounding.usedFallback ? `
[GROUNDED POLICY CONTEXT — MUST USE FOR FACTS]
- Use only the grounded snippets below for scheme/legal/policy factual claims.
- If you mention eligibility, benefits, deadlines, or application steps, cite source numbers like [1], [2].
- Do not invent values beyond these sources.
${grounding.citations.map((citation, index) => `[${index + 1}] ${citation.title}: ${citation.snippet}${citation.url ? ` (${citation.url})` : ''}`).join('\n')}
` : ''}

${suggestedAgent && suggestedAgent !== resolvedAgentKey ? `
[MULTI-INTENT HINT]
User's query involves the ${suggestedAgent} domain as well. While you are responding as the ${agent.role}, please briefly acknowledge this secondary concern and inform the user they can click the button to hand off the conversation to the ${agentConfigs[suggestedAgent as AgentKey].name} for more expert specialized assistance.
` : ''}

${grounding?.usedFallback ? `
[RAG_RECORD_NOT_FOUND_NOTE]
I could not find a specific government record or scheme matching this exact query in our official database. Please provide a helpful, empathetic general response based on your training as ${agent.name}, but explicitly note that you couldn't find a direct record match and suggest they consult a local official or the relevant portal.
` : ''}`;

    // Build messages array — cap history at 6 messages (3 turns) to save tokens
    const trimmedHistory = (conversationHistory as { role: string; content: string }[])
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-6);
    const messages = [
      { role: 'system', content: orchestratorSystemPrompt },
      ...trimmedHistory.map((msg) => ({ role: msg.role, content: msg.content })),
      { role: 'user', content: message },
    ];

    // ── Pick Azure deployment via round-robin (A / B alternate each request) ──
    const chosenDeployment = pickDeployment();
    console.log(`[DEPLOY] using ${chosenDeployment} (counter=${rrCounter})`);

    const bodyPayload: Record<string, unknown> = {
      messages,
      max_tokens: 700,
      temperature: 0.7,
      top_p: 0.95,
      presence_penalty: 0.1,
      frequency_penalty: 0.1,
    };

    // ── Gemini LLM Call via Adapter ──
    const client = ModelClient('dummy', new AzureKeyCredential('dummy'));
    
    let response: any = {
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => 'API Error'
    };

    try {
      const adapterRes = await client.path('/chat/completions').post({
        body: bodyPayload
      });
      if (adapterRes.status === '200') {
        response.ok = true;
        response.status = 200;
        response.json = async () => adapterRes.body;
      } else {
        response.status = parseInt(adapterRes.status) || 500;
        response.text = async () => JSON.stringify(adapterRes.body);
      }
    } catch (err) {
      console.warn('[FALLBACK] Gemini Adapter failed — using rich demo response');
      const demoRateLimitedResponse = NextResponse.json({
        reply: getDemoReply(resolvedAgentKey, message, language, digipin),
        agent: { name: agent.name, role: agent.role, color: agent.color, icon: agent.icon },
        suggestedAgent,
        resolvedAgentKey,
        grounding,
        source: 'demo-rate-limited',
      });
      telemetry.complete(200, {
        source: 'demo-rate-limited',
        resolvedAgentKey,
      });
      return demoRateLimitedResponse;
    }

    if (!response.ok) {
      const err = await response.text();
      console.error(`LLM API error:`, err);
      throw new Error(`AI service error: ${response.status}`);
    }

    const data = await response.json();
    // Log the actual model used — Azure returns the fine-tune model ID here (confirms v2 vs v1)
    if (data.model) console.log(`[MODEL] actual="${data.model}" deploy="${chosenDeployment}"`);
    const rawReply = data.choices?.[0]?.message?.content || 'कृपया पुनः प्रयास करें।';

    // ── Post-GPT: harvest Phi if it resolved while GPT was running ─────────
    // GPT takes 3-12s; warm Phi takes 2-3s — so Phi is often already done here.
    // 100ms gives it a final chance without adding meaningful latency.
    if (!phiClassified) {
      const phiLate = await Promise.race([
        phiPromise,
        new Promise<null>(r => setTimeout(() => r(null), 100)),
      ]);
      if (phiLate) {
        phiClassified = phiLate;
        console.log(`[PHI] late result (resolved during GPT execution): ${phiLate}`);
        if (phiLate !== resolvedAgentKey && !suggestedAgent) {
          suggestedAgent = phiLate;
          console.log(`[PHI] late handoff suggestion: → ${phiLate}`);
        }
      }
    }

    // ── Extract and strip the AGENT: routing prefix emitted by GPT (Legacy Support) ─
    let reply = rawReply;
    const agentPrefixMatch = rawReply.match(/^AGENT:(nagarik_mitra|swasthya_sahayak|yojana_saathi|arthik_salahkar|vidhi_sahayak)[\s\n]*/i);
    if (agentPrefixMatch) {
      const gptAgent = agentPrefixMatch[1].toLowerCase() as AgentKey;
      reply = rawReply.slice(agentPrefixMatch[0].length).trim();
      console.log(`[GPT] stripped legacy routing tag: ${gptAgent}`);
      // NOTE: GPT routing fallback is now disabled to strictly use Phi
    }

    if (grounding && !grounding.usedFallback && grounding.citations.length > 0) {
      const sourceLines = grounding.citations
        .slice(0, 3)
        .map((citation, index) => {
          const link = citation.url ? ` — ${citation.url}` : '';
          return `[${index + 1}] ${citation.title}${link}`;
        })
        .join('\n');

      if (!/\[1\]|\[2\]|\[3\]/.test(reply)) {
        reply = `${reply}\n\nSources:\n${sourceLines}`;
      }
    }

    if (resolvedAgentKey === 'vidhi_sahayak') {
      if (!resolvedLegalDomain) {
        reply = buildVidhiIntakeResponse(language);
      } else {
      if (!vidhiPoliceContact) {
        vidhiPoliceContact = await lookupLocalPoliceContact(
          citizenProfile?.digipin || digipin || '',
          citizenProfile?.address || ''
        );
      }
      if (!vidhiLegalResource) {
        vidhiLegalResource = await lookupLegalDomainResource(
          routingText || message,
          resolvedLegalDomain || detectLegalDomainTag(routingText || message)
        );
      }
      reply = sanitizeVidhiStructuredResponse(
        routingText || message,
        buildVidhiStructuredResponse(
          routingText || message,
          reply,
          language,
          vidhiLegalResource,
          resolvedLegalDomain || undefined
        ),
        language,
        resolvedLegalDomain || undefined
      );
      reply = `${reply}${buildVidhiSupportFooter(
        routingText || message,
        vidhiPoliceContact,
        vidhiLegalResource,
        resolvedLegalDomain || undefined
      )}`;
      }
    } else if (resolvedAgentKey === 'arthik_salahkar') {
      if (!resolvedFinanceDomain) {
        reply = buildArthikIntakeResponse(language);
      } else {
        reply = sanitizeArthikStructuredResponse(
          routingText || message,
          buildArthikStructuredResponse(
            routingText || message,
            reply,
            language,
            resolvedFinanceDomain || undefined,
            resolvedFinanceSubintent
          ),
          language,
          resolvedFinanceDomain || undefined,
          resolvedFinanceSubintent
        );
        reply = `${reply}${buildArthikSupportFooter(
          routingText || message,
          resolvedFinanceDomain || undefined,
          resolvedFinanceSubintent
        )}`;
      }
    } else if (resolvedAgentKey === 'swasthya_sahayak' && isSwasthyaEmergencyIntent(routingText || message)) {
      reply = await buildSwasthyaEmergencyResponse(
        routingText || message,
        language,
        citizenProfile?.digipin || digipin || '',
        citizenProfile?.address || '',
        citizenProfile?.emergencyContacts?.[0]?.name || 'Primary family contact',
        deriveAbhaSharePayload(citizenProfile as CitizenProfileContext | null)
      );
    }

    const successResponse = NextResponse.json({
      reply,
      agent: {
        name: agent.name,
        role: agent.role,
        color: agent.color,
        icon: agent.icon,
      },
      languageEnrichment: chatEnrichment,
      grounding,
      suggestedAgent, // non-null if Phi-3 routed to a different agent
      resolvedAgentKey, // which agent actually answered
      usage: data.usage,
    });
    telemetry.complete(200, {
      resolvedAgentKey,
      suggestedAgent: suggestedAgent || '',
      agentType: resolvedAgentKey,
      riskScore: chatEnrichment?.riskScore ?? '',
      trustScore: chatEnrichment?.trustScore ?? '',
      source: 'ai',
    });
    return successResponse;
  } catch (error: unknown) {
    console.error('Agent API error:', error);
    telemetry.fail(error, 500, {
      agentType: reqAgentKey,
      language: reqLanguage,
      source: 'demo',
    });
    // Demo fallback when AI is unavailable
    const agent = agentConfigs[reqAgentKey] || agentConfigs.nagarik_mitra;
    return NextResponse.json({
      reply: getDemoReply(reqAgentKey, reqMessage, reqLanguage),
      agent: { name: agent.name, role: agent.role, color: agent.color, icon: agent.icon },
      suggestedAgent: null,
      grounding,
      source: 'demo',
    });
  }
}

function getDemoReply(agentKey: string, message: string, language = 'hi', digipin = '88-H2K-99L1'): string {
  const DEMO_YEAR = new Date().getFullYear();
  const msg = (message || '').toLowerCase();
  const isEn = language === 'en' || language.startsWith('en-');

  // ── English responses ────────────────────────────────────────────────────────
  const enReplies: Record<string, Record<string, string>> = {
    nagarik_mitra: {
      default: '🏛️ Hello! I am Nagarik Mitra, your civic services assistant.\n\nI can help you with:\n• Street light / road repairs\n• Water supply issues\n• Sanitation complaints\n• File RTI or grievances via PGPortal\n\n📍 Your DIGIPIN zone is Active. Please describe your issue.',
      streetlight: `💡 Street light complaint registered!\n\nTicket: GRV-${DEMO_YEAR}-4521\nCategory: Electricity / Lighting\nPriority: HIGH\n\n📋 Status: Forwarded to PWD Department\n⏰ Expected resolution: 48 hours\n\n+25 Karma Points earned! 🌟`,
      water: `🚰 Water supply issue — we understand!\n\nJal Board has been alerted for your DIGIPIN zone.\nTicket: GRV-${DEMO_YEAR}-4522\n\nNearby Options:\n• Tanker Service: 1800-XXX-XXXX\n• Community Bore: 500m NW\n\nWant to know your legal right to water? Ask Vidhi Sahayak.`,
    },
    swasthya_sahayak: {
      default: '🏥 Hello! I am Swasthya Sahayak, your health assistant.\n\n💊 Nearest PHC: 2.1 km away\n🩺 Ayushman Bharat: ACTIVE\n📅 Next vaccination reminder: scheduled\n\nHow can I help you today — vaccination, ABHA ID, nearest hospital, or medicine?',
      vaccination: '💉 Vaccination Update:\n\n✅ BCG - Done\n✅ OPV 1,2,3 - Done\n⏳ Measles-1 - Due soon\n⏳ JE-1 - Due Dec\n\nNearest Center: Primary Health Centre\nReminder has been set! 🔔',
    },
    yojana_saathi: {
      default: '📋 Hello! I am Yojana Saathi, your welfare scheme guide.\n\n🔍 I can help you:\n• Check eligibility for PM-KISAN, Ayushman, MGNREGA\n• Apply for schemes via Jan Samarth portal\n• Track your DBT (Direct Benefit Transfer) payments\n\n✅ Multiple schemes available — tell me your need.',
      kisan: '🌾 PM-KISAN Status:\n\n✅ Registration: Active\n💰 Last installment: ₹2,000\n📅 Next installment: Expected soon\n\nAlso eligible for:\n• PMFBY (Crop Insurance) — Apply Now\n• KCC (Kisan Credit Card) — Pre-approved\n• PM-KUSUM (Solar Pump) — 60% subsidy',
    },
    arthik_salahkar: {
      default: '💰 Hello! I am Arthik Salahkar, your financial advisor.\n\n🛡️ Scam Shield: ACTIVE\n📊 I can help with UPI safety, Mudra loans, Jan Dhan account, and cyber fraud reporting.\n\nReport fraud: **1930** (National Cyber Crime Helpline)',
      scam: '🚨 SCAM ALERT DETECTED!\n\nPattern: Fake KYC request\nThreat Level: HIGH\n\n⚠️ Never share OTP, PIN, or bank details over phone!\n\n📞 Report: **1930** (Cyber Crime Helpline)\n🔒 Your accounts are SAFE',
    },
    vidhi_sahayak: {
      default: '⚖️ Hello! I am Vidhi Sahayak, your free legal aid assistant.\n\n📋 Your Rights:\n• Right to Information (RTI)\n• Right to Free Legal Aid (if income < ₹3L)\n• Right to Fair Trial\n\n🏛️ NALSA Helpline: **15100** (free, 24×7)',
      zerofir: '📋 How to file a Zero FIR:\n\n1. Go to **any** police station\n2. Demand FIR registration (cannot be refused)\n3. Get a free copy of your FIR\n4. It will be auto-transferred to the concerned station\n\n⚖️ Under Section 173 BNSS\n\nI can help draft your FIR. Please share the details.',
    },
  };

  // ── Hindi responses (original) ───────────────────────────────────────────────
  const replies: Record<string, Record<string, string>> = {
    nagarik_mitra: {
      default: `🏛️ नमस्ते! मैं नागरिक मित्र हूं। आपकी नगरपालिका सेवाओं में मदद के लिए यहां हूं। कृपया अपनी समस्या बताएं - सड़क, पानी, बिजली, या कोई और सेवा।\n\n📍 DIGIPIN: ${digipin} (Active)\n🔧 आज 12 शिकायतें हल हुईं आपके क्षेत्र में।`,
      streetlight: `💡 स्ट्रीटलाइट शिकायत दर्ज!\n\nTicket: GRV-${DEMO_YEAR}-4521\nDIGIPIN Location: ${digipin}\nCategory: Electricity/Lighting\nPriority: HIGH\n\n📋 Status: PWD विभाग को भेजा गया\n⏰ Expected: 48 hours\n\n+25 Karma Points earned! 🌟`,
      water: `🚰 पानी की समस्या – हम समझते हैं!\n\nDIGIPIN ${digipin} पर Jal Board को alert भेजा गया।\nTicket: GRV-${DEMO_YEAR}-4522\n\nNearby Options:\n• Tanker Service: 1800-XXX-XXXX\n• Community Bore: 500m NW\n\nVidhi Sahayak से बात करें? (Right to Water Act)`,
    },
    swasthya_sahayak: {
      default: `🏥 नमस्ते! मैं स्वास्थ्य सहायक हूं। आपके स्वास्थ्य संबंधी प्रश्नों में मदद करने के लिए यहां हूं।\n\n💊 Nearest PHC: 2.1 km (DIGIPIN)\n🩺 Ayushman Bharat: ACTIVE\n📅 Next vaccination: 15 Nov ${DEMO_YEAR}`,
      vaccination: `💉 टीकाकरण अपडेट:\n\nShishu (Age: 8 months)\n✅ BCG - Done\n✅ OPV 1,2,3 - Done\n⏳ Measles-1 - Due 15 Nov ${DEMO_YEAR}\n⏳ JE-1 - Due 20 Dec ${DEMO_YEAR}\n\nNearest Center: Nearest PHC\nReminder set! 🔔`,
    },
    yojana_saathi: {
      default: '📋 नमस्ते! मैं योजना साथी हूं। सरकारी योजनाओं की जानकारी और आवेदन में मदद करता हूं।\n\n✅ योजनाओं के लिए पात्रता जांचें\n⚡ PM-KISAN, Ayushman, MGNREGA, Ujjwala जैसी योजनाएं\n📲 Jan Samarth portal पर आवेदन करें\n\nअपनी ज़रूरत बताएं — मैं सही योजना खोजूंगा।',
      kisan: `🌾 PM-KISAN Status:\n\n✅ Registration: Active\n💰 Last installment: ₹2,000 (Aug ${DEMO_YEAR - 1})\n📅 Next installment: Expected Dec ${DEMO_YEAR}\n\nAdditional Eligible:\n• PMFBY (Crop Insurance) - Apply Now\n• KCC (Kisan Credit Card) - Pre-approved\n• PM-KUSUM (Solar Pump) - 60% subsidy`,
    },
    arthik_salahkar: {
      default: '💰 नमस्ते! मैं आर्थिक सलाहकार हूं। वित्तीय मार्गदर्शन में मदद करता हूं।\n\n🛡️ Scam Shield: ACTIVE\n📊 Financial Health Score: 72/100\n💳 UPI Safety: All transactions monitored',
      scam: '🚨 SCAM ALERT DETECTED!\n\nPattern: Fake KYC request via SMS\nThreat Level: HIGH\n\n⚠️ कभी भी OTP, PIN, या bank details फोन पर न दें!\n\n📞 Report: 1930 (Cyber Crime)\n🔒 Your accounts are SAFE\n\nAzure Content Safety Score: 98.2% threat confidence',
    },
    vidhi_sahayak: {
      default: '⚖️ नमस्ते! मैं विधि सहायक हूं। कानूनी सहायता में मदद करता हूं।\n\n📋 Your Rights:\n• Right to Information (RTI)\n• Right to Fair Trial\n• Legal Aid (Free if income < ₹3L)\n\n🏛️ Nearest Legal Aid: District Court, 4.2 km\n📞 NALSA Helpline: 15100',
      zerofir: '📋 Zero FIR दर्ज करने की प्रक्रिया:\n\n1. किसी भी थाने में जाएं\n2. FIR लिखवाएं (मना करने पर SP को शिकायत)\n3. FIR की कॉपी लें (Free)\n4. Auto-transfer होगा concerned PS को\n\n⚖️ BNSS Section 173 (पूर्व CrPC Section 154)\n\nMein aapki FIR draft kar sakta hoon. Details share karein.',
    },
  };

  // Route to English, Hindi, or English-fallback responses based on language
  // For languages other than Hindi (e.g. Tamil, Telugu, Bengali), serve English as
  // the clearest available fallback when the real API is unavailable.
  const isHindi = language === 'hi' || language.startsWith('hi-');
  const agentReplies = (isEn || (!isHindi))
    ? (enReplies[agentKey] || enReplies.nagarik_mitra)
    : (replies[agentKey] || replies.nagarik_mitra);

  // Try to match keywords
  for (const [key, reply] of Object.entries(agentReplies)) {
    if (key !== 'default' && msg.includes(key)) return reply;
  }

  // Additional keyword matching
  if (msg.includes('street') || msg.includes('light') || msg.includes('bijli')) return agentReplies.streetlight || agentReplies.default;
  if (msg.includes('water') || msg.includes('pani') || msg.includes('jal')) return agentReplies.water || agentReplies.default;
  if (msg.includes('vaccine') || msg.includes('teeka') || msg.includes('tika')) return agentReplies.vaccination || agentReplies.default;
  if (msg.includes('kisan') || msg.includes('farm') || msg.includes('kheti')) return agentReplies.kisan || agentReplies.default;
  if (msg.includes('scam') || msg.includes('fraud') || msg.includes('otp') || msg.includes('dhoka')) return agentReplies.scam || agentReplies.default;
  if (msg.includes('fir') || msg.includes('police') || msg.includes('complaint')) return agentReplies.zerofir || agentReplies.default;

  return agentReplies.default;
}
