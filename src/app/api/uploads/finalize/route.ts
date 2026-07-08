import { NextRequest, NextResponse } from 'next/server';
import { startRouteTelemetry } from '@/lib/telemetry';
import { finalizeUploadSession } from '@/lib/upload-pipeline';

export async function POST(request: NextRequest) {
  const telemetry = startRouteTelemetry(request, 'api.uploads.finalize.post');

  try {
    const { uploadId, userId = '', caseId = '', checksum = '', sizeBytes } = (await request.json()) as {
      uploadId: string;
      userId?: string;
      caseId?: string;
      checksum?: string;
      sizeBytes?: number;
    };

    if (!uploadId || uploadId.trim().length < 8) {
      telemetry.complete(400, { reason: 'invalid_upload_id' });
      return NextResponse.json({ error: 'Valid uploadId is required' }, { status: 400 });
    }

    const result = await finalizeUploadSession({
      uploadId: uploadId.trim(),
      userId,
      caseId,
      checksum,
      sizeBytes,
    });

    if (!result.ok) {
      telemetry.complete(404, { reason: result.reason || 'finalize_failed' });
      return NextResponse.json({ error: result.reason || 'Unable to finalize upload' }, { status: 404 });
    }

    telemetry.complete(200, {
      uploadId,
      asyncJobOk: result.asyncJob?.ok ?? false,
      queueName: result.asyncJob?.queueName || '',
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    telemetry.fail(error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message.slice(0, 160) }, { status: 500 });
  }
}
