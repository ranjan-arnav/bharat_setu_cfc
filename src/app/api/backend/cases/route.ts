import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getCases, getGovernmentCases, upsertCase } from '../../../../../BACKEND/src/services/case-service';
import { BackendHttpError } from '../../../../../BACKEND/src/services/backend-errors';

export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get('scope') || '';
  const userId = request.nextUrl.searchParams.get('userId') || undefined;
  const caseId = request.nextUrl.searchParams.get('caseId') || undefined;
  const limitRaw = Number(request.nextUrl.searchParams.get('limit') || '50');
  const status = request.nextUrl.searchParams.get('status') || undefined;
  const category = request.nextUrl.searchParams.get('category') || undefined;
  const dept = request.nextUrl.searchParams.get('dept') || undefined;
  const ward = request.nextUrl.searchParams.get('ward') || undefined;

  try {
    const result =
      scope === 'government'
        ? await getGovernmentCases({ limitRaw, status, category, dept, ward })
        : await getCases({ userId, caseId, limitRaw });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BackendHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Cases query failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await upsertCase(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BackendHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Case upsert failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
