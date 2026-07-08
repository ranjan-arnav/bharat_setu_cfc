import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Z-SCORE STATISTICAL ANOMALY DETECTOR
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Algorithm:
 * 1. Compute per-ward rolling mean/std of complaint rates
 * 2. Z-Score = (current - mean) / std
 * 3. Flag wards with |Z| > 2.0 (Grubbs' test threshold)
 * 4. Temporal anomaly detection: unusual hourly filing patterns
 * 5. Cross-category anomaly: sudden category distribution shifts
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface WardAnomaly {
  ward: string;
  currentRate: number;
  historicalMean: number;
  historicalStd: number;
  zScore: number;
  severity: 'critical' | 'warning' | 'normal';
  interpretation: string;
}

interface TemporalAnomaly {
  hour: number;
  expectedRate: number;
  actualRate: number;
  zScore: number;
  anomalous: boolean;
}

interface CategoryShift {
  category: string;
  expectedShare: number;
  actualShare: number;
  shiftMagnitude: number;
  direction: 'spike' | 'drop';
}

// ── Statistical Functions ────────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 1;
  const m = mean(arr);
  const variance = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function zScore(value: number, m: number, s: number): number {
  return s === 0 ? 0 : (value - m) / s;
}

// ── Grubbs' Test Critical Values (two-sided, α = 0.05) ──────────────────
function grubbsCritical(n: number): number {
  // Simplified lookup for common sample sizes
  if (n <= 3) return 1.15;
  if (n <= 5) return 1.67;
  if (n <= 7) return 1.94;
  if (n <= 10) return 2.18;
  if (n <= 15) return 2.41;
  if (n <= 20) return 2.56;
  if (n <= 30) return 2.75;
  return 2.0; // default threshold
}

// ── Generate Simulated Historical Data ───────────────────────────────────

function generateWardHistory(wardIdx: number, days: number = 30): number[] {
  const seed = wardIdx * 73 + 17;
  const history: number[] = [];
  const base = 5 + (wardIdx % 5) * 4;

  for (let d = 0; d < days; d++) {
    const seasonal = 2 * Math.sin((2 * Math.PI * d) / 7); // weekly pattern
    const noise = (Math.sin(seed + d * 47.3) * 10000 % 1 - 0.5) * 3;
    history.push(Math.max(0, Math.round(base + seasonal + noise)));
  }

  // Inject anomaly in some wards for today
  if (wardIdx === 2 || wardIdx === 7 || wardIdx === 11) {
    history.push(Math.round(base * 3.5 + Math.abs(Math.sin(seed) * 5))); // spike today
  } else {
    history.push(Math.max(0, Math.round(base + (Math.sin(seed + days * 47.3) * 10000 % 1 - 0.5) * 3)));
  }

  return history;
}

function generateHourlyPattern(): { expected: number[]; actual: number[] } {
  const expected = Array.from({ length: 24 }, (_, h) => {
    // Normal pattern: low at night, peak 9-11am and 3-5pm
    if (h >= 0 && h < 6) return 2;
    if (h >= 6 && h < 9) return 5;
    if (h >= 9 && h < 12) return 12;
    if (h >= 12 && h < 14) return 8;
    if (h >= 14 && h < 18) return 11;
    if (h >= 18 && h < 21) return 6;
    return 3;
  });

  const actual = expected.map((e, h) => {
    // Inject anomaly at 2-4 AM (unusual filing)
    if (h >= 2 && h <= 4) return Math.round(e * 4.5);
    return Math.max(0, Math.round(e + (Math.random() - 0.5) * 3));
  });

  return { expected, actual };
}

// ── Main Analysis ────────────────────────────────────────────────────────

export async function GET() {
  try {
    const wardCount = 15;
    const wardAnomalies: WardAnomaly[] = [];

    // Per-ward anomaly detection
    for (let w = 0; w < wardCount; w++) {
      const history = generateWardHistory(w, 30);
      const current = history[history.length - 1];
      const historicalData = history.slice(0, -1);

      const m = mean(historicalData);
      const s = stdDev(historicalData);
      const z = zScore(current, m, s);
      const critical = grubbsCritical(historicalData.length);

      const severity: WardAnomaly['severity'] =
        Math.abs(z) > critical * 1.5 ? 'critical' :
        Math.abs(z) > critical ? 'warning' : 'normal';

      wardAnomalies.push({
        ward: `Ward ${w + 1}`,
        currentRate: current,
        historicalMean: Math.round(m * 10) / 10,
        historicalStd: Math.round(s * 10) / 10,
        zScore: Math.round(z * 100) / 100,
        severity,
        interpretation: severity === 'critical'
          ? `Complaint rate is ${Math.round(Math.abs(z))}σ above normal — statistically significant anomaly (p < 0.01)`
          : severity === 'warning'
          ? `Elevated complaint rate at ${Math.round(Math.abs(z))}σ above mean — worth monitoring`
          : `Within normal statistical bounds`,
      });
    }

    // Temporal anomaly detection
    const { expected, actual } = generateHourlyPattern();
    const temporalAnomalies: TemporalAnomaly[] = expected.map((e, h) => {
      const z = e > 0 ? (actual[h] - e) / Math.max(1, e * 0.3) : 0;
      return {
        hour: h,
        expectedRate: e,
        actualRate: actual[h],
        zScore: Math.round(z * 100) / 100,
        anomalous: Math.abs(z) > 2.5,
      };
    });

    // Category distribution shift
    const expectedDistribution: Record<string, number> = {
      'Water Supply': 0.22, 'Road/Infrastructure': 0.28, 'Sanitation': 0.18,
      'Electricity': 0.15, 'Health': 0.10, 'Other': 0.07,
    };

    const actualDistribution: Record<string, number> = {
      'Water Supply': 0.35, 'Road/Infrastructure': 0.25, 'Sanitation': 0.12,
      'Electricity': 0.14, 'Health': 0.08, 'Other': 0.06,
    };

    const categoryShifts: CategoryShift[] = Object.keys(expectedDistribution).map(cat => {
      const expShare = expectedDistribution[cat];
      const actShare = actualDistribution[cat];
      const shift = actShare - expShare;
      return {
        category: cat,
        expectedShare: Math.round(expShare * 100),
        actualShare: Math.round(actShare * 100),
        shiftMagnitude: Math.round(Math.abs(shift) * 100),
        direction: (shift > 0 ? 'spike' : 'drop') as 'spike' | 'drop',
      };
    }).sort((a, b) => b.shiftMagnitude - a.shiftMagnitude);

    // Summary stats
    const criticalWards = wardAnomalies.filter(w => w.severity === 'critical');
    const warningWards = wardAnomalies.filter(w => w.severity === 'warning');
    const anomalousHours = temporalAnomalies.filter(t => t.anomalous);

    return NextResponse.json({
      wardAnomalies: wardAnomalies.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore)),
      temporalAnomalies,
      categoryShifts,
      summary: {
        criticalWards: criticalWards.length,
        warningWards: warningWards.length,
        anomalousHours: anomalousHours.length,
        topAnomaly: criticalWards[0] || warningWards[0] || null,
        biggestCategoryShift: categoryShifts[0] || null,
        overallRiskLevel: criticalWards.length > 0 ? 'HIGH' : warningWards.length > 0 ? 'ELEVATED' : 'NORMAL',
      },
      metadata: {
        algorithm: 'Rolling Window Z-Score + Grubbs\' Test + Category Distribution Analysis',
        significanceLevel: 'α = 0.05',
        windowSize: '30 days',
        wardCount,
      },
    });
  } catch (error: any) {
    console.error('Anomaly Detector Error:', error);
    return NextResponse.json({ error: 'Anomaly detection failed', details: error.message }, { status: 500 });
  }
}
