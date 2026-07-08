import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SPATIO-TEMPORAL GRID FORECASTER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Algorithm: Holt-Winters Triple Exponential Smoothing + Spatial Autocorrelation
 * 
 * City = 24 ward-cells, each is a time-series of complaint counts.
 * 1. Per-ward Holt-Winters smoothing for trend + seasonality
 * 2. Spatial correlation matrix (neighboring wards influence each other)
 * 3. Output: predicted surge zones for next 6 hours with confidence bands
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Simulated Historical Data ────────────────────────────────────────────
// In production, this would come from a database. Here we generate
// realistic time-series data for each of the 24 wards.

function generateWardTimeSeries(wardIdx: number, periods: number = 48): number[] {
  const seed = wardIdx * 137 + 42;
  const pseudoRandom = (i: number) => {
    const x = Math.sin(seed + i * 31.7) * 10000;
    return x - Math.floor(x);
  };

  const baseline = 5 + (wardIdx % 6) * 3; // Different base rates per ward
  const series: number[] = [];

  for (let t = 0; t < periods; t++) {
    // Trend component
    const trend = t * 0.02 * (wardIdx % 3 === 0 ? 1 : -0.5);
    // Seasonal component (6-hour cycle)
    const seasonal = 3 * Math.sin((2 * Math.PI * t) / 6);
    // Day/night cycle
    const hourOfDay = t % 24;
    const dayNight = hourOfDay >= 8 && hourOfDay <= 20 ? 2 : -1;
    // Random noise
    const noise = (pseudoRandom(t) - 0.5) * 4;

    series.push(Math.max(0, Math.round(baseline + trend + seasonal + dayNight + noise)));
  }

  return series;
}

// ── Holt-Winters Triple Exponential Smoothing ────────────────────────────

interface HoltWintersResult {
  forecast: number[];
  level: number;
  trend: number;
  seasonal: number[];
  confidence: { lower: number[]; upper: number[] };
}

function holtWinters(
  data: number[],
  seasonLength: number = 6,
  forecastPeriods: number = 6,
  alpha: number = 0.3,  // level smoothing
  beta: number = 0.1,   // trend smoothing
  gamma: number = 0.3   // seasonal smoothing
): HoltWintersResult {
  const n = data.length;
  if (n < seasonLength * 2) {
    // Not enough data — return simple average
    const avg = data.reduce((a, b) => a + b, 0) / n;
    return {
      forecast: Array(forecastPeriods).fill(Math.round(avg)),
      level: avg,
      trend: 0,
      seasonal: Array(seasonLength).fill(0),
      confidence: {
        lower: Array(forecastPeriods).fill(Math.max(0, Math.round(avg * 0.7))),
        upper: Array(forecastPeriods).fill(Math.round(avg * 1.3)),
      },
    };
  }

  // Initialize level as average of first season
  let level = data.slice(0, seasonLength).reduce((a, b) => a + b, 0) / seasonLength;

  // Initialize trend as average difference between first two seasons
  let trend = 0;
  for (let i = 0; i < seasonLength; i++) {
    trend += (data[seasonLength + i] - data[i]) / seasonLength;
  }
  trend /= seasonLength;

  // Initialize seasonal indices
  const seasonal: number[] = [];
  for (let i = 0; i < seasonLength; i++) {
    seasonal.push(data[i] - level);
  }

  // Smoothing pass
  const residuals: number[] = [];
  for (let t = seasonLength; t < n; t++) {
    const seasonIdx = t % seasonLength;
    const prevLevel = level;
    const prevTrend = trend;

    // Level update
    level = alpha * (data[t] - seasonal[seasonIdx]) + (1 - alpha) * (prevLevel + prevTrend);
    // Trend update
    trend = beta * (level - prevLevel) + (1 - beta) * prevTrend;
    // Seasonal update
    seasonal[seasonIdx] = gamma * (data[t] - level) + (1 - gamma) * seasonal[seasonIdx];

    const fitted = prevLevel + prevTrend + seasonal[seasonIdx];
    residuals.push(data[t] - fitted);
  }

  // Compute standard error for confidence intervals
  const mse = residuals.length > 0
    ? Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length)
    : 2;

  // Generate forecasts
  const forecast: number[] = [];
  const lower: number[] = [];
  const upper: number[] = [];

  for (let h = 1; h <= forecastPeriods; h++) {
    const seasonIdx = (n + h) % seasonLength;
    const predicted = level + h * trend + seasonal[seasonIdx];
    const width = 1.96 * mse * Math.sqrt(h); // 95% CI widens over time

    forecast.push(Math.max(0, Math.round(predicted)));
    lower.push(Math.max(0, Math.round(predicted - width)));
    upper.push(Math.round(predicted + width));
  }

  return { forecast, level, trend, seasonal, confidence: { lower, upper } };
}

// ── Spatial Autocorrelation (Moran's I approximation) ────────────────────

// Ward adjacency matrix (1 = neighboring, 0 = not)
const ADJACENCY: number[][] = Array.from({ length: 24 }, (_, i) =>
  Array.from({ length: 24 }, (_, j) => {
    if (i === j) return 0;
    // Simple grid proximity: wards within ±3 are "neighbors"
    return Math.abs(i - j) <= 3 ? 1 : 0;
  })
);

function spatialSmoothing(wardForecasts: number[][], step: number): number[] {
  const n = wardForecasts.length;
  const smoothed: number[] = [];

  for (let i = 0; i < n; i++) {
    let sum = wardForecasts[i][step] * 2; // weight own forecast double
    let count = 2;

    for (let j = 0; j < n; j++) {
      if (ADJACENCY[i][j] === 1) {
        sum += wardForecasts[j][step] * 0.3; // neighbor influence
        count += 0.3;
      }
    }

    smoothed.push(Math.round(sum / count));
  }

  return smoothed;
}

// ── Surge Detection ──────────────────────────────────────────────────────

function detectSurges(
  wardForecasts: number[][],
  wardHistorical: number[][]
): { ward: number; surgeScore: number; predicted: number; historical_avg: number; category: 'critical' | 'high' | 'moderate' }[] {
  const surges: ReturnType<typeof detectSurges> = [];

  for (let w = 0; w < wardForecasts.length; w++) {
    const avg = wardHistorical[w].reduce((a, b) => a + b, 0) / wardHistorical[w].length;
    const maxForecast = Math.max(...wardForecasts[w]);
    const surgeScore = avg > 0 ? (maxForecast - avg) / avg : 0;

    if (surgeScore > 0.3) {
      surges.push({
        ward: w + 1,
        surgeScore: Math.round(surgeScore * 100) / 100,
        predicted: maxForecast,
        historical_avg: Math.round(avg * 10) / 10,
        category: surgeScore > 1.0 ? 'critical' : surgeScore > 0.6 ? 'high' : 'moderate',
      });
    }
  }

  return surges.sort((a, b) => b.surgeScore - a.surgeScore);
}

// ── API Route ────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const forecastHours = 6;
    const wardHistorical: number[][] = [];
    const wardResults: {
      ward: number;
      forecast: number[];
      confidence: { lower: number[]; upper: number[] };
      trend: number;
      level: number;
    }[] = [];

    // Generate historical data and run Holt-Winters per ward
    for (let w = 0; w < 24; w++) {
      const history = generateWardTimeSeries(w, 48);
      wardHistorical.push(history);

      const hw = holtWinters(history, 6, forecastHours);
      wardResults.push({
        ward: w + 1,
        forecast: hw.forecast,
        confidence: hw.confidence,
        trend: Math.round(hw.trend * 100) / 100,
        level: Math.round(hw.level * 10) / 10,
      });
    }

    // Apply spatial smoothing
    const rawForecasts = wardResults.map(r => r.forecast);
    const spatiallySmoothed: number[][] = Array.from({ length: 24 }, () => []);

    for (let step = 0; step < forecastHours; step++) {
      const smoothed = spatialSmoothing(rawForecasts, step);
      for (let w = 0; w < 24; w++) {
        spatiallySmoothed[w].push(smoothed[w]);
      }
    }

    // Detect surges
    const surges = detectSurges(spatiallySmoothed, wardHistorical);

    // Compute global Moran's I statistic (spatial autocorrelation measure)
    const latestValues = spatiallySmoothed.map(s => s[0]);
    const globalMean = latestValues.reduce((a, b) => a + b, 0) / latestValues.length;
    let numerator = 0;
    let denominator = 0;
    let W = 0;

    for (let i = 0; i < 24; i++) {
      denominator += (latestValues[i] - globalMean) ** 2;
      for (let j = 0; j < 24; j++) {
        if (ADJACENCY[i][j]) {
          numerator += ADJACENCY[i][j] * (latestValues[i] - globalMean) * (latestValues[j] - globalMean);
          W += ADJACENCY[i][j];
        }
      }
    }

    const moransI = W > 0 && denominator > 0
      ? Math.round(((24 / W) * (numerator / denominator)) * 1000) / 1000
      : 0;

    return NextResponse.json({
      forecasts: wardResults.map((r, i) => ({
        ...r,
        spatialSmoothed: spatiallySmoothed[i],
      })),
      surgeAlerts: surges.slice(0, 6),
      spatialStats: {
        moransI,
        interpretation: moransI > 0.3 ? 'Strong spatial clustering — complaints are geographically concentrated'
          : moransI > 0 ? 'Moderate spatial correlation — some geographic patterns'
          : 'No significant spatial pattern — complaints are randomly distributed',
      },
      metadata: {
        algorithm: 'Holt-Winters Triple Exponential Smoothing + Moran\'s I Spatial Autocorrelation',
        forecastHorizon: `${forecastHours} hours`,
        wardCount: 24,
        smoothingParams: { alpha: 0.3, beta: 0.1, gamma: 0.3 },
        confidenceLevel: '95%',
      },
    });
  } catch (error: any) {
    console.error('Spatio-Temporal Forecast Error:', error);
    return NextResponse.json({ error: 'Forecast failed', details: error.message }, { status: 500 });
  }
}
