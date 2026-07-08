import { getBackendContainer } from '@/lib/cosmos-backend';

type AgentKey =
  | 'nagarik_mitra'
  | 'swasthya_sahayak'
  | 'yojana_saathi'
  | 'arthik_salahkar'
  | 'vidhi_sahayak'
  | 'kisan_mitra';

type SourceType = 'grievance' | 'chat_summary';

type SentimentResult = {
  sentiment: string;
  positive: number;
  neutral: number;
  negative: number;
};

type EntityResult = {
  text: string;
  category: string;
  confidenceScore: number;
};

type RoutingHint = {
  agentKey: AgentKey;
  confidence: number;
  reasons: string[];
};

export type LanguageEnrichmentSummary = {
  id: string;
  sentiment: SentimentResult;
  keyPhrases: string[];
  entities: EntityResult[];
  riskScore: number;
  trustScore: number;
  routingHint: RoutingHint | null;
  sourceType: SourceType;
};

type AnalyzeOptions = {
  text: string;
  sourceType: SourceType;
  userId?: string;
  sessionId?: string;
  caseId?: string;
  language?: string;
  metadata?: Record<string, string | number | boolean | undefined>;
};

type TextAnalyticsResponse<T> = {
  documents?: T[];
  errors?: Array<{ id: string; error: { code: string; message: string } }>;
};

type SentimentDocument = {
  id: string;
  sentiment?: string;
  confidenceScores?: { positive?: number; neutral?: number; negative?: number };
};

type EntityDocument = {
  id: string;
  entities?: Array<{ text?: string; category?: string; confidenceScore?: number }>;
};

type KeyPhraseDocument = {
  id: string;
  keyPhrases?: string[];
};

const ROUTING_RULES: Array<{ agentKey: AgentKey; pattern: RegExp; reason: string }> = [
  {
    agentKey: 'swasthya_sahayak',
    pattern: /hospital|doctor|medicine|medical|fever|pain|health|ambulance|clinic|treatment|symptom/i,
    reason: 'health keywords',
  },
  {
    agentKey: 'vidhi_sahayak',
    pattern: /police|fir|court|law|legal|lawyer|harassment|violence|threat|abuse|rights/i,
    reason: 'legal and safety keywords',
  },
  {
    agentKey: 'arthik_salahkar',
    pattern: /loan|bank|upi|fraud|scam|money|credit|debt|finance|otp|transaction/i,
    reason: 'finance keywords',
  },
  {
    agentKey: 'yojana_saathi',
    pattern: /scheme|subsidy|pension|ration|benefit|eligibility|pm-kisan|ayushman|mgnrega|yojana/i,
    reason: 'scheme keywords',
  },
  {
    agentKey: 'nagarik_mitra',
    pattern: /road|water|electricity|streetlight|garbage|sewage|drain|municipal|civic|sanitation/i,
    reason: 'civic infrastructure keywords',
  },
  {
    agentKey: 'kisan_mitra',
    pattern: /crop|farmer|farming|mandi|seed|tractor|fertilizer|harvest|soil|pesticide|kisan/i,
    reason: 'agricultural keywords',
  },
];

const RISK_TERMS =
  /emergency|urgent|threat|violence|abuse|accident|attack|fraud|scam|critical|harassment|unsafe|danger/i;

function languageConfig() {
  const endpoint =
    process.env.AZURE_LANGUAGE_ENDPOINT?.trim() ||
    process.env.AZURE_TEXT_ANALYTICS_ENDPOINT?.trim() ||
    '';
  const key =
    process.env.AZURE_LANGUAGE_KEY?.trim() ||
    process.env.AZURE_TEXT_ANALYTICS_KEY?.trim() ||
    '';
  const region = process.env.AZURE_LANGUAGE_REGION?.trim() || '';

  return { endpoint, key, region };
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
}

function normalizeLanguage(language?: string): string | undefined {
  if (!language) return undefined;
  const normalized = language.trim().toLowerCase();
  if (!normalized) return undefined;
  return normalized.includes('-') ? normalized.split('-')[0] : normalized;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function compactText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 5000);
}

async function runAnalysis<T>(
  endpoint: string,
  key: string,
  region: string,
  path: string,
  text: string,
  language?: string
): Promise<TextAnalyticsResponse<T> | null> {
  const body: {
    documents: Array<{ id: string; text: string; language?: string }>;
  } = {
    documents: [{ id: '1', text }],
  };

  if (language) {
    body.documents[0].language = language;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Ocp-Apim-Subscription-Key': key,
  };

  if (region) {
    headers['Ocp-Apim-Subscription-Region'] = region;
  }

  try {
    const response = await fetch(`${endpoint}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[Language] API ${path} failed (${response.status}):`, errorText.slice(0, 160));
      return null;
    }

    return (await response.json()) as TextAnalyticsResponse<T>;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[Language] API ${path} unavailable:`, errorMessage);
    return null;
  }
}

function deriveRoutingHint(text: string, keyPhrases: string[]): RoutingHint | null {
  const source = `${text} ${keyPhrases.join(' ')}`;
  const matchedRules = ROUTING_RULES.filter((rule) => rule.pattern.test(source));

  if (!matchedRules.length) {
    return null;
  }

  const scoreByAgent = new Map<AgentKey, { count: number; reasons: string[] }>();
  for (const rule of matchedRules) {
    const existing = scoreByAgent.get(rule.agentKey) || { count: 0, reasons: [] };
    existing.count += 1;
    existing.reasons.push(rule.reason);
    scoreByAgent.set(rule.agentKey, existing);
  }

  const sorted = Array.from(scoreByAgent.entries()).sort((a, b) => b[1].count - a[1].count);
  const [agentKey, details] = sorted[0];
  const confidence = clamp(0.55 + details.count * 0.12, 0.55, 0.92);

  return {
    agentKey,
    confidence: Number(confidence.toFixed(2)),
    reasons: details.reasons.slice(0, 3),
  };
}

function deriveRiskTrust(
  sentiment: SentimentResult,
  text: string,
  sourceType: SourceType,
  routingHint: RoutingHint | null
) {
  let riskScore = 20;

  if (sentiment.negative >= 0.55) riskScore += 30;
  if (sentiment.negative >= 0.75) riskScore += 15;
  if (RISK_TERMS.test(text)) riskScore += 25;
  if (sourceType === 'grievance') riskScore += 10;
  if (routingHint?.agentKey === 'vidhi_sahayak' || routingHint?.agentKey === 'arthik_salahkar') {
    riskScore += 8;
  }

  riskScore = clamp(riskScore, 5, 100);

  let trustScore = 90 - riskScore * 0.6 + sentiment.positive * 12 + sentiment.neutral * 8;
  trustScore = clamp(trustScore, 5, 99);

  return {
    riskScore: Number(riskScore.toFixed(1)),
    trustScore: Number(trustScore.toFixed(1)),
  };
}

async function persistEnrichment(summary: LanguageEnrichmentSummary, options: AnalyzeOptions) {
  const container = await getBackendContainer('enrichments');
  if (!container) return;

  const item = {
    id: summary.id,
    type: 'languageEnrichment',
    userId: options.userId?.trim() || 'anonymous',
    sessionId: options.sessionId || undefined,
    caseId: options.caseId || undefined,
    sourceType: options.sourceType,
    language: normalizeLanguage(options.language) || undefined,
    textPreview: compactText(options.text).slice(0, 280),
    sentiment: summary.sentiment,
    keyPhrases: summary.keyPhrases,
    entities: summary.entities,
    routingHint: summary.routingHint,
    riskScore: summary.riskScore,
    trustScore: summary.trustScore,
    metadata: options.metadata || undefined,
    createdAt: Date.now(),
  };

  try {
    await container.items.create(item);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('[Language] Failed to persist enrichment:', errorMessage);
  }
}

export async function analyzeAndPersistLanguageEnrichment(
  options: AnalyzeOptions
): Promise<LanguageEnrichmentSummary | null> {
  const text = compactText(options.text);
  if (!text) return null;

  const { endpoint: rawEndpoint, key, region } = languageConfig();
  if (!rawEndpoint || !key) {
    return null;
  }

  const endpoint = normalizeEndpoint(rawEndpoint);
  const language = normalizeLanguage(options.language);

  const [sentimentResponse, entitiesResponse, keyPhraseResponse] = await Promise.all([
    runAnalysis<SentimentDocument>(
      endpoint,
      key,
      region,
      '/text/analytics/v3.2/sentiment',
      text,
      language
    ),
    runAnalysis<EntityDocument>(
      endpoint,
      key,
      region,
      '/text/analytics/v3.2/entities/recognition/general',
      text,
      language
    ),
    runAnalysis<KeyPhraseDocument>(
      endpoint,
      key,
      region,
      '/text/analytics/v3.2/keyPhrases',
      text,
      language
    ),
  ]);

  const sentimentDoc = sentimentResponse?.documents?.[0];
  const entitiesDoc = entitiesResponse?.documents?.[0];
  const keyPhraseDoc = keyPhraseResponse?.documents?.[0];

  const sentiment: SentimentResult = {
    sentiment: sentimentDoc?.sentiment || 'unknown',
    positive: Number((sentimentDoc?.confidenceScores?.positive ?? 0).toFixed(3)),
    neutral: Number((sentimentDoc?.confidenceScores?.neutral ?? 0).toFixed(3)),
    negative: Number((sentimentDoc?.confidenceScores?.negative ?? 0).toFixed(3)),
  };

  const entities: EntityResult[] = (entitiesDoc?.entities || [])
    .map((entity) => ({
      text: entity.text || '',
      category: entity.category || 'unknown',
      confidenceScore: Number((entity.confidenceScore ?? 0).toFixed(3)),
    }))
    .filter((entity) => entity.text)
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, 8);

  const keyPhrases = (keyPhraseDoc?.keyPhrases || []).slice(0, 12);
  const routingHint = deriveRoutingHint(text, keyPhrases);
  const { riskScore, trustScore } = deriveRiskTrust(sentiment, text, options.sourceType, routingHint);

  const summary: LanguageEnrichmentSummary = {
    id: `enr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sentiment,
    keyPhrases,
    entities,
    riskScore,
    trustScore,
    routingHint,
    sourceType: options.sourceType,
  };

  await persistEnrichment(summary, options);
  return summary;
}
