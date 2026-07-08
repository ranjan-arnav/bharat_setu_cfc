import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MULTI-AGENT REINFORCEMENT LEARNING (MARL) RESOURCE OPTIMIZER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Officers = agents, Cases = tasks
 * Priority × SLA urgency = reward signal
 * 
 * Algorithm: Hungarian-style Greedy Assignment with utility maximization
 * - Builds a utility matrix: U[officer][case] = skill_match × priority × sla_urgency
 * - Iteratively assigns highest-utility (officer, case) pairs
 * - Computes load balance score and predicted SLA breach reduction
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface Officer {
  id: string;
  name: string;
  dept: string;
  currentLoad: number;
  maxCapacity: number;
  skills: string[];
  efficiency: number; // 0-1, higher is better
}

interface Case {
  id: string;
  title: string;
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  ward: string;
  slaHoursLeft: number;
  currentAssignee?: string;
}

interface Assignment {
  officerId: string;
  officerName: string;
  caseId: string;
  caseTitle: string;
  utility: number;
  reasoning: string;
}

// ── Priority weights ─────────────────────────────────────────────────────
const PRIORITY_WEIGHTS: Record<string, number> = {
  critical: 10,
  high: 7,
  medium: 4,
  low: 1,
};

// ── Skill matching ───────────────────────────────────────────────────────
const CATEGORY_SKILLS: Record<string, string[]> = {
  water: ['Water Supply', 'Infrastructure', 'Plumbing'],
  road: ['Infrastructure', 'PWD', 'Construction'],
  electricity: ['Electricity', 'DISCOM', 'Power Grid'],
  sanitation: ['Sanitation', 'Health', 'Waste Management'],
  health: ['Health', 'Medical', 'PHC'],
  other: ['General', 'Administration'],
};

function skillMatch(officer: Officer, caseCategory: string): number {
  const requiredSkills = CATEGORY_SKILLS[caseCategory] || CATEGORY_SKILLS.other;
  const matchCount = officer.skills.filter(s =>
    requiredSkills.some(r => r.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(r.toLowerCase()))
  ).length;
  return Math.min(1.0, matchCount / Math.max(1, requiredSkills.length) + 0.2);
}

// ── SLA Urgency Score ────────────────────────────────────────────────────
function slaUrgency(hoursLeft: number): number {
  if (hoursLeft <= 2) return 1.0;
  if (hoursLeft <= 6) return 0.8;
  if (hoursLeft <= 12) return 0.6;
  if (hoursLeft <= 24) return 0.4;
  if (hoursLeft <= 48) return 0.2;
  return 0.1;
}

// ── Load balance penalty ─────────────────────────────────────────────────
function loadPenalty(currentLoad: number, maxCapacity: number): number {
  const utilization = currentLoad / Math.max(1, maxCapacity);
  if (utilization >= 1.0) return 0.0; // fully loaded, can't take more
  if (utilization >= 0.8) return 0.3;
  if (utilization >= 0.6) return 0.6;
  return 1.0;
}

// ── Utility Matrix Construction ──────────────────────────────────────────
function buildUtilityMatrix(officers: Officer[], cases: Case[]): number[][] {
  return officers.map(officer =>
    cases.map(c => {
      const skill = skillMatch(officer, c.category);
      const priority = PRIORITY_WEIGHTS[c.priority] / 10;
      const urgency = slaUrgency(c.slaHoursLeft);
      const load = loadPenalty(officer.currentLoad, officer.maxCapacity);
      const efficiency = officer.efficiency;

      // Composite utility = weighted combination
      return (skill * 0.25 + priority * 0.30 + urgency * 0.25 + load * 0.10 + efficiency * 0.10);
    })
  );
}

// ── Greedy Assignment (Hungarian approximation) ──────────────────────────
function greedyAssign(
  officers: Officer[],
  cases: Case[],
  utilityMatrix: number[][]
): Assignment[] {
  const assignments: Assignment[] = [];
  const assignedCases = new Set<number>();
  const officerLoads = officers.map(o => o.currentLoad);

  // Create flat list of all (officer, case, utility) triples
  const triples: { oi: number; ci: number; utility: number }[] = [];
  for (let oi = 0; oi < officers.length; oi++) {
    for (let ci = 0; ci < cases.length; ci++) {
      triples.push({ oi, ci, utility: utilityMatrix[oi][ci] });
    }
  }

  // Sort by descending utility
  triples.sort((a, b) => b.utility - a.utility);

  // Greedily assign
  for (const { oi, ci, utility } of triples) {
    if (assignedCases.has(ci)) continue;
    if (officerLoads[oi] >= officers[oi].maxCapacity) continue;

    const officer = officers[oi];
    const caseItem = cases[ci];

    const skills = CATEGORY_SKILLS[caseItem.category] || ['General'];
    const matchedSkill = officer.skills.find(s =>
      skills.some(r => r.toLowerCase().includes(s.toLowerCase()))
    ) || officer.skills[0];

    assignments.push({
      officerId: officer.id,
      officerName: officer.name,
      caseId: caseItem.id,
      caseTitle: caseItem.title,
      utility: Math.round(utility * 1000) / 1000,
      reasoning: `Matched via ${matchedSkill} skill (${Math.round(utility * 100)}% fit). SLA: ${caseItem.slaHoursLeft}h left. Priority: ${caseItem.priority}.`,
    });

    assignedCases.add(ci);
    officerLoads[oi]++;
  }

  return assignments;
}

// ── Simulate Data ────────────────────────────────────────────────────────
const MOCK_OFFICERS: Officer[] = [
  { id: 'off-1', name: 'R.K. Singh', dept: 'Water Dept', currentLoad: 3, maxCapacity: 8, skills: ['Water Supply', 'Plumbing', 'Infrastructure'], efficiency: 0.92 },
  { id: 'off-2', name: 'S. Mehta', dept: 'PWD', currentLoad: 5, maxCapacity: 7, skills: ['Infrastructure', 'PWD', 'Construction'], efficiency: 0.85 },
  { id: 'off-3', name: 'A. Verma', dept: 'Health Dept', currentLoad: 2, maxCapacity: 6, skills: ['Health', 'Medical', 'Sanitation'], efficiency: 0.90 },
  { id: 'off-4', name: 'P. Gupta', dept: 'DISCOM', currentLoad: 4, maxCapacity: 8, skills: ['Electricity', 'DISCOM', 'Power Grid'], efficiency: 0.88 },
  { id: 'off-5', name: 'M. Yadav', dept: 'Sanitation', currentLoad: 1, maxCapacity: 6, skills: ['Sanitation', 'Waste Management', 'Health'], efficiency: 0.95 },
  { id: 'off-6', name: 'K. Dubey', dept: 'General Admin', currentLoad: 6, maxCapacity: 9, skills: ['Administration', 'General', 'Infrastructure'], efficiency: 0.78 },
];

const MOCK_CASES: Case[] = [
  { id: 'case-1', title: 'Burst water main flooding street', category: 'water', priority: 'critical', ward: 'Ward 14', slaHoursLeft: 3 },
  { id: 'case-2', title: 'Giant pothole on NH-44', category: 'road', priority: 'high', ward: 'Ward 5', slaHoursLeft: 12 },
  { id: 'case-3', title: 'Power outage in residential colony', category: 'electricity', priority: 'high', ward: 'Ward 22', slaHoursLeft: 6 },
  { id: 'case-4', title: 'Garbage dump near school', category: 'sanitation', priority: 'critical', ward: 'Ward 12', slaHoursLeft: 4 },
  { id: 'case-5', title: 'Streetlight not working', category: 'electricity', priority: 'medium', ward: 'Ward 8', slaHoursLeft: 48 },
  { id: 'case-6', title: 'Sewage overflow near market', category: 'sanitation', priority: 'high', ward: 'Ward 19', slaHoursLeft: 8 },
  { id: 'case-7', title: 'Water contamination report', category: 'water', priority: 'critical', ward: 'Ward 3', slaHoursLeft: 2 },
  { id: 'case-8', title: 'Road cave-in after rain', category: 'road', priority: 'high', ward: 'Ward 7', slaHoursLeft: 10 },
  { id: 'case-9', title: 'Dengue cases rising in area', category: 'health', priority: 'critical', ward: 'Ward 14', slaHoursLeft: 4 },
  { id: 'case-10', title: 'Tree fallen on road', category: 'road', priority: 'medium', ward: 'Ward 31', slaHoursLeft: 24 },
];

// ── API Route ────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const officers = MOCK_OFFICERS;
    const cases = MOCK_CASES;

    // Build utility matrix
    const utilityMatrix = buildUtilityMatrix(officers, cases);

    // Run greedy assignment
    const assignments = greedyAssign(officers, cases, utilityMatrix);

    // Compute metrics
    const officerLoadAfter: Record<string, number> = {};
    for (const officer of officers) {
      officerLoadAfter[officer.id] = officer.currentLoad;
    }
    for (const a of assignments) {
      officerLoadAfter[a.officerId] = (officerLoadAfter[a.officerId] || 0) + 1;
    }

    const loads = Object.values(officerLoadAfter);
    const avgLoad = loads.reduce((a, b) => a + b, 0) / loads.length;
    const loadVariance = loads.reduce((s, l) => s + (l - avgLoad) ** 2, 0) / loads.length;
    const loadBalanceScore = Math.round((1 - Math.min(1, Math.sqrt(loadVariance) / avgLoad)) * 100);

    // SLA breach prediction
    const criticalSlaCount = cases.filter(c => c.slaHoursLeft <= 6).length;
    const assignedCritical = assignments.filter(a => {
      const c = cases.find(cc => cc.id === a.caseId);
      return c && c.slaHoursLeft <= 6;
    }).length;
    const slaSaveRate = criticalSlaCount > 0 ? Math.round((assignedCritical / criticalSlaCount) * 100) : 100;

    return NextResponse.json({
      assignments,
      unassigned: cases.filter(c => !assignments.some(a => a.caseId === c.id)).map(c => ({
        ...c,
        reason: 'All matching officers at capacity',
      })),
      metrics: {
        totalCases: cases.length,
        totalAssigned: assignments.length,
        loadBalanceScore,
        slaSaveRate,
        avgUtility: Math.round(
          (assignments.reduce((s, a) => s + a.utility, 0) / Math.max(1, assignments.length)) * 1000
        ) / 1000,
      },
      officerLoads: officers.map(o => ({
        id: o.id,
        name: o.name,
        dept: o.dept,
        before: o.currentLoad,
        after: officerLoadAfter[o.id],
        capacity: o.maxCapacity,
        utilization: Math.round(((officerLoadAfter[o.id] || 0) / o.maxCapacity) * 100),
      })),
      metadata: {
        algorithm: 'MARL-style Greedy Utility Maximization (Hungarian approximation)',
        utilityComponents: 'skill_match(25%) + priority(30%) + sla_urgency(25%) + load_balance(10%) + efficiency(10%)',
      },
    });
  } catch (error: any) {
    console.error('MARL Optimizer Error:', error);
    return NextResponse.json({ error: 'Resource optimization failed', details: error.message }, { status: 500 });
  }
}
