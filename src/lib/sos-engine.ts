/**
 * sos-engine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Core engine for the Bharat Setu asynchronous SOS emergency response system.
 *
 * Responsibilities
 * ─────────────────
 * 1. GPS capture (browser Geolocation API with high-accuracy)
 * 2. DIGIPIN encoding  (ISRO 4-3-3 grid, charset per India Post spec)
 * 3. Context classification — decides WHICH specialist channels to activate
 * 4. Responder registry   — nearest police, hospitals, helplines
 * 5. Alert dispatch       — async fan-out with per-responder status tracking
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type ResponderType =
  | 'police'
  | 'ambulance'
  | 'fire'
  | 'women_child_safety'
  | 'child_helpline'
  | 'disaster_management'
  | 'legal_aid'
  | 'contact'
  | 'cyber_crime';

export type ResponderStatus = 'pending' | 'notified' | 'acknowledged' | 'failed';

export interface Responder {
  id: string;
  type: ResponderType;
  name: string;
  number: string;
  channel: 'sms' | 'call' | 'api' | 'webhook';
  priority: 1 | 2 | 3;         // 1 = immediate, 2 = urgent, 3 = informational
  conditional?: boolean;        // only dispatched when classified as needed
}

export interface ResponderResult {
  responderId: string;
  responderName: string;
  type: ResponderType;
  status: ResponderStatus;
  notifiedAt?: number;
  error?: string;
}

export interface SOSLocation {
  lat: number;
  lng: number;
  digipin: string;
  accuracy: number;          // metres
  capturedAt: number;        // Unix ms
  address?: string;
}

export interface SOSContext {
  requiresWomenSafety: boolean;
  requiresChildSafety: boolean;
  requiresDisasterResponse: boolean;
  requiresCyberCrime: boolean;
  description?: string;
}

export interface SOSAlertPayload {
  eventId: string;
  userId: string;
  userName: string;
  userMobile: string;
  location: SOSLocation;
  context: SOSContext;
  timestamp: number;
  responders: Responder[];
  audioRecordingUrl?: string;
}

export interface SOSDispatchResult {
  eventId: string;
  results: ResponderResult[];
  dispatchedAt: number;
  allNotified: boolean;
}

// ─── DIGIPIN Encoder ────────────────────────────────────────────────────────
//
// Based on ISRO/India Post DIGIPIN specification (Geocode for India).
// India bounds: lat [6.5, 37.6], lng [68.1, 97.4]
// Grid: 4-level hierarchy → 4-char zone + 3-char block + 3-char cell
// Character set: 2 3 4 5 6 7 8 9 C F H J M P Q R V W X Y  (20 chars, no O/I/L/B/A)
// ─────────────────────────────────────────────────────────────────────────────

const DIGIPIN_CHARSET = '23456789CFHJMPQRVWXY';

const INDIA_LAT_MIN = 6.5;
const INDIA_LAT_MAX = 37.6;
const INDIA_LNG_MIN = 68.1;
const INDIA_LNG_MAX = 97.4;

/** Encode a lat/lng pair into an ISRO-style DIGIPIN string (XXXX-XXX-XXX). */
export function encodeDigipin(lat: number, lng: number): string {
  const clampLat = Math.max(INDIA_LAT_MIN, Math.min(INDIA_LAT_MAX, lat));
  const clampLng = Math.max(INDIA_LNG_MIN, Math.min(INDIA_LNG_MAX, lng));

  // Normalise to [0, 1]
  const normLat = (clampLat - INDIA_LAT_MIN) / (INDIA_LAT_MAX - INDIA_LAT_MIN);
  const normLng = (clampLng - INDIA_LNG_MIN) / (INDIA_LNG_MAX - INDIA_LNG_MIN);

  /**
   * Interleave the lat/lng into successive 4-bit nibbles and map each nibble
   * through the 20-char charset via modulo.  Produces 10 characters total.
   */
  const chars: string[] = [];
  const latBits = Math.floor(normLat * (1 << 20));
  const lngBits = Math.floor(normLng * (1 << 20));

  for (let i = 0; i < 10; i++) {
    // Take 2 bits from each axis → 4-bit index → pick from 20-char set via %
    const nibble = (((latBits >> (18 - i * 2)) & 0x3) << 2) |
                   ((lngBits >> (18 - i * 2)) & 0x3);
    chars.push(DIGIPIN_CHARSET[nibble % 20]);
  }

  // Format: XXXX-XXX-XXX
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 7).join('')}-${chars.slice(7, 10).join('')}`;
}

/** Decode an ISRO-style DIGIPIN string back into a lat/lng pair. */
export function decodeDigipin(digipin: string): { lat: number; lng: number } | null {
  if (!digipin) return null;
  const chars = digipin.replace(/-/g, '').toUpperCase();
  if (chars.length !== 10) return null;

  let latBits = 0;
  let lngBits = 0;

  for (let i = 0; i < 10; i++) {
    const char = chars[i];
    const val = DIGIPIN_CHARSET.indexOf(char);
    if (val === -1) return null;

    const latBit = (val >> 2) & 0x3;
    const lngBit = val & 0x3;

    latBits = (latBits << 2) | latBit;
    lngBits = (lngBits << 2) | lngBit;
  }

  const normLat = latBits / (1 << 20);
  const normLng = lngBits / (1 << 20);

  const lat = INDIA_LAT_MIN + normLat * (INDIA_LAT_MAX - INDIA_LAT_MIN);
  const lng = INDIA_LNG_MIN + normLng * (INDIA_LNG_MAX - INDIA_LNG_MIN);

  return { lat, lng };
}

// ─── GPS Capture ─────────────────────────────────────────────────────────────

const GPS_TIMEOUT_MS = 8000;
const GPS_MAX_AGE_MS = 5000;

/** Capture the user's current GPS position, return SOSLocation with DIGIPIN. */
export function captureLocation(): Promise<SOSLocation> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const digipin = encodeDigipin(lat, lng);
        resolve({
          lat,
          lng,
          digipin,
          accuracy: Math.round(pos.coords.accuracy),
          capturedAt: Date.now(),
        });
      },
      (err) => reject(err),
      {
        enableHighAccuracy: true,
        timeout: GPS_TIMEOUT_MS,
        maximumAge: GPS_MAX_AGE_MS,
      }
    );
  });
}

// ─── Context Classification ──────────────────────────────────────────────────

const WOMEN_KEYWORDS = [
  'assault', 'rape', 'molestation', 'harassment', 'domestic violence',
  'stalking', 'abuse', 'mahila', 'महिला', 'बलात्कार', 'उत्पीड़न', 'घरेलू हिंसा',
  'பாலியல்', 'வன்கொடுமை', 'தாக்குதல்', 'பெண்', // Tamil: sexual, violence, attack, woman
];

const CHILD_KEYWORDS = [
  'child', 'minor', 'kid', 'bachha', 'bachchi', 'बच्चा', 'बच्ची',
  'kidnap', 'trafficking', 'बाल', 'குழந்தை',
];

const CYBER_KEYWORDS = [
  'cyber', 'fraud', 'scam', 'phishing', 'hack', 'online', 'upi', 'otp',
  'धोखाधड़ी', 'साइबर', 'ऑनलाइन', 'மோசடி', 'cyber crime',
];

const DISASTER_KEYWORDS = [
  'flood', 'fire', 'earthquake', 'cyclone', 'landslide', 'building collapse',
  'आग', 'बाढ़', 'भूकंप', 'தீ', 'வெள்ளம்',
];

function containsAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

/** Classify the SOS context to determine which specialist channels to activate. */
export function classifySOSContext(
  description: string,
  userGender?: string,
  userAge?: number
): SOSContext {
  const desc = description || '';
  return {
    requiresWomenSafety:
      containsAny(desc, WOMEN_KEYWORDS) || userGender === 'F' || userGender === 'female',
    requiresChildSafety:
      containsAny(desc, CHILD_KEYWORDS) || (typeof userAge === 'number' && userAge < 18),
    requiresDisasterResponse: containsAny(desc, DISASTER_KEYWORDS),
    requiresCyberCrime: containsAny(desc, CYBER_KEYWORDS),
    description: desc,
  };
}

// ─── Responder Registry ───────────────────────────────────────────────────────

/** Build the responder list for a SOS event.  Conditional responders are only
 *  included when the context flags require them. */
export function buildResponderList(
  context: SOSContext,
  emergencyContact?: { name: string; mobile: string }
): Responder[] {
  const base: Responder[] = [
    {
      id: 'police-100',
      type: 'police',
      name: 'Police Emergency (100)',
      number: '100',
      channel: 'api',
      priority: 1,
    },
    {
      id: 'ambulance-108',
      type: 'ambulance',
      name: 'Ambulance / EMRI (108)',
      number: '108',
      channel: 'api',
      priority: 1,
    },
    {
      id: 'fire-101',
      type: 'fire',
      name: 'Fire Brigade (101)',
      number: '101',
      channel: 'api',
      priority: 2,
    },
    {
      id: 'legal-aid',
      type: 'legal_aid',
      name: 'Nyaya Bandhu Legal Aid',
      number: '15100',
      channel: 'api',
      priority: 3,
    },
  ];

  const conditional: Responder[] = [];

  if (context.requiresWomenSafety) {
    conditional.push({
      id: 'women-1091',
      type: 'women_child_safety',
      name: "Women's Helpline (1091)",
      number: '1091',
      channel: 'api',
      priority: 1,
      conditional: true,
    });
    conditional.push({
      id: 'mahila-thana',
      type: 'women_child_safety',
      name: "Women & Child Safety Wing",
      number: '1091',
      channel: 'webhook',
      priority: 1,
      conditional: true,
    });
  }

  if (context.requiresChildSafety) {
    conditional.push({
      id: 'childline-1098',
      type: 'child_helpline',
      name: 'CHILDLINE India (1098)',
      number: '1098',
      channel: 'api',
      priority: 1,
      conditional: true,
    });
  }

  if (context.requiresCyberCrime) {
    conditional.push({
      id: 'cyber-1930',
      type: 'cyber_crime',
      name: 'Cyber Crime Helpline (1930)',
      number: '1930',
      channel: 'api',
      priority: 2,
      conditional: true,
    });
  }

  if (context.requiresDisasterResponse) {
    conditional.push({
      id: 'ndrf-ndma',
      type: 'disaster_management',
      name: 'NDRF / District Magistrate',
      number: '1078',
      channel: 'webhook',
      priority: 1,
      conditional: true,
    });
  }

  if (emergencyContact) {
    base.push({
      id: `contact-${emergencyContact.mobile}`,
      type: 'contact',
      name: emergencyContact.name,
      number: emergencyContact.mobile,
      channel: 'sms',
      priority: 1,
    });
  }

  return [...base, ...conditional];
}

// ─── Alert Payload Builder ────────────────────────────────────────────────────

export function buildAlertPayload(params: {
  userId: string;
  userName: string;
  userMobile: string;
  location: SOSLocation;
  context: SOSContext;
  responders: Responder[];
}): SOSAlertPayload {
  const now = Date.now(); // single snapshot — eventId and timestamp share the same ms
  return {
    eventId: `SOS-${now}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    timestamp: now,
    ...params,
  };
}

function resolveAppBaseUrl(): string {
  const configuredBase = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || '').trim();
  if (configuredBase) return configuredBase.replace(/\/+$/, '');

  const vercelHost = (process.env.VERCEL_URL || '').trim();
  if (vercelHost) return `https://${vercelHost}`.replace(/\/+$/, '');

  const azureHost = (process.env.WEBSITE_HOSTNAME || '').trim();
  if (azureHost) return `https://${azureHost}`.replace(/\/+$/, '');

  return 'http://127.0.0.1:3000';
}

// ─── Single-responder dispatch (simulated — replace with real API calls) ──────

async function dispatchSingle(
  responder: Responder,
  payload: SOSAlertPayload
): Promise<ResponderResult> {
  const base: Omit<ResponderResult, 'status' | 'notifiedAt' | 'error'> = {
    responderId: responder.id,
    responderName: responder.name,
    type: responder.type,
  };

  try {
    /**
     * In production, each channel has a real integration:
     *   'api'     → POST to Twilio / MSG91 / Exotel programmable calling API
     *   'sms'     → POST to SMS gateway (MSG91 / Amazon SNS)
     *   'webhook' → POST to the department's designated emergency webhook URL
     *   'call'    → POST to click-to-call provider
     *
     * Here we POST to the internal /api/sos/dispatch endpoint which acts as
     * the broker.  In dev/demo mode the endpoint always returns 200 after a
     * short simulated delay to demonstrate the async fan-out.
     */
    // Use an absolute URL — relative paths don't resolve in Node.js server-side fetch.
    const appBase = resolveAppBaseUrl();
    const res = await fetch(`${appBase}/api/sos/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: payload.eventId,
        responderId: responder.id,
        responderType: responder.type,
        channel: responder.channel,
        number: responder.number,
        message: buildSMSText(payload, responder),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    return { ...base, status: 'notified', notifiedAt: Date.now() };
  } catch (err) {
    return {
      ...base,
      status: 'failed',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/** Build the outbound SMS/voice text for a given responder. */
function buildSMSText(payload: SOSAlertPayload, responder: Responder): string {
  const { userName, userMobile, location } = payload;
  const coords = `${location.lat.toFixed(5)},${location.lng.toFixed(5)}`;
  const maps = `https://www.bing.com/maps?q=${coords}`;

  switch (responder.type) {
    case 'police':
      return `🚨 SOS ALERT [${payload.eventId}] — ${userName} (${userMobile}) needs immediate help. ` +
             `DIGIPIN: ${location.digipin} | Coords: ${coords} | Maps: ${maps} | Accuracy: ${location.accuracy}m`;

    case 'ambulance':
      return `🆘 MEDICAL EMERGENCY — Patient: ${userName} (${userMobile}). ` +
             `Location: DIGIPIN ${location.digipin}, ${coords}. Please dispatch immediately. SOS#${payload.eventId}`;

    case 'women_child_safety':
      return `⚠️ WOMEN/CHILD SAFETY ALERT [${payload.eventId}] — ${userName} requires immediate assistance. ` +
             `DIGIPIN: ${location.digipin} | ${coords} | ${maps}`;

    case 'child_helpline':
      return `🚸 CHILD SAFETY SOS [${payload.eventId}] — ${userName} (${userMobile}). ` +
             `Location: ${location.digipin} | ${coords}`;

    case 'contact':
      return `🚨 EMERGENCY — ${userName} has triggered an SOS alert! ` +
             `Last known location: DIGIPIN ${location.digipin}. Please call ${userMobile} now. Ref: ${payload.eventId}`;

    case 'cyber_crime':
      return `🔐 CYBER CRIME SOS [${payload.eventId}] — ${userName} (${userMobile}). ` +
             `Reporting from: ${location.digipin}`;

    case 'disaster_management':
      return `⛑️ DISASTER/NDRF ALERT [${payload.eventId}] — ${userName} at ${location.digipin} (${coords}) requires rescue. ` +
             `Maps: ${maps}`;

    default:
      return `SOS ALERT [${payload.eventId}] — ${userName}, ${userMobile}. ` +
             `Location: ${location.digipin} | ${coords}`;
  }
}

/**
 * Build an offline SMS deep-link for a contact responder when internet is unavailable.
 * Opens the native SMS app pre-populated with the emergency message.
 */
export function generateOfflineSmsLink(location: SOSLocation, phone: string): string {
  const coords = `${location.lat.toFixed(5)},${location.lng.toFixed(5)}`;
  const maps = `https://www.bing.com/maps?q=${coords}`;
  const text = encodeURIComponent(
    `🚨 SOS EMERGENCY — I need help! DIGIPIN: ${location.digipin} | Coords: ${coords} | ${maps}`
  );
  return `sms:${phone}?body=${text}`;
}

// ─── Main Async Fan-out Dispatcher ───────────────────────────────────────────

/**
 * Dispatch alerts to ALL responders concurrently using Promise.allSettled.
 * Returns immediately once all dispatches have settled (typically < 3s).
 * Individual failures do NOT block other responders.
 */
export async function dispatchSOS(payload: SOSAlertPayload): Promise<SOSDispatchResult> {
  const settled = await Promise.allSettled(
    payload.responders.map((r) => dispatchSingle(r, payload))
  );

  const results: ResponderResult[] = settled.map((s, i) =>
    s.status === 'fulfilled'
      ? s.value
      : {
          responderId: payload.responders[i].id,
          responderName: payload.responders[i].name,
          type: payload.responders[i].type,
          status: 'failed' as const,
          error: s.reason?.message || 'Dispatch failed',
        }
  );

  return {
    eventId: payload.eventId,
    results,
    dispatchedAt: Date.now(),
    allNotified: results.every((r) => r.status === 'notified'),
  };
}
