import { NextRequest, NextResponse } from 'next/server';
import { geminiConfig, agentConfigs } from '@/lib/gemini-config';

interface ContentSafetyCategory {
  category: string;
  severity: number;
}

interface ContentSafetyResponse {
  categoriesAnalysis?: ContentSafetyCategory[];
}

// POST /api/content-safety - Check content safety via Azure Content Safety
export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!geminiConfig.contentSafety.key) {
      return NextResponse.json({ safe: true, source: 'bypass' });
    }

    if (text) {
      const response = await fetch(
        `${geminiConfig.contentSafety.endpoint}/contentsafety/text:analyze?api-version=2024-09-01`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Ocp-Apim-Subscription-Key': geminiConfig.contentSafety.key,
          },
          body: JSON.stringify({
            text,
            categories: ['Hate', 'SelfHarm', 'Sexual', 'Violence'],
          }),
        }
      );

      if (!response.ok) {
        return NextResponse.json({ safe: true, source: 'error-bypass' });
      }

      const result = (await response.json()) as ContentSafetyResponse;
      const categories = result.categoriesAnalysis || [];
      const safe = categories.every((c) => c.severity <= 2);

      return NextResponse.json({
        safe,
        categories: categories.map((c) => ({
          category: c.category,
          severity: c.severity,
        })),
        source: 'azure',
      });
    }

    return NextResponse.json({ safe: true, source: 'no-content' });
  } catch (error: unknown) {
    console.error('Content safety error:', error);
    return NextResponse.json({ safe: true, source: 'error-bypass' });
  }
}
