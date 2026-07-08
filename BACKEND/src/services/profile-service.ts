import { getBackendContainer } from '../cosmos-backend';
import { BackendHttpError } from './backend-errors';

const PROFILE_TYPE = 'profile';

export async function getProfileByUserId(userId: string) {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new BackendHttpError(400, 'userId is required');
  }

  const container = await getBackendContainer('profiles');
  if (!container) {
    return { found: false, profile: null };
  }

  const { resources } = await container.items
    .query(
      {
        query: 'SELECT TOP 1 * FROM c WHERE c.type = @type AND c.userId = @userId ORDER BY c.updatedAt DESC',
        parameters: [
          { name: '@type', value: PROFILE_TYPE },
          { name: '@userId', value: normalizedUserId },
        ],
      },
      { partitionKey: normalizedUserId },
    )
    .fetchAll();

  return { found: Boolean(resources[0]), profile: resources[0] || null };
}

export async function upsertProfile(body: Record<string, unknown>) {
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!userId) {
    throw new BackendHttpError(400, 'userId is required');
  }

  const container = await getBackendContainer('profiles');
  if (!container) {
    return { success: true, profile: { ...body } };
  }

  const now = Date.now();
  const item = {
    id: `profile:${userId}`,
    type: PROFILE_TYPE,
    userId,
    ...body,
    updatedAt: now,
    createdAt: typeof body.createdAt === 'number' ? body.createdAt : now,
  };

  const result = await container.items.upsert(item);
  return { success: true, profile: result.resource };
}
