import { NextRequest, NextResponse } from 'next/server';
import { geminiConfig, agentConfigs } from '@/lib/gemini-config';
import { startRouteTelemetry } from '@/lib/telemetry';

// Map language codes to Azure Speech TTS voice names
// For languages without a specific Azure neural voice, we fallback to Hindi for transliterated reading
const VOICE_MAP: Record<string, string> = {
  en: 'en-IN-NeerjaNeural',
  hi: 'hi-IN-SwaraNeural',
  ta: 'ta-IN-PallaviNeural',
  te: 'te-IN-ShrutiNeural',
  ml: 'ml-IN-SobhanaNeural',
  kn: 'kn-IN-SapnaNeural',
  gu: 'gu-IN-DhwaniNeural',
  bn: 'bn-IN-TanishaaNeural',
  mr: 'mr-IN-AarohiNeural',
  pa: 'pa-IN-GurbaniNeural',
  or: 'or-IN-SubhasiniNeural',
  as: 'as-IN-YashicaNeural',
  ur: 'ur-IN-GulNeural',
  ne: 'ne-NP-HemkalaNeural',   // Nepali usually uses NP region in Azure
  mai: 'hi-IN-SwaraNeural',  // Fallback to Hindi voice for Maithili
  kok: 'mr-IN-AarohiNeural', // Fallback to Marathi voice for Konkani
  mni: 'hi-IN-SwaraNeural',  // Manipuri fallback
  doi: 'hi-IN-SwaraNeural',  // Dogri fallback
  sat: 'hi-IN-SwaraNeural',  // Santali fallback
  brx: 'hi-IN-SwaraNeural',  // Bodo fallback
  ks: 'hi-IN-SwaraNeural',   // Kashmiri fallback
  sd: 'hi-IN-SwaraNeural',   // Sindhi fallback
};

// Map language codes to xml:lang BCP-47 tags
const LANG_MAP: Record<string, string> = {
  en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN', ml: 'ml-IN',
  kn: 'kn-IN', gu: 'gu-IN', bn: 'bn-IN', mr: 'mr-IN', pa: 'pa-IN',
  or: 'or-IN', as: 'as-IN', ur: 'ur-IN', ne: 'ne-NP', mai: 'hi-IN',
  kok: 'mr-IN', mni: 'hi-IN', doi: 'hi-IN', sat: 'hi-IN', brx: 'hi-IN',
  ks: 'hi-IN', sd: 'hi-IN',
};

export async function POST(request: NextRequest) {
  const telemetry = startRouteTelemetry(request, 'api.kisan.tts.post');
  try {
    const { text, language = 'en' } = await request.json();

    if (!text) {
      telemetry.complete(400, { reason: 'missing_text' });
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const speechKey = geminiConfig.speech.key;
    const speechRegion = geminiConfig.speech.region;

    if (!speechKey) {
      return NextResponse.json({ error: 'Azure Speech not configured' }, { status: 500 });
    }

    const voiceName = VOICE_MAP[language] || VOICE_MAP['en'];
    const langTag = LANG_MAP[language] || LANG_MAP['en'];

    // Build SSML
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${langTag}">
  <voice name="${voiceName}">
    <prosody rate="0.95" pitch="+0%">${escapeXml(text)}</prosody>
  </voice>
</speak>`;

    // Call Azure Cognitive Services TTS REST API
    const ttsUrl = `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;

    const response = await fetch(ttsUrl, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': speechKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'BharatSetu-KisanMitra/1.0',
      },
      body: ssml,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Azure TTS error:', response.status, errText);
      telemetry.complete(500, { error: 'azure_tts_failed', status: response.status });
      return NextResponse.json({ error: 'TTS generation failed' }, { status: 500 });
    }

    const audioBuffer = await response.arrayBuffer();
    telemetry.complete(200, { size: audioBuffer.byteLength, language });

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audioBuffer.byteLength),
      },
    });
  } catch (error: any) {
    console.error('TTS error:', error);
    telemetry.fail(error, 500);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
