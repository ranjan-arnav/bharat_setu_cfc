import { NextResponse } from 'next/server';
import ModelClient, { isUnexpected } from '@/lib/gemini-adapter';
import { AzureKeyCredential } from '@/lib/gemini-adapter';

interface PerformanceRequest {
  target: string;
  type: 'officer' | 'dept';
  stats: {
    totalCases?: number;
    resolved?: number;
    rating?: number;
    budget?: string;
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PerformanceRequest;
    const { target, type, stats } = body;

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      console.warn('No GITHUB_TOKEN, returning fallback performance data.');
      return NextResponse.json({
        title: `Mock Analysis: ${target}`,
        data: [
          { label: 'Efficiency Rating', text: 'Excellent (Fallback Mode)', color: 'text-green-500' },
          { label: 'Trend', text: '+0% due to static fallback', color: 'text-blue-500' },
          { label: 'AI Recommendation', text: 'Provide GITHUB_TOKEN for real insights.', color: 'text-indigo-500' }
        ]
      });
    }

    const client = ModelClient('https://models.inference.ai.azure.com', new AzureKeyCredential(token));

    const prompt = `You are a strict, analytical AI Performance Auditor for the Bharat Setu Government Portal.
Analyze the following ${type}:
Name: ${target}
Available Stats: ${JSON.stringify(stats)}

Generate a highly precise performance review with exactly 4 data points.
Output MUST be valid JSON, strictly following this exact format:
{
  "title": "Performance Analysis: [Name]",
  "data": [
    { "label": "Short Actionable Metric Name", "text": "Detailed finding and percentage", "color": "text-[color]-500" }
  ]
}

Valid colors are ONLY: text-green-500, text-blue-500, text-orange-500, text-red-500, text-indigo-500.
Always include an 'AI Recommendation' as the 4th data point (using text-indigo-500).`;

    const response = await client.path('/chat/completions').post({
      body: {
        messages: [{ role: 'system', content: prompt }],
        model: 'gpt-4o-mini',
        temperature: 0.3,
        max_tokens: 400,
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
    console.error('Performance Analysis Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate performance report', details: error.message },
      { status: 500 }
    );
  }
}
