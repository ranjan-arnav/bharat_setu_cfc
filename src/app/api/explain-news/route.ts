import { NextResponse } from 'next/server';
import { translateText } from '@/app/actions/gemini-ai';

function buildFallbackExplanation(title: string, description: string) {
  const trimmedTitle = title?.trim() || 'Community update';
  const trimmedDescription = description?.trim() || 'A local advisory has been issued.';
  return `${trimmedTitle}. ${trimmedDescription.slice(0, 180)} Please follow the local guidance and stay updated through Bharat Setu.`;
}

export async function POST(req: Request) {
  try {
    const { title, description, targetLang = 'en-IN' } = await req.json();

    const systemPrompt = `You are a helpful Indian community assistant called "Yojana Saathi".
Your job is to read a local community news update or alert and explain it verbally to a citizen in extremely simple layman's terms.
Keep the explanation under 2-3 sentences. 
Make sure the citizen understands EXACTLY what is happening, why it matters, and what action they need to take (if any).
DO NOT include any markdown, emojis, asterisks, or introductory text. Just output the spoken script directly in English.`;

    const userPrompt = `News Title: ${title}\nDescription: ${description}`;

    let explanation = buildFallbackExplanation(title, description);

    const githubToken = process.env.GITHUB_TOKEN?.trim();
    if (githubToken) {
      try {
        const res = await fetch('https://models.inference.ai.azure.com/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${githubToken}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: 300,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const fromModel = data?.choices?.[0]?.message?.content?.trim();
          if (fromModel) {
            explanation = fromModel;
          }
        }
      } catch (llmError) {
        console.warn('Explain News LLM fallback used:', llmError);
      }
    }

    // Enforce target language natively via Azure Translator
    const shortLang = targetLang.split('-')[0];
    if (shortLang && shortLang !== 'en') {
      try {
        explanation = await translateText(explanation, shortLang);
      } catch (transErr) {
        console.error('Translation failed:', transErr);
      }
    }

    return NextResponse.json({ explanation, fallbackUsed: !process.env.GITHUB_TOKEN?.trim() });
  } catch (error: unknown) {
    console.error('Explain News error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
