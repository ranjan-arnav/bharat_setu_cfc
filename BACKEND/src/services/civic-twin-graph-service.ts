import { getBackendContainer } from '../cosmos-backend';

type CivicTwinGraphParams = {
  userId?: string;
  sinceHours?: number;
  topK?: number;
};

type ClusterDoc = {
  id: string;
  userId?: string;
  category?: string;
  location?: string;
  severity?: string;
  topTerms?: string[];
  updatedAt?: number;
};

type NotificationDoc = {
  id: string;
  userId?: string;
  attempted?: number;
  successful?: number;
  failed?: boolean;
  partiallyDelivered?: boolean;
  updatedAt?: number;
};

type WarningSeverity = 'critical' | 'high' | 'medium';

type LocalRiskResponse = {
  risk_level?: string;
  risk_score?: number;
  confidence?: number;
  source?: 'ml' | 'rule-fallback';
};

type LocalRiskResult = {
  riskLevel: WarningSeverity;
  riskScore: number;
  confidence: number;
  source: 'ml' | 'rule-fallback';
};

export type CivicTwinWarning = {
  id: string;
  title: string;
  zone: string;
  category: string;
  severity: WarningSeverity;
  riskScore: number;
  confidence: number;
  eta: string;
  reason: string;
  recommendedAction: string;
  citizenNudge: string;
};

export type CivicTwinGraphResult = {
  meta: {
    model: string;
    generatedAt: number;
    source: 'cosmos' | 'simulated';
    bridgeNodes: number;
    bridgeEdges: number;
  };
  earlyWarnings: CivicTwinWarning[];
  copilotHighlights: Array<{
    title: string;
    body: string;
    impact: string;
  }>;
  citizenAssistant: {
    style: 'subtle';
    nudges: string[];
  };
};

function normalizeLimit(value: number | undefined, fallback: number, max: number): number {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(1, Math.min(max, parsed));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mapSeverity(score: number): WarningSeverity {
  if (score >= 85) return 'critical';
  if (score >= 65) return 'high';
  return 'medium';
}

function normalizeRiskLevel(raw: string | undefined): WarningSeverity {
  if (raw === 'critical' || raw === 'high' || raw === 'medium') return raw;
  return 'medium';
}

async function predictLocalCivicRisk(text: string): Promise<LocalRiskResult | null> {
  const endpoint = (process.env.CIVIC_RISK_MODEL_URL || 'http://127.0.0.1:5001/predict-civic-risk').trim();
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(1800),
    });

    if (!response.ok) return null;
    const data = (await response.json()) as LocalRiskResponse;

    const riskLevel = normalizeRiskLevel(data.risk_level);
    const riskScore = clamp(Number.isFinite(data.risk_score) ? Number(data.risk_score) : 56, 40, 97);
    const confidence = clamp(Number.isFinite(data.confidence) ? Number(data.confidence) : 0.6, 0.45, 0.98);
    const source = data.source === 'ml' ? 'ml' : 'rule-fallback';

    return {
      riskLevel,
      riskScore,
      confidence,
      source,
    };
  } catch {
    return null;
  }
}

function categoryToDept(category: string): string {
  const normalized = category.toLowerCase();
  if (normalized.includes('water')) return 'Jal Board';
  if (normalized.includes('road')) return 'PWD';
  if (normalized.includes('sanitation') || normalized.includes('drain')) return 'Municipal';
  if (normalized.includes('electric')) return 'Electricity';
  if (normalized.includes('health')) return 'Health';
  return 'Municipal';
}

function timeframeFromSeverity(severity: WarningSeverity): string {
  if (severity === 'critical') return '48-72 hours';
  if (severity === 'high') return '5-7 days';
  return '10-14 days';
}

function buildSimulatedGraph(topK: number): CivicTwinGraphResult {
  const base: CivicTwinWarning[] = [
    {
      id: 'sim-water-3829',
      title: 'Water pressure drop risk',
      zone: '3829',
      category: 'Water Supply',
      severity: 'critical',
      riskScore: 89,
      confidence: 91,
      eta: '48-72 hours',
      reason: 'Complaint velocity and repeat reports indicate a localized supply stress pattern.',
      recommendedAction: 'Pre-position tanker routing and trigger ward-level inspection before peak demand.',
      citizenNudge: 'Share a low-volume usage advisory for evening hours in affected lanes.',
    },
    {
      id: 'sim-road-4512',
      title: 'Road hazard escalation',
      zone: '4512',
      category: 'Road Infrastructure',
      severity: 'high',
      riskScore: 76,
      confidence: 84,
      eta: '5-7 days',
      reason: 'Cluster overlap with commuter corridors suggests rapid impact expansion if unattended.',
      recommendedAction: 'Auto-generate patch-work order for top 3 segments and assign inspection crew.',
      citizenNudge: 'Push a short route advisory to avoid identified stretches during rush hour.',
    },
    {
      id: 'sim-san-4521',
      title: 'Sanitation-linked health risk',
      zone: '4521',
      category: 'Sanitation',
      severity: 'high',
      riskScore: 71,
      confidence: 79,
      eta: '7-10 days',
      reason: 'Recurring sanitation reports with humid weather signal rising secondary health complaints.',
      recommendedAction: 'Increase lift frequency and deploy disinfection in identified micro-zones.',
      citizenNudge: 'Issue a hygiene reminder and complaint shortcut for waste overflow hotspots.',
    },
  ];

  return {
    meta: {
      model: 'Civic Twin Graph v1 (Azure-ready)',
      generatedAt: Date.now(),
      source: 'simulated',
      bridgeNodes: 42,
      bridgeEdges: 116,
    },
    earlyWarnings: base.slice(0, topK),
    copilotHighlights: [
      {
        title: 'AI-Powered Resolution Copilot',
        body: 'Prepared action drafts prioritize high-risk wards and recommend department ownership by category.',
        impact: 'Expected faster first-response on emerging issue clusters.',
      },
      {
        title: 'Inter-department Signal Bridge',
        body: 'Citizen-side issue velocity is linked with notification delivery reliability to surface operational risk.',
        impact: 'Earlier escalation before backlog spikes become visible in monthly reports.',
      },
    ],
    citizenAssistant: {
      style: 'subtle',
      nudges: [
        'Quietly schedule preventive advisories only for wards crossing risk thresholds.',
        'Keep citizen prompts concise, contextual, and non-alarmist.',
      ],
    },
  };
}

export async function getCivicTwinGraph(params: CivicTwinGraphParams): Promise<CivicTwinGraphResult> {
  const userId = params.userId?.trim() || undefined;
  const topK = normalizeLimit(params.topK, 3, 8);
  const sinceHours = normalizeLimit(params.sinceHours, 24 * 7, 24 * 90);
  const sinceTs = Date.now() - sinceHours * 60 * 60 * 1000;
  const queryLimit = normalizeLimit(topK * 40, 120, 500);

  const clusterContainer = await getBackendContainer('clusterAnalytics');
  const notificationContainer = await getBackendContainer('notificationAnalytics');

  if (!clusterContainer || !notificationContainer) {
    return buildSimulatedGraph(topK);
  }

  const clusterQuery = userId
    ? {
        query: `SELECT TOP ${queryLimit} * FROM c WHERE c.userId = @userId AND c.updatedAt >= @sinceTs ORDER BY c.updatedAt DESC`,
        parameters: [
          { name: '@userId', value: userId },
          { name: '@sinceTs', value: sinceTs },
        ],
      }
    : {
        query: `SELECT TOP ${queryLimit} * FROM c WHERE c.updatedAt >= @sinceTs ORDER BY c.updatedAt DESC`,
        parameters: [{ name: '@sinceTs', value: sinceTs }],
      };

  const notificationQuery = userId
    ? {
        query: `SELECT TOP ${queryLimit} * FROM c WHERE c.userId = @userId AND c.updatedAt >= @sinceTs ORDER BY c.updatedAt DESC`,
        parameters: [
          { name: '@userId', value: userId },
          { name: '@sinceTs', value: sinceTs },
        ],
      }
    : {
        query: `SELECT TOP ${queryLimit} * FROM c WHERE c.updatedAt >= @sinceTs ORDER BY c.updatedAt DESC`,
        parameters: [{ name: '@sinceTs', value: sinceTs }],
      };

  const [clusterResult, notificationResult] = await Promise.all([
    userId
      ? clusterContainer.items.query(clusterQuery, { partitionKey: userId }).fetchAll()
      : clusterContainer.items.query(clusterQuery).fetchAll(),
    userId
      ? notificationContainer.items.query(notificationQuery, { partitionKey: userId }).fetchAll()
      : notificationContainer.items.query(notificationQuery).fetchAll(),
  ]);

  const clusters = (clusterResult.resources || []) as ClusterDoc[];
  const notifications = (notificationResult.resources || []) as NotificationDoc[];

  if (!clusters.length) {
    return buildSimulatedGraph(topK);
  }

  const attemptedTotal = notifications.reduce((sum, n) => sum + (Number.isFinite(n.attempted) ? Number(n.attempted) : 0), 0);
  const successfulTotal = notifications.reduce((sum, n) => sum + (Number.isFinite(n.successful) ? Number(n.successful) : 0), 0);
  const deliveryRate = attemptedTotal > 0 ? successfulTotal / attemptedTotal : 0.85;

  const grouped = new Map<string, ClusterDoc[]>();
  for (const cluster of clusters) {
    const category = cluster.category || 'General Civic';
    const zone = cluster.location || '0000';
    const key = `${category}::${zone}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(cluster);
  }

  const heuristicWarnings = Array.from(grouped.entries())
    .map(([key, items]) => {
      const [category, zone] = key.split('::');
      const avgRecencyFactor = items.reduce((sum: number, item: ClusterDoc) => {
        const ageHours = item.updatedAt ? (Date.now() - item.updatedAt) / (1000 * 60 * 60) : 48;
        return sum + clamp(1 - ageHours / 168, 0.1, 1);
      }, 0) / items.length;

      const severityBoost = items.some((item: ClusterDoc) => (item.severity || '').toLowerCase() === 'critical')
        ? 16
        : items.some((item: ClusterDoc) => (item.severity || '').toLowerCase() === 'high')
          ? 10
          : 4;

      const riskScore = clamp(Math.round(items.length * 13 + avgRecencyFactor * 25 + severityBoost + (1 - deliveryRate) * 20), 42, 97);
      const confidence = clamp(Math.round(58 + Math.min(items.length, 8) * 4 + avgRecencyFactor * 18), 60, 96);
      const severity = mapSeverity(riskScore);
      const eta = timeframeFromSeverity(severity);
      const department = categoryToDept(category);

      return {
        id: `warn-${category.toLowerCase().replace(/\s+/g, '-')}-${zone}`,
        title: `${category} escalation watch`,
        zone,
        category,
        severity,
        riskScore,
        confidence,
        eta,
        reason: `${items.length} correlated issue signals detected in zone ${zone} with delivery reliability at ${Math.round(deliveryRate * 100)}%.`,
        recommendedAction: `AI-Powered Resolution Copilot suggests ${department} as lead with immediate preventive dispatch in zone ${zone}.`,
        citizenNudge: `Subtle citizen prompt: share preventive guidance and quick-report shortcut for ${category.toLowerCase()} in zone ${zone}.`,
      } as CivicTwinWarning;
    });

  const warnings = (await Promise.all(
    heuristicWarnings.map(async (warning) => {
      const localPrediction = await predictLocalCivicRisk(
        `${warning.title}. ${warning.reason}. ${warning.recommendedAction}`,
      );

      if (!localPrediction) return warning;

      const fusedRisk = clamp(Math.round(warning.riskScore * 0.62 + localPrediction.riskScore * 0.38), 42, 97);
      const fusedConfidence = clamp(
        Math.round(warning.confidence * 0.6 + localPrediction.confidence * 100 * 0.4),
        60,
        98,
      );
      const fusedSeverity = mapSeverity(fusedRisk);

      return {
        ...warning,
        riskScore: fusedRisk,
        confidence: fusedConfidence,
        severity: fusedSeverity,
        eta: timeframeFromSeverity(fusedSeverity),
        reason: `${warning.reason} Local civic ML (${localPrediction.source}) predicts ${localPrediction.riskLevel} risk.`,
      };
    }),
  ))
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, topK);

  const uniqueZones = new Set(clusters.map((c) => c.location || '0000'));
  const uniqueCategories = new Set(clusters.map((c) => c.category || 'General Civic'));

  return {
    meta: {
      model: 'Civic Twin Graph v1 (Azure-ready)',
      generatedAt: Date.now(),
      source: 'cosmos',
      bridgeNodes: uniqueZones.size + uniqueCategories.size,
      bridgeEdges: clusters.length + notifications.length,
    },
    earlyWarnings: warnings,
    copilotHighlights: [
      {
        title: 'AI-Powered Resolution Copilot',
        body: 'Cross-signals from citizen issue clusters and dispatch outcomes produce pre-escalation intervention drafts.',
        impact: 'Improves first-response speed for at-risk wards.',
      },
      {
        title: 'Civic Twin Graph Bridge',
        body: 'Issue-category and zone edges are continuously scored to predict spillover risk across departments.',
        impact: 'Enables proactive coordination before complaint waves peak.',
      },
    ],
    citizenAssistant: {
      style: 'subtle',
      nudges: warnings.slice(0, 2).map((warning) => warning.citizenNudge),
    },
  };
}