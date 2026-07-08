import { QueueClient } from '@azure/storage-queue';
import { getBackendContainer } from '@/lib/cosmos-backend';

export type AsyncJobType =
  | 'cluster'
  | 'notify'
  | 'postprocess'
  | 'scan-classify';

export type AsyncJobRecord = {
  id: string;
  type: AsyncJobType;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  userId: string;
  caseId?: string;
  uploadId?: string;
  queueName: string;
  payload: Record<string, unknown>;
  attempts: number;
  createdAt: number;
  updatedAt: number;
};

type QueueMap = Record<AsyncJobType, string>;

const queueMap: QueueMap = {
  cluster: process.env.ASYNC_QUEUE_CLUSTER_NAME || 'bs-cluster-jobs',
  notify: process.env.ASYNC_QUEUE_NOTIFY_NAME || 'bs-notify-jobs',
  postprocess: process.env.ASYNC_QUEUE_POSTPROCESS_NAME || 'bs-postprocess-jobs',
  'scan-classify': process.env.ASYNC_QUEUE_SCAN_NAME || 'bs-scan-jobs',
};

function getStorageConnectionString(): string {
  return process.env.AZURE_STORAGE_CONNECTION_STRING?.trim() || '';
}

function getQueueClient(queueName: string): QueueClient | null {
  const connectionString = getStorageConnectionString();
  if (!connectionString) return null;
  return new QueueClient(connectionString, queueName);
}

function serializePayload(payload: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

export async function createAsyncJob(job: Omit<AsyncJobRecord, 'status' | 'attempts' | 'createdAt' | 'updatedAt'>): Promise<AsyncJobRecord | null> {
  const container = await getBackendContainer('asyncJobs');
  if (!container) return null;

  const now = Date.now();
  const record: AsyncJobRecord = {
    ...job,
    status: 'queued',
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await container.items.create(record);
    return record;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[AsyncJobs] failed to create job record:', message);
    return null;
  }
}

export async function enqueueAsyncJob(input: {
  type: AsyncJobType;
  userId?: string;
  caseId?: string;
  uploadId?: string;
  payload: Record<string, unknown>;
}): Promise<{ ok: boolean; jobId: string; queueName: string; reason?: string }> {
  const queueName = queueMap[input.type];
  const queueClient = getQueueClient(queueName);
  const jobId = crypto.randomUUID();

  if (!queueClient) {
    return {
      ok: false,
      jobId,
      queueName,
      reason: 'storage_connection_string_missing',
    };
  }

  try {
    await queueClient.createIfNotExists();

    const payload = {
      jobId,
      type: input.type,
      userId: input.userId || 'anonymous',
      caseId: input.caseId,
      uploadId: input.uploadId,
      createdAt: Date.now(),
      payload: input.payload,
    };

    await queueClient.sendMessage(serializePayload(payload));

    await createAsyncJob({
      id: jobId,
      type: input.type,
      userId: input.userId || 'anonymous',
      caseId: input.caseId,
      uploadId: input.uploadId,
      queueName,
      payload: input.payload,
    });

    return {
      ok: true,
      jobId,
      queueName,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      jobId,
      queueName,
      reason: message.slice(0, 120),
    };
  }
}
