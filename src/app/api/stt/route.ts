import { NextRequest, NextResponse } from 'next/server';
import { geminiConfig, getGeminiApiKey } from '@/lib/gemini-config';

export const runtime = 'nodejs';

async function tryTranscribe(modelName: string, apiKey: string, mimeType: string, base64Audio: string, prompt: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Audio,
            }
          },
          {
            text: prompt,
          }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
      }
    })
  });
  return response;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audio = formData.get('audio');
    const language = (formData.get('language') || 'en').toString();

    if (!audio || typeof audio === 'string') {
      return NextResponse.json({ error: 'Missing audio file in form field "audio".' }, { status: 400 });
    }

    const file = audio as File;
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    if (!audioBuffer.length) {
      return NextResponse.json({ error: 'Uploaded audio file is empty.' }, { status: 400 });
    }

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    const base64Audio = audioBuffer.toString('base64');
    let mimeType = file.type || 'audio/wav';
    
    if (!mimeType || mimeType === 'application/octet-stream') {
      mimeType = 'audio/wav';
    }

    const prompt = `You are a professional speech-to-text transcriber. Transcribe this audio recording into text.
The audio language is primarily: ${language}.
Rules:
1. Return ONLY the transcribed text.
2. Do NOT add any notes, headers, explanations, prefix, or conversational remarks.
3. Transcribe exactly what is spoken. If nothing is spoken or it is just background noise, return an empty string.`;

    const preferredModel = geminiConfig.model || 'gemini-2.5-flash';
    
    let response = await tryTranscribe(preferredModel, apiKey, mimeType, base64Audio, prompt);

    // If preferred model fails with 503 (high demand) or 429 (rate limit), fallback immediately to gemini-1.5-flash
    if (response.status === 503 || response.status === 429) {
      console.warn(`STT model ${preferredModel} failed with status ${response.status}. Retrying with gemini-1.5-flash...`);
      response = await tryTranscribe('gemini-1.5-flash', apiKey, mimeType, base64Audio, prompt);
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini STT request failed:', errText);
      return NextResponse.json({ error: 'Gemini STT failed' }, { status: 500 });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    return NextResponse.json({ 
      text: text.trim(),
      language,
      recognitionStatus: 'Success'
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected STT server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
