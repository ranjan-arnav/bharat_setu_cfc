import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { BackendHttpError } from '../../../../../BACKEND/src/services/backend-errors';
import { createMessage, getMessages } from '../../../../../BACKEND/src/services/message-service';

export async function GET(request: NextRequest) {
  const conversationId = request.nextUrl.searchParams.get('conversationId') || '';
  const limitRaw = Number(request.nextUrl.searchParams.get('limit') || '50');

  try {
    const result = await getMessages(conversationId, limitRaw);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BackendHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Message query failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createMessage(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BackendHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Message insert failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
