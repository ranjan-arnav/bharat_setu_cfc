import { NextRequest, NextResponse } from 'next/server';
import { geminiConfig, getGeminiApiKey } from '@/lib/gemini-config';

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, prompt, lang, location } = await request.json();

    const aiPrompt = `${prompt}
    
Location: ${location}

Analyze the provided image and symptoms, and generate the required diagnosis JSON in ${lang} language.`;

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    const modelName = geminiConfig.model || 'gemini-2.5-flash';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: imageBase64,
              }
            },
            {
              text: aiPrompt,
            }
          ]
        }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json',
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', errText);
      return NextResponse.json({ error: 'Failed to generate diagnosis' }, { status: 500 });
    }

    const result = await response.json();
    const resultText = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    return NextResponse.json({ result: resultText });
  } catch (error) {
    console.error('Diagnosis error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
