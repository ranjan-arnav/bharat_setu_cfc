import { NextRequest, NextResponse } from 'next/server';
import { geminiConfig, agentConfigs } from '@/lib/gemini-config';

// POST /api/vision-chat - Analyze an image via Azure Vision for chat context
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const image = formData.get('image') as File | null;

    if (!image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    if (!geminiConfig.vision.key) {
      return NextResponse.json({ analysis: 'Image received (Vision not configured)', source: 'bypass' });
    }

    const imageBytes = await image.arrayBuffer();

    const visionResponse = await fetch(
      `${geminiConfig.vision.endpoint}/computervision/imageanalysis:analyze?features=caption,tags,objects&api-version=2024-02-01`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Ocp-Apim-Subscription-Key': geminiConfig.vision.key,
        },
        body: imageBytes,
      }
    );

    if (!visionResponse.ok) {
      const errText = await visionResponse.text();
      console.error('Vision API error:', errText);
      return NextResponse.json({ analysis: 'Image received (analysis unavailable)', source: 'error' });
    }

    const result = await visionResponse.json();

    const caption = result.captionResult?.text || '';
    const tags = (result.tagsResult?.values || [])
      .slice(0, 8)
      .map((t: { name: string }) => t.name)
      .join(', ');
    const objects = (result.objectsResult?.values || [])
      .slice(0, 5)
      .map((o: { tags?: { name: string }[] }) => o.tags?.[0]?.name)
      .filter(Boolean)
      .join(', ');

    const parts: string[] = [];
    if (caption) parts.push(caption);
    if (tags) parts.push(`Visible: ${tags}`);
    if (objects) parts.push(`Objects: ${objects}`);

    const analysis = parts.join('. ') || 'Image received';

    return NextResponse.json({ analysis, caption, tags, objects, source: 'azure-vision' });
  } catch (error: unknown) {
    console.error('Vision-chat error:', error);
    return NextResponse.json({ analysis: 'Image received (analysis failed)', source: 'error' });
  }
}
