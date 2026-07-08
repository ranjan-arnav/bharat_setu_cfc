import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BENFORD'S LAW SCHEME LEAKAGE DETECTOR
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Algorithm:
 * 1. Extract first digits from beneficiary counts per scheme per ward
 * 2. Compare distribution vs Benford's Law expected distribution
 * 3. Chi-squared test for statistical significance
 * 4. Flag schemes with p < 0.05 as potential leakage/fraud
 * 
 * Benford's Law: P(d) = log10(1 + 1/d) for d = 1..9
 * Natural data follows this distribution. Fabricated data usually doesn't.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Benford's Law Expected Distribution ──────────────────────────────────
const BENFORD_EXPECTED: Record<number, number> = {
  1: 0.301, 2: 0.176, 3: 0.125, 4: 0.097, 5: 0.079,
  6: 0.067, 7: 0.058, 8: 0.051, 9: 0.046,
};

// ── Chi-Squared Critical Values (df=8, various α) ───────────────────────
const CHI_SQ_CRITICAL: Record<string, number> = {
  '0.10': 13.362,
  '0.05': 15.507,
  '0.01': 20.090,
  '0.001': 26.125,
};

// ── Helpers ──────────────────────────────────────────────────────────────

function firstDigit(n: number): number {
  const abs = Math.abs(n);
  if (abs < 1) return 0;
  const str = abs.toString();
  return parseInt(str[0]);
}

function firstDigitDistribution(numbers: number[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (let d = 1; d <= 9; d++) counts[d] = 0;

  for (const n of numbers) {
    const d = firstDigit(n);
    if (d >= 1 && d <= 9) counts[d]++;
  }

  const total = numbers.filter(n => firstDigit(n) >= 1).length;
  const dist: Record<number, number> = {};
  for (let d = 1; d <= 9; d++) {
    dist[d] = total > 0 ? counts[d] / total : 0;
  }

  return dist;
}

function chiSquaredTest(observed: Record<number, number>, expected: Record<number, number>, sampleSize: number): {
  statistic: number;
  pValueCategory: string;
  degreesOfFreedom: number;
  significant: boolean;
} {
  let chiSq = 0;

  for (let d = 1; d <= 9; d++) {
    const expectedCount = expected[d] * sampleSize;
    const observedCount = observed[d] * sampleSize;
    if (expectedCount > 0) {
      chiSq += ((observedCount - expectedCount) ** 2) / expectedCount;
    }
  }

  const df = 8; // 9 digits - 1

  let pCategory = 'p > 0.10 (not significant)';
  let significant = false;

  if (chiSq > CHI_SQ_CRITICAL['0.001']) {
    pCategory = 'p < 0.001 (highly significant)';
    significant = true;
  } else if (chiSq > CHI_SQ_CRITICAL['0.01']) {
    pCategory = 'p < 0.01 (very significant)';
    significant = true;
  } else if (chiSq > CHI_SQ_CRITICAL['0.05']) {
    pCategory = 'p < 0.05 (significant)';
    significant = true;
  } else if (chiSq > CHI_SQ_CRITICAL['0.10']) {
    pCategory = 'p < 0.10 (marginal)';
  }

  return {
    statistic: Math.round(chiSq * 100) / 100,
    pValueCategory: pCategory,
    degreesOfFreedom: df,
    significant,
  };
}

// ── Generating Simulated Beneficiary Data ────────────────────────────────

interface SchemeWardData {
  scheme: string;
  ward: string;
  beneficiaryCount: number;
}

function generateSchemeData(): SchemeWardData[] {
  const schemes = ['PM-KISAN', 'Ayushman Bharat', 'PM Awas Yojana', 'Jan Dhan Yojana', 'Ujjwala Yojana', 'MGNREGA'];
  const data: SchemeWardData[] = [];

  for (const scheme of schemes) {
    for (let w = 1; w <= 12; w++) {
      const seed = (scheme.charCodeAt(0) + w) * 31;
      let count: number;

      if (scheme === 'PM Awas Yojana' && (w === 3 || w === 7 || w === 11)) {
        // Inject fabricated numbers (uniform first digits — Benford violation)
        count = 100 + Math.floor((Math.sin(seed) * 10000 + 10000) % 900);
        // Force first digits to be more uniform (fabrication pattern)
        const fakeFirstDigits = [3, 4, 5, 6, 7, 8, 9];
        const fakeFd = fakeFirstDigits[w % fakeFirstDigits.length];
        count = fakeFd * 100 + Math.floor(Math.abs(Math.sin(seed + w) * 99));
      } else {
        // Natural Benford-conforming data
        const u = (Math.sin(seed + 137) * 10000 + 10000) % 1;
        const benfordBase = Math.pow(10, u); // generates numbers with Benford-compliant first digits
        count = Math.floor(benfordBase * (50 + (w * 20)));
      }

      data.push({ scheme, ward: `Ward ${w}`, beneficiaryCount: count });
    }
  }

  return data;
}

// ── API Route ────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const allData = generateSchemeData();
    const schemes = Array.from(new Set(allData.map(d => d.scheme)));

    const results = schemes.map(scheme => {
      const schemeData = allData.filter(d => d.scheme === scheme);
      const numbers = schemeData.map(d => d.beneficiaryCount);

      const observedDist = firstDigitDistribution(numbers);
      const chiTest = chiSquaredTest(observedDist, BENFORD_EXPECTED, numbers.length);

      // Compute per-digit deviation
      const digitAnalysis = Array.from({ length: 9 }, (_, i) => {
        const d = i + 1;
        return {
          digit: d,
          expected: Math.round(BENFORD_EXPECTED[d] * 100 * 10) / 10,
          observed: Math.round(observedDist[d] * 100 * 10) / 10,
          deviation: Math.round((observedDist[d] - BENFORD_EXPECTED[d]) * 100 * 10) / 10,
        };
      });

      // Largest deviation digit
      const maxDev = digitAnalysis.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))[0];

      return {
        scheme,
        wardCount: schemeData.length,
        totalBeneficiaries: numbers.reduce((a, b) => a + b, 0),
        chiSquared: chiTest,
        digitAnalysis: digitAnalysis.sort((a, b) => a.digit - b.digit),
        maxDeviation: maxDev,
        riskLevel: chiTest.significant ? 'HIGH' : 'LOW',
        interpretation: chiTest.significant
          ? `⚠️ Beneficiary data for ${scheme} shows statistically significant deviation from Benford's Law (χ² = ${chiTest.statistic}, ${chiTest.pValueCategory}). Digit ${maxDev.digit} appears ${maxDev.deviation > 0 ? 'more' : 'less'} often than expected. Possible data fabrication or reporting irregularity.`
          : `✅ ${scheme} beneficiary data conforms to Benford's Law. No statistical evidence of data manipulation.`,
        wardBreakdown: schemeData.map(d => ({
          ward: d.ward,
          count: d.beneficiaryCount,
          firstDigit: firstDigit(d.beneficiaryCount),
        })),
      };
    });

    const flaggedSchemes = results.filter(r => r.riskLevel === 'HIGH');

    return NextResponse.json({
      schemes: results,
      summary: {
        totalSchemes: schemes.length,
        flaggedSchemes: flaggedSchemes.length,
        cleanSchemes: schemes.length - flaggedSchemes.length,
        overallRisk: flaggedSchemes.length > 0 ? 'ELEVATED' : 'LOW',
        flagged: flaggedSchemes.map(r => r.scheme),
      },
      benfordReference: BENFORD_EXPECTED,
      metadata: {
        algorithm: "Benford's Law First-Digit Distribution + Chi-Squared Goodness-of-Fit Test",
        significanceLevel: 'α = 0.05',
        degreesOfFreedom: 8,
        criticalValue: CHI_SQ_CRITICAL['0.05'],
      },
    });
  } catch (error: any) {
    console.error('Benford Leakage Error:', error);
    return NextResponse.json({ error: 'Leakage detection failed', details: error.message }, { status: 500 });
  }
}
