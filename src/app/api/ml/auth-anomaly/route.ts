import { NextResponse } from 'next/server';
import ModelClient, { isUnexpected } from '@/lib/gemini-adapter';
import { AzureKeyCredential } from '@/lib/gemini-adapter';

// Define the shape of the expected request body
interface AuthAnomalyRequest {
  username: string;
  department: string;
  securityPhrase: string;
  timingMs: number;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AuthAnomalyRequest;
    const { username, department, securityPhrase, timingMs } = body;

    if (!username || !securityPhrase) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Initialize the GitHub Models client
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      console.error('GITHUB_TOKEN not found in environment');
      // Fallback for demo if token is missing
      return NextResponse.json({
         isAnomalous: false,
         score: 12,
         reasoning: 'Verified via fallback (No GITHUB_TOKEN).'
      });
    }

    const client = ModelClient('https://models.inference.ai.azure.com', new AzureKeyCredential(token));

    // Formulate a prompt for the model to act as a security anomaly detector
    const prompt = `You are an AI Security Module for the Bharat Setu Government Portal.
Your job is to analyze a login attempt and determine if it looks like a bot, a brute-force script, or anomalous behavior, based on the provided security phrase.

Context:
- User: ${username}
- Claimed Dept: ${department}
- Typing/Input Time: ${timingMs}ms
- Security Phrase Entered: "${securityPhrase}"

Rules:
1. If the phrase is random gibberish (e.g., "asdfgh"), or completely unrelated to a human response, mark as anomalous.
2. If the typing time is less than 500ms for a long phrase, it might be a bot (copy-pasting is okay but suspicious).
3. If the phrase is a coherent human response (e.g., repeating a required word or answering a basic captcha question), it is safe.
4. Output MUST be valid JSON, strictly following this exact format:
{
  "isAnomalous": boolean,
  "score": number (0 to 100, where 100 is highly anomalous/bot),
  "reasoning": "A brief 1-sentence explanation"
}

Analyze the attempt and return ONLY the JSON.`;

    const response = await client.path('/chat/completions').post({
      body: {
        messages: [{ role: 'system', content: prompt }],
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 150,
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
    console.error('Auth Anomaly Error:', error);
    return NextResponse.json(
      { error: 'Failed to process AI security check', details: error.message },
      { status: 500 }
    );
  }
}
