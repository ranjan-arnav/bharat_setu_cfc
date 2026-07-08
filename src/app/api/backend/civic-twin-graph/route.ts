import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getCivicTwinGraph } from '../../../../../BACKEND/src/services/civic-twin-graph-service';

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId') || undefined;
  const sinceHours = Number(request.nextUrl.searchParams.get('sinceHours') || '168');
  const topK = Number(request.nextUrl.searchParams.get('topK') || '3');

  try {
    const result = await getCivicTwinGraph({ userId, sinceHours, topK });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Civic Twin Graph query failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}