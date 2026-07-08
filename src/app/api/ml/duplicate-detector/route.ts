import { NextResponse } from 'next/server';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TF-IDF COSINE SIMILARITY DUPLICATE DETECTOR
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Algorithm:
 * 1. Tokenize case titles + descriptions → bag of words
 * 2. Compute Term Frequency (TF) per document
 * 3. Compute Inverse Document Frequency (IDF) across corpus
 * 4. Build TF-IDF vectors for each document
 * 5. Compute pairwise cosine similarity matrix
 * 6. Cluster cases with similarity > threshold (0.65)
 * 
 * Pure math — zero dependencies.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Tokenizer ────────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 'in', 'with',
  'to', 'for', 'of', 'not', 'no', 'has', 'have', 'had', 'was', 'were', 'been',
  'be', 'are', 'it', 'its', 'this', 'that', 'from', 'by', 'as', 'can', 'do',
  'my', 'our', 'your', 'their', 'i', 'we', 'they', 'he', 'she', 'me', 'him', 'her',
  'near', 'area', 'please', 'since', 'very', 'there', 'still', 'issue', 'problem',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

// ── TF ───────────────────────────────────────────────────────────────────
function termFrequency(tokens: string[]): Record<string, number> {
  const tf: Record<string, number> = {};
  const total = tokens.length;
  for (const t of tokens) {
    tf[t] = (tf[t] || 0) + 1;
  }
  // Normalize
  for (const k in tf) {
    tf[k] = tf[k] / total;
  }
  return tf;
}

// ── IDF ──────────────────────────────────────────────────────────────────
function inverseDocumentFrequency(corpus: string[][]): Record<string, number> {
  const n = corpus.length;
  const df: Record<string, number> = {};

  for (const doc of corpus) {
    const unique = new Set(doc);
    for (const term of Array.from(unique)) {
      df[term] = (df[term] || 0) + 1;
    }
  }

  const idf: Record<string, number> = {};
  for (const term in df) {
    idf[term] = Math.log(n / (1 + df[term])) + 1; // smoothed IDF
  }

  return idf;
}

// ── TF-IDF Vector ────────────────────────────────────────────────────────
function tfidfVector(tf: Record<string, number>, idf: Record<string, number>, vocabulary: string[]): number[] {
  return vocabulary.map(term => (tf[term] || 0) * (idf[term] || 0));
}

// ── Cosine Similarity ───────────────────────────────────────────────────
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Clustering ───────────────────────────────────────────────────────────
function clusterDuplicates(
  cases: { id: string; text: string }[],
  threshold: number = 0.65
): { clusterId: number; cases: { id: string; text: string }[]; avgSimilarity: number }[] {
  // Step 1: Tokenize all documents
  const corpus = cases.map(c => tokenize(c.text));

  // Step 2: Compute IDF
  const idf = inverseDocumentFrequency(corpus);

  // Step 3: Build vocabulary (all unique terms)
  const vocabulary = Array.from(new Set(corpus.flat()));

  // Step 4: Compute TF-IDF vectors
  const tfs = corpus.map(doc => termFrequency(doc));
  const vectors = tfs.map(tf => tfidfVector(tf, idf, vocabulary));

  // Step 5: Pairwise cosine similarity
  const n = cases.length;
  const simMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = cosineSimilarity(vectors[i], vectors[j]);
      simMatrix[i][j] = sim;
      simMatrix[j][i] = sim;
    }
  }

  // Step 6: Simple connected-component clustering
  const visited = new Set<number>();
  const clusters: { clusterId: number; cases: { id: string; text: string }[]; avgSimilarity: number }[] = [];
  let clusterId = 0;

  for (let i = 0; i < n; i++) {
    if (visited.has(i)) continue;

    const members = [i];
    visited.add(i);
    const queue = [i];

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (let j = 0; j < n; j++) {
        if (!visited.has(j) && simMatrix[current][j] >= threshold) {
          members.push(j);
          visited.add(j);
          queue.push(j);
        }
      }
    }

    if (members.length >= 2) {
      // Compute average similarity within cluster
      let totalSim = 0;
      let pairCount = 0;
      for (let a = 0; a < members.length; a++) {
        for (let b = a + 1; b < members.length; b++) {
          totalSim += simMatrix[members[a]][members[b]];
          pairCount++;
        }
      }

      clusters.push({
        clusterId: clusterId++,
        cases: members.map(idx => cases[idx]),
        avgSimilarity: pairCount > 0 ? Math.round((totalSim / pairCount) * 1000) / 1000 : 0,
      });
    }
  }

  return clusters.sort((a, b) => b.cases.length - a.cases.length);
}

// ── Mock Cases ───────────────────────────────────────────────────────────
const MOCK_CASES = [
  { id: 'GRV-2026-0001', text: 'Water leaking from broken pipe near main road Ward 3 flooding the street with dirty water' },
  { id: 'GRV-2026-0002', text: 'Burst water pipe on main road Ward 3 causing water logging and dirty water everywhere' },
  { id: 'GRV-2026-0003', text: 'Water pipe burst in Ward 3 main road area dirty water flooding street' },
  { id: 'GRV-2026-0004', text: 'Streetlight not working in sector 5 making the road very dark and unsafe at night' },
  { id: 'GRV-2026-0005', text: 'Street lamp broken in sector 5 area very dark dangerous for pedestrians night time' },
  { id: 'GRV-2026-0006', text: 'Garbage dump overflowing near the primary school children exposed to bad smell and germs' },
  { id: 'GRV-2026-0007', text: 'Huge garbage pile next to school gate bad smell children getting sick waste not collected' },
  { id: 'GRV-2026-0008', text: 'Pothole on NH44 highway near ward 12 causing accidents motorcycles falling damaged vehicles' },
  { id: 'GRV-2026-0009', text: 'Large pothole on national highway 44 near ward 12 multiple accidents reported bikes falling' },
  { id: 'GRV-2026-0010', text: 'Power cut in residential colony ward 22 transformer blown since morning no electricity' },
  { id: 'GRV-2026-0011', text: 'Electricity outage ward 22 colony transformer burst no power supply since early morning' },
  { id: 'GRV-2026-0012', text: 'Sewage overflowing in market area ward 19 bad smell shops affected health hazard' },
  { id: 'GRV-2026-0013', text: 'Mosquito breeding in stagnant water ward 14 dengue cases increasing health department not responding' },
  { id: 'GRV-2026-0014', text: 'Standing water breeding mosquitoes ward 14 dengue outbreak health officials absent' },
  { id: 'GRV-2026-0015', text: 'Road construction blocking traffic ward 5 no diversion signs commuters stuck for hours daily' },
];

// ── API Route ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const customCases: { id: string; text: string }[] = body.cases || MOCK_CASES;
    const threshold = body.threshold || 0.65;

    const clusters = clusterDuplicates(customCases, threshold);

    // Build the full similarity matrix for the top pairs
    const corpus = customCases.map(c => tokenize(c.text));
    const idf = inverseDocumentFrequency(corpus);
    const vocabulary = Array.from(new Set(corpus.flat()));
    const vectors = corpus.map(doc => tfidfVector(termFrequency(doc), idf, vocabulary));

    // Find top similar pairs
    const topPairs: { case1: string; case2: string; similarity: number }[] = [];
    for (let i = 0; i < customCases.length; i++) {
      for (let j = i + 1; j < customCases.length; j++) {
        const sim = cosineSimilarity(vectors[i], vectors[j]);
        if (sim >= 0.4) {
          topPairs.push({
            case1: customCases[i].id,
            case2: customCases[j].id,
            similarity: Math.round(sim * 1000) / 1000,
          });
        }
      }
    }
    topPairs.sort((a, b) => b.similarity - a.similarity);

    return NextResponse.json({
      duplicateGroups: clusters.map(c => ({
        clusterId: c.clusterId,
        caseCount: c.cases.length,
        avgSimilarity: c.avgSimilarity,
        cases: c.cases.map(cc => ({
          id: cc.id,
          preview: cc.text.slice(0, 80) + (cc.text.length > 80 ? '...' : ''),
        })),
        suggestedMerge: c.cases[0].id, // first case as merge target
      })),
      topSimilarPairs: topPairs.slice(0, 10),
      stats: {
        totalCases: customCases.length,
        duplicateGroupCount: clusters.length,
        duplicateCaseCount: clusters.reduce((s, c) => s + c.cases.length, 0),
        duplicatePercentage: Math.round(
          (clusters.reduce((s, c) => s + c.cases.length, 0) / customCases.length) * 100
        ),
        threshold,
      },
      metadata: {
        algorithm: 'TF-IDF Vectorization + Cosine Similarity Matrix + Connected Component Clustering',
        vocabularySize: vocabulary.length,
        stopWordsRemoved: STOP_WORDS.size,
      },
    });
  } catch (error: any) {
    console.error('Duplicate Detector Error:', error);
    return NextResponse.json({ error: 'Duplicate detection failed', details: error.message }, { status: 500 });
  }
}
