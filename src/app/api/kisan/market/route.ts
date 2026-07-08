import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { geminiConfig, getGeminiApiKey } from '@/lib/gemini-config';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query') || '';
    const state = searchParams.get('state') || 'India';

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return NextResponse.json({ prices: getStaticFallback(state) });
    }

    const searchClause = query ? `The user is searching for "${query}". Only include crops/commodities matching that query.` : '';

    const prompt = `You are a mandi price data API for India. Generate realistic current wholesale mandi prices for the region: "${state}".
${searchClause}

Return ONLY a JSON array with 5-8 items. Each item must have:
- id: unique string
- name: crop/commodity name  
- price: realistic wholesale price in INR per quintal
- change: percentage change from yesterday (can be negative)
- trend: "up" or "down"
- unit: "quintal"
- market: a real mandi/APMC name in or near ${state}
- state: the state the mandi is in

Use REAL mandi names from India (like "Azadpur Mandi", "Vashi APMC", "Yeshwanthpur APMC", etc).
Use realistic 2025-2026 Indian wholesale prices.
Return ONLY valid JSON array, no markdown.`;

    const modelName = geminiConfig.model || 'gemini-2.5-flash';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: 'application/json',
        }
      })
    });

    if (!response.ok) {
      console.error('AI mandi price generation failed:', response.status);
      return NextResponse.json({ prices: getStaticFallback(state) });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

    try {
      // Extract JSON from response
      const jsonStart = text.indexOf('[');
      const jsonEnd = text.lastIndexOf(']') + 1;
      if (jsonStart === -1 || jsonEnd <= jsonStart) throw new Error('No JSON array');
      
      const parsed = JSON.parse(text.substring(jsonStart, jsonEnd));
      const prices = parsed.map((item: { id?: string; name?: string; price?: number | string; change?: number | string; trend?: 'up' | 'down'; unit?: string; market?: string; state?: string }, idx: number) => ({
        id: item.id || String(idx + 1),
        name: item.name || 'Unknown',
        price: Number(item.price) || 0,
        change: Number(item.change) || 0,
        trend: item.trend === 'down' ? 'down' : 'up',
        unit: item.unit || 'quintal',
        market: item.market || 'Local Mandi',
        state: item.state || state,
        lastUpdated: new Date(),
      }));

      return NextResponse.json({ prices });
    } catch (parseErr) {
      console.error('Failed to parse AI mandi response:', parseErr);
      return NextResponse.json({ prices: getStaticFallback(state) });
    }

  } catch (error) {
    console.error('Mandi prices error:', error);
    return NextResponse.json({ prices: getStaticFallback('India') });
  }
}

// Static fallback only if AI completely fails
function getStaticFallback(state: string) {
  return [
    { id: '1', name: 'Wheat', price: 2150, change: 5.2, trend: 'up', unit: 'quintal', market: 'Azadpur Mandi', state: state, lastUpdated: new Date() },
    { id: '2', name: 'Rice', price: 3400, change: -1.2, trend: 'down', unit: 'quintal', market: 'Karnal Mandi', state: 'Haryana', lastUpdated: new Date() },
    { id: '3', name: 'Tomato', price: 1800, change: 12.5, trend: 'up', unit: 'quintal', market: 'Vashi APMC', state: 'Maharashtra', lastUpdated: new Date() },
    { id: '4', name: 'Onion', price: 1600, change: -4.3, trend: 'down', unit: 'quintal', market: 'Lasalgaon APMC', state: 'Maharashtra', lastUpdated: new Date() },
    { id: '5', name: 'Potato', price: 1200, change: 2.1, trend: 'up', unit: 'quintal', market: 'Agra Mandi', state: 'Uttar Pradesh', lastUpdated: new Date() },
  ];
}
