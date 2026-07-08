import { NextRequest, NextResponse } from 'next/server';
import { geminiConfig, agentConfigs } from '@/lib/gemini-config';
import { buildGroundedAnswer } from '@/lib/gemini-rag';
import { startRouteTelemetry } from '@/lib/telemetry';

// POST /api/schemes - Search government schemes via Azure AI Search
export async function POST(request: NextRequest) {
  const telemetry = startRouteTelemetry(request, 'api.schemes.post');
  try {
    const { query, filters = {}, top = 10, language = 'hi', grounded = true } = await request.json() as {
      query: string;
      filters?: Record<string, unknown>;
      top?: number;
      language?: string;
      grounded?: boolean;
    };

    if (!query || query.trim().length < 2) {
      telemetry.complete(400, { reason: 'query_too_short' });
      return NextResponse.json({ error: 'Query too short' }, { status: 400 });
    }

    if (!geminiConfig.search.endpoint) {
      return NextResponse.json({ schemes: [] });
    }

    // Use Azure AI Search to find matching schemes
    const searchUrl = `${geminiConfig.search.endpoint}/indexes/${geminiConfig.search.indexName}/docs/search?api-version=2024-07-01`;

    const searchBody: Record<string, unknown> = {
      search: query,
      queryType: 'simple',  // free tier doesn't support semantic configs
      top,
      select: 'scheme_name,ministry,description,eligibility,benefits,application_url,deadline,category,match_score',
      count: true,
    };

    // Apply filters based on user profile — sanitize values to prevent OData injection
    const filterParts: string[] = [];
    if (filters.category) {
      const safeCategory = String(filters.category).replace(/'/g, '');
      filterParts.push(`category eq '${safeCategory}'`);
    }
    if (filters.state) {
      const safeState = String(filters.state).replace(/'/g, '');
      filterParts.push(`states/any(s: s eq '${safeState}')`);
    }
    if (filters.income_limit !== undefined) {
      const n = Number(filters.income_limit);
      if (Number.isFinite(n) && n >= 0) filterParts.push(`income_limit ge ${n}`);
    }
    if (filterParts.length) searchBody.filter = filterParts.join(' and ');

    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': geminiConfig.search.key,
      },
      body: JSON.stringify(searchBody),
    });

    if (!response.ok) {
      const groundedAnswer = grounded
        ? await buildGroundedAnswer(query, { language, top, filters })
        : null;

      // Fallback: return mock data for demo
      const fallbackResponse = NextResponse.json({
        schemes: getDemoSchemes(query),
        total: 5,
        source: 'demo',
        groundedAnswer: groundedAnswer?.answer || null,
        citations: groundedAnswer?.citations || [],
        confidence: groundedAnswer?.confidence ?? null,
        usedFallback: groundedAnswer?.usedFallback ?? true,
      });
      telemetry.complete(200, {
        source: 'demo',
        grounded: grounded ? 'true' : 'false',
        confidence: groundedAnswer?.confidence ?? '',
        usedFallback: groundedAnswer?.usedFallback ?? '',
      });
      return fallbackResponse;
    }

    const data = await response.json();
    const groundedAnswer = grounded
      ? await buildGroundedAnswer(query, { language, top, filters })
      : null;

    const successResponse = NextResponse.json({
      schemes: data.value || [],
      total: data['@odata.count'] || 0,
      source: 'azure-search',
      groundedAnswer: groundedAnswer?.answer || null,
      citations: groundedAnswer?.citations || [],
      confidence: groundedAnswer?.confidence ?? null,
      usedFallback: groundedAnswer?.usedFallback ?? false,
    });
    telemetry.complete(200, {
      source: 'azure-search',
      grounded: grounded ? 'true' : 'false',
      confidence: groundedAnswer?.confidence ?? '',
      usedFallback: groundedAnswer?.usedFallback ?? '',
    });
    return successResponse;
  } catch (error: unknown) {
    console.error('Schemes API error:', error);
    telemetry.fail(error, 500, { source: 'demo' });
    // Return demo data on error
    return NextResponse.json({
      schemes: getDemoSchemes(''),
      total: 5,
      source: 'demo',
      groundedAnswer: null,
      citations: [],
      confidence: null,
      usedFallback: true,
    });
  }
}

function getDemoSchemes(query: string) {
  const allSchemes = [
    {
      scheme_name: 'PM-KISAN Samman Nidhi',
      ministry: 'Ministry of Agriculture',
      description: 'Direct income support of ₹6,000 per year to farmer families across India.',
      eligibility: 'All land-holding farmer families with cultivable land',
      benefits: '₹6,000/year in 3 installments of ₹2,000 each',
      category: 'Agriculture',
      application_url: 'https://pmkisan.gov.in',
      deadline: 'Open enrollment',
    },
    {
      scheme_name: 'Ayushman Bharat PM-JAY',
      ministry: 'Ministry of Health & Family Welfare',
      description: 'Health insurance of ₹5 lakh per family per year for secondary and tertiary care.',
      eligibility: 'Bottom 40% vulnerable families (SECC 2011 data)',
      benefits: '₹5,00,000 health cover per family per year',
      category: 'Health',
      application_url: 'https://pmjay.gov.in',
      deadline: 'Open enrollment',
    },
    {
      scheme_name: 'PM Awas Yojana (Gramin)',
      ministry: 'Ministry of Rural Development',
      description: 'Financial assistance for construction of pucca houses for rural poor.',
      eligibility: 'Houseless or families living in kutcha/dilapidated houses',
      benefits: '₹1,20,000 in plains, ₹1,30,000 in hilly areas',
      category: 'Housing',
      application_url: 'https://pmayg.nic.in',
      deadline: 'Rolling basis',
    },
    {
      scheme_name: 'MGNREGA',
      ministry: 'Ministry of Rural Development',
      description: '100 days guaranteed wage employment per year for rural households.',
      eligibility: 'Any rural household adult willing to do unskilled manual work',
      benefits: '100 days employment at ₹267-348/day (state-wise)',
      category: 'Employment',
      application_url: 'https://nrega.nic.in',
      deadline: 'Always open',
    },
    {
      scheme_name: 'PM Mudra Yojana',
      ministry: 'Ministry of Finance',
      description: 'Collateral-free loans up to ₹10 lakh for micro/small enterprises.',
      eligibility: 'Non-farm small/micro enterprises',
      benefits: 'Shishu: ₹50K, Kishore: ₹5L, Tarun: ₹10L',
      category: 'Finance',
      application_url: 'https://mudra.org.in',
      deadline: 'Open',
    },
  ];

  if (!query) return allSchemes;
  const q = query.toLowerCase();
  return allSchemes.filter(
    (s) =>
      s.scheme_name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
  );
}
