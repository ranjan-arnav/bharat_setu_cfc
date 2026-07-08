/**
 * POST /api/sos/dispatch
 * ─────────────────────────────────────────────────────────────────────────────
 * Single-responder dispatch broker.  Called concurrently (N times) by
 * sos-engine.ts for each responder.
 *
 * In PRODUCTION — replace each `channel` block with real integrations:
 *   'api'     → Twilio / Exotel click-to-call + Voice API
 *   'sms'     → MSG91 / Amazon SNS / Gupshup bulk SMS
 *   'webhook' → Department webhook (police control room, NDRF, DM office)
 *   'call'    → Exotel outbound dialler API
 *
 * In DEV / DEMO — simulates success after a realistic random delay (100–800 ms)
 * so the UI shows a live "typing-indicator"-style fan-out.
 */

import { NextRequest, NextResponse } from 'next/server';

interface DispatchRequest {
  eventId: string;
  responderId: string;
  responderType: string;
  channel: 'api' | 'sms' | 'webhook' | 'call';
  number: string;
  message: string;
}

const isDev = process.env.NODE_ENV !== 'production';

/** Simulated delivery delay per channel type in ms (dev mode only). */
const CHANNEL_DELAY: Record<string, number> = {
  api: 200,
  sms: 350,
  webhook: 600,
  call: 150,
};

async function simulateDispatch(req: DispatchRequest): Promise<void> {
  const delay = CHANNEL_DELAY[req.channel] || 300;
  await new Promise((r) => setTimeout(r, delay + Math.random() * 200));
}

async function realSMSDispatch(req: DispatchRequest): Promise<void> {
  /**
   * Production SMS via MSG91 API (configurable via env vars).
   * Set MSG91_AUTH_KEY + MSG91_SENDER_ID in .env.local to enable.
   */
  const authKey = process.env.MSG91_AUTH_KEY;
  if (!authKey) throw new Error('MSG91_AUTH_KEY not configured');

  const smsBody = {
    sender: process.env.MSG91_SENDER_ID || 'BHRSETU',
    route: '4',
    country: '91',
    sms: [
      {
        message: req.message,
        to: [req.number.replace(/^0+/, '').replace(/^\+91/, '')],
      },
    ],
  };

  const res = await fetch('https://api.msg91.com/api/v2/sendsms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authkey: authKey,
    },
    body: JSON.stringify(smsBody),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) throw new Error(`MSG91 error: ${res.status}`);
}

async function realWebhookDispatch(req: DispatchRequest): Promise<void> {
  /**
   * Production webhook dispatch.
   * Department endpoints are configured per responder type via env vars.
   *   SOS_WEBHOOK_POLICE=https://...
   *   SOS_WEBHOOK_NDRF=https://...
   *   SOS_WEBHOOK_MAHILA=https://...
   */
  const webhookMap: Record<string, string | undefined> = {
    police: process.env.SOS_WEBHOOK_POLICE,
    women_child_safety: process.env.SOS_WEBHOOK_MAHILA,
    child_helpline: process.env.SOS_WEBHOOK_CHILDLINE,
    disaster_management: process.env.SOS_WEBHOOK_NDRF,
    cyber_crime: process.env.SOS_WEBHOOK_CYBER,
    legal_aid: process.env.SOS_WEBHOOK_LEGAL,
  };

  const url = webhookMap[req.responderType];
  if (!url) throw new Error(`No webhook configured for ${req.responderType}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventId: req.eventId,
      responderId: req.responderId,
      message: req.message,
      timestamp: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Webhook error: ${res.status}`);
}

async function realAPICallDispatch(req: DispatchRequest): Promise<void> {
  /**
   * Production voice-call dispatch via Exotel.
   * Set EXOTEL_API_KEY + EXOTEL_API_TOKEN + EXOTEL_SID in .env.local.
   */
  const key = process.env.EXOTEL_API_KEY;
  const token = process.env.EXOTEL_API_TOKEN;
  const sid = process.env.EXOTEL_SID;
  if (!key || !token || !sid) throw new Error('Exotel credentials not configured');

  const res = await fetch(
    `https://api.exotel.com/v1/Accounts/${sid}/Calls/connect`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${key}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: req.number,
        To: req.number,
        CallerId: process.env.EXOTEL_CALLER_ID || '08047124028',
        StatusCallback: process.env.EXOTEL_STATUS_CALLBACK || '',
      }),
      signal: AbortSignal.timeout(8000),
    }
  );

  if (!res.ok) throw new Error(`Exotel error: ${res.status}`);
}

export async function POST(request: NextRequest) {
  try {
    const body: DispatchRequest = await request.json();

    if (!body.eventId || !body.responderId || !body.channel) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (isDev) {
      // Development / demo mode — simulate realistic delay, always succeed
      await simulateDispatch(body);
    } else {
      // Production mode — use real integrations
      switch (body.channel) {
        case 'sms':
          await realSMSDispatch(body);
          break;
        case 'webhook':
          await realWebhookDispatch(body);
          break;
        case 'api':
        case 'call':
          await realAPICallDispatch(body);
          break;
        default:
          throw new Error(`Unknown channel: ${body.channel}`);
      }
    }

    return NextResponse.json({
      success: true,
      eventId: body.eventId,
      responderId: body.responderId,
      dispatchedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Dispatch failed';
    console.error(`[SOS Dispatch] ${message}`);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
