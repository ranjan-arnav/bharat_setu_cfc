import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import ModelClient, { isUnexpected } from '@/lib/gemini-adapter';
import { AzureKeyCredential } from '@/lib/gemini-adapter';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ward = searchParams.get('ward') || 'all';

    // In a real app, we would fetch cases from the database here.
    // For now, we simulate pulling the latest 200 cases for analysis.
    const fakeCasesString = "120 Water Dept cases in Ward 14, 80 PWD cases in Ward 5, 40 Sanitation cases in Ward 22.";

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      console.warn('No GITHUB_TOKEN, returning fallback intelligence data.');
      return NextResponse.json({
        hotspots: [
          { location: 'Sector 3, Baharpur', ward: 'Ward 14', category: 'Water Supply', count: 47, severity: 'critical', trend: 'rising' },
          { location: 'NH-44 Highway Zone', ward: 'Ward 5', category: 'Road Infrastructure', count: 35, severity: 'high', trend: 'stable' }
        ],
        predictions: [
          { area: 'Ward 14, Sector 3', category: 'Water Crisis', probability: 87, timeframe: 'Next 2 weeks', reasoning: 'Fallbacks active', icon: 'water_drop', color: '#EF4444' }
        ]
      });
    }

    const client = ModelClient('https://models.inference.ai.azure.com', new AzureKeyCredential(token));

    const prompt = `You are the Civic Intelligence Engine for Bharat Setu.
Based on the following aggregated case data: "${fakeCasesString}" (Target Ward: ${ward})

Generate an intelligence briefing containing:
1. 'hotspots': Array of objects { location, ward, category, count, severity ('critical'|'high'|'medium'), trend ('rising'|'stable'|'declining') }
2. 'predictions': Array of objects { area, category, probability (0-100), timeframe, reasoning, icon, color }

Rules:
- Generate 3 engaging, realistic hotspots.
- Generate 2 realistic predictions based on the hotspots.
- Choose icons from Material Symbols (e.g., 'water_drop', 'coronavirus', 'add_road').
- Colors should be HEX codes like '#EF4444', '#F59E0B'.
- Output MUST be valid JSON strictly matching the structure above.`;

    const response = await client.path('/chat/completions').post({
      body: {
        messages: [{ role: 'system', content: prompt }],
        model: 'gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 800,
        response_format: { type: 'json_object' }
      }
    });

    if (response.status !== '200') {
      throw new Error(`Model API error: ${(response.body as any).error?.message || response.status}`);
    }

    const resultText = (response.body as any).choices[0].message.content;
    const resultObj = JSON.parse(resultText);

    return NextResponse.json(resultObj);

  } catch (error: any) {
    console.error('Intelligence Engine Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate intelligence', details: error.message },
      { status: 500 }
    );
  }
}
