// gemini-rag.ts - RAG utility for Gemini
// Note: Azure Search was removed as requested.

export type RagCitation = {
  id: string;
  title: string;
  snippet: string;
  url?: string;
  score: number;
};

export type GroundedAnswerResult = {
  answer: string;
  confidence: number;
  usedFallback: boolean;
  citations: RagCitation[];
  source: 'demo';
};

function fallbackAnswer(language?: string): string {
  const normalized = (language || '').toLowerCase();
  if (normalized.startsWith('hi')) {
    return 'मुझे पक्की जानकारी नहीं मिली। कृपया आधिकारिक पोर्टल या स्थानीय अधिकारी से पुष्टि करें।';
  }
  return "I’m not sure based on available records. Please verify on the official government portal or with your local office.";
}

export function shouldUseGroundedRag(query: string, agentKey?: string): boolean {
  const byAgent = agentKey === 'yojana_saathi' || agentKey === 'vidhi_sahayak' || agentKey === 'nagarik_mitra';
  if (byAgent) return true;

  return /(scheme|yojana|pension|subsidy|benefit|eligibility|ration|card|legal|fir|rights|law|complaint|application|deadline|document)/i.test(
    query
  );
}

export async function retrieveAndRerank(
  query: string,
  options?: {
    top?: number;
    filters?: Record<string, unknown>;
  }
): Promise<{ citations: RagCitation[]; source: 'demo' }> {
  // Azure Search was removed. In a real scenario, this would query a vector DB.
  return { citations: [], source: 'demo' };
}

export async function buildGroundedAnswer(
  query: string,
  options?: {
    language?: string;
    top?: number;
    filters?: Record<string, unknown>;
  }
): Promise<GroundedAnswerResult> {
  const retrieval = await retrieveAndRerank(query, options);
  const citations = retrieval.citations;

  if (!citations.length) {
    return {
      answer: fallbackAnswer(options?.language),
      confidence: 0,
      usedFallback: true,
      citations: [],
      source: retrieval.source,
    };
  }

  return {
    answer: fallbackAnswer(options?.language),
    confidence: 0,
    usedFallback: true,
    citations: citations,
    source: retrieval.source,
  };
}
