/**
 * GET /api/sos/status?id=<eventId>
 * ─────────────────────────────────────────────────────────────────────────────
 * Poll the dispatch status of a SOS event by its eventId.
 * Returns per-responder status so the client can show a live feed.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getSOSDispatchResult } from '@/lib/sos-storage';

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get('id');

  if (!eventId) {
    return NextResponse.json({ error: 'Missing event id' }, { status: 400 });
  }

  const result = await getSOSDispatchResult(eventId);

  if (!result) {
    // Dispatch still running — return pending state
    return NextResponse.json({
      eventId,
      dispatching: true,
      results: [],
    });
  }

  return NextResponse.json({
    eventId: result.eventId,
    dispatching: false,
    allNotified: result.allNotified,
    dispatchedAt: result.dispatchedAt,
    results: result.results,
  });
}
