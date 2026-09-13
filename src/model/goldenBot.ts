// Golden Bot + Gilded Sniper coin model, shared by the Golden Bot planner and
// the Themes vs. Golden Bot comparison.

// ----------------------------------------------------------------------------
// Game model
//
// Golden Bot (wiki: https://the-tower-idle-tower-defense.fandom.com/wiki/Golden_Bot)
//   Enemies destroyed inside the bot's range receive its coin multiplier.
//   Range:  20m base, +2m per level, 20 levels (60m max), plus relics / vault.
//   Bonus:  2.0x base, +0.2x per level, 30 levels (8.0x max).
//   Each upgrade level costs 100 medals + 40 per level already bought
//   (level 1 = 100, level 2 = 140, ...). Range maxes at 9,600 medals,
//   bonus at 20,400.
//
// Gilded Sniper (cannon module unique effect, per rarity 10/20/30/40%):
//   Killed enemies that are NOT in range still receive all active coin
//   bonuses (Golden Bot, orbs, black hole, golden tower wave) with that
//   chance. Spotlight and Bot bot are not included.
//
// Coverage model:
//   c0 = measured share of kills inside Golden Bot range (battle report:
//   "Killed with effect active" section, "Golden Bot N [x%]") at the range r0 it
//   was measured at. r0 is its own input so the level sliders never move the
//   calibration point, and the from-scratch optimum stays independent of them.
//   That share already folds in uptime: a kill can only be "in range" while
//   the bot is active, so c0 <= uptime, where uptime = duration / cooldown.
//   Coverage at another range r is extrapolated as c0 * (r / r0)^2, capped at
//   uptime.
//   The square is because the range is a circle, so covered area grows with
//   the square of the range (radius or diameter, the ratio is the same).
//   This assumes kills are spread evenly over that area, which they are not:
//   enemies cluster along their approach and die where your damage lands.
//   Treat range extrapolation as a rough guide, not a measurement.
//
// Objective: average coin multiplier per kill made WHILE THE BOT IS ACTIVE.
//   Players make nearly all their income in that window because the other
//   coin multipliers fire at the same time, so kills outside it are worth ~0.
//   share of active-time kills in range   a = c / uptime
//   share of active-time kills with bonus e = a + p * (1 - a)
//   V = 1 + e * (M - 1)
//   Enemies not covered still pay 1x, which is why V is not simply e * M.
//   Uptime enters only through a = c / uptime. Without a sniper it just
//   rescales V - 1; with a sniper it shifts the split, since the sniper's
//   share is range-independent while a scales with 1 / uptime.
//   Sync with other multipliers does NOT enter: dropping unsynced activations
//   removes in-range and out-of-range kills in the same proportion.
//   Whole-run multiplier W = 1 + uptime * (V - 1): the same score spread over
//   all kills, assuming coins are spread evenly over the run. W - 1 is V - 1
//   scaled by a constant, so both rank upgrades identically; W is shown
//   because it is what a player sees when they compare runs with and
//   without the bot.
// ----------------------------------------------------------------------------

export const RANGE_BASE = 20;
export const RANGE_PER_LEVEL = 2;
export const RANGE_MAX_LEVEL = 20;
export const BONUS_BASE = 2.0;
export const BONUS_PER_LEVEL = 0.2;
export const BONUS_MAX_LEVEL = 30;
export const COST_BASE = 100;
export const COST_STEP = 40;

/** Coverage scales with covered area, i.e. with range squared. */
export const COVERAGE_EXPONENT = 2;

export const SNIPER_RARITIES = [
  { id: "none", label: "None (no Gilded Sniper)", chance: 0 },
  { id: "epic", label: "Epic (10%)", chance: 10 },
  { id: "legendary", label: "Legendary (20%)", chance: 20 },
  { id: "mythic", label: "Mythic (30%)", chance: 30 },
  { id: "ancestral", label: "Ancestral (40%)", chance: 40 },
];

/** Medals to buy level `n` (1-indexed) of any Golden Bot upgrade. */
export function levelCost(n: number): number {
  return COST_BASE + COST_STEP * (n - 1);
}

/** Medals spent to reach `level` from level 0. */
export function cumulativeCost(level: number): number {
  let total = 0;
  for (let n = 1; n <= level; n++) total += levelCost(n);
  return total;
}

export function rangeMeters(level: number, extra: number): number {
  return RANGE_BASE + RANGE_PER_LEVEL * level + extra;
}

export function bonusMultiplier(level: number): number {
  return BONUS_BASE + BONUS_PER_LEVEL * level;
}

export function round(n: number, d = 2): number {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

export function fmtMedals(n: number): string {
  return n.toLocaleString("en-US");
}

export function fmtMult(v: number): string {
  return `×${round(v, 3).toFixed(3)}`;
}

export function fmtPct(v: number, d = 1): string {
  return `${round(v, d).toFixed(d)}%`;
}

export interface Model {
  extraRange: number;
  refRangeMeters: number; // total range (levels + extra) at which coverage was measured
  refCoverage: number; // % of kills inside range at refRangeMeters
  uptime: number; // % of time the bot is active (duration / cooldown)
  sniperChance: number; // %
}

export interface Evaluation {
  rangeLevel: number;
  bonusLevel: number;
  meters: number;
  multiplier: number;
  coverage: number; // % of all kills inside range (battle-report scale)
  activeCoverage: number; // % of active-time kills inside range
  activeEffective: number; // % of active-time kills receiving the multiplier (incl. sniper)
  value: number; // average coin multiplier per active-time kill
  wholeRun: number; // average coin multiplier per kill over the whole run, if coins are spread evenly
}

export function coverageAt(model: Model, rangeLevel: number): number {
  const r0 = model.refRangeMeters;
  const r = rangeMeters(rangeLevel, model.extraRange);
  const cap = Math.max(0, Math.min(100, model.uptime));
  if (r0 <= 0) return Math.max(0, Math.min(cap, model.refCoverage));
  const c = model.refCoverage * Math.pow(Math.max(0, r) / r0, COVERAGE_EXPONENT);
  return Math.max(0, Math.min(cap, c));
}

export function evaluate(model: Model, rangeLevel: number, bonusLevel: number): Evaluation {
  const coverage = coverageAt(model, rangeLevel);
  const uptime = Math.max(0, Math.min(100, model.uptime));
  const sniper = Math.max(0, Math.min(100, model.sniperChance)) / 100;
  const activeCoverage = uptime > 0 ? Math.min(100, (coverage / uptime) * 100) : 0;
  const activeEffective = activeCoverage + sniper * (100 - activeCoverage);
  const multiplier = bonusMultiplier(bonusLevel);
  const value = 1 + (activeEffective / 100) * (multiplier - 1);
  return {
    rangeLevel,
    bonusLevel,
    meters: rangeMeters(rangeLevel, model.extraRange),
    multiplier,
    coverage,
    activeCoverage,
    activeEffective,
    value,
    wholeRun: 1 + (uptime / 100) * (value - 1),
  };
}

/** Best (range, bonus) pair reachable from `start` with `budget` medals. */
export function bestReachable(
  model: Model,
  startRange: number,
  startBonus: number,
  budget: number,
): { target: Evaluation; cost: number } {
  const baseSpent = cumulativeCost(startRange) + cumulativeCost(startBonus);
  let best = evaluate(model, startRange, startBonus);
  let bestCost = 0;
  for (let lr = startRange; lr <= RANGE_MAX_LEVEL; lr++) {
    const rangeCost = cumulativeCost(lr);
    for (let lm = startBonus; lm <= BONUS_MAX_LEVEL; lm++) {
      const cost = rangeCost + cumulativeCost(lm) - baseSpent;
      if (cost > budget) break;
      const ev = evaluate(model, lr, lm);
      if (ev.value > best.value + 1e-12 || (Math.abs(ev.value - best.value) <= 1e-12 && cost < bestCost)) {
        best = ev;
        bestCost = cost;
      }
    }
  }
  return { target: best, cost: bestCost };
}

/** Levels reached by spending `budget` on `first`, then the other upgrade. */
export function sequentialLevels(
  startRange: number,
  startBonus: number,
  budget: number,
  first: "range" | "bonus",
): { rangeLevel: number; bonusLevel: number; cost: number } {
  let lr = startRange;
  let lm = startBonus;
  let spent = 0;
  const buyRange = () => {
    while (lr < RANGE_MAX_LEVEL && spent + levelCost(lr + 1) <= budget) {
      spent += levelCost(lr + 1);
      lr += 1;
    }
  };
  const buyBonus = () => {
    while (lm < BONUS_MAX_LEVEL && spent + levelCost(lm + 1) <= budget) {
      spent += levelCost(lm + 1);
      lm += 1;
    }
  };
  if (first === "range") {
    buyRange();
    buyBonus();
  } else {
    buyBonus();
    buyRange();
  }
  return { rangeLevel: lr, bonusLevel: lm, cost: spent };
}

export interface UpgradeStep {
  step: number;
  upgrade: "Range" | "Bonus";
  from: number;
  to: number;
  cost: number;
  cumulative: number;
  after: Evaluation;
}

/**
 * Every remaining upgrade from `start` up to max on both tracks, in the order
 * that gives the most coin gain per medal at each step.
 */
export function nextUpgrades(model: Model, startRange: number, startBonus: number): UpgradeStep[] {
  const steps: UpgradeStep[] = [];
  let lr = startRange;
  let lm = startBonus;
  let cumulative = 0;
  let current = evaluate(model, lr, lm);
  while (lr < RANGE_MAX_LEVEL || lm < BONUS_MAX_LEVEL) {
    const rangeEv = lr < RANGE_MAX_LEVEL ? evaluate(model, lr + 1, lm) : null;
    const bonusEv = lm < BONUS_MAX_LEVEL ? evaluate(model, lr, lm + 1) : null;
    const rangeRate = rangeEv ? (rangeEv.value - current.value) / levelCost(lr + 1) : -Infinity;
    const bonusRate = bonusEv ? (bonusEv.value - current.value) / levelCost(lm + 1) : -Infinity;
    if (rangeEv && (!bonusEv || rangeRate >= bonusRate)) {
      const cost = levelCost(lr + 1);
      cumulative += cost;
      steps.push({ step: steps.length + 1, upgrade: "Range", from: lr, to: lr + 1, cost, cumulative, after: rangeEv });
      lr += 1;
      current = rangeEv;
    } else if (bonusEv) {
      const cost = levelCost(lm + 1);
      cumulative += cost;
      steps.push({ step: steps.length + 1, upgrade: "Bonus", from: lm, to: lm + 1, cost, cumulative, after: bonusEv });
      lm += 1;
      current = bonusEv;
    } else {
      break;
    }
  }
  return steps;
}
