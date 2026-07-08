import { NextRequest, NextResponse } from 'next/server';
import { BackendHttpError } from '../../../../../BACKEND/src/services/backend-errors';
import { resetSessionCloudData } from '../../../../../BACKEND/src/services/reset-session-service';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await resetSessionCloudData(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BackendHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Session reset failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}