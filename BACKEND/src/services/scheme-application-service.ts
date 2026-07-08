import { randomUUID } from 'crypto';
import { getBackendContainer } from '../cosmos-backend';
import { BackendHttpError } from './backend-errors';

const SCHEME_APPLICATION_TYPE = 'schemeApplication';

function normalizeLimit(limitRaw: number | undefined, fallback: number, max: number): number {
  const candidate = typeof limitRaw === 'number' ? limitRaw : fallback;
  return Number.isFinite(candidate) ? Math.max(1, Math.min(max, Math.floor(candidate))) : fallback;
}

export async function getSchemeApplications(params: { userId?: string; applicationId?: string; limitRaw?: number }) {
  const applicationId = params.applicationId?.trim();
  const userId = params.userId?.trim();
  const limit = normalizeLimit(params.limitRaw, 50, 100);

  const container = await getBackendContainer('schemeApplications');
  if (!container) {
    if (applicationId) {
      return { found: false, application: null };
    }
    return { userId: userId || '', count: 0, applications: [] };
  }

  if (applicationId) {
    const { resources } = await container.items
      .query({
        query: 'SELECT TOP 1 * FROM c WHERE c.type = @type AND c.id = @applicationId',
        parameters: [
          { name: '@type', value: SCHEME_APPLICATION_TYPE },
          { name: '@applicationId', value: applicationId },
        ],
      })
      .fetchAll();

    return { found: Boolean(resources[0]), application: resources[0] || null };
  }

  if (!userId) {
    throw new BackendHttpError(400, 'userId is required when applicationId is not provided');
  }

  const { resources } = await container.items
    .query(
      {
        query:
          `SELECT TOP ${limit} * FROM c WHERE c.type = @type AND c.userId = @userId ORDER BY c.updatedAt DESC`,
        parameters: [
          { name: '@type', value: SCHEME_APPLICATION_TYPE },
          { name: '@userId', value: userId },
        ],
      },
      { partitionKey: userId },
    )
    .fetchAll();

  return { userId, count: resources.length, applications: resources };
}

export async function upsertSchemeApplication(body: Record<string, unknown>) {
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!userId) {
    throw new BackendHttpError(400, 'userId is required');
  }

  const container = await getBackendContainer('schemeApplications');
  const mockMode = !container;

  const applicationId =
    typeof body.applicationId === 'string' && body.applicationId.trim()
      ? body.applicationId.trim()
      : `APP-${Date.now()}-${randomUUID().slice(0, 6)}`;

  const now = Date.now();
  const item = {
    id: applicationId,
    type: SCHEME_APPLICATION_TYPE,
    userId,
    schemeId: typeof body.schemeId === 'string' ? body.schemeId : undefined,
    schemeName: typeof body.schemeName === 'string' ? body.schemeName.slice(0, 200) : undefined,
    docsStatus: body.docsStatus ?? undefined,
    workflowStage: typeof body.workflowStage === 'string' ? body.workflowStage : 'submitted',
    approvals: body.approvals ?? undefined,
    notes: typeof body.notes === 'string' ? body.notes.slice(0, 2000) : undefined,
    updatedAt: now,
    createdAt: typeof body.createdAt === 'number' ? body.createdAt : now,
  };

  if (mockMode) {
    return { success: true, application: item };
  }

  const result = await container!.items.upsert(item);
  return { success: true, application: result.resource };
}
