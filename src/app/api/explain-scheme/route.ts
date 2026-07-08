import { NextRequest, NextResponse } from 'next/server';
import { getGeminiApiKey, geminiConfig } from '@/lib/gemini-config';

const LANGUAGE_NAMES: Record<string, string> = {
  'hi': 'Hindi (हिंदी)', 'en': 'English', 'bn': 'Bengali (বাংলা)', 
  'te': 'Telugu (తెలుగు)', 'mr': 'Marathi (मराठी)', 'ta': 'Tamil (தமிழ்)',
  'gu': 'Gujarati (ગુજરાતી)', 'kn': 'Kannada (ಕನ್ನಡ)', 'ml': 'Malayalam (മലയാളം)', 
  'pa': 'Punjabi (ਪੰਜਾਬੀ)', 'or': 'Odia (ଓଡ଼ିଆ)', 'ur': 'Urdu'
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { schemeName, description, benefits, docsNeeded = [], lang } = body;
    
    const shortLang = (lang || 'hi').split('-')[0];
    const langName = LANGUAGE_NAMES[shortLang] || LANGUAGE_NAMES['hi'];

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return NextResponse.json({ 
        script: `This is the ${schemeName} scheme. ${benefits}. You need ${docsNeeded.join(', ')}.` 
      });
    }

    const prompt = `You are "Yojana Saathi", a very helpful government scheme assistant for rural Indian citizens.
You are speaking out loud to a citizen to explain a government scheme to them.

Here is the data about the scheme:
- Name: ${schemeName}
- Description: ${description}
- Benefits: ${benefits}
- Required Documents: ${docsNeeded.join(', ')}

Task:
Write a friendly, very simple, and conversational script explaining this scheme to the citizen.
1. Explain the benefits in simple detail, so they fully understand how it helps them.
2. Tell them exactly what documents they need to prepare.
3. Finish by telling them "Yojana Saathi can help you apply for this scheme automatically, just click the button below."

Rules:
- You MUST write the final output in the language: ${langName}.
- Do NOT use English unless you are translating a specific scheme name that cannot be translated.
- Do NOT use complex legal jargon. Explain it like you are talking to a friend or elder.
- Output ONLY the text to be spoken. No markdown, no bullet points, no asterisks, no "Yojana Saathi: " prefixes. Just plain spoken words.`;

    const modelName = geminiConfig.model || 'gemini-2.5-flash';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.5,
        }
      })
    });

    let script = `This is the ${schemeName} scheme. ${benefits}. You need ${docsNeeded.join(', ')}.`;
    
    if (response.ok) {
      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        script = text.trim();
      }
    }

    return NextResponse.json({ script });

  } catch (error: unknown) {
    console.error('Explain Scheme Error:', error);
    return NextResponse.json({ error: 'Internal server error processing scheme explanation' }, { status: 500 });
  }
}
