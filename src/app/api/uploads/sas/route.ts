import { NextRequest, NextResponse } from 'next/server';
import { startRouteTelemetry } from '@/lib/telemetry';
import { createUploadSession } from '@/lib/upload-pipeline';

export async function POST(request: NextRequest) {
  const telemetry = startRouteTelemetry(request, 'api.uploads.sas.post');

  try {
    const { fileName, contentType, sizeBytes, userId = '', caseId = '', sourceType = 'general' } =
      (await request.json()) as {
        fileName: string;
        contentType: string;
        sizeBytes: number;
        userId?: string;
        caseId?: string;
        sourceType?: 'grievance' | 'scheme' | 'general';
      };

    if (!fileName || !contentType || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      telemetry.complete(400, { reason: 'invalid_payload' });
      return NextResponse.json({ error: 'Invalid upload request payload' }, { status: 400 });
    }

    const session = await createUploadSession({
      fileName,
      contentType,
      sizeBytes,
      userId,
      caseId,
      sourceType,
    });

    if (!session) {
      telemetry.complete(503, { reason: 'storage_not_configured' });
      return NextResponse.json(
        { error: 'Blob storage is not configured. Set AZURE_STORAGE_CONNECTION_STRING.' },
        { status: 503 }
      );
    }

    telemetry.complete(200, {
      uploadId: session.uploadId,
      container: session.container,
    });

    return NextResponse.json({
      uploadId: session.uploadId,
      uploadUrl: session.uploadUrl,
      blobUrl: session.blobUrl,
      blobName: session.blobName,
      container: session.container,
      expiresAt: session.expiresAt,
    });
  } catch (error: unknown) {
    telemetry.fail(error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message.slice(0, 160) }, { status: 500 });
  }
}
