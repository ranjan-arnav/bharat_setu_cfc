import { NextResponse } from 'next/server';
import { geminiConfig, getGeminiApiKey } from '@/lib/gemini-config';

interface TriageRequest {
  cases: {
    id: string;
    title: string;
    description: string;
    category: string;
  }[];
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as TriageRequest;
    const { cases } = body;

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      console.warn('No Gemini API key configured, returning fallback triage data.');
      return NextResponse.json({
        updates: cases.map(c => ({
          id: c.id,
          priority: 'high',
          reasoning: 'Fallback mode active'
        }))
      });
    }

    const prompt = `You are an AI Triage assistant for the Bharat Setu Government Portal.
Analyze the following batch of citizen grievances and determine their priority ('critical', 'high', 'medium', 'low').

Cases to analyze:
${JSON.stringify(cases, null, 2)}

Rules for Priority:
- critical: Immediate threat to life, major public safety hazard, SOS, severe disaster.
- high: Major utility disruption (water, power), large potholes on main roads, disease outbreaks.
- medium: Scheme issues, card issues, minor streetlight outages, general complaints.
- low: Information requests, feedback, minor aesthetic issues.

Output MUST be valid JSON strictly matching the structure:
{
  "updates": [
    {
      "id": "case_id",
      "priority": "critical | high | medium | low",
      "reasoning": "A short 1-sentence explanation"
    }
  ]
}`;

    const modelName = geminiConfig.model || 'gemini-2.5-flash';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const result = await response.json();
    const resultText = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const resultObj = JSON.parse(resultText);

    return NextResponse.json(resultObj);

  } catch (error: any) {
    console.error('Triage Analysis Error:', error);
    return NextResponse.json(
      { error: 'Failed to run triage analysis', details: error.message },
      { status: 500 }
    );
  }
}
