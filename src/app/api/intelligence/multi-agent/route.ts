import { NextRequest, NextResponse } from 'next/server';
import ModelClient, { isUnexpected } from '@/lib/gemini-adapter';
import { AzureKeyCredential } from '@/lib/gemini-adapter';
import type { AgentKey } from '@/lib/store';
import { AGENT_LABELS } from '@/lib/intelligence';

const PHI_MODEL = "microsoft/Phi-4";
const GITHUB_MODELS_ENDPOINT = "https://models.github.ai/inference";

const PHI_MULTI_AGENT_SYSTEM = `You are an AI intelligence router for the Indian government's Bharat Setu app.
Your job is to analyze a citizen's query and determine if it requires collaboration across MULTIPLE distinct government departments/agents.

The available agents are:
- nagarik_mitra: Civic issues (roads, water, electricity, garbage, municipality)
- swasthya_sahayak: Health & Medical (illness, hospitals, medicines, vaccines, Ayushman)
- yojana_saathi: Government Schemes (PM-KISAN, rations, housing, subsidies, MGNREGA)
- arthik_salahkar: Finance & Banking (bank accounts, UPI fraud, loans, insurance)
- vidhi_sahayak: Legal & Rights (police, FIRs, courts, disputes, domestic violence, consumer rights)

RULES:
1. ONLY return multiple agents if the query explicitly spans multiple domains.
2. For example: "Hospital refused treatment and I need legal help" -> Health (swasthya_sahayak) AND Legal (vidhi_sahayak).
3. If the query belongs to only ONE domain, return "NONE".
4. You must output ONLY a valid JSON array of objects. No markdown formatting, no code blocks, no explanation. Just the raw JSON array.

Format your output exactly like this example if multiple domains are detected:
[
  {"agent": "swasthya_sahayak", "confidence": 95, "reason": "Hospital refused treatment"},
  {"agent": "vidhi_sahayak", "confidence": 90, "reason": "User is asking for legal help"}
]

If only one domain is detected, output:
[]`;

export async function POST(request: NextRequest) {
  try {
    const { text, currentAgent } = await request.json();
    if (!text || text.length < 10) return NextResponse.json({ isMultiAgent: false });

    const token = process.env["GITHUB_TOKEN_PHI"] || process.env["GITHUB_TOKEN"] || '';
    if (!token) {
      console.warn('No GitHub token found for Phi multi-agent detection');
      return NextResponse.json({ isMultiAgent: false });
    }

    const client = ModelClient(GITHUB_MODELS_ENDPOINT, new AzureKeyCredential(token));
    const userPrompt = `Citizen Query: "${text}"\nCurrent Primary Agent handling this: ${currentAgent}\n\nAnalyze if THIS specific query requires experts from other domains to collaborate. Reply with pure JSON only.`;

    const res = await client.path('/chat/completions').post({
      body: {
        model: PHI_MODEL,
        messages: [
          { role: 'system', content: PHI_MULTI_AGENT_SYSTEM },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 150,
        temperature: 0.1,
      },
    });

    if (isUnexpected(res)) {
      console.error('[MULTI-AGENT] API Error:', res.body.error);
      return NextResponse.json({ isMultiAgent: false });
    }

    let raw = ((res.body.choices as Array<{ message: { content: string } }>)?.[0]?.message?.content || '').trim();
    // Remove markdown code blocks if Phi hallucinates them
    raw = raw.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 1) { // Needs at least 2 agents to be "multi-agent"
        // Ensure the current agent is included if it's relevant, or format the detected ones
        const consulted = parsed
          .filter(p => ['nagarik_mitra', 'swasthya_sahayak', 'yojana_saathi', 'arthik_salahkar', 'vidhi_sahayak'].includes(p.agent))
          .map(p => ({
            agent: p.agent as AgentKey,
            label: AGENT_LABELS[p.agent as AgentKey] || p.agent,
            reason: p.reason,
            confidence: p.confidence
          }));

        if (consulted.length > 1) {
          console.log(`[MULTI-AGENT] Phi detected collaboration for:`, text.slice(0, 50));
          return NextResponse.json({
            isMultiAgent: true,
            primary: currentAgent,
            consulted
          });
        }
      }
    } catch {
      console.warn(`[MULTI-AGENT] Failed to parse Phi output: ${raw}`);
    }

    return NextResponse.json({ isMultiAgent: false });

  } catch (error) {
    console.error('[MULTI-AGENT] Exception:', error);
    return NextResponse.json({ isMultiAgent: false }, { status: 500 });
  }
}
