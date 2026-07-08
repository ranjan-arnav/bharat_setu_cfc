import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { takeCallEvent } from '@/lib/call-handoff-store';

export async function GET(request: NextRequest) {
  const channel = (request.nextUrl.searchParams.get('channel') || 'local-rn').trim() || 'local-rn';
  const event = await takeCallEvent(channel);

  if (!event) {
    return NextResponse.json({ pending: false, channel });
  }

  return NextResponse.json({
    pending: true,
    channel,
    event,
  });
}
