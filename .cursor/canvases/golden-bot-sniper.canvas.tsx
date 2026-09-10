import { useState } from "react";

import {
  H1,
  H2,
  Stack,
  Grid,
  Row,
  Spacer,
  Text,
  Card,
  CardHeader,
  CardBody,
  Stat,
  Select,
  Toggle,
  TextInput,
  Callout,
  Table,
  Divider,
  Pill,
  LineChart,
  useCanvasState,
  useHostTheme,
} from "cursor/canvas";

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
//   "Killed with effect active" section, "Golden Bot N [x%]") at the current range.
//   Coverage at another range r is extrapolated as c0 * (r / r0)^2, capped at
//   100%. The bot is treated as always active (cooldown / duration ignored).
//   The square is because the range is a circle, so covered area grows with
//   the square of the range (radius or diameter, the ratio is the same).
//   This assumes kills are spread evenly over that area, which they are not:
//   enemies cluster along their approach and die where your damage lands.
//   Treat range extrapolation as a rough guide, not a measurement.
//
// Objective (average coin multiplier per kill, relative to no Golden Bot):
//   effective coverage e = c + p * (100 - c)
//   V = 1 + e * (M - 1)
//   Enemies not covered still pay 1x, which is why V is not simply e * M.
// ----------------------------------------------------------------------------

const RANGE_BASE = 20;
const RANGE_PER_LEVEL = 2;
const RANGE_MAX_LEVEL = 20;
const BONUS_BASE = 2.0;
const BONUS_PER_LEVEL = 0.2;
const BONUS_MAX_LEVEL = 30;
const COST_BASE = 100;
const COST_STEP = 40;

/** Coverage scales with covered area, i.e. with range squared. */
const COVERAGE_EXPONENT = 2;

const SNIPER_RARITIES = [
  { id: "none", label: "None (no Gilded Sniper)", chance: 0 },
  { id: "epic", label: "Epic (10%)", chance: 10 },
  { id: "legendary", label: "Legendary (20%)", chance: 20 },
  { id: "mythic", label: "Mythic (30%)", chance: 30 },
  { id: "ancestral", label: "Ancestral (40%)", chance: 40 },
];

/** Medals to buy level `n` (1-indexed) of any Golden Bot upgrade. */
function levelCost(n: number): number {
  return COST_BASE + COST_STEP * (n - 1);
}

/** Medals spent to reach `level` from level 0. */
function cumulativeCost(level: number): number {
  let total = 0;
  for (let n = 1; n <= level; n++) total += levelCost(n);
  return total;
}

function rangeMeters(level: number, extra: number): number {
  return RANGE_BASE + RANGE_PER_LEVEL * level + extra;
}

function bonusMultiplier(level: number): number {
  return BONUS_BASE + BONUS_PER_LEVEL * level;
}

function round(n: number, d = 2): number {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

function fmtMedals(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtMult(v: number): string {
  return `×${round(v, 3).toFixed(3)}`;
}

function fmtPct(v: number, d = 1): string {
  return `${round(v, d).toFixed(d)}%`;
}

interface Model {
  extraRange: number;
  refRangeLevel: number; // level at which coverage was measured
  refCoverage: number; // % of kills inside range at refRangeLevel
  sniperChance: number; // %
}

interface Evaluation {
  rangeLevel: number;
  bonusLevel: number;
  meters: number;
  multiplier: number;
  coverage: number; // % of kills inside range
  effective: number; // % of kills receiving the multiplier (incl. sniper)
  value: number; // average coin multiplier per kill
}

function coverageAt(model: Model, rangeLevel: number): number {
  const r0 = rangeMeters(model.refRangeLevel, model.extraRange);
  const r = rangeMeters(rangeLevel, model.extraRange);
  if (r0 <= 0) return Math.max(0, Math.min(100, model.refCoverage));
  const c = model.refCoverage * Math.pow(Math.max(0, r) / r0, COVERAGE_EXPONENT);
  return Math.max(0, Math.min(100, c));
}

function evaluate(model: Model, rangeLevel: number, bonusLevel: number): Evaluation {
  const coverage = coverageAt(model, rangeLevel);
  const sniper = Math.max(0, Math.min(100, model.sniperChance)) / 100;
  const effective = coverage + sniper * (100 - coverage);
  const multiplier = bonusMultiplier(bonusLevel);
  return {
    rangeLevel,
    bonusLevel,
    meters: rangeMeters(rangeLevel, model.extraRange),
    multiplier,
    coverage,
    effective,
    value: 1 + (effective / 100) * (multiplier - 1),
  };
}

/** Best (range, bonus) pair reachable from `start` with `budget` medals. */
function bestReachable(
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
function sequentialLevels(
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

interface PathStep {
  step: number;
  upgrade: "Range" | "Bonus";
  from: number;
  to: number;
  cost: number;
  cumulative: number;
  after: Evaluation;
}

/** Order the upgrades between `start` and `target` by marginal gain per medal. */
function pathTo(model: Model, startRange: number, startBonus: number, target: Evaluation): PathStep[] {
  const steps: PathStep[] = [];
  let lr = startRange;
  let lm = startBonus;
  let cumulative = 0;
  let current = evaluate(model, lr, lm);
  while (lr < target.rangeLevel || lm < target.bonusLevel) {
    const canRange = lr < target.rangeLevel;
    const canBonus = lm < target.bonusLevel;
    const rangeEv = canRange ? evaluate(model, lr + 1, lm) : null;
    const bonusEv = canBonus ? evaluate(model, lr, lm + 1) : null;
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

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  hint?: string;
  onChange: (v: number) => void;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <Stack gap={4}>
      <Row align="center" gap={8}>
        <Stack gap={0} style={{ flex: 1 }}>
          <Text size="small" tone="secondary">
            {label}
          </Text>
          {hint ? (
            <Text size="small" tone="tertiary">
              {hint}
            </Text>
          ) : null}
        </Stack>
        <div style={{ width: 96 }}>
          <TextInput
            type="number"
            value={String(value)}
            onChange={(s) => {
              const n = Number(s);
              if (s.trim() !== "" && !Number.isNaN(n)) onChange(clamp(n));
            }}
            style={{ textAlign: "right" }}
          />
        </div>
        {suffix ? (
          <Text size="small" tone="tertiary" style={{ minWidth: 40 }}>
            {suffix}
          </Text>
        ) : null}
      </Row>
      {step > 0 && max - min <= 200 ? (
        <SliderOnly value={value} min={min} max={max} step={step} onChange={(n) => onChange(clamp(n))} />
      ) : null}
    </Stack>
  );
}

/**
 * One-line level input paired with the value that level produces (metres or
 * multiplier). Editing either updates the other; the slider drives both.
 * Typing a value snaps to the nearest level.
 */
function LevelValueField({
  label,
  level,
  maxLevel,
  base,
  perLevel,
  suffix,
  decimals,
  onChange,
}: {
  label: string;
  level: number;
  maxLevel: number;
  base: number;
  perLevel: number;
  suffix: string;
  decimals: number;
  onChange: (level: number) => void;
}) {
  const clampLevel = (n: number) => Math.min(maxLevel, Math.max(0, Math.round(n)));
  const valueOf = (l: number) => base + perLevel * l;
  const levelOf = (v: number) => clampLevel((v - base) / perLevel);
  const fmtValue = (l: number) => round(valueOf(l), decimals).toFixed(decimals);
  const [draft, setDraft] = useState<string | null>(null);
  const draftNum = draft === null ? NaN : Number(draft);
  const shownValue =
    draft !== null && draft.trim() !== "" && !Number.isNaN(draftNum) && levelOf(draftNum) === level
      ? draft
      : fmtValue(level);
  return (
    <Stack gap={4}>
      <Row align="center" gap={8}>
        <Text size="small" tone="secondary" style={{ flex: 1 }}>
          {label}
        </Text>
        <Text size="small" tone="tertiary">
          Lvl
        </Text>
        <div style={{ width: 56 }}>
          <TextInput
            type="number"
            value={String(level)}
            onChange={(s) => {
              const n = Number(s);
              if (s.trim() !== "" && !Number.isNaN(n)) {
                setDraft(null);
                onChange(clampLevel(n));
              }
            }}
            style={{ textAlign: "right" }}
          />
        </div>
        <div style={{ width: 72 }}>
          <TextInput
            type="text"
            value={shownValue}
            onChange={(s) => {
              setDraft(s);
              const n = Number(s);
              if (s.trim() !== "" && !Number.isNaN(n)) onChange(levelOf(n));
            }}
            style={{ textAlign: "right", fontWeight: 600 }}
          />
        </div>
        <Text size="small" tone="tertiary" style={{ minWidth: 12 }}>
          {suffix}
        </Text>
      </Row>
      <SliderOnly
        value={level}
        min={0}
        max={maxLevel}
        step={1}
        onChange={(n) => {
          setDraft(null);
          onChange(clampLevel(n));
        }}
      />
    </Stack>
  );
}

function SliderOnly({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const theme = useHostTheme();
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number((e.target as HTMLInputElement).value))}
      style={{ width: "100%", accentColor: theme.accent.primary, cursor: "pointer" }}
    />
  );
}

export default function GoldenBotSniperPlanner() {
  const [medals, setMedals] = useCanvasState("medals", 10000);
  const [sniperId, setSniperId] = useCanvasState("sniperId", "ancestral");
  const [rangeLevel, setRangeLevel] = useCanvasState("rangeLevel", 20);
  const [extraRange, setExtraRange] = useCanvasState("extraRange", 7);
  const [bonusLevel, setBonusLevel] = useCanvasState("bonusLevel", 16);
  const [coverage, setCoverage] = useCanvasState("coverage", 20);
  const [chartFromScratch, setChartFromScratch] = useCanvasState("chartFromScratch", true);

  const sniper = SNIPER_RARITIES.find((r) => r.id === sniperId) ?? SNIPER_RARITIES[0];

  const model: Model = {
    extraRange,
    refRangeLevel: rangeLevel,
    refCoverage: coverage,
    sniperChance: sniper.chance,
  };
  const noSniperModel: Model = { ...model, sniperChance: 0 };

  const current = evaluate(model, rangeLevel, bonusLevel);
  const currentNoSniper = evaluate(noSniperModel, rangeLevel, bonusLevel);
  const spentSoFar = cumulativeCost(rangeLevel) + cumulativeCost(bonusLevel);
  const remainingToMax = cumulativeCost(RANGE_MAX_LEVEL) + cumulativeCost(BONUS_MAX_LEVEL) - spentSoFar;

  // --- Plan from current levels with the available medals ---
  const plan = bestReachable(model, rangeLevel, bonusLevel, medals);
  const path = pathTo(model, rangeLevel, bonusLevel, plan.target);
  const rangeFirst = sequentialLevels(rangeLevel, bonusLevel, medals, "range");
  const bonusFirst = sequentialLevels(rangeLevel, bonusLevel, medals, "bonus");
  const rangeFirstEv = evaluate(model, rangeFirst.rangeLevel, rangeFirst.bonusLevel);
  const bonusFirstEv = evaluate(model, bonusFirst.rangeLevel, bonusFirst.bonusLevel);
  const gainPct = current.value > 0 ? ((plan.target.value - current.value) / current.value) * 100 : 0;

  // --- Strategy curves as the total budget grows ---
  const chartStartRange = chartFromScratch ? 0 : rangeLevel;
  const chartStartBonus = chartFromScratch ? 0 : bonusLevel;
  const chartMaxBudget = chartFromScratch
    ? cumulativeCost(RANGE_MAX_LEVEL) + cumulativeCost(BONUS_MAX_LEVEL)
    : remainingToMax;
  const budgetStep = 500;
  const budgets: number[] = [];
  for (let b = 0; b <= chartMaxBudget; b += budgetStep) budgets.push(b);
  if (budgets[budgets.length - 1] !== chartMaxBudget) budgets.push(chartMaxBudget);
  const curveOptimal: number[] = [];
  const curveRangeFirst: number[] = [];
  const curveBonusFirst: number[] = [];
  const curveNoSniper: number[] = [];
  for (const b of budgets) {
    curveOptimal.push(round(bestReachable(model, chartStartRange, chartStartBonus, b).target.value, 3));
    const rf = sequentialLevels(chartStartRange, chartStartBonus, b, "range");
    curveRangeFirst.push(round(evaluate(model, rf.rangeLevel, rf.bonusLevel).value, 3));
    const bf = sequentialLevels(chartStartRange, chartStartBonus, b, "bonus");
    curveBonusFirst.push(round(evaluate(model, bf.rangeLevel, bf.bonusLevel).value, 3));
    curveNoSniper.push(round(bestReachable(noSniperModel, chartStartRange, chartStartBonus, b).target.value, 3));
  }
  const chartCategories = budgets.map((b) => fmtMedals(b));
  const chartSeries = [
    { name: "Optimal mix", data: curveOptimal, tone: "success" as const },
    { name: "Range first", data: curveRangeFirst, tone: "info" as const },
    { name: "Multiplier first", data: curveBonusFirst, tone: "warning" as const },
    { name: "Optimal, no sniper", data: curveNoSniper, tone: "neutral" as const },
  ];

  // --- Milestone table: where the optimal mix lands at round budgets ---
  const milestoneBudgets = [2500, 5000, 7500, 10000, 12500, 15000, 20000, 25000, 30000].filter(
    (b) => b <= chartMaxBudget,
  );
  if (!milestoneBudgets.includes(chartMaxBudget)) milestoneBudgets.push(chartMaxBudget);
  const milestoneRows = milestoneBudgets.map((b) => {
    const opt = bestReachable(model, chartStartRange, chartStartBonus, b).target;
    const rf = sequentialLevels(chartStartRange, chartStartBonus, b, "range");
    const bf = sequentialLevels(chartStartRange, chartStartBonus, b, "bonus");
    return [
      fmtMedals(b),
      `R${opt.rangeLevel} / B${opt.bonusLevel}`,
      `${opt.meters}m · ${round(opt.multiplier, 1)}×`,
      fmtMult(opt.value),
      fmtMult(evaluate(model, rf.rangeLevel, rf.bonusLevel).value),
      fmtMult(evaluate(model, bf.rangeLevel, bf.bonusLevel).value),
    ];
  });

  const hasBudget = medals > 0 && path.length > 0;

  return (
    <Stack gap={20} style={{ padding: 4 }}>
      <Stack gap={4}>
        <H1>Golden Bot + Gilded Sniper Planner</H1>
        <Text tone="secondary">
          The Tower — where to put Golden Bot medals (range vs. coin multiplier) when the Gilded
          Sniper cannon module gives out-of-range kills a chance to receive active coin bonuses.
        </Text>
      </Stack>

      <Grid columns="repeat(auto-fit, minmax(280px, 1fr))" gap={16} align="start">
        <Card>
          <CardHeader trailing={<Pill size="sm">{fmtMedals(spentSoFar)} spent</Pill>}>Golden Bot stats</CardHeader>
          <CardBody>
            <Stack gap={14}>
              <LevelValueField
                label="Range from levels"
                level={rangeLevel}
                maxLevel={RANGE_MAX_LEVEL}
                base={RANGE_BASE}
                perLevel={RANGE_PER_LEVEL}
                suffix="m"
                decimals={0}
                onChange={setRangeLevel}
              />
              <NumberField
                label="Extra range"
                hint="Relics, vault and other flat bonuses"
                value={extraRange}
                min={0}
                max={100}
                suffix="m"
                onChange={setExtraRange}
              />
              <LevelValueField
                label="Coin bonus"
                level={bonusLevel}
                maxLevel={BONUS_MAX_LEVEL}
                base={BONUS_BASE}
                perLevel={BONUS_PER_LEVEL}
                suffix="×"
                decimals={1}
                onChange={setBonusLevel}
              />
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader trailing={<Pill size="sm" active={sniper.chance > 0}>{sniper.chance}% sniper</Pill>}>
            Tower stats
          </CardHeader>
          <CardBody>
            <Stack gap={14}>
              <NumberField
                label="Medals to spend"
                hint={`${fmtMedals(remainingToMax)} medals would max both`}
                value={medals}
                min={0}
                max={100000}
                step={0}
                onChange={setMedals}
              />
              <Stack gap={4}>
                <Text size="small" tone="secondary">
                  Gilded Sniper rarity
                </Text>
                <Select
                  value={sniperId}
                  onChange={setSniperId}
                  options={SNIPER_RARITIES.map((r) => ({ value: r.id, label: r.label }))}
                />
                <Text size="small" tone="tertiary">
                  Chance that a kill outside the range still receives all active coin bonuses.
                </Text>
              </Stack>
              <NumberField
                label="Kills inside Golden Bot range"
                hint='Battle report → Killed with effect active → "Golden Bot [x%]"'
                value={coverage}
                min={0}
                max={100}
                step={0.5}
                suffix="%"
                onChange={setCoverage}
              />
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Stack gap={10}>
        <H2>Right now</H2>
        <Grid columns="repeat(auto-fit, minmax(160px, 1fr))" gap={16}>
          <Stat value={`${current.meters}m`} label="Golden Bot range" />
          <Stat value={`${round(current.multiplier, 1)}×`} label="Coin multiplier" />
          <Stat value={fmtPct(current.coverage)} label="Kills in range" tone="info" />
          <Stat value={fmtPct(current.effective)} label="Kills getting the bonus (with sniper)" tone="info" />
          <Stat value={fmtMult(currentNoSniper.value)} label="Avg coin ×, no sniper" />
          <Stat value={fmtMult(current.value)} label="Avg coin ×, with sniper" tone="success" />
        </Grid>
        <Text size="small" tone="tertiary">
          Average coin multiplier per kill = 1 + (share of kills receiving the bonus) × (multiplier − 1).
          Kills that miss the bonus still pay 1×. Gilded Sniper adds {sniper.chance}% of the uncovered{" "}
          {fmtPct(100 - current.coverage)} of kills.
        </Text>
      </Stack>

      {hasBudget ? (
        <Stack gap={10}>
          <H2>Best use of {fmtMedals(medals)} medals</H2>
          <Grid columns="repeat(auto-fit, minmax(160px, 1fr))" gap={16}>
            <Stat
              value={`R${plan.target.rangeLevel} / B${plan.target.bonusLevel}`}
              label={`Target levels (${plan.target.meters}m, ${round(plan.target.multiplier, 1)}×)`}
              tone="success"
            />
            <Stat value={fmtMult(plan.target.value)} label="Avg coin × at target" tone="success" />
            <Stat value={`+${fmtPct(gainPct)}`} label="Coins vs. now" tone="success" />
            <Stat value={fmtMedals(plan.cost)} label="Medals used" />
            <Stat value={fmtMult(rangeFirstEv.value)} label={`Range first (R${rangeFirst.rangeLevel} / B${rangeFirst.bonusLevel})`} tone="info" />
            <Stat value={fmtMult(bonusFirstEv.value)} label={`Multiplier first (R${bonusFirst.rangeLevel} / B${bonusFirst.bonusLevel})`} tone="warning" />
          </Grid>

          <Callout tone="warning" title="Read this before you spend">
            <Stack gap={6}>
              <Text size="small">
                <Text size="small" weight="semibold">
                  1. Only range vs. bonus.
                </Text>{" "}
                This planner splits medals between Golden Bot range and coin bonus. Cooldown and
                duration are not modelled; the bot is treated as always active.
              </Text>
              <Text size="small">
                <Text size="small" weight="semibold">
                  2. Enemies are not evenly spread.
                </Text>{" "}
                The model assumes kills are spread evenly, but they are not. There might be useful
                range breakpoints where Golden Bot reliably covers Black Holes.
              </Text>
              <Text size="small">
                <Text size="small" weight="semibold">
                  3. A direction, not an answer.
                </Text>{" "}
                Many other things can affect these numbers. Use the result to decide which upgrade
                to lean toward, not as a precise target.
              </Text>
            </Stack>
          </Callout>

          <Grid columns="repeat(auto-fit, minmax(300px, 1fr))" gap={16} align="start">
            <Card>
              <CardHeader trailing={<Pill size="sm">{path.length} upgrades</Pill>}>Upgrade order</CardHeader>
              <CardBody>
                <Stack gap={8}>
                  <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
                    <Table
                      headers={["#", "Upgrade", "Level", "Cost", "Total", "Bonus reach", "Avg coin ×"]}
                      columnAlign={["right", "left", "right", "right", "right", "right", "right"]}
                      stickyHeader
                      rowTone={path.map((s) => (s.upgrade === "Range" ? "info" : "warning"))}
                      rows={path.map((s) => [
                        String(s.step),
                        s.upgrade,
                        `${s.from} → ${s.to}`,
                        fmtMedals(s.cost),
                        fmtMedals(s.cumulative),
                        fmtPct(s.after.effective),
                        fmtMult(s.after.value),
                      ])}
                    />
                  </div>
                  <Text size="small" tone="tertiary">
                    Upgrades between now and the target, ordered by coin gain per medal so the
                    plan is also the best stopping point if you run short. Blue = range, amber =
                    multiplier.
                  </Text>
                </Stack>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>Why</CardHeader>
              <CardBody>
                <Stack gap={8}>
                  {rangeLevel < RANGE_MAX_LEVEL ? (
                    <Text size="small">
                      A range level adds 2m. At {current.meters}m that lifts in-range kills by about{" "}
                      <Text size="small" weight="semibold">
                        {fmtPct(
                          Math.max(0, evaluate(model, rangeLevel + 1, bonusLevel).coverage - current.coverage),
                          2,
                        )}
                      </Text>{" "}
                      of all kills, but the sniper already gives {sniper.chance}% of those kills the
                      bonus, so the net gain is only{" "}
                      <Text size="small" weight="semibold">
                        {fmtPct(
                          Math.max(0, evaluate(model, rangeLevel + 1, bonusLevel).effective - current.effective),
                          2,
                        )}
                      </Text>
                      .
                    </Text>
                  ) : (
                    <Text size="small">
                      Range is maxed, so every remaining medal goes to the multiplier. Lower the
                      range level to see how the range-vs-multiplier trade-off plays out.
                    </Text>
                  )}
                  <Text size="small">
                    A bonus level adds 0.2× to every kill that gets the bonus, which is{" "}
                    <Text size="small" weight="semibold">
                      {fmtPct(current.effective)}
                    </Text>{" "}
                    of kills with the sniper (vs. {fmtPct(current.coverage)} without). The sniper
                    makes multiplier levels worth more and range levels worth less.
                  </Text>
                  <Text size="small" tone="tertiary">
                    Next range level: {fmtMult(evaluate(model, Math.min(RANGE_MAX_LEVEL, rangeLevel + 1), bonusLevel).value)}
                    {rangeLevel < RANGE_MAX_LEVEL ? ` for ${fmtMedals(levelCost(rangeLevel + 1))} medals` : " (maxed)"}
                    . Next bonus level: {fmtMult(evaluate(model, rangeLevel, Math.min(BONUS_MAX_LEVEL, bonusLevel + 1)).value)}
                    {bonusLevel < BONUS_MAX_LEVEL ? ` for ${fmtMedals(levelCost(bonusLevel + 1))} medals` : " (maxed)"}.
                  </Text>
                </Stack>
              </CardBody>
            </Card>
          </Grid>
        </Stack>
      ) : (
        <Callout tone="neutral" title={medals > 0 ? "Nothing left to buy" : "No medals"}>
          {medals > 0
            ? "Both upgrades are already at the target for this budget."
            : "Enter how many medals you can spend to get an upgrade plan."}
        </Callout>
      )}

      <Stack gap={10}>
        <Row align="center" gap={12} wrap>
          <H2>Strategy comparison</H2>
          <Spacer />
          <Row align="center" gap={8}>
            <Text size="small" tone="secondary">
              {chartFromScratch ? "From level 0 / 0" : "From current levels"}
            </Text>
            <Toggle checked={chartFromScratch} onChange={setChartFromScratch} />
          </Row>
        </Row>
        <LineChart categories={chartCategories} series={chartSeries} height={280} />
        <Text size="small" tone="tertiary">
          Average coin multiplier vs. medals spent{" "}
          {chartFromScratch ? "starting from an unupgraded Golden Bot" : "on top of your current levels"}.
          "Range first" buys all range levels before any multiplier; "Multiplier first" the reverse;
          "Optimal mix" is the best reachable pair at each budget. The grey line shows the optimal
          mix without a Gilded Sniper for comparison. Coverage is extrapolated from your measured{" "}
          {fmtPct(coverage)} at {current.meters}m.
        </Text>
        <div style={{ overflowX: "auto" }}>
          <Table
            headers={["Medals", "Optimal levels", "Range · mult", "Optimal", "Range first", "Multiplier first"]}
            columnAlign={["right", "left", "left", "right", "right", "right"]}
            rows={milestoneRows}
          />
        </div>
      </Stack>

      <Stack gap={6}>
        <H2>Golden Bot upgrade reference</H2>
        <div style={{ overflowX: "auto" }}>
          <Table
            headers={["Upgrade", "Base", "Per level", "Levels", "Max", "Medals to max"]}
            columnAlign={["left", "right", "right", "right", "right", "right"]}
            rows={[
              ["Range", `${RANGE_BASE}m`, `+${RANGE_PER_LEVEL}m`, String(RANGE_MAX_LEVEL), `${rangeMeters(RANGE_MAX_LEVEL, 0)}m`, fmtMedals(cumulativeCost(RANGE_MAX_LEVEL))],
              ["Bonus", `${BONUS_BASE.toFixed(1)}×`, `+${BONUS_PER_LEVEL}×`, String(BONUS_MAX_LEVEL), `${bonusMultiplier(BONUS_MAX_LEVEL).toFixed(1)}×`, fmtMedals(cumulativeCost(BONUS_MAX_LEVEL))],
            ]}
          />
        </div>
        <Text size="small" tone="tertiary">
          Every level costs 100 medals + 40 per level already bought (level 1 = 100, level 2 = 140,
          … level 30 = 1,260). Source: the-tower-idle-tower-defense.fandom.com/wiki/Golden_Bot.
        </Text>
      </Stack>

      <Callout tone="warning" title="Model assumptions">
        <Stack gap={4}>
          <Text size="small">
            • Golden Bot range = 20m + 2m × level + extra range. Coin bonus = 2.0× + 0.2× × level.
            Tower-range amplification scales all ranges equally, so it cancels out.
          </Text>
          <Text size="small">
            • Kills-in-range % is taken from your battle report at your current range and scaled to
            other ranges by covered area, i.e. (new range ÷ current range)², capped at 100%. The
            range is a circle, so area grows with the square of the range.
          </Text>
          <Text size="small">
            • This scaling is a rough guide only. It assumes kills are spread evenly over the
            circle, but enemies cluster along their approach and die where your damage lands, so
            the true effect of a range change can be quite different. The measured value at your
            current range is exact; every other range is an estimate.
          </Text>
          <Text size="small">
            • Gilded Sniper: each kill outside the range gets the bonus with the rarity's chance
            while the bot is active. Effective share = in-range % + chance × (100% − in-range %).
          </Text>
          <Text size="small">
            • Score = average coin multiplier per kill = 1 + effective share × (multiplier − 1).
            Enemies without the bonus still pay 1×, so this is not simply share × multiplier.
          </Text>
          <Text size="small">
            • Cooldown and duration upgrades are ignored; the bot is treated as always active.
          </Text>
          <Text size="small">
            • Orbs, black hole and golden tower bonuses are unaffected by Golden Bot upgrades and
            are left out. Bosses and elites are treated like any other kill.
          </Text>
        </Stack>
      </Callout>
    </Stack>
  );
}
