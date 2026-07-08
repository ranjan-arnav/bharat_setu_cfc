import { NextRequest, NextResponse } from 'next/server';
import { geminiConfig, getGeminiApiKey } from '@/lib/gemini-config';

export async function POST(request: NextRequest) {
  try {
    const { soil, location, season, lang } = await request.json();

    const prompt = `You are an expert agricultural AI in India. Provide crop recommendations for the following parameters:
- Soil: ${soil}
- Location: ${location}
- Season & Water: ${season}
Language: ${lang}

Return ONLY a JSON array of objects with the following schema:
[
  {
    "crop_name": "string",
    "yield": "string",
    "water": "string",
    "conditions": "string",
    "market": "string",
    "duration": "string",
    "investment": "string"
  }
]`;

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    const modelName = geminiConfig.model || 'gemini-2.5-flash';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: 'application/json',
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', errText);
      return NextResponse.json({ error: 'Failed to generate recommendation' }, { status: 500 });
    }

    const result = await response.json();
    const resultText = result.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    
    return NextResponse.json({ result: resultText });
  } catch (error) {
    console.error('Recommend error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
