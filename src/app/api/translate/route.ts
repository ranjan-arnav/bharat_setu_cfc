import { NextRequest, NextResponse } from 'next/server';
import { geminiConfig, agentConfigs } from '@/lib/gemini-config';
import { startRouteTelemetry } from '@/lib/telemetry';

// POST /api/translate — Translation via Azure AI Translator
export async function POST(request: NextRequest) {
  const telemetry = startRouteTelemetry(request, 'api.translate.post');
  let text = '';
  let sourceLang = 'en';
  let targetLang = 'hi';
  let sessionId = '';
  let userId = '';

  try {
    const body = await request.json();
    text = body.text || '';
    sourceLang = body.sourceLang || 'en';
    targetLang = body.targetLang || 'hi';
    sessionId = body.sessionId || '';
    userId = body.userId || '';

    telemetry.setContext({
      sessionId,
      userId,
      sourceLang,
      targetLang,
    });

    if (!text.trim()) {
      telemetry.complete(400, { reason: 'missing_text' });
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    // No-op when source and target are the same language
    if (sourceLang === targetLang) {
      const passthroughResponse = NextResponse.json({ translated: text, sourceLang, targetLang, source: 'passthrough' });
      telemetry.complete(200, { source: 'passthrough' });
      return passthroughResponse;
    }

    if (!geminiConfig.translator.key) {
      console.warn('[TRANSLATOR] AZURE_TRANSLATOR_KEY not configured — returning passthrough');
      const noKeyResponse = NextResponse.json({
        translated: text,
        sourceLang,
        targetLang,
        source: 'passthrough',
        note: 'AZURE_TRANSLATOR_KEY not configured',
      });
      telemetry.complete(200, { source: 'passthrough-no-key' });
      return noKeyResponse;
    }

    const url =
      `${geminiConfig.translator.endpoint}/translate` +
      `?api-version=3.0&from=${sourceLang}&to=${targetLang}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': geminiConfig.translator.key,
        'Ocp-Apim-Subscription-Region': geminiConfig.translator.region,
      },
      body: JSON.stringify([{ Text: text }]),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[TRANSLATOR] API error:', response.status, errText);
      const fallbackResponse = NextResponse.json({
        translated: text,
        sourceLang,
        targetLang,
        source: 'fallback',
        error: `Azure Translator returned ${response.status}`,
      });
      telemetry.complete(200, { source: 'fallback', providerStatus: response.status });
      return fallbackResponse;
    }

    const data = await response.json();
    const translated = data?.[0]?.translations?.[0]?.text || text;

    const translatedResponse = NextResponse.json({ translated, sourceLang, targetLang, source: 'azure-translator' });
    telemetry.complete(200, { source: 'azure-translator' });
    return translatedResponse;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[TRANSLATOR] Error:', msg);
    telemetry.fail(error, 500, {
      sessionId,
      userId,
      sourceLang,
      targetLang,
    });
    return NextResponse.json(
      { translated: text || '', sourceLang, targetLang, error: msg },
      { status: 500 }
    );
  }
}
