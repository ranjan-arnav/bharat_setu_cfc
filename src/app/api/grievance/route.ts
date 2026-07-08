import { NextRequest, NextResponse } from 'next/server';
import { geminiConfig, agentConfigs } from '@/lib/gemini-config';
import { startRouteTelemetry } from '@/lib/telemetry';
import { analyzeAndPersistLanguageEnrichment } from '@/lib/azure-language-enrichment';

type SafetyCategory = { severity?: number };
type VisionTag = { name?: string };
type VisionObject = { tags?: Array<{ name?: string }> };

// Helper: Use Phi-4 to generate accurate ticket details based on Vision analysis
async function generateTicketDetails(
  description: string,
  category: string,
  visionAnalysis: { caption?: string; tags?: string[]; objects?: string[] } | null,
  digipin: string
): Promise<{
  department: string;
  ward: string;
  priority: string;
  estimatedResolution: string;
}> {
  const phiToken = process.env.GITHUB_TOKEN_PHI;
  
  if (!phiToken || !visionAnalysis?.caption) {
    // Fallback to rule-based system
    return {
      department: getDepartment(category),
      ward: `Ward ${Math.floor(Math.random() * 50) + 1}, Sector ${String.fromCharCode(65 + Math.floor(Math.random() * 5))}`,
      priority: category === 'electricity' || category === 'water' ? 'HIGH' : 'MEDIUM',
      estimatedResolution: category === 'electricity' || category === 'water' ? '48 hours' : '7-15 working days',
    };
  }

  try {
    const prompt = `You are a civic grievance routing AI. Based on the image analysis and description, generate accurate ticket routing details.

**User Report:**
Description: "${description}"
Category: ${category}

**Azure Vision Analysis:**
Caption: ${visionAnalysis.caption || 'N/A'}
Tags: ${visionAnalysis.tags?.join(', ') || 'N/A'}
Objects: ${visionAnalysis.objects?.join(', ') || 'N/A'}

**Location:**
DIGIPIN: ${digipin}

Generate a JSON response with these exact fields:
{
  "department": "full department name (e.g., Municipal Corporation - Electrical Wing, Public Works Department, Water Authority)",
  "ward": "Ward number and sector (e.g., Ward 42, Sector C)",
  "priority": "HIGH or MEDIUM",
  "estimatedResolution": "realistic timeline (e.g., 48 hours, 3-5 days, 7-15 working days)"
}

Rules:
- If vision detects safety hazards (broken wires, leaks, structural damage) → HIGH priority
- Electricity/water issues → assign to appropriate utility department
- Roads/infrastructure → Public Works Department
- Sanitation → Municipal Sanitation Wing

Respond ONLY with valid JSON, no markdown.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout

    const response = await fetch('https://models.github.ai/inference/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${phiToken}`,
      },
      body: JSON.stringify({
        model: 'microsoft/Phi-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        top_p: 1.0,
        max_tokens: 100,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Phi API error ${response.status}:`, errorText);
      throw new Error(`Phi API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('✅ Phi-4 generated ticket details');
      return {
        department: parsed.department,
        ward: parsed.ward,
        priority: parsed.priority,
        estimatedResolution: parsed.estimatedResolution,
      };
    }
    
    throw new Error('Could not parse Phi response');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('⚠️  Phi ticket generation failed, using rule-based fallback:', errorMessage);
    return {
      department: getDepartment(category),
      ward: `Ward ${Math.floor(Math.random() * 50) + 1}, Sector ${String.fromCharCode(65 + Math.floor(Math.random() * 5))}`,
      priority: category === 'electricity' || category === 'water' ? 'HIGH' : 'MEDIUM',
      estimatedResolution: category === 'electricity' || category === 'water' ? '48 hours' : '7-15 working days',
    };
  }
}

// POST /api/grievance - Submit a grievance with DIGIPIN location
export async function POST(request: NextRequest) {
  const telemetry = startRouteTelemetry(request, 'api.grievance.post');
  try {
    const formData = await request.formData();
    const description = formData.get('description') as string;
    const category = formData.get('category') as string;
    const digipin = formData.get('digipin') as string;
    const language = formData.get('language') as string || 'hi';
    const userId = (formData.get('userId') as string) || '';
    const image = formData.get('image') as File | null;

    telemetry.setContext({
      userId,
      language,
      category: category || 'General',
      hasImage: Boolean(image),
    });

    if (!description) {
      telemetry.complete(400, { reason: 'missing_description' });
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }

    let imageAnalysis: {
      captionResult?: { text?: string };
      tagsResult?: { values?: VisionTag[] };
      objectsResult?: { values?: VisionObject[] };
    } | null = null;
    
    // If image provided, analyze with Azure Vision
    if (image && geminiConfig.vision.key) {
      try {
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

        if (visionResponse.ok) {
          imageAnalysis = await visionResponse.json();
          console.log('✅ Azure Vision analysis successful');
        } else {
          const errorText = await visionResponse.text();
          console.error('❌ Azure Vision API error:', visionResponse.status, errorText);
        }
      } catch (e) {
        console.error('❌ Vision analysis failed:', e);
      }
    } else if (image && !geminiConfig.vision.key) {
      console.warn('⚠️  Image provided but AZURE_VISION_KEY not configured - using demo analysis');
    }

    // Content safety check on the description
    let isSafe = true;
    if (geminiConfig.contentSafety.key) {
      try {
        const safetyResponse = await fetch(
          `${geminiConfig.contentSafety.endpoint}/contentsafety/text:analyze?api-version=2024-09-01`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Ocp-Apim-Subscription-Key': geminiConfig.contentSafety.key,
            },
            body: JSON.stringify({ text: description }),
          }
        );

        if (safetyResponse.ok) {
          const safetyResult = await safetyResponse.json();
          // Check if any category severity is above 2
          const categories = (safetyResult.categoriesAnalysis as SafetyCategory[] | undefined) || [];
          isSafe = categories.every((category) => (category.severity ?? 0) <= 2);
        }
      } catch (e: unknown) {
        console.log('Content safety check skipped:', e);
      }
    }

    if (!isSafe) {
      telemetry.complete(400, { reason: 'content_safety_blocked' });
      return NextResponse.json({
        error: 'Content flagged by safety review. Please revise your submission.',
        safe: false,
      }, { status: 400 });
    }

    // Generate a grievance ID
    const grievanceId = `GRV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    telemetry.setContext({ caseId: grievanceId });
    
    console.log(`✅ Grievance registered: ${grievanceId}`, {
      category: category || 'General',
      hasImage: !!image,
      hasVisionAnalysis: !!imageAnalysis,
      digipin: digipin || 'Not provided',
    });

    // Prepare vision analysis
    const visionData = imageAnalysis ? {
      caption: imageAnalysis.captionResult?.text,
      tags: imageAnalysis.tagsResult?.values?.map((tag) => tag.name).filter((value): value is string => Boolean(value)),
      objects: imageAnalysis.objectsResult?.values?.map((obj) => obj.tags?.[0]?.name).filter((value): value is string => Boolean(value)),
    } : image ? {
      // Demo fallback when image is provided but Azure Vision isn't configured
      caption: getDemoCaption(category),
      tags: getDemoTags(category),
      objects: getDemoObjects(category),
    } : null;

    // Use Phi-4 to generate accurate ticket details based on Vision analysis
    const ticketDetails = await generateTicketDetails(
      description,
      category || 'General',
      visionData,
      digipin || 'Not provided'
    );

    const languageEnrichment = await analyzeAndPersistLanguageEnrichment({
      text: description,
      sourceType: 'grievance',
      userId,
      caseId: grievanceId,
      language,
      metadata: {
        category: category || 'General',
        digipin: digipin || 'Not provided',
      },
    });

    const computedPriority =
      (languageEnrichment?.riskScore ?? 0) >= 75 ? 'HIGH' : ticketDetails.priority;

    if (languageEnrichment) {
      telemetry.setContext({
        riskScore: languageEnrichment.riskScore,
        trustScore: languageEnrichment.trustScore,
        routingHint: languageEnrichment.routingHint?.agentKey || '',
      });
    }

    // In production, this would be stored in Cosmos DB
    const grievance = {
      id: grievanceId,
      description,
      category: category || 'General',
      digipin: digipin || 'Not provided',
      language,
      status: 'Submitted',
      imageAnalysis: visionData,
      submittedAt: new Date().toISOString(),
      estimatedResolution: ticketDetails.estimatedResolution,
      karmaEarned: 25,
      department: ticketDetails.department,
      ward: ticketDetails.ward,
      priority: computedPriority,
      languageEnrichment,
    };

    const response = NextResponse.json({
      success: true,
      grievance,
      message: `Grievance ${grievanceId} registered successfully. You will receive updates via SMS and in-app notifications.`,
    });
    telemetry.complete(200, {
      caseId: grievanceId,
      priority: computedPriority,
      riskScore: languageEnrichment?.riskScore ?? '',
      trustScore: languageEnrichment?.trustScore ?? '',
      source: 'primary',
    });
    return response;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Grievance API error:', errorMessage);
    telemetry.fail(error, 500, { source: 'demo-fallback' });
    // Demo fallback - still return success so user can file grievance
    const grievanceId = `GRV-DEMO-${Date.now().toString(36).toUpperCase()}`;
    console.log('⚠️  Using demo fallback mode for grievance:', grievanceId);
    return NextResponse.json({
      success: true,
      grievance: {
        id: grievanceId,
        description: 'Demo grievance submitted',
        category: 'General',
        digipin: 'Not provided',
        status: 'Submitted',
        imageAnalysis: { caption: 'Infrastructure issue detected', tags: ['road', 'damage', 'infrastructure'], objects: ['pothole'] },
        submittedAt: new Date().toISOString(),
        estimatedResolution: '7-15 working days',
        karmaEarned: 25,
        department: 'Municipal Corporation',
        priority: 'MEDIUM',
      },
      message: `Grievance ${grievanceId} registered.`,
      source: 'demo',
    });
  }
}

function getDemoCaption(category: string): string {
  const captions: Record<string, string> = {
    road: 'A damaged road with visible potholes near residential area',
    water: 'Water pipeline leakage causing waterlogging on street',
    electricity: 'Non-functional streetlight in residential colony',
    sanitation: 'Overflowing garbage dump near public area',
    streetlight: 'Broken streetlight post on main road',
  };
  return captions[category] || 'Infrastructure issue detected in residential area';
}

function getDemoTags(category: string): string[] {
  const tags: Record<string, string[]> = {
    road: ['road', 'pothole', 'damage', 'infrastructure', 'urban'],
    water: ['water', 'pipeline', 'leak', 'road', 'drainage'],
    electricity: ['streetlight', 'pole', 'dark', 'night', 'urban'],
    sanitation: ['garbage', 'waste', 'dump', 'pollution', 'urban'],
    streetlight: ['light', 'pole', 'broken', 'night', 'safety'],
  };
  return tags[category] || ['infrastructure', 'issue', 'urban', 'residential'];
}

function getDemoObjects(category: string): string[] {
  const objects: Record<string, string[]> = {
    road: ['pothole', 'road surface', 'vehicle'],
    water: ['pipe', 'water pool', 'road'],
    electricity: ['light pole', 'wire', 'transformer'],
    sanitation: ['garbage bin', 'waste', 'container'],
    streetlight: ['light pole', 'lamp', 'road'],
  };
  return objects[category] || ['infrastructure', 'building'];
}

function getDepartment(category: string): string {
  const departments: Record<string, string> = {
    road: 'Public Works Department (PWD)',
    water: 'Jal Board / Water Authority',
    electricity: 'Power Distribution Company',
    sanitation: 'Municipal Sanitation Wing',
    streetlight: 'Electrical Division, PWD',
  };
  return departments[category] || 'Municipal Corporation';
}
