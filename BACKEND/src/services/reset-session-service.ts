import { getBackendContainer } from '../cosmos-backend';
import { BackendHttpError } from './backend-errors';

type ResetSummary = {
  profiles: number;
  cases: number;
  schemeApplications: number;
  sosSessions: number;
  sosEvents: number;
  enrichments: number;
  uploads: number;
  asyncJobs: number;
  clusterAnalytics: number;
  notificationAnalytics: number;
  messages: number;
  totalDeleted: number;
};

async function deleteUserPartitionItems(containerName:
  | 'profiles'
  | 'cases'
  | 'schemeApplications'
  | 'sosSessions'
  | 'enrichments'
  | 'uploads'
  | 'asyncJobs'
  | 'clusterAnalytics'
  | 'notificationAnalytics',
  userId: string,
) {
  const container = await getBackendContainer(containerName);
  if (!container) {
    return 0;
  }

  const { resources } = await container.items
    .query(
      {
        query: 'SELECT c.id FROM c WHERE c.userId = @userId',
        parameters: [{ name: '@userId', value: userId }],
      },
      { partitionKey: userId },
    )
    .fetchAll();

  let deleted = 0;
  for (const resource of resources) {
    const id = typeof resource.id === 'string' ? resource.id : '';
    if (!id) continue;
    await container.item(id, userId).delete();
    deleted += 1;
  }

  return deleted;
}

async function deleteMessagesForUser(userId: string) {
  const container = await getBackendContainer('messages');
  if (!container) {
    return 0;
  }

  const { resources } = await container.items
    .query({
      query: 'SELECT c.id, c.conversationId FROM c WHERE c.userId = @userId',
      parameters: [{ name: '@userId', value: userId }],
    })
    .fetchAll();

  let deleted = 0;
  for (const resource of resources) {
    const id = typeof resource.id === 'string' ? resource.id : '';
    const conversationId = typeof resource.conversationId === 'string' ? resource.conversationId : '';
    if (!id || !conversationId) continue;
    await container.item(id, conversationId).delete();
    deleted += 1;
  }

  return deleted;
}

async function deleteSosEventsBySessionIds(sessionIds: string[]) {
  if (sessionIds.length === 0) return 0;

  const eventsContainer = await getBackendContainer('sosEvents');
  if (!eventsContainer) {
    return 0;
  }

  let deleted = 0;
  for (const sessionId of sessionIds) {
    const { resources } = await eventsContainer.items
      .query(
        {
          query: 'SELECT c.id FROM c WHERE c.sessionId = @sessionId',
          parameters: [{ name: '@sessionId', value: sessionId }],
        },
        { partitionKey: sessionId },
      )
      .fetchAll();

    for (const resource of resources) {
      const id = typeof resource.id === 'string' ? resource.id : '';
      if (!id) continue;
      await eventsContainer.item(id, sessionId).delete();
      deleted += 1;
    }
  }

  return deleted;
}

export async function resetSessionCloudData(body: Record<string, unknown>) {
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!userId) {
    throw new BackendHttpError(400, 'userId is required');
  }

  const summary: ResetSummary = {
    profiles: 0,
    cases: 0,
    schemeApplications: 0,
    sosSessions: 0,
    sosEvents: 0,
    enrichments: 0,
    uploads: 0,
    asyncJobs: 0,
    clusterAnalytics: 0,
    notificationAnalytics: 0,
    messages: 0,
    totalDeleted: 0,
  };

  const sosContainer = await getBackendContainer('sosSessions');
  let sessionIds: string[] = [];
  if (sosContainer) {
    const sosSessionQuery = await sosContainer.items
      .query(
        {
          query: 'SELECT c.id FROM c WHERE c.userId = @userId',
          parameters: [{ name: '@userId', value: userId }],
        },
        { partitionKey: userId },
      )
      .fetchAll();
    sessionIds = sosSessionQuery.resources
      .map((resource) => (typeof resource.id === 'string' ? resource.id : ''))
      .filter(Boolean);
  }

  summary.sosEvents = await deleteSosEventsBySessionIds(sessionIds);

  summary.profiles = await deleteUserPartitionItems('profiles', userId);
  summary.cases = await deleteUserPartitionItems('cases', userId);
  summary.schemeApplications = await deleteUserPartitionItems('schemeApplications', userId);
  summary.sosSessions = await deleteUserPartitionItems('sosSessions', userId);
  summary.enrichments = await deleteUserPartitionItems('enrichments', userId);
  summary.uploads = await deleteUserPartitionItems('uploads', userId);
  summary.asyncJobs = await deleteUserPartitionItems('asyncJobs', userId);
  summary.clusterAnalytics = await deleteUserPartitionItems('clusterAnalytics', userId);
  summary.notificationAnalytics = await deleteUserPartitionItems('notificationAnalytics', userId);
  summary.messages = await deleteMessagesForUser(userId);

  summary.totalDeleted =
    summary.profiles +
    summary.cases +
    summary.schemeApplications +
    summary.sosSessions +
    summary.sosEvents +
    summary.enrichments +
    summary.uploads +
    summary.asyncJobs +
    summary.clusterAnalytics +
    summary.notificationAnalytics +
    summary.messages;

  return {
    success: true,
    userId,
    summary,
  };
}