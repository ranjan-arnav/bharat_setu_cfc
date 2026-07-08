import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ status: 'ok', app: 'bharat-setu', timestamp: new Date().toISOString() });
}
