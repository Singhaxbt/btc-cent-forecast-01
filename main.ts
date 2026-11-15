// btc-cent-forecast-01 — draft entry (local only, NOT submitted).
//
// Forecast: Bitcoin's price 4 hours ahead from the last 72 hours of
// 1-minute closes (4,320 prices, last = close at the checkpoint).
//
// Method — shrunk multi-horizon momentum with a small mean-reversion pull
// and a volatility-scaled cap. Score is mean absolute
// error in cents, so the best guess is the conditional MEDIAN of the price
// 240 minutes ahead: the forecast is therefore heavily shrunk toward the
// checkpoint close (persistence) instead of chasing the last move.
//
//   log-return features (log price, last = checkpoint close):
//     r15, r60, r240, r720  — log returns over the last 15m / 1h / 4h / 12h
//     dev = last - EMA1440 (deviation from the 24h EMA)
//     sig4h = std(1-min log returns, last 24h) * sqrt(240)
//   raw move  m = 0.8 * (0.15*r15 + 0.30*r60 + 0.25*r240 + 0.10*r720
//                        - 0.15*dev)
//   capped: |m| <= min(0.5 * sig4h, 0.01)   (max 1% move either way)
//   forecast = last_price * exp(m), rounded to 5 decimals, clamped to
//   (0.00001, 9999999.99999) like the house baseline.
//
// Parameters were chosen on the kit's practice data by a disciplined search
// (see REPORT.md and test/tune.py): a coarse grid ranked by the MEAN ratio
// vs persistence across independent splits (5 scored cases, walk-forward
// early half, walk-forward late half), requiring a win on every split, then
// a fine grid around the winner with the plateau centre picked — not the
// argmin. EMA-slope features were dropped: they hurt every split. The tuned
// entry beats persistence on all six local splits (5-case MAE 40,855 cents
// vs persistence 47,055; walk-forward 27,497 vs 31,746) and wins 9 of 11
// distinct walk-forward checkpoints. The practice is one downtrend week
// (Nov 7-11, 2026); the final window (Nov 15-17) is a different regime, so
// no parameter is tuned to a single case and every weight is small — the
// model cannot move far from persistence.
//
// Deterministic, stdlib only, no network, no randomness, no API keys.
// Runs in well under 1s per case (limit 8s).
//
// Input/output contract (RULES.txt):
//   reads every <id>.in in $MAKEFUN_INPUT_DIR (else /input):
//     {"schema":"makefun/btc-cent-case/v1","competition","case","at",
//      "horizon_minutes":240,
//      "markets":[{"id":"btc-usdc","name","start","prices":[4320 closes]}]}
//   writes <id>.out to $MAKEFUN_OUTPUT_DIR (else /output):
//     {"forecasts":[{"case":"<id>","price":<number>}]}
// Local run: mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Smallest positive price on the grid: one unit of its 5 decimals. */
const MIN_PRICE = 0.00001;
/** Largest grid price below the scorer's exclusive 10,000,000-dollar cap. */
const MAX_PRICE = 9_999_999.99999;

/** Shrinkage applied to the raw signal (median forecast: stay near persistence). */
const SHRINK = 0.8;
/** Weights on log-return features (see header). */
const W15 = 0.15;
const W60 = 0.3;
const W240 = 0.25;
const W720 = 0.1;
const WMEAN_REV = 0.15;
/** Move cap: min(0.5 * 4h realised vol, 1% absolute). */
const CAP_SIG = 0.5;
const CAP_ABS = 0.01;

interface CaseMarket {
  id: string;
  prices: number[];
}

interface Case {
  markets: CaseMarket[];
}

/** x kept on the grid's 5 decimals and inside the scorer's (0, 10,000,000). */
const price5 = (x: number): number =>
  Math.round(Math.min(MAX_PRICE, Math.max(MIN_PRICE, x)) * 1e5) / 1e5;

/** Final EMA value of a series (alpha = 2 / (n + 1)), single pass. */
function emaLast(xs: number[], n: number): number {
  const a = 2 / (n + 1);
  let e = xs[0] as number;
  for (let i = 1; i < xs.length; i++) e = a * (xs[i] as number) + (1 - a) * e;
  return e;
}

/** Forecast price 240 minutes after the checkpoint for one market. */
function forecast(m: CaseMarket): number {
  if (!Array.isArray(m.prices) || m.prices.length === 0) {
    throw new Error(`market ${m.id} has no prices`);
  }
  const prices = m.prices;
  const n = prices.length;
  const lx: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = prices[i] as number;
    if (typeof p !== 'number' || !Number.isFinite(p) || p <= 0) {
      throw new Error(`market ${m.id} has a non-positive/non-finite price at ${i}`);
    }
    lx[i] = Math.log(p);
  }
  const last = lx[n - 1] as number;
  // Log return over the last k minutes; k clamped to the data available.
  const ret = (k: number): number => last - (lx[Math.max(0, n - 1 - k)] as number);

  const r15 = ret(15);
  const r60 = ret(60);
  const r240 = ret(240);
  const r720 = ret(720);
  const dev = last - emaLast(lx, 1440);

  // Realised 1-minute volatility over the last 24h (or all data if shorter).
  const winStart = Math.max(1, n - 1440);
  const count = n - winStart;
  let mean = 0;
  for (let i = winStart; i < n; i++) mean += (lx[i] as number) - (lx[i - 1] as number);
  mean /= count;
  let varSum = 0;
  for (let i = winStart; i < n; i++) {
    const d = (lx[i] as number) - (lx[i - 1] as number) - mean;
    varSum += d * d;
  }
  const sig4h = Math.sqrt(varSum / count) * Math.sqrt(240);

  let move =
    SHRINK * (W15 * r15 + W60 * r60 + W240 * r240 + W720 * r720 - WMEAN_REV * dev);
  const cap = Math.min(CAP_SIG * sig4h, CAP_ABS);
  if (move > cap) move = cap;
  else if (move < -cap) move = -cap;

  return price5(Math.exp(last) * Math.exp(move));
}

mkdirSync(OUTPUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (!Array.isArray(c.markets) || c.markets.length !== 1) {
    throw new Error(`${file} does not hold exactly one market`);
  }
  writeFileSync(
    join(OUTPUT_DIR, `${id}.out`),
    `${JSON.stringify({ forecasts: [{ case: id, price: forecast(c.markets[0] as CaseMarket) }] })}\n`,
  );
}
