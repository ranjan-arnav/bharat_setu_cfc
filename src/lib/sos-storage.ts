import type { SOSDispatchResult } from './sos-engine';

type SOSActivitySession = {
  locations: unknown[];
  updatedAt: number;
};

const DISPATCH_TTL_SECONDS = 60 * 60;
const ACTIVITY_TTL_SECONDS = 60 * 60 * 6;

const redisRestUrl = process.env.REDIS_REST_URL;
const redisRestToken = process.env.REDIS_REST_TOKEN;
const hasRedis = Boolean(redisRestUrl && redisRestToken);

const g = globalThis as typeof globalThis & {
  _sosDispatchMem?: Map<string, SOSDispatchResult>;
  _sosActivityMem?: Map<string, SOSActivitySession>;
};

if (!g._sosDispatchMem) g._sosDispatchMem = new Map<string, SOSDispatchResult>();
if (!g._sosActivityMem) g._sosActivityMem = new Map<string, SOSActivitySession>();

const dispatchMem = g._sosDispatchMem;
const activityMem = g._sosActivityMem;

function dispatchKey(eventId: string) {
  return `sos:dispatch:${eventId}`;
}

function activityKey(eventId: string) {
  return `sos:activity:${eventId}`;
}

async function upstashCommand<T = unknown>(...command: Array<string | number>): Promise<T | null> {
  if (!hasRedis) return null;

  const response = await fetch(redisRestUrl as string, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${redisRestToken as string}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Redis REST error ${response.status}: ${text}`);
  }

  const payload = (await response.json()) as { result?: T; error?: string };
  if (payload.error) {
    throw new Error(payload.error);
  }
  return (payload.result as T | undefined) ?? null;
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await upstashCommand<string>('GET', key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (error: unknown) {
    console.error('[SOS Storage] Failed to read Redis key:', key, error);
    return null;
  }
}

async function writeJson(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
  try {
    await upstashCommand('SET', key, JSON.stringify(value), 'EX', ttlSeconds);
    return true;
  } catch (error: unknown) {
    console.error('[SOS Storage] Failed to write Redis key:', key, error);
    return false;
  }
}

async function deleteKey(key: string): Promise<void> {
  try {
    await upstashCommand('DEL', key);
  } catch (error: unknown) {
    console.error('[SOS Storage] Failed to delete Redis key:', key, error);
  }
}

export async function setSOSDispatchResult(eventId: string, result: SOSDispatchResult): Promise<void> {
  dispatchMem.set(eventId, result);
  setTimeout(() => dispatchMem.delete(eventId), DISPATCH_TTL_SECONDS * 1000);

  if (hasRedis) {
    await writeJson(dispatchKey(eventId), result, DISPATCH_TTL_SECONDS);
  }
}

export async function getSOSDispatchResult(eventId: string): Promise<SOSDispatchResult | null> {
  const inMemory = dispatchMem.get(eventId);
  if (inMemory) return inMemory;

  if (!hasRedis) return null;

  const persisted = await readJson<SOSDispatchResult>(dispatchKey(eventId));
  if (persisted) dispatchMem.set(eventId, persisted);
  return persisted;
}

export async function deleteSOSDispatchResult(eventId: string): Promise<void> {
  dispatchMem.delete(eventId);
  if (hasRedis) {
    await deleteKey(dispatchKey(eventId));
  }
}

export async function appendSOSLocationUpdates(eventId: string, updates: unknown[]): Promise<number> {
  const now = Date.now();
  const existing = activityMem.get(eventId) ?? { locations: [], updatedAt: now };
  existing.locations.push(...updates);
  existing.updatedAt = now;
  activityMem.set(eventId, existing);

  if (hasRedis) {
    const persisted = (await readJson<SOSActivitySession>(activityKey(eventId))) ?? { locations: [], updatedAt: now };
    persisted.locations.push(...updates);
    persisted.updatedAt = now;
    await writeJson(activityKey(eventId), persisted, ACTIVITY_TTL_SECONDS);
    activityMem.set(eventId, persisted);
    return persisted.locations.length;
  }

  return existing.locations.length;
}

export async function deleteSOSActivity(eventId: string): Promise<void> {
  activityMem.delete(eventId);
  if (hasRedis) {
    await deleteKey(activityKey(eventId));
  }
}
