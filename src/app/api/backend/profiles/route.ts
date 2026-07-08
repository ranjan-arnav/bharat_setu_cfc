import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { BackendHttpError } from '../../../../../BACKEND/src/services/backend-errors';
import { getProfileByUserId, upsertProfile } from '../../../../../BACKEND/src/services/profile-service';

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId') || '';

  try {
    const result = await getProfileByUserId(userId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BackendHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Profile read failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await upsertProfile(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BackendHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Profile upsert failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
