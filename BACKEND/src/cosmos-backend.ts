import { Container, CosmosClient } from '@azure/cosmos';
import { trackBackendOperation } from '../../src/lib/telemetry';

export type BackendContainerName =
  | 'profiles'
  | 'messages'
  | 'sosSessions'
  | 'sosEvents'
  | 'cases'
  | 'schemeApplications'
  | 'enrichments'
  | 'uploads'
  | 'asyncJobs'
  | 'clusterAnalytics'
  | 'notificationAnalytics'
  | 'citizenAlerts';

type ContainerConfig = {
  partitionPath: string;
  defaultTtl?: number;
};

const containerConfigs: Record<BackendContainerName, ContainerConfig> = {
  profiles: { partitionPath: '/userId' },
  messages: { partitionPath: '/conversationId', defaultTtl: Number(process.env.COSMOS_MESSAGES_TTL_SECONDS || 60 * 60 * 24 * 14) },
  sosSessions: { partitionPath: '/userId' },
  sosEvents: { partitionPath: '/sessionId', defaultTtl: Number(process.env.COSMOS_SOS_EVENTS_TTL_SECONDS || 60 * 60 * 24 * 7) },
  cases: { partitionPath: '/userId' },
  schemeApplications: { partitionPath: '/userId' },
  enrichments: { partitionPath: '/userId', defaultTtl: Number(process.env.COSMOS_ENRICHMENTS_TTL_SECONDS || 60 * 60 * 24 * 14) },
  uploads: { partitionPath: '/userId', defaultTtl: Number(process.env.COSMOS_UPLOADS_TTL_SECONDS || 60 * 60 * 24 * 30) },
  asyncJobs: { partitionPath: '/userId', defaultTtl: Number(process.env.COSMOS_ASYNC_JOBS_TTL_SECONDS || 60 * 60 * 24 * 14) },
  clusterAnalytics: { partitionPath: '/userId', defaultTtl: Number(process.env.COSMOS_CLUSTER_ANALYTICS_TTL_SECONDS || 60 * 60 * 24 * 30) },
  notificationAnalytics: { partitionPath: '/userId', defaultTtl: Number(process.env.COSMOS_NOTIFICATION_ANALYTICS_TTL_SECONDS || 60 * 60 * 24 * 30) },
  citizenAlerts: { partitionPath: '/scopeId', defaultTtl: Number(process.env.COSMOS_CITIZEN_ALERTS_TTL_SECONDS || 60 * 60 * 24 * 14) },
};

let clientPromise: Promise<CosmosClient | null> | null = null;
let databasePromise: Promise<any | null> | null = null;
const containerPromises = new Map<BackendContainerName, Promise<Container | null>>();

async function getCosmosClient(): Promise<CosmosClient | null> {
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    const t0 = Date.now();
    const endpoint = process.env.COSMOSDB_ENDPOINT?.trim();
    const key = process.env.COSMOSDB_KEY?.trim();

    if (!endpoint || !key) {
      trackBackendOperation('cosmos.client.init', Date.now() - t0, false, {
        reason: 'missing_config',
      });
      return null;
    }

    const client = new CosmosClient({ endpoint, key });
    trackBackendOperation('cosmos.client.init', Date.now() - t0, true);
    return client;
  })().catch((error) => {
    trackBackendOperation('cosmos.client.init', 0, false, undefined, error);
    console.warn('Cosmos backend client unavailable:', error);
    return null;
  });

  return clientPromise;
}

async function getDatabase() {
  if (databasePromise) return databasePromise;

  databasePromise = (async () => {
    const t0 = Date.now();
    const client = await getCosmosClient();
    if (!client) return null;

    const databaseId = process.env.COSMOSDB_DATABASE?.trim() || 'bharat-setu-db';
    const { database } = await client.databases.createIfNotExists({ id: databaseId });
    trackBackendOperation('cosmos.database.ensure', Date.now() - t0, true, {
      databaseId,
    });
    return database;
  })().catch((error) => {
    trackBackendOperation('cosmos.database.ensure', 0, false, undefined, error);
    console.warn('Cosmos database unavailable:', error);
    return null;
  });

  return databasePromise;
}

export async function getBackendContainer(name: BackendContainerName): Promise<Container | null> {
  if (containerPromises.has(name)) {
    return containerPromises.get(name)!;
  }

  const promise = (async () => {
    const t0 = Date.now();
    const database = await getDatabase();
    if (!database) return null;

    const config = containerConfigs[name];
    const definition: {
      id: string;
      partitionKey: { paths: string[] };
      defaultTtl?: number;
    } = {
      id: name,
      partitionKey: { paths: [config.partitionPath] },
    };

    if (typeof config.defaultTtl === 'number' && Number.isFinite(config.defaultTtl)) {
      definition.defaultTtl = config.defaultTtl;
    }

    const { container } = await database.containers.createIfNotExists(definition);
    trackBackendOperation('cosmos.container.ensure', Date.now() - t0, true, {
      container: name,
    });
    return container;
  })().catch((error) => {
    trackBackendOperation('cosmos.container.ensure', 0, false, { container: name }, error);
    console.warn(`Cosmos container unavailable: ${name}`, error);
    return null;
  });

  containerPromises.set(name, promise);
  return promise;
}
