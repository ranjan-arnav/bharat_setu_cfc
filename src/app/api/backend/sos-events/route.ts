import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { BackendHttpError } from '../../../../../BACKEND/src/services/backend-errors';
import { createSosEvent, getSosEvents } from '../../../../../BACKEND/src/services/sos-event-service';

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId') || '';
  const limitRaw = Number(request.nextUrl.searchParams.get('limit') || '100');

  try {
    const result = await getSosEvents(sessionId, limitRaw);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BackendHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'SOS events query failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createSosEvent(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BackendHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'SOS event insert failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
