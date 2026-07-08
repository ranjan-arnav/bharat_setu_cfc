import { NextRequest, NextResponse } from 'next/server';
import { appendSOSLocationUpdates } from '@/lib/sos-storage';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { eventId, updates, isOfflineBatch } = body;

        if (!eventId || !updates || !Array.isArray(updates)) {
            return NextResponse.json({ error: 'Missing or malformed payload' }, { status: 400 });
        }

        const count = await appendSOSLocationUpdates(eventId, updates);

        // In a production environment, this data would sync to Redis, Cosmos DB, or an Azure IoT hub
        console.log(`[SOS-Update] Stored ${updates.length} locations for ${eventId}. OfflineBatch: ${!!isOfflineBatch}`);

        return NextResponse.json({ success: true, count });
    } catch (err) {
        console.error('[SOS API Update Location] Error:', err);
        return NextResponse.json(
            { error: 'Internal server error processing location updates' },
            { status: 500 }
        );
    }
}
