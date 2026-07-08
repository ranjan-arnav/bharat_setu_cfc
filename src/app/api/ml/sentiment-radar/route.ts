import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import ModelClient, { isUnexpected } from '@/lib/gemini-adapter';
import { AzureKeyCredential } from '@/lib/gemini-adapter';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BATCH SENTIMENT RADAR — Multi-Signal NLP Pipeline
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * 1. Aggregates recent grievance descriptions
 * 2. LLM batch sentiment scoring with emotion tags
 * 3. Ward-level sentiment heatmap
 * 4. Trending keyword extraction
 * 5. Fallback: rule-based lexicon sentiment when LLM unavailable
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Lexicon-Based Sentiment (fallback) ───────────────────────────────────
const POSITIVE_WORDS = new Set([
  'good', 'great', 'fixed', 'resolved', 'thank', 'thanks', 'appreciate', 'happy',
  'excellent', 'improved', 'clean', 'working', 'restored', 'satisfied',
]);

const NEGATIVE_WORDS = new Set([
  'bad', 'worse', 'broken', 'damaged', 'dangerous', 'dirty', 'unsafe', 'corrupt',
  'delay', 'delayed', 'stuck', 'ignored', 'pathetic', 'terrible', 'horrible',
  'overflow', 'flooding', 'stinking', 'rotten', 'collapsed', 'failing', 'dead',
  'sick', 'disease', 'contaminated', 'pollution', 'hazard', 'risk', 'threat',
]);

const ANGER_WORDS = new Set(['angry', 'furious', 'outraged', 'incompetent', 'useless', 'disgust', 'shame', 'corrupt']);
const FEAR_WORDS = new Set(['dangerous', 'unsafe', 'scared', 'afraid', 'risk', 'hazard', 'threat', 'emergency']);
const HOPE_WORDS = new Set(['hope', 'please', 'request', 'kindly', 'help', 'expect', 'waiting', 'looking']);

function lexiconSentiment(text: string): { score: number; emotions: Record<string, number> } {
  const tokens = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
  let pos = 0;
  let neg = 0;
  const emotions: Record<string, number> = { anger: 0, fear: 0, hope: 0, satisfaction: 0, neutral: 0 };

  for (const token of tokens) {
    if (POSITIVE_WORDS.has(token)) pos++;
    if (NEGATIVE_WORDS.has(token)) neg++;
    if (ANGER_WORDS.has(token)) emotions.anger++;
    if (FEAR_WORDS.has(token)) emotions.fear++;
    if (HOPE_WORDS.has(token)) emotions.hope++;
  }

  const total = Math.max(1, pos + neg);
  const score = (pos - neg) / total; // -1 to +1

  // Satisfaction derived from positive score
  if (pos > neg) emotions.satisfaction = Math.min(1, pos / total);

  if (emotions.anger + emotions.fear + emotions.hope + emotions.satisfaction === 0) {
    emotions.neutral = 1;
  }

  return { score: Math.round(score * 100) / 100, emotions };
}

// ── Mock Grievance Data ──────────────────────────────────────────────────
const SAMPLE_GRIEVANCES = [
  { ward: 'Ward 3', text: 'Water pipe burst on main road causing flooding. Very dangerous for children walking to school. Please fix urgently!' },
  { ward: 'Ward 3', text: 'Dirty water coming from municipal supply. Family members getting sick. This is pathetic service.' },
  { ward: 'Ward 7', text: 'The garbage dump near my house has not been cleaned for 2 weeks. Horrible stinking smell. Rats everywhere.' },
  { ward: 'Ward 7', text: 'Thank you for fixing the streetlight in our area. Appreciate the quick response!' },
  { ward: 'Ward 12', text: 'Road is completely damaged after rain. Multiple potholes causing accidents. Bikes are falling daily.' },
  { ward: 'Ward 12', text: 'Power cut since morning. Transformer blown. No one is responding to complaints.' },
  { ward: 'Ward 5', text: 'Sewage overflow in market area. Shops are affected badly. Health hazard for customers.' },
  { ward: 'Ward 5', text: 'Construction debris blocking drain. Expecting flooding in monsoon. Very scared.' },
  { ward: 'Ward 14', text: 'Dengue cases increasing rapidly. Standing water everywhere. Health department is useless.' },
  { ward: 'Ward 14', text: 'Mosquito breeding in stagnant water near school. Children at risk. Please send fogging team.' },
  { ward: 'Ward 22', text: 'Electricity restored after 3 days. Finally working but voltage is still low.' },
  { ward: 'Ward 22', text: 'Transformer keeps blowing. Third time this month. Incompetent department.' },
  { ward: 'Ward 8', text: 'Good work on the new park in sector 4. Clean and well maintained. Thank you!' },
  { ward: 'Ward 8', text: 'Street sweeping is regular now. Appreciate the improvement in sanitation.' },
  { ward: 'Ward 19', text: 'Traffic congestion at main crossing is terrible. No traffic police. Risk of accidents.' },
  { ward: 'Ward 1', text: 'Water supply timing reduced to 1 hour. Not enough for family. Request increase.' },
];

// ── API Route ────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const token = process.env.GITHUB_TOKEN;
    let sentimentResults: { ward: string; text: string; score: number; emotions: Record<string, number> }[];
    let source = 'lexicon_fallback';

    if (token) {
      try {
        const client = ModelClient(
          'https://models.github.ai/inference',
          new AzureKeyCredential(token)
        );

        const batchText = SAMPLE_GRIEVANCES.map((g, i) => `[${i}] ${g.text}`).join('\n');

        const response = await client.path('/chat/completions').post({
          body: {
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `You are a sentiment analysis engine. Analyze each numbered grievance and return ONLY a JSON array. Each element: {"index": number, "score": number (-1 to 1), "emotions": {"anger": 0-1, "fear": 0-1, "hope": 0-1, "satisfaction": 0-1}}. Return ONLY the JSON array, no markdown.`
              },
              { role: 'user', content: batchText }
            ],
            temperature: 0.1,
            max_tokens: 1000,
          }
        });

        const result = response.body as any;
        const content = result.choices?.[0]?.message?.content || '';
        
        try {
          const parsed = JSON.parse(content.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
          if (Array.isArray(parsed)) {
            sentimentResults = SAMPLE_GRIEVANCES.map((g, i) => {
              const llmResult = parsed.find((p: any) => p.index === i);
              return {
                ward: g.ward,
                text: g.text,
                score: llmResult?.score ?? lexiconSentiment(g.text).score,
                emotions: llmResult?.emotions ?? lexiconSentiment(g.text).emotions,
              };
            });
            source = 'llm_batch_analysis';
          } else {
            throw new Error('Not array');
          }
        } catch {
          // LLM output parse failed — use lexicon
          sentimentResults = SAMPLE_GRIEVANCES.map(g => ({
            ward: g.ward,
            text: g.text,
            ...lexiconSentiment(g.text),
          }));
        }
      } catch {
        sentimentResults = SAMPLE_GRIEVANCES.map(g => ({
          ward: g.ward,
          text: g.text,
          ...lexiconSentiment(g.text),
        }));
      }
    } else {
      sentimentResults = SAMPLE_GRIEVANCES.map(g => ({
        ward: g.ward,
        text: g.text,
        ...lexiconSentiment(g.text),
      }));
    }

    // Aggregate by ward
    const wardMap: Record<string, { scores: number[]; emotions: Record<string, number> }> = {};
    for (const r of sentimentResults) {
      if (!wardMap[r.ward]) wardMap[r.ward] = { scores: [], emotions: { anger: 0, fear: 0, hope: 0, satisfaction: 0, neutral: 0 } };
      wardMap[r.ward].scores.push(r.score);
      for (const [k, v] of Object.entries(r.emotions)) {
        wardMap[r.ward].emotions[k] = (wardMap[r.ward].emotions[k] || 0) + v;
      }
    }

    const wardSentiments = Object.entries(wardMap).map(([ward, data]) => {
      const sortedEmotions = Object.entries(data.emotions).sort((a, b) => b[1] - a[1]);
      const dominantEmotion = (sortedEmotions[0][1] > 0) ? sortedEmotions[0][0] : 'neutral';
      
      return {
        ward,
        avgSentiment: Math.round((data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 100) / 100,
        sampleCount: data.scores.length,
        dominantEmotion,
        emotionBreakdown: data.emotions,
      };
    }).sort((a, b) => a.avgSentiment - b.avgSentiment);

    // Global sentiment
    const allScores = sentimentResults.map(r => r.score);
    const globalSentiment = Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 100) / 100;

    // Trending keywords
    const wordCount: Record<string, number> = {};
    for (const g of SAMPLE_GRIEVANCES) {
      const tokens = g.text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(t => t.length > 3);
      for (const t of tokens) {
        if (!['this', 'that', 'with', 'from', 'have', 'been', 'very', 'please', 'near', 'area'].includes(t)) {
          wordCount[t] = (wordCount[t] || 0) + 1;
        }
      }
    }
    const trending = Object.entries(wordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([word, count]) => ({ word, count }));

    return NextResponse.json({
      globalSentiment,
      sentimentLabel: globalSentiment > 0.2 ? 'Positive' : globalSentiment > -0.2 ? 'Mixed' : 'Negative',
      wardHeatmap: wardSentiments,
      trendingKeywords: trending,
      individualResults: sentimentResults.map(r => ({
        ward: r.ward,
        preview: r.text.slice(0, 60) + '...',
        score: r.score,
        dominantEmotion: Object.entries(r.emotions).sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral',
      })),
      source,
      metadata: {
        algorithm: source === 'llm_batch_analysis'
          ? 'GPT-4o-mini Batch Sentiment + Emotion Classification'
          : 'Lexicon-Based Sentiment (VADER-style) + Rule-Based Emotion Tags',
        sampleSize: SAMPLE_GRIEVANCES.length,
      },
    });
  } catch (error: any) {
    console.error('Sentiment Radar Error:', error);
    return NextResponse.json({ error: 'Sentiment analysis failed', details: error.message }, { status: 500 });
  }
}
