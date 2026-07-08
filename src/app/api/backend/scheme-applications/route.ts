import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { BackendHttpError } from '../../../../../BACKEND/src/services/backend-errors';
import {
  getSchemeApplications,
  upsertSchemeApplication,
} from '../../../../../BACKEND/src/services/scheme-application-service';

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId') || undefined;
  const applicationId = request.nextUrl.searchParams.get('applicationId') || undefined;
  const limitRaw = Number(request.nextUrl.searchParams.get('limit') || '50');

  try {
    const result = await getSchemeApplications({ userId, applicationId, limitRaw });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BackendHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Scheme applications query failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await upsertSchemeApplication(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BackendHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Scheme application upsert failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
