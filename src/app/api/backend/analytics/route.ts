import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getGovAnalytics } from '../../../../../BACKEND/src/services/analytics-service';
import { BackendHttpError } from '../../../../../BACKEND/src/services/backend-errors';

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId') || undefined;
  const sinceHours = Number(request.nextUrl.searchParams.get('sinceHours') || '168');
  const topK = Number(request.nextUrl.searchParams.get('topK') || '5');
  const limitRaw = Number(request.nextUrl.searchParams.get('limit') || '300');

  try {
    const result = await getGovAnalytics({ userId, sinceHours, topK, limitRaw });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BackendHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Analytics query failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}