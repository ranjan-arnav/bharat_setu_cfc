import { randomUUID } from 'crypto';
import { getBackendContainer } from '../cosmos-backend';
import { BackendHttpError } from './backend-errors';

const ALERT_TYPE = 'citizenAlert';

type AlertPriority = 'low' | 'medium' | 'high' | 'critical';
type AlertCategory = 'infra' | 'health' | 'schemes' | 'emergency' | 'civic';
type AlertChannel = 'broadcast' | 'protocol' | 'system';
type SqlParamValue = string | number | boolean | null;

function normalizeLimit(limitRaw: number | undefined, fallback: number, max: number): number {
  const candidate = typeof limitRaw === 'number' ? limitRaw : fallback;
  return Number.isFinite(candidate) ? Math.max(1, Math.min(max, Math.floor(candidate))) : fallback;
}

function normalizeCategory(value: unknown): AlertCategory {
  if (value === 'infra' || value === 'health' || value === 'schemes' || value === 'emergency') {
    return value;
  }
  return 'civic';
}

function normalizePriority(value: unknown, category: AlertCategory): AlertPriority {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') {
    return value;
  }
  if (category === 'emergency') return 'high';
  return 'medium';
}

function normalizeChannel(value: unknown): AlertChannel {
  if (value === 'protocol' || value === 'system') return value;
  return 'broadcast';
}

function normalizeTargetWard(value: unknown): string {
  if (typeof value !== 'string') return 'all';
  const trimmed = value.trim();
  if (!trimmed) return 'all';
  return trimmed.slice(0, 40);
}

function estimateReach(targetWard: string): number {
  if (targetWard === 'all') return 1247;
  if (targetWard === '1-10') return 420;
  if (targetWard === '11-20') return 390;
  if (targetWard === '21-30') return 437;
  return 250;
}

export async function getCitizenAlerts(params: {
  limitRaw?: number;
  ward?: string;
  category?: string;
  includeExpired?: boolean;
  sinceHours?: number;
}) {
  const container = await getBackendContainer('citizenAlerts');
  if (!container) {
    return {
      count: 0,
      unreadCount: 0,
      generatedAt: Date.now(),
      alerts: [],
    };
  }

  const limit = normalizeLimit(params.limitRaw, 8, 50);
  const ward = typeof params.ward === 'string' ? params.ward.trim() : '';
  const category = typeof params.category === 'string' ? params.category.trim() : '';
  const includeExpired = Boolean(params.includeExpired);
  const sinceHours =
    typeof params.sinceHours === 'number' && Number.isFinite(params.sinceHours)
      ? Math.max(1, Math.min(720, Math.floor(params.sinceHours)))
      : 72;

  const now = Date.now();
  const sinceAt = now - sinceHours * 60 * 60 * 1000;

  const queryParts: string[] = [`c.type = @type`, `c.createdAt >= @sinceAt`];
  const parameters: Array<{ name: string; value: SqlParamValue }> = [
    { name: '@type', value: ALERT_TYPE },
    { name: '@sinceAt', value: sinceAt },
  ];

  if (ward) {
    queryParts.push('(c.targetWard = @allWard OR c.targetWard = @targetWard)');
    parameters.push({ name: '@allWard', value: 'all' });
    parameters.push({ name: '@targetWard', value: ward });
  }

  if (category && category !== 'all') {
    queryParts.push('(c.category = @allCategory OR c.category = @category)');
    parameters.push({ name: '@allCategory', value: 'civic' });
    parameters.push({ name: '@category', value: category });
  }

  if (!includeExpired) {
    queryParts.push('(NOT IS_DEFINED(c.expiresAt) OR c.expiresAt >= @now)');
    queryParts.push('(NOT IS_DEFINED(c.status) OR c.status = @activeStatus)');
    parameters.push({ name: '@now', value: now });
    parameters.push({ name: '@activeStatus', value: 'active' });
  }

  const query = `SELECT TOP ${limit} c.id, c.title, c.message, c.category, c.priority, c.targetWard, c.source, c.channel, c.protocolId, c.createdAt, c.expiresAt, c.stats FROM c WHERE ${queryParts.join(' AND ')} ORDER BY c.createdAt DESC`;

  const { resources } = await container.items.query({ query, parameters }).fetchAll();

  return {
    count: resources.length,
    unreadCount: resources.length,
    generatedAt: now,
    alerts: resources,
  };
}

export async function createCitizenAlert(body: Record<string, unknown>) {
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    throw new BackendHttpError(400, 'message is required');
  }

  const category = normalizeCategory(body.category);
  const priority = normalizePriority(body.priority, category);
  const channel = normalizeChannel(body.channel);
  const targetWard = normalizeTargetWard(body.targetWard);
  const now = Date.now();

  const container = await getBackendContainer('citizenAlerts');
  const mockMode = !container;

  const estimatedReach =
    typeof body.reachEstimate === 'number' && Number.isFinite(body.reachEstimate)
      ? Math.max(0, Math.floor(body.reachEstimate))
      : estimateReach(targetWard);

  const expiresInHours =
    typeof body.expiresInHours === 'number' && Number.isFinite(body.expiresInHours)
      ? Math.max(1, Math.min(168, Math.floor(body.expiresInHours)))
      : category === 'emergency'
        ? 24
        : 72;

  const item = {
    id: randomUUID(),
    type: ALERT_TYPE,
    scopeId: `${targetWard}:${category}`,
    title:
      typeof body.title === 'string' && body.title.trim()
        ? body.title.trim().slice(0, 120)
        : category === 'emergency'
          ? 'Emergency Advisory'
          : 'Public Advisory',
    message: message.slice(0, 1000),
    category,
    priority,
    targetWard,
    audience: 'citizen',
    source: typeof body.source === 'string' ? body.source.trim().slice(0, 120) : 'District Administration',
    channel,
    protocolId: typeof body.protocolId === 'string' ? body.protocolId.trim().slice(0, 40) : undefined,
    issuedBy: typeof body.userId === 'string' ? body.userId.trim().slice(0, 120) : 'gov-admin',
    status: 'active',
    stats: {
      estimatedReach,
    },
    createdAt: typeof body.createdAt === 'number' ? body.createdAt : now,
    updatedAt: now,
    expiresAt: now + expiresInHours * 60 * 60 * 1000,
  };

  if (mockMode) {
    return {
      success: true,
      estimatedReach,
      alert: item,
    };
  }

  const result = await container!.items.create(item);
  return {
    success: true,
    estimatedReach,
    alert: result.resource,
  };
}
