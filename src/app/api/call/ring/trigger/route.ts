import { NextRequest, NextResponse } from 'next/server';
import { enqueueCallEvent, PendingCallEvent } from '@/lib/call-handoff-store';
// @ts-ignore
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { emergencyType, emergencyLabel } = await request.json();

    if (!emergencyType || !emergencyLabel) {
      return NextResponse.json({ error: 'Missing emergency metadata' }, { status: 400 });
    }

    const event: PendingCallEvent = {
      callId: uuidv4(),
      continuationToken: uuidv4(),
      continuationMode: 'call_only',
      agentKey: 'nagarik_mitra',
      language: 'en',
      digipin: '',
      userName: '',
      mobile: '',
      conversation: [],
      createdAt: Date.now(),
      emergencyType,
      emergencyLabel,
    };

    // The RN App defaults to 'local-rn' channel for polling.
    await enqueueCallEvent('local-rn', event);

    return NextResponse.json({ success: true, message: 'Emergency alert dispatched to mobile app' });
  } catch (error) {
    console.error('Failed to trigger emergency call:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
