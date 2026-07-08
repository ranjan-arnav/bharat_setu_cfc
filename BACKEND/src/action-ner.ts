export interface StructuredAction {
  issue?: string;
  location?: string;
  department?: string;
  person?: string;
  category: 'civic' | 'health' | 'legal' | 'finance' | 'scheme' | 'general';
  source: 'spacy' | 'fallback' | 'hybrid';
  confidence: number;
}

type NerResponse = {
  issue?: string;
  location?: string;
  department?: string;
  person?: string;
  category?: string;
  source?: 'spacy' | 'fallback' | 'hybrid';
  confidence?: number;
};

const REQUIRE_NER_SERVICE = (process.env.NER_SERVICE_REQUIRED || 'true').toLowerCase() !== 'false';

const ISSUE_KEYWORDS = [
  'streetlight',
  'pothole',
  'garbage',
  'drain',
  'sewage',
  'water',
  'pipeline',
  'electricity',
  'transformer',
  'road',
  'hospital',
  'ambulance',
  'fraud',
  'scam',
  'loan',
  'ration',
  'pension',
  'scholarship',
  'scheme',
  'complaint',
];

const CATEGORY_RULES: Array<{ category: StructuredAction['category']; terms: string[] }> = [
  { category: 'health', terms: ['hospital', 'doctor', 'ambulance', 'health', 'medical', 'clinic'] },
  { category: 'legal', terms: ['police', 'fir', 'court', 'legal', 'lawyer', 'cybercrime'] },
  { category: 'finance', terms: ['loan', 'bank', 'upi', 'fraud', 'scam', 'credit'] },
  { category: 'scheme', terms: ['scheme', 'yojana', 'pension', 'ration', 'scholarship', 'benefit'] },
  { category: 'civic', terms: ['streetlight', 'pothole', 'road', 'water', 'garbage', 'drain', 'sewage', 'electricity', 'municipal'] },
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWholeTerm(text: string, term: string): boolean {
  return new RegExp(`\\b${escapeRegex(term)}\\b`, 'i').test(text);
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function normalizeCategory(value: string | undefined, text: string): StructuredAction['category'] {
  const lowerValue = (value || '').toLowerCase().trim();
  if (lowerValue === 'health' || lowerValue === 'legal' || lowerValue === 'finance' || lowerValue === 'scheme' || lowerValue === 'civic' || lowerValue === 'general') {
    return lowerValue;
  }

  const source = `${text} ${lowerValue}`.toLowerCase();
  const found = CATEGORY_RULES.find((rule) => rule.terms.some((term) => hasWholeTerm(source, term)));
  return found?.category || 'general';
}

function inferDepartment(text: string): string | undefined {
  const value = text.toLowerCase();
  if (hasWholeTerm(value, 'streetlight') || hasWholeTerm(value, 'electricity') || hasWholeTerm(value, 'transformer')) {
    return 'Electrical Department';
  }
  if (hasWholeTerm(value, 'water') || hasWholeTerm(value, 'pipeline') || hasWholeTerm(value, 'sewage') || hasWholeTerm(value, 'drain')) {
    return 'Water and Drainage Department';
  }
  if (hasWholeTerm(value, 'road') || hasWholeTerm(value, 'pothole')) {
    return 'Public Works Department';
  }
  if (hasWholeTerm(value, 'garbage') || hasWholeTerm(value, 'sanitation') || hasWholeTerm(value, 'waste')) {
    return 'Sanitation Department';
  }
  if (hasWholeTerm(value, 'hospital') || hasWholeTerm(value, 'ambulance') || hasWholeTerm(value, 'health')) {
    return 'Health Department';
  }
  if (hasWholeTerm(value, 'police') || hasWholeTerm(value, 'fir') || hasWholeTerm(value, 'court')) {
    return 'Police and Legal Services';
  }
  return undefined;
}

function extractIssueFromText(text: string): string | undefined {
  const lower = text.toLowerCase();
  const direct = ISSUE_KEYWORDS.find((term) => hasWholeTerm(lower, term));
  if (direct) return direct;

  const issuePattern = /(?:issue|problem|complaint|regarding|about)\s+(?:of\s+)?([a-zA-Z\s]{3,40})/i;
  const match = text.match(issuePattern);
  if (!match?.[1]) return undefined;
  return match[1].trim().split(/\s+/).slice(0, 3).join(' ').toLowerCase();
}

function extractLocationFromText(text: string): string | undefined {
  const locationPatterns = [
    /\bin\s+([a-zA-Z][a-zA-Z\s]{1,30}?)(?=\s+(?:not|is|was|working|broken|with|due|because)\b|[,.!?]|$)/i,
    /\b(?:at|near|around|from)\s+([a-zA-Z][a-zA-Z\s]{1,30}?)(?=\s+(?:in|near|at|not|is|was|working|broken|with|due|because)\b|[,.!?]|$)/i,
    /\b(?:village|ward|district|sector|city|town)\s+([a-zA-Z0-9\-\s]{1,35})\b/i,
  ];

  for (const pattern of locationPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      let raw = match[1].trim().replace(/\s+(is|was|not|broken|working|issue)$/i, '').trim();
      if (/\sin\s/i.test(raw)) {
        raw = raw.split(/\sin\s/i).pop() || raw;
      }
      if (raw.length >= 2) return toTitleCase(raw);
    }
  }
  return undefined;
}

function fallbackExtraction(text: string): StructuredAction {
  const issue = extractIssueFromText(text);
  const location = extractLocationFromText(text);
  const department = inferDepartment(text);
  const category = normalizeCategory(undefined, `${text} ${issue || ''} ${department || ''}`);

  return {
    issue,
    location,
    department,
    category,
    source: 'fallback',
    confidence: [issue, location, department].filter(Boolean).length >= 2 ? 0.72 : 0.55,
  };
}

async function callSpacyService(text: string): Promise<NerResponse | null> {
  const endpoint = process.env.NER_SERVICE_URL?.trim() || 'http://127.0.0.1:5001/extract';
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) return null;
    const json = (await response.json()) as NerResponse;
    return json;
  } catch {
    return null;
  }
}

export async function extractStructuredAction(text: string): Promise<StructuredAction> {
  const clean = text.trim();
  if (!clean) return { category: 'general', source: 'fallback', confidence: 0.2 };

  const spacy = await callSpacyService(clean);

  if (!spacy && REQUIRE_NER_SERVICE) {
    const endpoint = process.env.NER_SERVICE_URL?.trim() || 'http://127.0.0.1:5001/extract';
    throw new Error(`NER service unavailable. Start the NER server and ensure ${endpoint} is reachable.`);
  }

  const fallback = fallbackExtraction(clean);

  const issue = (spacy?.issue || fallback.issue || '').trim() || undefined;
  const location = (spacy?.location || fallback.location || '').trim() || undefined;
  const department = (spacy?.department || fallback.department || '').trim() || undefined;
  const person = (spacy?.person || '').trim() || undefined;
  const category = normalizeCategory(spacy?.category, `${clean} ${issue || ''} ${department || ''}`);
  const usedSpacy = Boolean(spacy);
  const usedFallback = Boolean((!spacy?.issue && fallback.issue) || (!spacy?.location && fallback.location) || (!spacy?.department && fallback.department));
  const source: StructuredAction['source'] = usedSpacy && usedFallback ? 'hybrid' : usedSpacy ? 'spacy' : 'fallback';

  let confidence = typeof spacy?.confidence === 'number' && Number.isFinite(spacy.confidence)
    ? Math.max(0, Math.min(1, spacy.confidence))
    : fallback.confidence;

  const signalCount = [issue, location, department, person].filter(Boolean).length;
  if (!usedSpacy) {
    confidence = Math.min(0.85, fallback.confidence + signalCount * 0.06);
  } else if (source === 'hybrid') {
    confidence = Math.min(0.92, confidence + 0.05);
  }

  return {
    issue,
    location,
    department,
    person,
    category,
    source,
    confidence: Number(confidence.toFixed(2)),
  };
}
