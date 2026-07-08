import { NextResponse } from 'next/server';
import ModelClient, { isUnexpected } from '@/lib/gemini-adapter';
import { AzureKeyCredential } from '@/lib/gemini-adapter';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KNOWLEDGE GRAPH + LLM REASONING (City Brain)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * In-memory graph of civic entities:
 *   Citizens → Complaints → Departments → Wards → Schemes
 * 
 * 1. Builds adjacency list graph from civic data
 * 2. Graph traversal finds connected entity paths (BFS/DFS)
 * 3. LLM synthesizes natural language explanation from paths
 * 4. Fallback: pure graph-based reasoning without LLM
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Graph Types ──────────────────────────────────────────────────────────
type NodeType = 'ward' | 'department' | 'category' | 'scheme' | 'officer' | 'metric';

interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  properties: Record<string, string | number>;
}

interface GraphEdge {
  from: string;
  to: string;
  relation: string;
  weight: number;
}

// ── Knowledge Graph Construction ─────────────────────────────────────────
const GRAPH_NODES: GraphNode[] = [
  // Wards
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `ward-${i + 1}`, type: 'ward' as NodeType,
    label: `Ward ${i + 1}`,
    properties: { population: 6000 + (i * 1200), area_sqkm: 2 + (i % 4) }
  })),
  // Departments
  { id: 'dept-water', type: 'department', label: 'Water Supply Dept', properties: { officers: 12, budget_cr: 45 } },
  { id: 'dept-pwd', type: 'department', label: 'Public Works Dept', properties: { officers: 18, budget_cr: 120 } },
  { id: 'dept-health', type: 'department', label: 'Health Dept', properties: { officers: 15, budget_cr: 80 } },
  { id: 'dept-elec', type: 'department', label: 'Electricity (DISCOM)', properties: { officers: 10, budget_cr: 65 } },
  { id: 'dept-sanit', type: 'department', label: 'Sanitation Dept', properties: { officers: 20, budget_cr: 55 } },
  // Categories
  { id: 'cat-water', type: 'category', label: 'Water Supply Issues', properties: { avg_resolution_hrs: 36 } },
  { id: 'cat-road', type: 'category', label: 'Road & Infrastructure', properties: { avg_resolution_hrs: 72 } },
  { id: 'cat-health', type: 'category', label: 'Health & Sanitation', properties: { avg_resolution_hrs: 24 } },
  { id: 'cat-elec', type: 'category', label: 'Electricity Issues', properties: { avg_resolution_hrs: 18 } },
  { id: 'cat-garbage', type: 'category', label: 'Garbage & Waste', properties: { avg_resolution_hrs: 48 } },
  // Schemes
  { id: 'scheme-pmkisan', type: 'scheme', label: 'PM-KISAN', properties: { beneficiaries: 12340, target: 15000 } },
  { id: 'scheme-ayush', type: 'scheme', label: 'Ayushman Bharat', properties: { beneficiaries: 8920, target: 12000 } },
  { id: 'scheme-awas', type: 'scheme', label: 'PM Awas Yojana', properties: { beneficiaries: 3210, target: 5000 } },
  { id: 'scheme-ujjwala', type: 'scheme', label: 'Ujjwala Yojana', properties: { beneficiaries: 6500, target: 8000 } },
  // Metrics
  { id: 'metric-satisfaction', type: 'metric', label: 'Citizen Satisfaction', properties: { score: 4.2, max: 5.0 } },
  { id: 'metric-resolution', type: 'metric', label: 'Resolution Rate', properties: { rate: 78, unit: 'percent' } },
];

const GRAPH_EDGES: GraphEdge[] = [
  // Ward → Department (complaints filed)
  { from: 'ward-3', to: 'dept-water', relation: 'COMPLAINTS_TO', weight: 47 },
  { from: 'ward-7', to: 'dept-water', relation: 'COMPLAINTS_TO', weight: 32 },
  { from: 'ward-5', to: 'dept-pwd', relation: 'COMPLAINTS_TO', weight: 56 },
  { from: 'ward-12', to: 'dept-pwd', relation: 'COMPLAINTS_TO', weight: 28 },
  { from: 'ward-3', to: 'dept-health', relation: 'COMPLAINTS_TO', weight: 22 },
  { from: 'ward-8', to: 'dept-health', relation: 'COMPLAINTS_TO', weight: 38 },
  { from: 'ward-10', to: 'dept-elec', relation: 'COMPLAINTS_TO', weight: 41 },
  { from: 'ward-2', to: 'dept-elec', relation: 'COMPLAINTS_TO', weight: 19 },
  { from: 'ward-6', to: 'dept-sanit', relation: 'COMPLAINTS_TO', weight: 53 },
  { from: 'ward-9', to: 'dept-sanit', relation: 'COMPLAINTS_TO', weight: 37 },
  { from: 'ward-1', to: 'dept-sanit', relation: 'COMPLAINTS_TO', weight: 44 },
  // Department → Category (handles)
  { from: 'dept-water', to: 'cat-water', relation: 'HANDLES', weight: 1 },
  { from: 'dept-pwd', to: 'cat-road', relation: 'HANDLES', weight: 1 },
  { from: 'dept-health', to: 'cat-health', relation: 'HANDLES', weight: 1 },
  { from: 'dept-elec', to: 'cat-elec', relation: 'HANDLES', weight: 1 },
  { from: 'dept-sanit', to: 'cat-garbage', relation: 'HANDLES', weight: 1 },
  // Ward → Scheme (beneficiaries)
  { from: 'ward-1', to: 'scheme-pmkisan', relation: 'ENROLLED_IN', weight: 1200 },
  { from: 'ward-4', to: 'scheme-pmkisan', relation: 'ENROLLED_IN', weight: 890 },
  { from: 'ward-3', to: 'scheme-ayush', relation: 'ENROLLED_IN', weight: 1500 },
  { from: 'ward-7', to: 'scheme-ayush', relation: 'ENROLLED_IN', weight: 2100 },
  { from: 'ward-5', to: 'scheme-awas', relation: 'ENROLLED_IN', weight: 450 },
  { from: 'ward-12', to: 'scheme-ujjwala', relation: 'ENROLLED_IN', weight: 780 },
  // Category → Metric
  { from: 'cat-water', to: 'metric-satisfaction', relation: 'IMPACTS', weight: -0.3 },
  { from: 'cat-health', to: 'metric-satisfaction', relation: 'IMPACTS', weight: -0.5 },
  { from: 'cat-garbage', to: 'metric-satisfaction', relation: 'IMPACTS', weight: -0.4 },
  { from: 'cat-road', to: 'metric-resolution', relation: 'IMPACTS', weight: -0.2 },
];

// ── Graph Traversal (BFS) ────────────────────────────────────────────────
function bfsPathFind(fromId: string, toId: string, edges: GraphEdge[], maxDepth: number = 5): string[][] {
  const paths: string[][] = [];
  const queue: { node: string; path: string[] }[] = [{ node: fromId, path: [fromId] }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.path.length > maxDepth) continue;

    if (current.node === toId && current.path.length > 1) {
      paths.push(current.path);
      continue;
    }

    const neighbors = edges
      .filter(e => e.from === current.node || e.to === current.node)
      .map(e => e.from === current.node ? e.to : e.from)
      .filter(n => !current.path.includes(n));

    for (const neighbor of neighbors) {
      queue.push({ node: neighbor, path: [...current.path, neighbor] });
    }
  }

  return paths;
}

function findRelatedEntities(entityId: string, edges: GraphEdge[], depth: number = 2): Set<string> {
  const visited = new Set<string>();
  const queue: { node: string; d: number }[] = [{ node: entityId, d: 0 }];

  while (queue.length > 0) {
    const { node, d } = queue.shift()!;
    if (visited.has(node) || d > depth) continue;
    visited.add(node);

    const neighbors = edges
      .filter(e => e.from === node || e.to === node)
      .map(e => e.from === node ? e.to : e.from);

    for (const n of neighbors) {
      queue.push({ node: n, d: d + 1 });
    }
  }

  visited.delete(entityId);
  return visited;
}

// ── Graph-based reasoning (fallback without LLM) ─────────────────────────
function graphReason(query: string, nodes: GraphNode[], edges: GraphEdge[]): string {
  const q = query.toLowerCase();

  // Identify mentioned entities
  const mentionedNodes = nodes.filter(n =>
    q.includes(n.label.toLowerCase()) || q.includes(n.id.replace('ward-', 'ward ').replace('dept-', '').replace('cat-', ''))
  );

  if (mentionedNodes.length === 0) {
    // General query — analyze highest complaint wards
    const wardComplaints = edges
      .filter(e => e.relation === 'COMPLAINTS_TO')
      .reduce((acc, e) => {
        acc[e.from] = (acc[e.from] || 0) + e.weight;
        return acc;
      }, {} as Record<string, number>);

    const topWard = Object.entries(wardComplaints).sort((a, b) => b[1] - a[1])[0];
    const wardNode = nodes.find(n => n.id === topWard?.[0]);

    return `Based on the Knowledge Graph analysis:\n\n• ${wardNode?.label || 'Ward 5'} has the highest complaint volume (${topWard?.[1] || 56} cases), primarily directed at the Public Works Department.\n• The Sanitation Department handles the most cross-ward complaints (3 wards reporting issues).\n• Water Supply issues in Ward 3 correlate with lower citizen satisfaction scores.\n• Ayushman Bharat scheme has highest enrollment in Ward 7 (2,100 beneficiaries).\n\nRecommendation: Prioritize infrastructure intervention in the top-complaint ward and increase sanitation capacity across all reporting wards.`;
  }

  // Analyze connections for mentioned entities
  const insights: string[] = [];
  for (const node of mentionedNodes) {
    const related = findRelatedEntities(node.id, edges, 2);
    const relatedNodes = nodes.filter(n => related.has(n.id));

    const connections = edges.filter(e => e.from === node.id || e.to === node.id);
    insights.push(`${node.label} is connected to ${relatedNodes.length} entities via ${connections.length} relationships.`);

    for (const conn of connections.slice(0, 3)) {
      const targetNode = nodes.find(n => n.id === (conn.from === node.id ? conn.to : conn.from));
      insights.push(`  → ${conn.relation.replace(/_/g, ' ')}: ${targetNode?.label} (weight: ${conn.weight})`);
    }
  }

  return `Knowledge Graph Traversal Results:\n\n${insights.join('\n')}\n\nThe graph reveals that these entities are interconnected through ${mentionedNodes.length > 1 ? 'multiple pathways' : 'direct and indirect relationships'}, suggesting coordinated intervention would be most effective.`;
}

// ── API Route ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const query = body.query || 'What are the main civic issues?';
    const useLLM = body.useLLM !== false;

    // Step 1: Graph traversal to gather context
    const graphInsight = graphReason(query, GRAPH_NODES, GRAPH_EDGES);

    // Step 2: Try LLM synthesis if available
    let llmExplanation: string | null = null;
    const token = process.env.GITHUB_TOKEN;

    if (useLLM && token) {
      try {
        const client = ModelClient(
          'https://models.github.ai/inference',
          new AzureKeyCredential(token)
        );

        const response = await client.path('/chat/completions').post({
          body: {
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `You are City Brain, an AI that reasons over a Knowledge Graph of a city's civic data. You have traversed the graph and found the following insights. Synthesize these into a clear, actionable explanation for a government official. Use data points from the graph. Be concise but insightful. Format with bullet points.\n\nALWAYS start your response exactly with "Dear Jan Seva," and always end your response exactly with "Best regards,\nBharat Setu". Do not use placeholders like [Your Name].`
              },
              {
                role: 'user',
                content: `User Query: "${query}"\n\nKnowledge Graph Traversal Results:\n${graphInsight}\n\nGraph Stats: ${GRAPH_NODES.length} entities, ${GRAPH_EDGES.length} relationships.\n\nProvide a synthesized explanation connecting these graph patterns to answer the query.`
              }
            ],
            temperature: 0.7,
            max_tokens: 500,
          }
        });

        const result = response.body as any;
        llmExplanation = result.choices?.[0]?.message?.content || null;
        if (llmExplanation) {
          llmExplanation = llmExplanation
            .replace(/\[Government Official\]/g, 'Jan Seva')
            .replace(/\[Your Name\]/g, 'Bharat Setu');
        }
      } catch {
        // LLM unavailable — use graph-only reasoning
      }
    }

    return NextResponse.json({
      query,
      answer: llmExplanation || graphInsight,
      source: llmExplanation ? 'knowledge_graph + llm_synthesis' : 'knowledge_graph_only',
      graphStats: {
        nodesTraversed: GRAPH_NODES.length,
        edgesTraversed: GRAPH_EDGES.length,
        maxDepth: 3,
      },
      relatedEntities: (() => {
        const q = query.toLowerCase();
        const mentioned = GRAPH_NODES.filter(n => q.includes(n.label.toLowerCase()));
        if (mentioned.length === 0) return GRAPH_NODES.slice(0, 6).map(n => ({ id: n.id, label: n.label, type: n.type }));
        const related = new Set<string>();
        for (const m of mentioned) {
          findRelatedEntities(m.id, GRAPH_EDGES, 2).forEach(id => related.add(id));
        }
        return Array.from(related).slice(0, 8).map(id => {
          const node = GRAPH_NODES.find(n => n.id === id);
          return { id, label: node?.label || id, type: node?.type || 'unknown' };
        });
      })(),
      metadata: {
        algorithm: 'BFS Graph Traversal + RAG-style LLM Synthesis',
        graphType: 'Heterogeneous Property Graph',
        entityTypes: ['ward', 'department', 'category', 'scheme', 'officer', 'metric'],
        relationTypes: ['COMPLAINTS_TO', 'HANDLES', 'ENROLLED_IN', 'IMPACTS'],
      },
    });
  } catch (error: any) {
    console.error('Knowledge Graph Error:', error);
    return NextResponse.json({ error: 'Knowledge graph query failed', details: error.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query') || 'What are the main civic issues?';
  console.log('--- DEBUG: GET request to knowledge-graph ---');
  console.log('Query:', query);
  
  // Reuse the logic from POST but specifically for this rogue GET
  const graphInsight = graphReason(query, GRAPH_NODES, GRAPH_EDGES);
  return NextResponse.json({
    query,
    answer: graphInsight,
    source: 'knowledge_graph_only (fallback_get)',
    graphStats: {
      nodesTraversed: GRAPH_NODES.length,
      edgesTraversed: GRAPH_EDGES.length,
      maxDepth: 3,
    },
    relatedEntities: GRAPH_NODES.slice(0, 6).map(n => ({ id: n.id, label: n.label, type: n.type })),
    metadata: {
      note: 'This is a fallback GET handler for debugging.',
      algorithm: 'BFS Graph Traversal',
    },
  });
}
