import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CAUSAL AI ENGINE — Structural Causal Model (SCM) + do-calculus
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Models city systems as a Directed Acyclic Graph (DAG):
 *   Rain → Drainage Failure → Waterlogging → Health Issues
 *   Population Density → Garbage Accumulation → Sanitation Complaints
 *   Power Grid Load → Transformer Failure → Electricity Complaints
 * 
 * Supports do(X) interventions:
 *   "If we fix drainage in Ward 5, how much will health complaints reduce?"
 * 
 * Algorithm: Path coefficient multiplication through adjacency matrix
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Causal Graph Definition ──────────────────────────────────────────────
// Each node is a civic variable. Edges carry causal coefficients (0-1).
interface CausalEdge {
  from: string;
  to: string;
  coefficient: number; // strength of causal effect (0 to 1)
  mechanism: string;   // human-readable explanation
}

interface CausalNode {
  id: string;
  label: string;
  category: 'environmental' | 'infrastructure' | 'health' | 'social' | 'economic';
  baseRate: number; // baseline complaint rate per 1000 citizens/month
  icon: string;
  color: string;
}

const NODES: CausalNode[] = [
  { id: 'rain', label: 'Heavy Rainfall', category: 'environmental', baseRate: 0, icon: 'water_drop', color: '#06B6D4' },
  { id: 'heat', label: 'Heat Wave', category: 'environmental', baseRate: 0, icon: 'thermostat', color: '#EF4444' },
  { id: 'drainage', label: 'Drainage Failure', category: 'infrastructure', baseRate: 12, icon: 'plumbing', color: '#8B5CF6' },
  { id: 'waterlogging', label: 'Waterlogging', category: 'infrastructure', baseRate: 8, icon: 'flood', color: '#3B82F6' },
  { id: 'garbage', label: 'Garbage Accumulation', category: 'infrastructure', baseRate: 15, icon: 'delete', color: '#F59E0B' },
  { id: 'mosquito', label: 'Mosquito Breeding', category: 'health', baseRate: 6, icon: 'pest_control', color: '#10B981' },
  { id: 'dengue', label: 'Dengue/Malaria Risk', category: 'health', baseRate: 3, icon: 'coronavirus', color: '#EF4444' },
  { id: 'water_supply', label: 'Water Supply Disruption', category: 'infrastructure', baseRate: 10, icon: 'water_damage', color: '#06B6D4' },
  { id: 'road_damage', label: 'Road Damage', category: 'infrastructure', baseRate: 14, icon: 'add_road', color: '#F59E0B' },
  { id: 'power_failure', label: 'Power Grid Failure', category: 'infrastructure', baseRate: 9, icon: 'power_off', color: '#8B5CF6' },
  { id: 'traffic', label: 'Traffic Congestion', category: 'social', baseRate: 7, icon: 'traffic', color: '#FF9933' },
  { id: 'ambulance_delay', label: 'Ambulance Delay', category: 'health', baseRate: 2, icon: 'emergency', color: '#EF4444' },
  { id: 'economic_loss', label: 'Economic Loss', category: 'economic', baseRate: 5, icon: 'trending_down', color: '#EF4444' },
  { id: 'pop_density', label: 'Population Density', category: 'social', baseRate: 0, icon: 'groups', color: '#3B82F6' },
];

const EDGES: CausalEdge[] = [
  // Rain → cascading effects
  { from: 'rain', to: 'drainage', coefficient: 0.72, mechanism: 'Heavy rain overwhelms drainage capacity' },
  { from: 'rain', to: 'waterlogging', coefficient: 0.65, mechanism: 'Excess rainfall causes surface flooding' },
  { from: 'rain', to: 'road_damage', coefficient: 0.45, mechanism: 'Water seepage weakens road surface' },
  
  // Drainage → downstream
  { from: 'drainage', to: 'waterlogging', coefficient: 0.80, mechanism: 'Blocked drains cause water accumulation' },
  { from: 'drainage', to: 'garbage', coefficient: 0.35, mechanism: 'Stagnant water traps solid waste' },
  
  // Waterlogging → health chain
  { from: 'waterlogging', to: 'mosquito', coefficient: 0.78, mechanism: 'Standing water breeds mosquitoes' },
  { from: 'waterlogging', to: 'traffic', coefficient: 0.55, mechanism: 'Flooded roads block traffic' },
  { from: 'waterlogging', to: 'water_supply', coefficient: 0.40, mechanism: 'Contamination of water mains' },
  
  // Garbage → health
  { from: 'garbage', to: 'mosquito', coefficient: 0.60, mechanism: 'Organic waste provides breeding grounds' },
  { from: 'garbage', to: 'dengue', coefficient: 0.30, mechanism: 'Direct disease vector proximity' },
  
  // Mosquito → disease
  { from: 'mosquito', to: 'dengue', coefficient: 0.85, mechanism: 'Aedes mosquitoes transmit dengue virus' },
  
  // Heat wave effects
  { from: 'heat', to: 'power_failure', coefficient: 0.62, mechanism: 'AC load overwhelms transformer capacity' },
  { from: 'heat', to: 'water_supply', coefficient: 0.50, mechanism: 'Increased water demand exceeds supply' },
  
  // Power failure cascades
  { from: 'power_failure', to: 'water_supply', coefficient: 0.45, mechanism: 'Water pumps stop without electricity' },
  { from: 'power_failure', to: 'traffic', coefficient: 0.35, mechanism: 'Traffic signals go dark' },
  
  // Traffic → emergency
  { from: 'traffic', to: 'ambulance_delay', coefficient: 0.70, mechanism: 'Gridlock prevents emergency vehicle passage' },
  
  // Road damage
  { from: 'road_damage', to: 'traffic', coefficient: 0.50, mechanism: 'Damaged roads cause bottlenecks' },
  { from: 'road_damage', to: 'economic_loss', coefficient: 0.40, mechanism: 'Transport disruption hits businesses' },
  
  // Population density amplifier
  { from: 'pop_density', to: 'garbage', coefficient: 0.55, mechanism: 'More people generate more waste' },
  { from: 'pop_density', to: 'traffic', coefficient: 0.60, mechanism: 'Dense areas have more vehicles' },
  { from: 'pop_density', to: 'water_supply', coefficient: 0.45, mechanism: 'Higher demand on water infrastructure' },
  
  // Economic cascades
  { from: 'water_supply', to: 'economic_loss', coefficient: 0.35, mechanism: 'Businesses cannot operate without water' },
  { from: 'dengue', to: 'economic_loss', coefficient: 0.50, mechanism: 'Workforce illness reduces productivity' },
];

// ── Causal Inference Engine ──────────────────────────────────────────────

/**
 * Compute total causal effect from source to target using all directed paths.
 * Uses recursive DFS with path coefficient multiplication.
 */
function computeCausalEffect(
  source: string,
  target: string,
  edges: CausalEdge[],
  visited: Set<string> = new Set()
): { totalEffect: number; paths: { path: string[]; effect: number; mechanisms: string[] }[] } {
  if (source === target) return { totalEffect: 1.0, paths: [{ path: [source], effect: 1.0, mechanisms: [] }] };

  visited.add(source);
  const paths: { path: string[]; effect: number; mechanisms: string[] }[] = [];

  const outgoing = edges.filter(e => e.from === source && !visited.has(e.to));

  for (const edge of outgoing) {
    const sub = computeCausalEffect(edge.to, target, edges, new Set(visited));
    for (const p of sub.paths) {
      paths.push({
        path: [source, ...p.path],
        effect: edge.coefficient * p.effect,
        mechanisms: [edge.mechanism, ...p.mechanisms],
      });
    }
  }

  // Total effect = sum of all path effects (Pearl's do-calculus for DAGs)
  const totalEffect = paths.reduce((sum, p) => sum + p.effect, 0);
  return { totalEffect: Math.min(totalEffect, 1.0), paths };
}

/**
 * do(X) intervention: "If we fix X, what happens to downstream nodes?"
 * Removes all incoming edges to X (sets X to 0) and recomputes downstream effects.
 */
function doIntervention(
  interventionNode: string,
  edges: CausalEdge[],
  nodes: CausalNode[]
): {
  node: string;
  label: string;
  icon: string;
  color: string;
  originalRate: number;
  reducedRate: number;
  reductionPct: number;
  mechanism: string;
}[] {
  const results: ReturnType<typeof doIntervention> = [];
  const interventionNodeData = nodes.find(n => n.id === interventionNode);
  if (!interventionNodeData) return results;

  // For each downstream node, compute how much fixing the intervention node would reduce it
  for (const node of nodes) {
    if (node.id === interventionNode || node.baseRate === 0) continue;

    const effect = computeCausalEffect(interventionNode, node.id, edges);
    if (effect.totalEffect > 0.01) {
      const reduction = effect.totalEffect * interventionNodeData.baseRate;
      const reducedRate = Math.max(0, node.baseRate - reduction);
      const reductionPct = Math.round((reduction / Math.max(1, node.baseRate)) * 100);

      // Find the strongest path for mechanism explanation
      const strongestPath = effect.paths.sort((a, b) => b.effect - a.effect)[0];

      results.push({
        node: node.id,
        label: node.label,
        icon: node.icon,
        color: node.color,
        originalRate: node.baseRate,
        reducedRate: Math.round(reducedRate * 10) / 10,
        reductionPct: Math.min(reductionPct, 95),
        mechanism: strongestPath?.mechanisms.join(' → ') || 'Direct causal link',
      });
    }
  }

  return results.sort((a, b) => b.reductionPct - a.reductionPct);
}

// ── API Route ────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const intervention = searchParams.get('intervention') || 'drainage';
    const mode = searchParams.get('mode') || 'intervention'; // 'intervention' | 'graph' | 'effect'
    const source = searchParams.get('source');
    const target = searchParams.get('target');

    if (mode === 'graph') {
      // Return the full causal graph structure for visualization
      return NextResponse.json({
        nodes: NODES.map(n => ({ ...n })),
        edges: EDGES.map(e => ({ ...e })),
        metadata: {
          totalNodes: NODES.length,
          totalEdges: EDGES.length,
          algorithm: 'Structural Causal Model (SCM)',
          method: 'Path coefficient multiplication + do-calculus',
        }
      });
    }

    if (mode === 'effect' && source && target) {
      // Compute specific causal effect between two nodes
      const result = computeCausalEffect(source, target, EDGES);
      const sourceNode = NODES.find(n => n.id === source);
      const targetNode = NODES.find(n => n.id === target);

      return NextResponse.json({
        source: sourceNode?.label || source,
        target: targetNode?.label || target,
        totalEffect: Math.round(result.totalEffect * 1000) / 1000,
        pathCount: result.paths.length,
        paths: result.paths.slice(0, 5).map(p => ({
          nodes: p.path,
          effect: Math.round(p.effect * 1000) / 1000,
          chain: p.mechanisms.join(' → '),
        })),
        interpretation: `A unit increase in "${sourceNode?.label}" causes a ${Math.round(result.totalEffect * 100)}% increase in "${targetNode?.label}" through ${result.paths.length} causal path(s).`,
      });
    }

    // Default: Run do(intervention) analysis
    const results = doIntervention(intervention, EDGES, NODES);
    const interventionNode = NODES.find(n => n.id === intervention);

    return NextResponse.json({
      intervention: {
        node: intervention,
        label: interventionNode?.label || intervention,
        icon: interventionNode?.icon || 'build',
        color: interventionNode?.color || '#3B82F6',
        action: `Fix/eliminate "${interventionNode?.label}"`,
      },
      downstreamEffects: results,
      summary: {
        totalAffectedNodes: results.length,
        avgReduction: results.length > 0 ? Math.round(results.reduce((s, r) => s + r.reductionPct, 0) / results.length) : 0,
        maxReduction: results.length > 0 ? results[0] : null,
        algorithm: 'SCM do-calculus with path coefficient multiplication',
      },
    });
  } catch (error: any) {
    console.error('Causal Engine Error:', error);
    return NextResponse.json({ error: 'Causal analysis failed', details: error.message }, { status: 500 });
  }
}
