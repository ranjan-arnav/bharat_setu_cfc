import {
  BlobSASPermissions,
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';
import { getBackendContainer } from '@/lib/cosmos-backend';
import { enqueueAsyncJob } from '@/lib/async-jobs';

export type UploadRequest = {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  userId?: string;
  caseId?: string;
  sourceType?: 'grievance' | 'scheme' | 'general';
};

export type UploadSession = {
  uploadId: string;
  blobName: string;
  blobUrl: string;
  uploadUrl: string;
  expiresAt: string;
  container: string;
};

type ParsedConnectionString = {
  accountName: string;
  accountKey: string;
  endpointSuffix: string;
  defaultProtocol: string;
};

function parseConnectionString(raw: string): ParsedConnectionString | null {
  const parts = raw.split(';').map((entry) => entry.trim()).filter(Boolean);
  const kv = new Map<string, string>();

  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx);
    const value = part.slice(idx + 1);
    kv.set(key, value);
  }

  const accountName = kv.get('AccountName') || '';
  const accountKey = kv.get('AccountKey') || '';
  const endpointSuffix = kv.get('EndpointSuffix') || 'core.windows.net';
  const defaultProtocol = kv.get('DefaultEndpointsProtocol') || 'https';

  if (!accountName || !accountKey) return null;

  return {
    accountName,
    accountKey,
    endpointSuffix,
    defaultProtocol,
  };
}

function sanitizeFileName(input: string): string {
  const ext = input.includes('.') ? input.slice(input.lastIndexOf('.') + 1).replace(/[^a-zA-Z0-9]/g, '') : 'bin';
  const base = input
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);

  return `${base || 'upload'}.${ext || 'bin'}`;
}

function uploadsContainerName(): string {
  return process.env.AZURE_BLOB_UPLOAD_CONTAINER?.trim() || 'bharat-setu-uploads';
}

export async function createUploadSession(request: UploadRequest): Promise<UploadSession | null> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim() || '';
  const parsed = parseConnectionString(connectionString);
  if (!parsed) return null;

  const containerName = uploadsContainerName();
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(containerName);
  await containerClient.createIfNotExists();

  const uploadId = crypto.randomUUID();
  const now = Date.now();
  const blobName = `${new Date(now).toISOString().slice(0, 10)}/${uploadId}-${sanitizeFileName(request.fileName)}`;

  const startsOn = new Date(now - 2 * 60 * 1000);
  const expiresOn = new Date(now + 15 * 60 * 1000);
  const sharedKey = new StorageSharedKeyCredential(parsed.accountName, parsed.accountKey);

  const sas = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse('cw'),
      startsOn,
      expiresOn,
      contentType: request.contentType,
    },
    sharedKey
  ).toString();

  const accountUrl = `${parsed.defaultProtocol}://${parsed.accountName}.blob.${parsed.endpointSuffix}`;
  const blobUrl = `${accountUrl}/${containerName}/${blobName}`;
  const uploadUrl = `${blobUrl}?${sas}`;

  const container = await getBackendContainer('uploads');
  if (container) {
    const item = {
      id: uploadId,
      type: 'upload',
      userId: request.userId?.trim() || 'anonymous',
      caseId: request.caseId || undefined,
      sourceType: request.sourceType || 'general',
      status: 'sas-issued',
      fileName: sanitizeFileName(request.fileName),
      originalFileName: request.fileName,
      contentType: request.contentType,
      sizeBytes: request.sizeBytes,
      blobName,
      container: containerName,
      blobUrl,
      createdAt: now,
      updatedAt: now,
      expiresAt: expiresOn.toISOString(),
    };

    await container.items.upsert(item);
  }

  return {
    uploadId,
    blobName,
    blobUrl,
    uploadUrl,
    expiresAt: expiresOn.toISOString(),
    container: containerName,
  };
}

export async function finalizeUploadSession(input: {
  uploadId: string;
  userId?: string;
  caseId?: string;
  checksum?: string;
  sizeBytes?: number;
}) {
  const uploads = await getBackendContainer('uploads');
  if (!uploads) {
    return { ok: false, reason: 'uploads_container_unavailable' };
  }

  try {
    const { resource } = await uploads.item(input.uploadId, input.userId?.trim() || 'anonymous').read();
    if (!resource) {
      return { ok: false, reason: 'upload_not_found' };
    }

    const updated = {
      ...resource,
      status: 'uploaded',
      updatedAt: Date.now(),
      checksum: input.checksum || undefined,
      sizeBytes: typeof input.sizeBytes === 'number' ? input.sizeBytes : resource.sizeBytes,
      caseId: input.caseId || resource.caseId,
    };

    await uploads.items.upsert(updated);

    const enqueue = await enqueueAsyncJob({
      type: 'scan-classify',
      userId: input.userId || resource.userId,
      caseId: input.caseId || resource.caseId,
      uploadId: input.uploadId,
      payload: {
        uploadId: input.uploadId,
        blobUrl: resource.blobUrl,
        blobName: resource.blobName,
        container: resource.container,
        contentType: resource.contentType,
        sizeBytes: updated.sizeBytes,
      },
    });

    return {
      ok: true,
      upload: {
        uploadId: input.uploadId,
        blobUrl: resource.blobUrl,
        blobName: resource.blobName,
        status: updated.status,
      },
      asyncJob: enqueue,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: message.slice(0, 120),
    };
  }
}
