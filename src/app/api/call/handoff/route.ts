import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { enqueueCallEvent } from '@/lib/call-handoff-store';

type AgentKey =
  | 'nagarik_mitra'
  | 'swasthya_sahayak'
  | 'yojana_saathi'
  | 'arthik_salahkar'
  | 'vidhi_sahayak';

interface ConversationItem {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

interface CallHandoffBody {
  agentKey: AgentKey;
  continuationMode?: 'call_only' | 'chat_or_call';
  language?: string;
  digipin?: string;
  mobile?: string;
  userName?: string;
  conversation?: ConversationItem[];
}

const VALID_AGENTS: AgentKey[] = [
  'nagarik_mitra',
  'swasthya_sahayak',
  'yojana_saathi',
  'arthik_salahkar',
  'vidhi_sahayak',
];

function normalizeMobile(raw: string | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+91${digits.slice(1)}`;
  return raw.trim();
}

function compactConversation(items: ConversationItem[] = []): ConversationItem[] {
  return items
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
    .slice(-10)
    .map((item) => ({
      role: item.role,
      content: item.content.trim().slice(0, 1000),
      ...(typeof item.timestamp === 'number' ? { timestamp: item.timestamp } : {}),
    }));
}

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CallHandoffBody;

    if (!body?.agentKey || !VALID_AGENTS.includes(body.agentKey)) {
      return NextResponse.json({ error: 'Invalid or missing agentKey.' }, { status: 400 });
    }

    const conversation = compactConversation(body.conversation || []);
    const mobile = normalizeMobile(body.mobile);

    const callId = `CALL-${Date.now()}`;
    const continuationToken = randomUUID();

    const deepLinkBase = process.env.MOBILE_CALL_DEEPLINK_BASE?.trim() || '';
    const ringWebhookUrl = process.env.MOBILE_CALL_RING_WEBHOOK_URL?.trim() || '';
    const fallbackDialNumber = normalizeMobile(process.env.MOBILE_CALL_FALLBACK_NUMBER);
    const localRingChannel = (process.env.MOBILE_CALL_DEVICE_CHANNEL || 'local-rn').trim() || 'local-rn';

    const ringPayload = {
      eventType: 'agent_call_handoff',
      continuationMode: body.continuationMode || 'call_only',
      callId,
      continuationToken,
      createdAt: new Date().toISOString(),
      agentKey: body.agentKey,
      user: {
        name: (body.userName || 'Citizen').slice(0, 80),
        language: (body.language || 'hi').slice(0, 12),
        digipin: (body.digipin || '').slice(0, 24),
        mobile,
      },
      conversation,
    };

    let ringDispatched = false;
    let warning = '';

    if (ringWebhookUrl) {
      try {
        const ringResponse = await fetch(ringWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ringPayload),
          signal: AbortSignal.timeout(6000),
        });

        ringDispatched = ringResponse.ok;
        if (!ringResponse.ok) {
          warning = `Ring webhook returned ${ringResponse.status}.`;
        }
      } catch {
        warning = 'Ring webhook request failed.';
      }
    }

    if (!ringDispatched) {
      await enqueueCallEvent(localRingChannel, {
        callId,
        continuationToken,
        continuationMode: body.continuationMode || 'call_only',
        agentKey: body.agentKey,
        language: (body.language || 'hi').slice(0, 12),
        digipin: (body.digipin || '').slice(0, 24),
        userName: (body.userName || 'Citizen').slice(0, 80),
        mobile,
        conversation: conversation.slice(-6).map((item) => ({
          role: item.role,
          content: item.content.slice(0, 300),
          timestamp: item.timestamp,
        })),
        createdAt: Date.now(),
      });
      ringDispatched = true;
      warning = warning || `Ring webhook not configured; queued LAN ring on channel ${localRingChannel}.`;
    }

    if (!ringWebhookUrl && !fallbackDialNumber && !deepLinkBase) {
      return NextResponse.json(
        {
          error:
            'Call handoff is not configured. Set MOBILE_CALL_RING_WEBHOOK_URL or MOBILE_CALL_DEEPLINK_BASE or MOBILE_CALL_FALLBACK_NUMBER.',
        },
        { status: 503 },
      );
    }

    let joinDeepLink: string | undefined;
    if (deepLinkBase) {
      const continuationMode = body.continuationMode || 'call_only';
      const baseJoin = `${deepLinkBase}${deepLinkBase.includes('?') ? '&' : '?'}token=${encodeURIComponent(continuationToken)}&agent=${encodeURIComponent(body.agentKey)}&continuationMode=${encodeURIComponent(continuationMode)}`;

      if (!ringWebhookUrl) {
        const localPayload = {
          callId,
          continuationToken,
          continuationMode: body.continuationMode || 'call_only',
          agentKey: body.agentKey,
          language: (body.language || 'hi').slice(0, 12),
          digipin: (body.digipin || '').slice(0, 24),
          userName: (body.userName || 'Citizen').slice(0, 80),
          mobile,
          conversation: conversation.slice(-4).map((item) => ({
            role: item.role,
            content: item.content.slice(0, 220),
            timestamp: item.timestamp,
          })),
        };
        const encoded = toBase64Url(JSON.stringify(localPayload));
        joinDeepLink = `${baseJoin}&ctx=${encodeURIComponent(encoded)}`;
      } else {
        joinDeepLink = baseJoin;
      }
    }

    return NextResponse.json({
      success: true,
      callId,
      continuationToken,
      ringDispatched,
      localRingChannel,
      joinDeepLink,
      localWifiMode: !ringWebhookUrl && Boolean(joinDeepLink),
      fallbackDialNumber: !ringDispatched ? fallbackDialNumber || undefined : undefined,
      warning: warning || (!ringWebhookUrl ? 'Ring webhook not configured; using configured fallback path.' : undefined),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Call handoff failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
