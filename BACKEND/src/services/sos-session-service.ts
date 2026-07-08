import { randomUUID } from 'crypto';
import { getBackendContainer } from '../cosmos-backend';
import { BackendHttpError } from './backend-errors';

const SOS_SESSION_TYPE = 'sosSession';

function normalizeLimit(limitRaw: number | undefined, fallback: number, max: number): number {
  const candidate = typeof limitRaw === 'number' ? limitRaw : fallback;
  return Number.isFinite(candidate) ? Math.max(1, Math.min(max, Math.floor(candidate))) : fallback;
}

export async function getSosSessions(params: { userId?: string; sessionId?: string; limitRaw?: number }) {
  const userId = params.userId?.trim();
  const sessionId = params.sessionId?.trim();
  const limit = normalizeLimit(params.limitRaw, 20, 100);

  const container = await getBackendContainer('sosSessions');
  if (!container) {
    if (sessionId) {
      return { found: false, session: null };
    }
    return { userId: userId || '', count: 0, sessions: [] };
  }

  if (sessionId) {
    const { resources } = await container.items
      .query({
        query: 'SELECT TOP 1 * FROM c WHERE c.type = @type AND c.id = @sessionId',
        parameters: [
          { name: '@type', value: SOS_SESSION_TYPE },
          { name: '@sessionId', value: sessionId },
        ],
      })
      .fetchAll();

    return { found: Boolean(resources[0]), session: resources[0] || null };
  }

  if (!userId) {
    throw new BackendHttpError(400, 'userId is required when sessionId is not provided');
  }

  const { resources } = await container.items
    .query(
      {
        query:
          `SELECT TOP ${limit} * FROM c WHERE c.type = @type AND c.userId = @userId ORDER BY c.updatedAt DESC`,
        parameters: [
          { name: '@type', value: SOS_SESSION_TYPE },
          { name: '@userId', value: userId },
        ],
      },
      { partitionKey: userId },
    )
    .fetchAll();

  return { userId, count: resources.length, sessions: resources };
}

export async function upsertSosSession(body: Record<string, unknown>) {
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!userId) {
    throw new BackendHttpError(400, 'userId is required');
  }

  const container = await getBackendContainer('sosSessions');
  const mockMode = !container;

  const sessionId =
    typeof body.sessionId === 'string' && body.sessionId.trim()
      ? body.sessionId.trim()
      : `SOS-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const now = Date.now();

  const item = {
    id: sessionId,
    type: SOS_SESSION_TYPE,
    userId,
    status: typeof body.status === 'string' ? body.status : 'active',
    location: body.location ?? null,
    responderState: body.responderState ?? null,
    notes: typeof body.notes === 'string' ? body.notes.slice(0, 2000) : undefined,
    updatedAt: now,
    createdAt: typeof body.createdAt === 'number' ? body.createdAt : now,
    endedAt: typeof body.endedAt === 'number' ? body.endedAt : undefined,
    metadata: body.metadata ?? undefined,
  };

  if (mockMode) {
    return { success: true, session: item };
  }

  const result = await container!.items.upsert(item);
  return { success: true, session: result.resource };
}
