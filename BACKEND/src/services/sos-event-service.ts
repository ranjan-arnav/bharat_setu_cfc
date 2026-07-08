import { randomUUID } from 'crypto';
import { getBackendContainer } from '../cosmos-backend';
import { BackendHttpError } from './backend-errors';

const SOS_EVENT_TYPE = 'sosEvent';

function normalizeLimit(limitRaw: number | undefined, fallback: number, max: number): number {
  const candidate = typeof limitRaw === 'number' ? limitRaw : fallback;
  return Number.isFinite(candidate) ? Math.max(1, Math.min(max, Math.floor(candidate))) : fallback;
}

export async function getSosEvents(sessionId: string, limitRaw?: number) {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    throw new BackendHttpError(400, 'sessionId is required');
  }

  const container = await getBackendContainer('sosEvents');
  if (!container) {
    return { sessionId: normalizedSessionId, count: 0, events: [] };
  }

  const limit = normalizeLimit(limitRaw, 100, 500);
  const { resources } = await container.items
    .query(
      {
        query:
          `SELECT TOP ${limit} * FROM c WHERE c.type = @type AND c.sessionId = @sessionId ORDER BY c.createdAt DESC`,
        parameters: [
          { name: '@type', value: SOS_EVENT_TYPE },
          { name: '@sessionId', value: normalizedSessionId },
        ],
      },
      { partitionKey: normalizedSessionId },
    )
    .fetchAll();

  return { sessionId: normalizedSessionId, count: resources.length, events: resources.reverse() };
}

export async function createSosEvent(body: Record<string, unknown>) {
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  if (!sessionId) {
    throw new BackendHttpError(400, 'sessionId is required');
  }

  const container = await getBackendContainer('sosEvents');
  const mockMode = !container;

  const ttl = typeof body.ttl === 'number' && body.ttl > 0 ? Math.floor(body.ttl) : undefined;

  const item = {
    id: randomUUID(),
    type: SOS_EVENT_TYPE,
    sessionId,
    eventType: typeof body.eventType === 'string' ? body.eventType.slice(0, 64) : 'update',
    location: body.location ?? null,
    status: typeof body.status === 'string' ? body.status.slice(0, 64) : undefined,
    payload: body.payload ?? undefined,
    createdAt: typeof body.createdAt === 'number' ? body.createdAt : Date.now(),
    ...(ttl ? { ttl } : {}),
  };

  if (mockMode) {
    return { success: true, event: item };
  }

  const result = await container!.items.create(item);
  return { success: true, event: result.resource };
}
