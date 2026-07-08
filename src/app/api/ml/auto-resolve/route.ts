import { NextResponse } from 'next/server';
import ModelClient, { isUnexpected } from '@/lib/gemini-adapter';
import { AzureKeyCredential } from '@/lib/gemini-adapter';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI RESOLUTION PLANNER — Chain-of-Thought Action Plan Generator
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Takes case details → generates step-by-step resolution plan with:
 * - Timeline estimation
 * - Resource requirements
 * - Risk assessment
 * - Department coordination needs
 * 
 * Fallback: template-based plan generation
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Templates ────────────────────────────────────────────────────────────
const PLAN_TEMPLATES: Record<string, {
  steps: { action: string; dept: string; hours: number; resources: string }[];
  risks: string[];
}> = {
  water: {
    steps: [
      { action: 'Dispatch field inspection team to verify complaint', dept: 'Water Supply', hours: 2, resources: '1 engineer + 1 inspector' },
      { action: 'Identify fault location using SCADA system', dept: 'Water Supply', hours: 1, resources: 'SCADA monitoring + GIS mapping' },
      { action: 'Isolate affected pipeline section', dept: 'Water Supply', hours: 2, resources: 'Valve operation team' },
      { action: 'Deploy repair crew with materials', dept: 'PWD + Water Supply', hours: 4, resources: 'Plumbing crew + replacement pipes' },
      { action: 'Conduct water quality testing post-repair', dept: 'Health Dept', hours: 2, resources: 'Lab testing kit' },
      { action: 'Restore supply and notify citizens', dept: 'Water Supply + Admin', hours: 1, resources: 'SMS/App notification system' },
    ],
    risks: ['Contamination risk if not isolated quickly', 'Secondary flooding in low-lying areas', 'Extended outage if main pipeline affected'],
  },
  road: {
    steps: [
      { action: 'Photograph and document damage extent', dept: 'PWD', hours: 1, resources: '1 inspector + measuring tools' },
      { action: 'Place temporary safety barriers and signage', dept: 'PWD + Traffic Police', hours: 2, resources: 'Barriers + warning signs' },
      { action: 'Procure repair materials (tar/concrete)', dept: 'PWD Procurement', hours: 4, resources: 'Budget allocation + vendor' },
      { action: 'Execute pothole filling / resurfacing', dept: 'PWD', hours: 6, resources: 'Road crew + machinery' },
      { action: 'Quality inspection of repair work', dept: 'PWD Quality', hours: 1, resources: '1 senior engineer' },
    ],
    risks: ['Accident risk if not barricaded', 'Rain can worsen damage if delayed', 'Traffic disruption during repair'],
  },
  electricity: {
    steps: [
      { action: 'Check transformer status via SCADA', dept: 'DISCOM', hours: 1, resources: 'Control room monitoring' },
      { action: 'Dispatch line crew to fault location', dept: 'DISCOM', hours: 2, resources: 'Electrician team + safety gear' },
      { action: 'Isolate faulty section for safe repair', dept: 'DISCOM', hours: 1, resources: 'Circuit isolation team' },
      { action: 'Replace damaged transformer/cables', dept: 'DISCOM', hours: 4, resources: 'Replacement transformer + crane' },
      { action: 'Energize and test restored section', dept: 'DISCOM', hours: 1, resources: 'Testing equipment' },
    ],
    risks: ['Electrocution risk for field crew', 'Food spoilage for residents', 'Medical equipment failure in homes'],
  },
  sanitation: {
    steps: [
      { action: 'Deploy sanitation team for immediate cleanup', dept: 'Sanitation', hours: 3, resources: 'Cleaning crew + vehicle' },
      { action: 'Unclog drainage if applicable', dept: 'Sanitation + PWD', hours: 2, resources: 'Jetting machine' },
      { action: 'Apply pest control and disinfectant', dept: 'Health Dept', hours: 2, resources: 'Fogging machine + chemicals' },
      { action: 'Install waste bins if area lacks them', dept: 'Municipal Corp', hours: 4, resources: 'Bins + installation crew' },
      { action: 'Schedule regular pickup and monitor', dept: 'Sanitation', hours: 1, resources: 'Updated collection route' },
    ],
    risks: ['Disease outbreak if delayed', 'Mosquito breeding in stagnant waste', 'Community health impact'],
  },
  health: {
    steps: [
      { action: 'Deploy mobile health team for assessment', dept: 'Health Dept', hours: 2, resources: 'Doctor + paramedic + testing kits' },
      { action: 'Conduct door-to-door screening in affected area', dept: 'Health Dept', hours: 6, resources: 'ASHA workers + screening forms' },
      { action: 'Set up emergency treatment desk', dept: 'Health Dept + PHC', hours: 3, resources: 'Medical supplies + temporary shelter' },
      { action: 'Initiate fogging and vector control', dept: 'Health Dept + Municipal', hours: 4, resources: 'Fogging machines + insecticide' },
      { action: 'Issue public health advisory', dept: 'Admin + Health', hours: 1, resources: 'Broadcast system' },
    ],
    risks: ['Epidemic spread if containment delayed', 'Hospital overcrowding', 'Public panic if communication is poor'],
  },
};

const DEFAULT_PLAN = PLAN_TEMPLATES.water;

// ── API Route ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      caseId = 'UNKNOWN',
      title = 'Civic issue',
      category = 'other',
      priority = 'medium',
      ward = 'Ward 1',
      description = '',
    } = body;

    const token = process.env.GITHUB_TOKEN;
    let plan: {
      steps: { action: string; dept: string; hours: number; resources: string }[];
      risks: string[];
      estimatedTotal: string;
      coordinationNeeds: string[];
    };
    let source = 'template';

    if (token) {
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
                content: `You are a government operations planner. Generate a detailed action plan for resolving a citizen grievance. Return ONLY JSON:
{
  "steps": [{"action": "desc", "dept": "department", "hours": number, "resources": "needed"}],
  "risks": ["risk1", "risk2"],
  "estimatedTotal": "X hours",
  "coordinationNeeds": ["dept1 + dept2 coordination", ...]
}
Provide 5-7 steps. Be specific and actionable.`
              },
              {
                role: 'user',
                content: `Case: ${title}\nCategory: ${category}\nPriority: ${priority}\nWard: ${ward}\nDescription: ${description}\n\nGenerate the resolution plan.`
              }
            ],
            temperature: 0.5,
            max_tokens: 800,
          }
        });

        const result = response.body as any;
        const content = result.choices?.[0]?.message?.content || '';

        try {
          const parsed = JSON.parse(content.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
          if (parsed.steps && Array.isArray(parsed.steps)) {
            plan = {
              steps: parsed.steps,
              risks: parsed.risks || [],
              estimatedTotal: parsed.estimatedTotal || `${parsed.steps.reduce((s: number, st: any) => s + (st.hours || 2), 0)} hours`,
              coordinationNeeds: parsed.coordinationNeeds || [],
            };
            source = 'llm_chain_of_thought';
          } else {
            throw new Error('Invalid format');
          }
        } catch {
          const template = PLAN_TEMPLATES[category] || DEFAULT_PLAN;
          plan = {
            steps: template.steps,
            risks: template.risks,
            estimatedTotal: `${template.steps.reduce((s, st) => s + st.hours, 0)} hours`,
            coordinationNeeds: Array.from(new Set(template.steps.map(s => s.dept))),
          };
        }
      } catch {
        const template = PLAN_TEMPLATES[category] || DEFAULT_PLAN;
        plan = {
          steps: template.steps,
          risks: template.risks,
          estimatedTotal: `${template.steps.reduce((s, st) => s + st.hours, 0)} hours`,
          coordinationNeeds: Array.from(new Set(template.steps.map(s => s.dept))),
        };
      }
    } else {
      const template = PLAN_TEMPLATES[category] || DEFAULT_PLAN;
      plan = {
        steps: template.steps,
        risks: template.risks,
        estimatedTotal: `${template.steps.reduce((s, st) => s + st.hours, 0)} hours`,
        coordinationNeeds: Array.from(new Set(template.steps.map(s => s.dept))),
      };
    }

    return NextResponse.json({
      caseId,
      title,
      category,
      priority,
      ward,
      plan,
      source,
      metadata: {
        algorithm: source === 'llm_chain_of_thought'
          ? 'GPT-4o-mini Chain-of-Thought Planning'
          : 'Template-Based Department Resolution Planning',
      },
    });
  } catch (error: any) {
    console.error('Auto-Resolve Error:', error);
    return NextResponse.json({ error: 'Plan generation failed', details: error.message }, { status: 500 });
  }
}
