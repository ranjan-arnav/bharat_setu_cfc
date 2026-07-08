import { NextRequest, NextResponse } from 'next/server';
import { geminiConfig, getGeminiApiKey } from '@/lib/gemini-config';

export async function POST(request: NextRequest) {
  try {
    const { originCity, destinationCities } = await request.json();

    const prompt = `Calculate approximate road distance in kilometers from ${originCity}, India to each of these Indian cities. Return ONLY a JSON object like {"City1": 100, "City2": 200}. Cities: ${destinationCities.join(', ')}`;

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
          temperature: 0.1,
          responseMimeType: 'application/json',
        }
      })
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to generate distances' }, { status: 500 });
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    return NextResponse.json({ result: resultText });
  } catch (error) {
    console.error('Distance error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
