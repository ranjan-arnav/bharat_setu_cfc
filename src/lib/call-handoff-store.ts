import { CosmosClient, Container } from '@azure/cosmos';

export type PendingCallEvent = {
  callId: string;
  continuationToken: string;
  continuationMode: 'call_only' | 'chat_or_call';
  agentKey: string;
  language: string;
  digipin: string;
  userName: string;
  mobile: string;
  conversation: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: number }>;
  createdAt: number;
  emergencyType?: string;
  emergencyLabel?: string;
};

type ChannelQueue = {
  event: PendingCallEvent;
  expiresAt: number;
};

const TTL_MS = 2 * 60 * 1000;
const TTL_SECONDS = Math.floor(TTL_MS / 1000);
const queue = new Map<string, ChannelQueue>();

type CosmosQueueItem = {
  id: string;
  type: 'call_event';
  channel: string;
  createdAt: number;
  expiresAt: number;
  ttl: number;
  event: PendingCallEvent;
};

let containerPromise: Promise<Container | null> | null = null;

function normalizeChannel(value?: string): string {
  const trimmed = (value || 'local-rn').trim();
  return trimmed.length > 0 ? trimmed : 'local-rn';
}

function enqueueFallback(channel: string, event: PendingCallEvent): void {
  const key = normalizeChannel(channel);
  queue.set(key, { event, expiresAt: Date.now() + TTL_MS });
}

function takeFallback(channel: string): PendingCallEvent | null {
  const key = normalizeChannel(channel);
  const item = queue.get(key);
  if (!item) return null;

  if (Date.now() > item.expiresAt) {
    queue.delete(key);
    return null;
  }

  queue.delete(key);
  return item.event;
}

function peekFallback(channel: string): PendingCallEvent | null {
  const key = normalizeChannel(channel);
  const item = queue.get(key);
  if (!item) return null;

  if (Date.now() > item.expiresAt) {
    queue.delete(key);
    return null;
  }

  return item.event;
}

async function getContainer(): Promise<Container | null> {
  if (containerPromise) return containerPromise;

  containerPromise = (async () => {
    const endpoint = process.env.COSMOSDB_ENDPOINT?.trim();
    const key = process.env.COSMOSDB_KEY?.trim();
    const databaseId = process.env.COSMOSDB_DATABASE?.trim() || 'bharat-setu-db';
    const containerId = process.env.COSMOSDB_CONTAINER?.trim() || 'callHandoffQueue';

    if (!endpoint || !key) {
      return null;
    }

    const client = new CosmosClient({ endpoint, key });
    const { database } = await client.databases.createIfNotExists({ id: databaseId });
    const { container } = await database.containers.createIfNotExists({
      id: containerId,
      partitionKey: { paths: ['/channel'] },
      defaultTtl: TTL_SECONDS,
    });

    return container;
  })().catch((error) => {
    console.warn('Cosmos queue disabled, falling back to in-memory queue:', error);
    return null;
  });

  return containerPromise;
}

export async function enqueueCallEvent(channel: string, event: PendingCallEvent): Promise<void> {
  const normalizedChannel = normalizeChannel(channel);
  const container = await getContainer();

  if (!container) {
    enqueueFallback(normalizedChannel, event);
    return;
  }

  const now = Date.now();
  const item: CosmosQueueItem = {
    id: `${normalizedChannel}:${event.callId}:${now}`,
    type: 'call_event',
    channel: normalizedChannel,
    createdAt: now,
    expiresAt: now + TTL_MS,
    ttl: TTL_SECONDS,
    event,
  };

  try {
    await container.items.create(item);
  } catch (error) {
    console.warn('Cosmos enqueue failed, using in-memory queue:', error);
    enqueueFallback(normalizedChannel, event);
  }
}

export async function takeCallEvent(channel: string): Promise<PendingCallEvent | null> {
  const normalizedChannel = normalizeChannel(channel);
  const container = await getContainer();

  if (!container) {
    return takeFallback(normalizedChannel);
  }

  try {
    const now = Date.now();
    const query = {
      query:
        'SELECT TOP 1 c.id, c.channel, c.expiresAt, c.event FROM c WHERE c.type = @type AND c.channel = @channel AND c.expiresAt > @now ORDER BY c.createdAt ASC',
      parameters: [
        { name: '@type', value: 'call_event' },
        { name: '@channel', value: normalizedChannel },
        { name: '@now', value: now },
      ],
    };

    const { resources } = await container.items.query<CosmosQueueItem>(query).fetchAll();
    const record = resources[0];
    if (!record) {
      return null;
    }

    await container.item(record.id, normalizedChannel).delete();
    return record.event;
  } catch (error) {
    console.warn('Cosmos dequeue failed, using in-memory queue:', error);
    return takeFallback(normalizedChannel);
  }
}

export async function peekCallEvent(channel: string): Promise<PendingCallEvent | null> {
  const normalizedChannel = normalizeChannel(channel);
  const container = await getContainer();

  if (!container) {
    return peekFallback(normalizedChannel);
  }

  try {
    const now = Date.now();
    const query = {
      query:
        'SELECT TOP 1 c.event FROM c WHERE c.type = @type AND c.channel = @channel AND c.expiresAt > @now ORDER BY c.createdAt ASC',
      parameters: [
        { name: '@type', value: 'call_event' },
        { name: '@channel', value: normalizedChannel },
        { name: '@now', value: now },
      ],
    };

    const { resources } = await container.items.query<{ event: PendingCallEvent }>(query).fetchAll();
    return resources[0]?.event || null;
  } catch (error) {
    console.warn('Cosmos peek failed, using in-memory queue:', error);
    return peekFallback(normalizedChannel);
  }
}
