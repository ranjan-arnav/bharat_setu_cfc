/**
 * Intelligence Engine — pure functions, no UI, no side effects.
 * Provides: Multi-Agent Collaboration, Collective Action, Trust Scores, Civic Digital Twin.
 * All logic is simulated and designed for easy backend replacement.
 */

import type { AgentKey } from './store';

// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
// 1. MULTI-AGENT COLLABORATION
// (Detection logic migrated to /api/intelligence/multi-agent using Phi-4-mini)
// ═══════════════════════════════════════════════════════════════════

const AGENT_LABELS: Record<AgentKey, string> = {
  nagarik_mitra: 'Nagarik Mitra',
  swasthya_sahayak: 'Swasthya Sahayak',
  yojana_saathi: 'Yojana Saathi',
  arthik_salahkar: 'Arthik Salahkar',
  vidhi_sahayak: 'Vidhi Sahayak',
  kisan_mitra: 'Kisan Mitra',
};

// ═══════════════════════════════════════════════════════════════════
// 2. COLLECTIVE ACTION ENGINE
// ═══════════════════════════════════════════════════════════════════

export interface CollectiveCluster {
  clusterId: string;
  category: string;
  location: string;         // DIGIPIN zone (first 4 chars)
  participantCount: number;
  matchedGrievanceIds: string[];
  status: 'active' | 'amplified' | 'resolved';
  createdAt: number;
}

interface GrievanceLike {
  id: string;
  category: string;
  digipin: string;
  submittedAt: string;
}

// Simulated existing clusters for demo purposes
const SEED_CLUSTERS: CollectiveCluster[] = [
  { clusterId: 'CLU-WTR-001', category: 'water', location: '3829', participantCount: 14, matchedGrievanceIds: [], status: 'active', createdAt: Date.now() - 86400000 * 3 },
  { clusterId: 'CLU-RD-002', category: 'road', location: '3829', participantCount: 23, matchedGrievanceIds: [], status: 'amplified', createdAt: Date.now() - 86400000 * 7 },
  { clusterId: 'CLU-SAN-003', category: 'sanitation', location: '4521', participantCount: 8, matchedGrievanceIds: [], status: 'active', createdAt: Date.now() - 86400000 * 2 },
  { clusterId: 'CLU-ELC-004', category: 'electricity', location: '3829', participantCount: 19, matchedGrievanceIds: [], status: 'active', createdAt: Date.now() - 86400000 },
];

export function findCollectiveCluster(
  category: string,
  digipin: string,
  _existingGrievances: GrievanceLike[] = []
): CollectiveCluster | null {
  const zone = digipin.slice(0, 4) || '3829';
  const catLower = category.toLowerCase();

  // Check seeded clusters first
  const match = SEED_CLUSTERS.find(c =>
    c.category === catLower && c.location === zone && c.status !== 'resolved'
  );
  if (match) return { ...match, participantCount: match.participantCount + 1 };

  // Probabilistic match for demo (60% chance of finding a cluster)
  const hash = (catLower + zone).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  if (hash % 5 < 3) {
    return {
      clusterId: `CLU-${catLower.slice(0, 3).toUpperCase()}-${hash % 1000}`,
      category: catLower,
      location: zone,
      participantCount: 5 + (hash % 20),
      matchedGrievanceIds: [],
      status: 'active',
      createdAt: Date.now() - (hash % 5) * 86400000,
    };
  }

  return null;
}

export function getAllClusters(): CollectiveCluster[] {
  return [...SEED_CLUSTERS];
}

// ═══════════════════════════════════════════════════════════════════
// 3. TRUST SCORE SYSTEM
// ═══════════════════════════════════════════════════════════════════

export interface TrustScore {
  department: string;
  score: number;          // 0-10
  avgResolutionDays: number;
  backlog: number;
  satisfaction: number;   // 0-5
  color: string;
  label: string;
  trend: 'up' | 'down' | 'stable';
}

const DEPT_DATA: Record<string, { resTime: number; backlog: number; sat: number; trend: 'up' | 'down' | 'stable' }> = {
  'PWD': { resTime: 5.2, backlog: 42, sat: 3.8, trend: 'up' },
  'Municipal': { resTime: 3.1, backlog: 38, sat: 4.1, trend: 'stable' },
  'Jal Board': { resTime: 7.8, backlog: 22, sat: 3.2, trend: 'down' },
  'Health': { resTime: 2.4, backlog: 15, sat: 4.5, trend: 'up' },
  'Revenue': { resTime: 8.5, backlog: 28, sat: 3.0, trend: 'down' },
  'Town Planning': { resTime: 12.3, backlog: 11, sat: 2.8, trend: 'down' },
  'Education': { resTime: 4.1, backlog: 18, sat: 4.2, trend: 'up' },
  'Police': { resTime: 6.7, backlog: 35, sat: 3.5, trend: 'stable' },
  'Electricity': { resTime: 4.8, backlog: 19, sat: 3.9, trend: 'up' },
  'Supply': { resTime: 9.2, backlog: 25, sat: 3.1, trend: 'down' },
};

export function calculateTrustScore(department: string): TrustScore {
  const data = DEPT_DATA[department] || { resTime: 5, backlog: 20, sat: 3.5, trend: 'stable' as const };

  // Score = weighted combination: lower resolution time is better, lower backlog is better, higher satisfaction is better
  const timeScore = Math.max(0, 10 - data.resTime * 0.8);  // 0-10
  const backlogScore = Math.max(0, 10 - data.backlog * 0.15); // 0-10
  const satScore = data.sat * 2; // 0-10

  const raw = timeScore * 0.35 + backlogScore * 0.25 + satScore * 0.40;
  const score = Math.round(raw * 10) / 10;

  return {
    department,
    score,
    avgResolutionDays: data.resTime,
    backlog: data.backlog,
    satisfaction: data.sat,
    color: score >= 7 ? '#10B981' : score >= 5 ? '#F59E0B' : '#EF4444',
    label: score >= 7 ? 'Trusted' : score >= 5 ? 'Average' : 'Needs Improvement',
    trend: data.trend,
  };
}

export function getAllTrustScores(): TrustScore[] {
  return Object.keys(DEPT_DATA).map(calculateTrustScore).sort((a, b) => b.score - a.score);
}

// ═══════════════════════════════════════════════════════════════════
// 4. CIVIC DIGITAL TWIN
// ═══════════════════════════════════════════════════════════════════

export interface Hotspot {
  location: string;
  ward: string;
  category: string;
  count: number;
  severity: 'critical' | 'high' | 'medium';
  trend: 'rising' | 'stable' | 'declining';
}

export interface TrendInsight {
  category: string;
  direction: 'up' | 'down' | 'stable';
  change: number;        // percentage
  description: string;
  icon: string;
  color: string;
}

export interface Prediction {
  area: string;
  category: string;
  probability: number;   // 0-100
  timeframe: string;
  reasoning: string;
  icon: string;
  color: string;
}

export function getHotspots(): Hotspot[] {
  return [
    { location: 'Sector 3, Baharpur', ward: 'Ward 14', category: 'Water Supply', count: 47, severity: 'critical', trend: 'rising' },
    { location: 'NH-44 Highway Zone', ward: 'Ward 5', category: 'Road Infrastructure', count: 35, severity: 'high', trend: 'stable' },
    { location: 'Market Area, Old City', ward: 'Ward 22', category: 'Sanitation', count: 31, severity: 'high', trend: 'rising' },
    { location: 'Indira Colony', ward: 'Ward 12', category: 'Drainage', count: 28, severity: 'medium', trend: 'declining' },
    { location: 'Railway Station Zone', ward: 'Ward 3', category: 'Streetlights', count: 22, severity: 'medium', trend: 'rising' },
    { location: 'Industrial Area', ward: 'Ward 31', category: 'Electricity', count: 19, severity: 'medium', trend: 'stable' },
  ];
}

export function getTrendInsights(): TrendInsight[] {
  return [
    { category: 'Water Supply', direction: 'up', change: 34, description: 'Water complaints surged 34% this month — peak summer demand starting', icon: 'water_drop', color: '#06B6D4' },
    { category: 'Road Infrastructure', direction: 'up', change: 18, description: 'Pothole reports up 18% — post-monsoon damage becoming visible', icon: 'add_road', color: '#F59E0B' },
    { category: 'Sanitation', direction: 'down', change: -12, description: 'Sanitation complaints dropped 12% after new garbage collection route', icon: 'cleaning_services', color: '#10B981' },
    { category: 'Electricity', direction: 'stable', change: 2, description: 'Power outage complaints stable — grid upgrade showing results', icon: 'bolt', color: '#8B5CF6' },
    { category: 'Health Services', direction: 'up', change: 22, description: 'PHC queue complaints rising — seasonal illness wave detected', icon: 'medical_services', color: '#EF4444' },
  ];
}

export function getPredictions(): Prediction[] {
  return [
    { area: 'Ward 14, Sector 3', category: 'Water Crisis', probability: 87, timeframe: 'Next 2 weeks', reasoning: 'Based on 47 complaints, seasonal pattern, and pipeline age data', icon: 'water_drop', color: '#EF4444' },
    { area: 'Ward 5, NH-44', category: 'Road Damage', probability: 72, timeframe: 'Next month', reasoning: 'Post-monsoon deterioration + high traffic volume on aging surface', icon: 'add_road', color: '#F59E0B' },
    { area: 'Ward 22, Old City', category: 'Disease Outbreak Risk', probability: 61, timeframe: 'Next 3 weeks', reasoning: 'Rising sanitation complaints + stagnant water reports + summer heat', icon: 'coronavirus', color: '#EF4444' },
    { area: 'Ward 3, Railway Zone', category: 'Safety Incident', probability: 54, timeframe: 'Next 2 weeks', reasoning: '22 streetlight failures in high-footfall area near railway crossing', icon: 'warning', color: '#F59E0B' },
  ];
}

// Agent labels export for UI usage
export { AGENT_LABELS };
