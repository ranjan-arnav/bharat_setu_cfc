import { randomUUID } from 'crypto';
import { getBackendContainer } from '../cosmos-backend';
import { BackendHttpError } from './backend-errors';

const MESSAGE_TYPE = 'message';

function normalizeRole(value: unknown): 'user' | 'assistant' | 'system' {
  if (value === 'assistant' || value === 'system') return value;
  return 'user';
}

function normalizeLimit(limitRaw: number | undefined, fallback: number, max: number): number {
  const candidate = typeof limitRaw === 'number' ? limitRaw : fallback;
  return Number.isFinite(candidate) ? Math.max(1, Math.min(max, Math.floor(candidate))) : fallback;
}

export async function getMessages(conversationId: string, limitRaw?: number) {
  const normalizedConversationId = conversationId.trim();
  if (!normalizedConversationId) {
    throw new BackendHttpError(400, 'conversationId is required');
  }

  const container = await getBackendContainer('messages');
  if (!container) {
    return {
      conversationId: normalizedConversationId,
      count: 0,
      messages: [],
    };
  }

  const limit = normalizeLimit(limitRaw, 50, 100);
  const { resources } = await container.items
    .query(
      {
        query:
          `SELECT TOP ${limit} c.id, c.type, c.userId, c.conversationId, c.agentKey, c.role, c.content, c.createdAt FROM c WHERE c.type = @type AND c.conversationId = @conversationId ORDER BY c.createdAt DESC`,
        parameters: [
          { name: '@type', value: MESSAGE_TYPE },
          { name: '@conversationId', value: normalizedConversationId },
        ],
      },
      { partitionKey: normalizedConversationId },
    )
    .fetchAll();

  return {
    conversationId: normalizedConversationId,
    count: resources.length,
    messages: resources.reverse(),
  };
}

export async function createMessage(body: Record<string, unknown>) {
  const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : '';
  const contentRaw = typeof body.content === 'string' ? body.content : '';

  if (!conversationId) {
    throw new BackendHttpError(400, 'conversationId is required');
  }

  if (!contentRaw.trim()) {
    throw new BackendHttpError(400, 'content is required');
  }

  const container = await getBackendContainer('messages');
  const mockMode = !container;

  const item = {
    id: randomUUID(),
    type: MESSAGE_TYPE,
    userId: typeof body.userId === 'string' ? body.userId.trim() : 'anonymous',
    conversationId,
    agentKey: typeof body.agentKey === 'string' ? body.agentKey.slice(0, 64) : 'nagarik_mitra',
    role: normalizeRole(body.role),
    content: contentRaw.trim().slice(0, 4000),
    createdAt: typeof body.createdAt === 'number' ? body.createdAt : Date.now(),
  };

  if (mockMode) {
    return { success: true, message: item };
  }

  const result = await container!.items.create(item);
  return { success: true, message: result.resource };
}
