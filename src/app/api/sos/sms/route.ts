/**
 * POST /api/sos/sms
 * ─────────────────────────────────────────────────────────────────────────────
 * Sends real SMS alert via Fast2SMS to the configured emergency number.
 */

import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.FAST2SMS_API_KEY || '';
const PHONE = process.env.FAST2SMS_PHONE || '';

interface SMSRequestBody {
    message: string;
    eventId?: string;
}

interface Fast2SMSResponse {
    return?: boolean;
    message?: string;
}

export async function POST(request: NextRequest) {
    try {
        const body: SMSRequestBody = await request.json();

        if (!body.message) {
            return NextResponse.json({ error: 'message is required' }, { status: 400 });
        }
        if (!API_KEY || !PHONE) {
            console.warn('[Fast2SMS] FAST2SMS_API_KEY or FAST2SMS_PHONE not set');
            return NextResponse.json({ success: false, error: 'SMS not configured' }, { status: 500 });
        }

        const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
            method: 'POST',
            headers: {
                'authorization': API_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                route: 'q',
                message: body.message,
                flash: 0,
                numbers: PHONE,
            }),
            signal: AbortSignal.timeout(10_000),
        });

        const contentType = res.headers.get('content-type') || '';
        let data: Fast2SMSResponse = {};

        if (contentType.includes('application/json')) {
            try {
                data = (await res.json()) as Fast2SMSResponse;
            } catch {
                data = { message: 'Invalid JSON from SMS provider' };
            }
        } else {
            const raw = await res.text();
            data = { message: raw || `SMS provider returned HTTP ${res.status}` };
        }

        if (!res.ok) {
            const providerError = data.message || `SMS provider error (${res.status})`;
            console.error(`[Fast2SMS] ❌ HTTP error:`, providerError);
            return NextResponse.json({ success: false, error: providerError }, { status: 502 });
        }

        if (data.return === true) {
            console.log(`[Fast2SMS] ✅ SMS sent to ${PHONE}`);
            return NextResponse.json({ success: true, phone: PHONE, eventId: body.eventId || null, sentAt: new Date().toISOString() });
        } else {
            console.error(`[Fast2SMS] ❌ Failed:`, data.message);
            return NextResponse.json({ success: false, error: data.message || 'SMS failed' });
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[Fast2SMS] ❌ Error:`, msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
