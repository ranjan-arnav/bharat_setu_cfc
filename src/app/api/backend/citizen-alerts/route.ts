import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { BackendHttpError } from '../../../../../BACKEND/src/services/backend-errors';
import { createCitizenAlert, getCitizenAlerts } from '../../../../../BACKEND/src/services/citizen-alert-service';

export async function GET(request: NextRequest) {
  const limitRaw = Number(request.nextUrl.searchParams.get('limit') || '8');
  const ward = request.nextUrl.searchParams.get('ward') || undefined;
  const category = request.nextUrl.searchParams.get('category') || undefined;
  const includeExpired = request.nextUrl.searchParams.get('includeExpired') === 'true';
  const sinceHours = Number(request.nextUrl.searchParams.get('sinceHours') || '72');

  try {
    const result = await getCitizenAlerts({
      limitRaw,
      ward,
      category,
      includeExpired,
      sinceHours,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BackendHttpError) {
      return NextResponse.json(
        {
          count: 0,
          unreadCount: 0,
          generatedAt: Date.now(),
          alerts: [],
          backendUnavailable: true,
          message: error.message,
        },
        { status: 200 },
      );
    }
    return NextResponse.json(
      {
        count: 0,
        unreadCount: 0,
        generatedAt: Date.now(),
        alerts: [],
        backendUnavailable: true,
        message: error instanceof Error ? error.message : 'Citizen alerts query failed',
      },
      { status: 200 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createCitizenAlert(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BackendHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Citizen alert create failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
