import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { BackendHttpError } from '../../../../../BACKEND/src/services/backend-errors';
import { getSosSessions, upsertSosSession } from '../../../../../BACKEND/src/services/sos-session-service';

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId') || undefined;
  const userId = request.nextUrl.searchParams.get('userId') || undefined;
  const limitRaw = Number(request.nextUrl.searchParams.get('limit') || '20');

  try {
    const result = await getSosSessions({ userId, sessionId, limitRaw });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BackendHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'SOS session query failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await upsertSosSession(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BackendHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'SOS session upsert failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
