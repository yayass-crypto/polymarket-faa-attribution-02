// polymarket-faa-attribution-02 entry (Node 22, standard library only):
// persistence forecast with a price-level-scaled two-sigma spread.
//
//   q_tau(h) = clamp(x + z_tau * sigma_tau * sqrt(h), 0, 1), rounded to 6 decimals
//
// for minute h = 1..horizon_minutes after the checkpoint, where x is the
// market's last price in the case. The median stays at x (the last price is
// the best center: trailing means scored worse on the practice, and any
// drift or mean-reversion shift scored worse too). The spread uses TWO
// sigmas, because the price-change distribution is sharply peaked at zero
// with fat tails: most minutes a market does not move at all, and now and
// then it jumps. So the inner quantiles (25%/75%) are tight and the outer
// quantiles (5%/95%) are wide:
//
//   sigma_inner = 0.0008 * f,  sigma_outer = 0.0020 * f
//
// where f = (x * (1 - x))^0.65 / 0.25^1.3 scales the spread by the price
// level: a market near 0.5 can move far more than one near 0.003, both
// because its moves are bigger in practice and because the [0,1] bounds bite
// near the edges. The 0.65 power (rather than a square root) fits the
// practice best: it gives high-price markets relatively wider bands and
// low-price markets relatively tighter ones. f is floored at 0.1 so a market
// at exactly 0 or 1 still gets some spread. Both sigmas were picked on the
// kit's six practice cases (NVIDIA CEO event) and the optimum is flat:
// nearby values score within 0.001 of each other, so the choice is not a
// knife-edge fit.
//
// On the practice this scores a pinball loss of 0.2847 against the house
// baseline's 0.3636 (median error 0.7675 for the baseline). The practice is
// a different, calmer event than the final FAA markets, so the level scaling
// is what carries over: it widens the bands exactly where the final's
// high-price markets need them and keeps them tight where prices sit near 0.
//
// The program reads every <id>.in in the input directory (the grader runs
// one case at a time, with only that case's file there) and writes
// <id>.out to the output directory: {"forecasts":[{"id","q"}]}, every market
// of the case exactly once, q exactly horizon_minutes rows, row h-1 the
// forecast for minute at+h, each row five finite numbers in [0,1],
// non-decreasing. Deterministic: no clock, no randomness, no network, no
// environment reads beyond the input/output directories.
//
// Outside the grader's container, MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR
// stand in for /input and /output:
//   mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The quantile levels the contest scores, in the order each row lists them. */
const QUANTILES = [0.05, 0.25, 0.5, 0.75, 0.95];
/** The standard normal's quantile at each level, to 6 decimals. */
const Z = [-1.644854, -0.67449, 0, 0.67449, 1.644854];
/** Inner (25%/75%) spread, in price units per square-root minute at f = 1. */
const SIGMA_INNER = 0.0008;
/** Outer (5%/95%) spread, in price units per square-root minute at f = 1. */
const SIGMA_OUTER = 0.002;
/** The level factor is (x(1-x))^0.65 / 0.25^1.3, floored so no market gets zero spread. */
const LEVEL_FLOOR = 0.1;
/** The exponent of the price-level factor. */
const LEVEL_POWER = 0.65;

interface CaseMarket {
  id: string;
  prices: number[];
}

interface Case {
  horizon_minutes: number;
  quantiles: number[];
  markets: CaseMarket[];
}

/** x clamped to [0,1] and rounded to 6 decimals (0, never -0). */
const price6 = (x: number): number => Math.round(Math.min(1, Math.max(0, x)) * 1e6) / 1e6 + 0;

/** The forecast of one market: horizon rows of the five quantiles around its last price. */
function forecast(m: CaseMarket, horizon: number): number[][] {
  if (m.prices.length === 0) {
    // A market with no prices cannot happen per the case format; if it ever
    // does, fall back to a flat 0.5 forecast instead of crashing the run.
    return Array.from({ length: horizon }, () => [0.05, 0.25, 0.5, 0.75, 0.95].map(() => 0.5));
  }
  const x = m.prices[m.prices.length - 1] as number;
  const f = Math.max(
    LEVEL_FLOOR,
    Math.pow(Math.max(x * (1 - x), 0), LEVEL_POWER) / Math.pow(0.25, 2 * LEVEL_POWER),
  );
  const sIn = SIGMA_INNER * f;
  const sOut = SIGMA_OUTER * f;
  const rows: number[][] = [];
  for (let h = 1; h <= horizon; h++) {
    const sq = Math.sqrt(h);
    const row = [
      price6(x + Z[0] * sOut * sq),
      price6(x + Z[1] * sIn * sq),
      price6(x),
      price6(x + Z[3] * sIn * sq),
      price6(x + Z[4] * sOut * sq),
    ];
    // Clamping and rounding are monotone, so the row is already
    // non-decreasing; enforce it anyway so the output is valid by construction.
    for (let j = 1; j < 5; j++) {
      if ((row[j] as number) < (row[j - 1] as number)) row[j] = row[j - 1] as number;
    }
    rows.push(row);
  }
  return rows;
}

mkdirSync(OUTPUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (c.quantiles.length !== QUANTILES.length || c.quantiles.some((t, j) => t !== QUANTILES[j])) throw new Error(`${file} asks for quantiles ${JSON.stringify(c.quantiles)}, not ${JSON.stringify(QUANTILES)}`);
  const forecasts = c.markets.map((m) => ({ id: m.id, q: forecast(m, c.horizon_minutes) }));
  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify({ forecasts })}\n`);
}
