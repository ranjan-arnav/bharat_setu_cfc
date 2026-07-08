import { getBackendContainer } from '../cosmos-backend';
import { BackendHttpError } from './backend-errors';

function normalizeLimit(limitRaw: number | undefined, fallback: number, max: number): number {
  const candidate = typeof limitRaw === 'number' ? limitRaw : fallback;
  return Number.isFinite(candidate) ? Math.max(1, Math.min(max, Math.floor(candidate))) : fallback;
}

type GovAnalyticsParams = {
  userId?: string;
  sinceHours?: number;
  topK?: number;
  limitRaw?: number;
};

type ClusterDoc = {
  id: string;
  userId?: string;
  category?: string;
  location?: string;
  severity?: string;
  topTerms?: string[];
  groupedAt?: number;
  updatedAt?: number;
};

type NotificationDoc = {
  id: string;
  userId?: string;
  attempted?: number;
  successful?: number;
  failed?: boolean;
  partiallyDelivered?: boolean;
  notificationType?: string;
  channels?: string[];
  dispatchedAt?: number;
  updatedAt?: number;
};

type CaseDoc = {
  id: string;
  userId?: string;
  type?: string;
  title?: string;
  description?: string;
  category?: string;
  status?: string;
  createdAt?: number;
  updatedAt?: number;
  metadata?: {
    ward?: string;
    department?: string;
    citizenName?: string;
    documentType?: string;
    referenceNumber?: string;
    [key: string]: unknown;
  };
};

type Priority = 'critical' | 'high' | 'medium' | 'low';

function bucketCount(items: string[]): Array<{ name: string; count: number }> {
  const map = new Map<string, number>();
  for (const item of items) {
    if (!item) continue;
    map.set(item, (map.get(item) || 0) + 1);
  }

  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

function monthKeyFromTs(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function monthLabelFromKey(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, Math.max(0, month - 1), 1));
  return date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
}

function normalizeKeywordTokens(value: string): string[] {
  const stop = new Set([
    'the', 'and', 'for', 'with', 'from', 'into', 'ward', 'case', 'issue', 'request', 'citizen', 'please', 'this',
    'that', 'are', 'was', 'were', 'been', 'have', 'has', 'had', 'your', 'their', 'about', 'regarding', 'due',
  ]);
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !stop.has(token));
}

function inferCasePriority(caseDoc: CaseDoc): Priority {
  const status = String(caseDoc.status || '').toLowerCase();
  if (status.includes('escalated')) return 'critical';

  const source = `${caseDoc.title || ''} ${caseDoc.description || ''} ${caseDoc.category || ''}`.toLowerCase();
  if (/emergency|urgent|critical|ambulance|severe|fire|accident|unconscious|violence|threat/.test(source)) return 'critical';
  if (/hospital|health|fraud|cyber|police|court|unsafe|water|sewage|electricity/.test(source)) return 'high';
  if (/ration|scheme|certificate|pension|document|application/.test(source)) return 'medium';
  return 'low';
}

function buildDuplicateGroups(cases: CaseDoc[]) {
  const signatureMap = new Map<string, CaseDoc[]>();

  for (const caseDoc of cases) {
    const ward = String(caseDoc.metadata?.ward || 'Ward Unspecified').trim();
    const source = `${caseDoc.title || ''} ${caseDoc.description || ''}`;
    const tokens = normalizeKeywordTokens(source).slice(0, 8);
    if (tokens.length === 0) continue;
    const signature = `${ward.toLowerCase()}|${tokens.join(' ')}`;
    const list = signatureMap.get(signature) || [];
    list.push(caseDoc);
    signatureMap.set(signature, list);
  }

  return Array.from(signatureMap.entries())
    .filter(([, grouped]) => grouped.length > 1)
    .map(([signature, grouped]) => {
      const latest = [...grouped].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
      return {
        signature,
        count: grouped.length,
        ward: latest.metadata?.ward || 'Ward Unspecified',
        sampleTitle: latest.title || latest.description || 'Citizen report',
        caseIds: grouped.slice(0, 6).map((item: CaseDoc) => item.id),
      };
    })
    .sort((a, b) => b.count - a.count);
}

function buildGeoClusters(cases: CaseDoc[]) {
  const map = new Map<string, { count: number; criticalCount: number; categories: string[] }>();

  for (const caseDoc of cases) {
    const ward = String(caseDoc.metadata?.ward || 'Ward Unspecified').trim();
    const entry = map.get(ward) || { count: 0, criticalCount: 0, categories: [] };
    entry.count += 1;

    const priority = inferCasePriority(caseDoc);
    if (priority === 'critical' || priority === 'high') entry.criticalCount += 1;

    if (caseDoc.category) entry.categories.push(caseDoc.category);
    map.set(ward, entry);
  }

  return Array.from(map.entries())
    .map(([ward, data]) => ({
      ward,
      count: data.count,
      criticalCount: data.criticalCount,
      topCategories: bucketCount(data.categories).slice(0, 3),
    }))
    .sort((a, b) => b.count - a.count);
}

function buildCriticalHighlights(cases: CaseDoc[]) {
  const now = Date.now();
  return cases
    .map((caseDoc) => {
      const priority = inferCasePriority(caseDoc);
      const updatedAt = caseDoc.updatedAt || caseDoc.createdAt || now;
      const ageHours = Math.max(1, Math.round((now - updatedAt) / (1000 * 60 * 60)));
      return {
        id: caseDoc.id,
        title: caseDoc.title || caseDoc.description || 'Citizen report',
        category: caseDoc.category || 'General',
        ward: caseDoc.metadata?.ward || 'Ward Unspecified',
        department: caseDoc.metadata?.department || 'Municipal',
        priority,
        status: caseDoc.status || 'open',
        ageHours,
      };
    })
    .filter((entry) => entry.status !== 'resolved' && (entry.priority === 'critical' || entry.priority === 'high'))
    .sort((a, b) => {
      const weight = (p: Priority) => (p === 'critical' ? 0 : p === 'high' ? 1 : p === 'medium' ? 2 : 3);
      return weight(a.priority) - weight(b.priority) || b.ageHours - a.ageHours;
    });
}

function buildMonthlyTrendSeries(clusters: ClusterDoc[], notifications: NotificationDoc[]) {
  const now = new Date();
  const monthKeys: string[] = [];

  for (let offset = 5; offset >= 0; offset--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    monthKeys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }

  const clusterByMonth = new Map<string, number>();
  for (const cluster of clusters) {
    const ts = typeof cluster.updatedAt === 'number' ? cluster.updatedAt : undefined;
    if (!ts) continue;
    const key = monthKeyFromTs(ts);
    clusterByMonth.set(key, (clusterByMonth.get(key) || 0) + 1);
  }

  const successfulByMonth = new Map<string, number>();
  for (const item of notifications) {
    const ts = typeof item.updatedAt === 'number' ? item.updatedAt : undefined;
    if (!ts) continue;
    const successful = Number.isFinite(item.successful) ? Number(item.successful) : 0;
    const key = monthKeyFromTs(ts);
    successfulByMonth.set(key, (successfulByMonth.get(key) || 0) + successful);
  }

  return monthKeys.map((key) => ({
    month: monthLabelFromKey(key),
    filed: clusterByMonth.get(key) || 0,
    resolved: successfulByMonth.get(key) || 0,
  }));
}

export async function getGovAnalytics(params: GovAnalyticsParams) {
  const userId = params.userId?.trim() || undefined;
  const sinceHours = normalizeLimit(params.sinceHours, 24 * 7, 24 * 90);
  const topK = normalizeLimit(params.topK, 5, 20);
  const limit = normalizeLimit(params.limitRaw, 300, 1000);
  const sinceTs = Date.now() - sinceHours * 60 * 60 * 1000;

  const clusterContainer = await getBackendContainer('clusterAnalytics');
  const notificationContainer = await getBackendContainer('notificationAnalytics');
  const caseContainer = await getBackendContainer('cases');

  if (!clusterContainer || !notificationContainer) {
    throw new BackendHttpError(503, 'Cosmos analytics backend is not configured');
  }

  const clusterQuery = userId
    ? {
        query: `SELECT TOP ${limit} * FROM c WHERE c.userId = @userId AND c.updatedAt >= @sinceTs ORDER BY c.updatedAt DESC`,
        parameters: [
          { name: '@userId', value: userId },
          { name: '@sinceTs', value: sinceTs },
        ],
      }
    : {
        query: `SELECT TOP ${limit} * FROM c WHERE c.updatedAt >= @sinceTs ORDER BY c.updatedAt DESC`,
        parameters: [{ name: '@sinceTs', value: sinceTs }],
      };

  const notifyQuery = userId
    ? {
        query: `SELECT TOP ${limit} * FROM c WHERE c.userId = @userId AND c.updatedAt >= @sinceTs ORDER BY c.updatedAt DESC`,
        parameters: [
          { name: '@userId', value: userId },
          { name: '@sinceTs', value: sinceTs },
        ],
      }
    : {
        query: `SELECT TOP ${limit} * FROM c WHERE c.updatedAt >= @sinceTs ORDER BY c.updatedAt DESC`,
        parameters: [{ name: '@sinceTs', value: sinceTs }],
      };

    const caseQuery = userId
      ? {
          query:
            `SELECT TOP ${limit} * FROM c WHERE c.type = @type AND c.userId = @userId AND c.updatedAt >= @sinceTs ORDER BY c.updatedAt DESC`,
          parameters: [
            { name: '@type', value: 'case' },
            { name: '@userId', value: userId },
            { name: '@sinceTs', value: sinceTs },
          ],
        }
      : {
          query:
            `SELECT TOP ${limit} * FROM c WHERE c.type = @type AND c.updatedAt >= @sinceTs ORDER BY c.updatedAt DESC`,
          parameters: [
            { name: '@type', value: 'case' },
            { name: '@sinceTs', value: sinceTs },
          ],
        };

    const [clusterResult, notifyResult, caseResult] = await Promise.all([
    userId
      ? clusterContainer.items.query(clusterQuery, { partitionKey: userId }).fetchAll()
      : clusterContainer.items.query(clusterQuery).fetchAll(),
    userId
      ? notificationContainer.items.query(notifyQuery, { partitionKey: userId }).fetchAll()
      : notificationContainer.items.query(notifyQuery).fetchAll(),
      caseContainer
        ? userId
          ? caseContainer.items.query(caseQuery, { partitionKey: userId }).fetchAll()
          : caseContainer.items.query(caseQuery).fetchAll()
        : Promise.resolve({ resources: [] as CaseDoc[] }),
  ]);

  const clusters = (clusterResult.resources || []) as ClusterDoc[];
  const notifications = (notifyResult.resources || []) as NotificationDoc[];
    const cases = (caseResult.resources || []) as CaseDoc[];

  const byCategory = bucketCount(clusters.map((item) => (typeof item.category === 'string' ? item.category : 'unknown')));
  const bySeverity = bucketCount(clusters.map((item) => (typeof item.severity === 'string' ? item.severity : 'unknown')));
  const byNotificationType = bucketCount(
    notifications.map((item) => (typeof item.notificationType === 'string' ? item.notificationType : 'generic')),
  );

  const topClusters = clusters
    .slice(0, topK)
    .map((item) => ({
      id: item.id,
      category: item.category || 'unknown',
      severity: item.severity || 'unknown',
      location: item.location || 'unknown',
      topTerms: Array.isArray(item.topTerms) ? item.topTerms.slice(0, 5) : [],
      groupedAt: item.groupedAt || item.updatedAt || 0,
    }));

  const totalAttempted = notifications.reduce((sum, item) => sum + (Number.isFinite(item.attempted) ? Number(item.attempted) : 0), 0);
  const totalSuccessful = notifications.reduce((sum, item) => sum + (Number.isFinite(item.successful) ? Number(item.successful) : 0), 0);
  const failureCount = notifications.filter((item) => Boolean(item.failed)).length;
  const partialCount = notifications.filter((item) => Boolean(item.partiallyDelivered)).length;

  const deliveryRate = totalAttempted > 0 ? Number(((totalSuccessful / totalAttempted) * 100).toFixed(2)) : 0;
  const monthly = buildMonthlyTrendSeries(clusters, notifications);
  const duplicateGroups = buildDuplicateGroups(cases);
  const geoClusters = buildGeoClusters(cases);
  const criticalHighlights = buildCriticalHighlights(cases).slice(0, 8);
  const prioritySummary = bucketCount(cases.map((caseDoc) => inferCasePriority(caseDoc)));
  const categorySummary = bucketCount(cases.map((caseDoc) => String(caseDoc.category || 'General')));

  return {
    scope: {
      userId: userId || null,
      sinceHours,
      sampleLimit: limit,
      generatedAt: Date.now(),
    },
    summary: {
      clusterCount: clusters.length,
      notificationCount: notifications.length,
      totalAttempted,
      totalSuccessful,
      deliveryRate,
      failedDispatches: failureCount,
      partialDispatches: partialCount,
    },
    topClusters,
    breakdowns: {
      byCategory: byCategory.slice(0, topK),
      bySeverity: bySeverity.slice(0, topK),
      byNotificationType: byNotificationType.slice(0, topK),
    },
    trends: {
      monthly,
    },
    reportIntelligence: {
      totalReports: cases.length,
      prioritySummary,
      categorySummary: categorySummary.slice(0, topK),
      duplicates: duplicateGroups.slice(0, 8),
      geoClusters: geoClusters.slice(0, 8),
      criticalHighlights,
    },
  };
}