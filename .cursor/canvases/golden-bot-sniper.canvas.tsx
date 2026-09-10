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
//   Uptime only rescales V - 1, so it never changes the optimal split.
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
  refRangeMeters: number; // total range (levels + extra) at which coverage was measured
  refCoverage: number; // % of kills inside range at refRangeMeters
  uptime: number; // % of time the bot is active (duration / cooldown)
  sniperChance: number; // %
}

interface Evaluation {
  rangeLevel: number;
  bonusLevel: number;
  meters: number;
  multiplier: number;
  coverage: number; // % of all kills inside range (battle-report scale)
  activeCoverage: number; // % of active-time kills inside range
  activeEffective: number; // % of active-time kills receiving the multiplier (incl. sniper)
  value: number; // average coin multiplier per active-time kill
}

function coverageAt(model: Model, rangeLevel: number): number {
  const r0 = model.refRangeMeters;
  const r = rangeMeters(rangeLevel, model.extraRange);
  const cap = Math.max(0, Math.min(100, model.uptime));
  if (r0 <= 0) return Math.max(0, Math.min(cap, model.refCoverage));
  const c = model.refCoverage * Math.pow(Math.max(0, r) / r0, COVERAGE_EXPONENT);
  return Math.max(0, Math.min(cap, c));
}

function evaluate(model: Model, rangeLevel: number, bonusLevel: number): Evaluation {
  const coverage = coverageAt(model, rangeLevel);
  const uptime = Math.max(0, Math.min(100, model.uptime));
  const sniper = Math.max(0, Math.min(100, model.sniperChance)) / 100;
  const activeCoverage = uptime > 0 ? Math.min(100, (coverage / uptime) * 100) : 0;
  const activeEffective = activeCoverage + sniper * (100 - activeCoverage);
  const multiplier = bonusMultiplier(bonusLevel);
  return {
    rangeLevel,
    bonusLevel,
    meters: rangeMeters(rangeLevel, model.extraRange),
    multiplier,
    coverage,
    activeCoverage,
    activeEffective,
    value: 1 + (activeEffective / 100) * (multiplier - 1),
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

interface UpgradeStep {
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
function nextUpgrades(model: Model, startRange: number, startBonus: number): UpgradeStep[] {
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

function ScenarioStats({
  title,
  subtitle,
  ev,
  gain,
  tone,
}: {
  title: string;
  subtitle?: string;
  ev: Evaluation;
  gain: string;
  tone?: "info" | "success";
}) {
  return (
    <Stack gap={14}>
      <Row align="center" gap={10} wrap>
        <H2>{title}</H2>
        <Pill size="sm" tone={tone ?? "neutral"}>{`R${ev.rangeLevel} / B${ev.bonusLevel}`}</Pill>
        {subtitle ? (
          <Text size="small" tone="tertiary">
            {subtitle}
          </Text>
        ) : null}
      </Row>
      <Grid columns="repeat(auto-fit, minmax(140px, 1fr))" gap={16}>
        <Stat value={`${ev.meters}m`} label="Range" />
        <Stat value={`${round(ev.multiplier, 1)}×`} label="Multiplier" />
        <Stat value={fmtPct(ev.coverage)} label="Kills in range" />
        <Stat value={fmtPct(ev.activeCoverage)} label="In range while active" />
        <Stat value={fmtPct(ev.activeEffective)} label="Getting bonus while active" tone="info" />
        <Stat value={fmtMult(ev.value)} label="Avg coin × while active" tone={tone ?? "info"} />
        <Stat value={gain} label="Coins vs. no Sniper" tone={tone} />
      </Grid>
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
  const [totalMedals, setTotalMedals] = useCanvasState("totalMedals", 17000);
  const [sniperId, setSniperId] = useCanvasState("sniperId", "ancestral");
  const [rangeLevel, setRangeLevel] = useCanvasState("rangeLevel", 20);
  const [extraRange, setExtraRange] = useCanvasState("extraRange", 7);
  const [bonusLevel, setBonusLevel] = useCanvasState("bonusLevel", 16);
  const [coverage, setCoverage] = useCanvasState("coverage", 20);
  const [measuredAtRange, setMeasuredAtRange] = useCanvasState("measuredAtRange", 67);
  const [duration, setDuration] = useCanvasState("duration", 26);
  const [cooldown, setCooldown] = useCanvasState("cooldown", 100);
  const [chartFromScratch, setChartFromScratch] = useCanvasState("chartFromScratch", true);

  const sniper = SNIPER_RARITIES.find((r) => r.id === sniperId) ?? SNIPER_RARITIES[0];

  const uptime = cooldown > 0 ? Math.min(100, (duration / cooldown) * 100) : 100;
  const coverageAboveUptime = coverage > uptime + 1e-9;

  const model: Model = {
    extraRange,
    refRangeMeters: measuredAtRange,
    refCoverage: coverage,
    uptime,
    sniperChance: sniper.chance,
  };
  const noSniperModel: Model = { ...model, sniperChance: 0 };

  const current = evaluate(model, rangeLevel, bonusLevel);
  const currentNoSniper = evaluate(noSniperModel, rangeLevel, bonusLevel);
  const spentSoFar = cumulativeCost(rangeLevel) + cumulativeCost(bonusLevel);
  const remainingToMax = cumulativeCost(RANGE_MAX_LEVEL) + cumulativeCost(BONUS_MAX_LEVEL) - spentSoFar;
  const overspent = totalMedals < spentSoFar;
  const unspent = Math.max(0, totalMedals - spentSoFar);

  // --- Ideal split of the total, as if starting from level 0 / 0 ---
  const ideal = bestReachable(model, 0, 0, totalMedals);

  // --- Next upgrades from the current levels, best gain per medal first ---
  const path = nextUpgrades(model, rangeLevel, bonusLevel);
  const affordableSteps = path.filter((st) => st.cumulative <= unspent).length;

  const gainVsBase = (v: number) =>
    currentNoSniper.value > 0 ? `+${fmtPct(((v - currentNoSniper.value) / currentNoSniper.value) * 100)}` : "—";

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
              <Divider />
              <NumberField
                label="Duration"
                hint="20–35s from levels, up to 45s with labs"
                value={duration}
                min={1}
                max={120}
                step={0.5}
                suffix="s"
                onChange={setDuration}
              />
              <NumberField
                label="Cooldown"
                hint={`120–75s from levels, down to 50s with labs. Uptime ${fmtPct(uptime)}`}
                value={cooldown}
                min={1}
                max={300}
                suffix="s"
                onChange={setCooldown}
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
                label="Total medals"
                hint={
                  overspent
                    ? `Less than the ${fmtMedals(spentSoFar)} already spent on the levels above`
                    : `${fmtMedals(spentSoFar)} already spent on the levels above, ${fmtMedals(unspent)} unspent`
                }
                value={totalMedals}
                min={0}
                max={100000}
                step={0}
                onChange={setTotalMedals}
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
              <NumberField
                label="Measured at range"
                hint={`Your total Golden Bot range (levels + extra) in that battle. Current: ${current.meters}m`}
                value={measuredAtRange}
                min={1}
                max={200}
                suffix="m"
                onChange={setMeasuredAtRange}
              />
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Stack gap={28}>
        <ScenarioStats title="Right now, without Sniper" ev={currentNoSniper} gain="—" />
        <Divider />
        <ScenarioStats
          title="Right now, with Sniper"
          ev={current}
          gain={gainVsBase(current.value)}
          tone="info"
        />
        <Divider />
        <ScenarioStats
          title="Optimal Golden Bot with Sniper"
          subtitle={`best split of ${fmtMedals(totalMedals)} medals from level 0 / 0, ${fmtMedals(ideal.cost)} used`}
          ev={ideal.target}
          gain={gainVsBase(ideal.target.value)}
          tone="success"
        />
        <Text size="small" tone="tertiary">
          Only kills made while Golden Bot is active count. The bot is active {fmtPct(uptime)} of
          the time ({duration}s every {cooldown}s), so your {fmtPct(coverage)} kills-in-range means{" "}
          {fmtPct(current.activeCoverage)} of active-time kills are inside the circle. Avg coin ×
          while active = 1 + (share of active-time kills getting the bonus) × (multiplier − 1);
          kills that miss the bonus still pay 1×. Gilded Sniper adds {sniper.chance}% of the{" "}
          {fmtPct(100 - current.activeCoverage)} of active-time kills outside the circle.
        </Text>
      </Stack>

      {coverageAboveUptime ? (
        <Callout tone="danger" title="Kills in range exceeds uptime">
          {fmtPct(coverage)} of kills can't be inside the range if the bot is only active{" "}
          {fmtPct(uptime)} of the time. Check the duration, cooldown, or the battle-report value.
          Coverage is capped at uptime below.
        </Callout>
      ) : null}

      {overspent ? (
        <Callout tone="danger" title="Total is below what you've spent">
          Your current levels cost {fmtMedals(spentSoFar)} medals, more than the total entered.
          Raise the total or lower the levels.
        </Callout>
      ) : null}

      <Callout tone="warning" title="Read this before you spend">
        <Stack gap={6}>
          <Text size="small">
            <Text size="small" weight="semibold">
              1. Only range vs. bonus.
            </Text>{" "}
            This planner splits medals between Golden Bot range and coin bonus. Duration and
            cooldown only set the uptime; upgrading them is not planned here.
          </Text>
          <Text size="small">
            <Text size="small" weight="semibold">
              2. Only coins during Golden Bot count.
            </Text>{" "}
            Players make almost all their income while Golden Bot is active, because the other
            coin multipliers go off at the same time. Kills outside its duration are treated as
            worth 0, so every number here is per kill made while the bot is active.
          </Text>
          <Text size="small">
            <Text size="small" weight="semibold">
              3. Enemies are not evenly spread.
            </Text>{" "}
            The model assumes kills are spread evenly, but they are not. There might be useful
            range breakpoints where Golden Bot reliably covers Black Holes.
          </Text>
          <Text size="small">
            <Text size="small" weight="semibold">
              4. A direction, not an answer.
            </Text>{" "}
            Many other things can affect these numbers. Use the result to decide which upgrade
            to lean toward, not as a precise target.
          </Text>
        </Stack>
      </Callout>

      <Stack gap={10}>
        <Row align="center" gap={8} wrap>
          <H2>Next upgrades</H2>
          <Pill size="sm" tone={affordableSteps > 0 ? "success" : "neutral"}>
            {affordableSteps} of {path.length} affordable with {fmtMedals(unspent)} unspent
          </Pill>
        </Row>
        {path.length > 0 ? (
          <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
            <Table
              headers={["#", "Upgrade", "Level", "Cost", "Total", "Kills in range", "Getting bonus while active", "Avg coin × while active"]}
              columnAlign={["right", "left", "right", "right", "right", "right", "right", "right"]}
              stickyHeader
              rowTone={path.map((st) => (st.cumulative <= unspent ? "success" : undefined))}
              rows={path.map((st) => [
                String(st.step),
                <Pill key={st.step} size="sm" tone={st.upgrade === "Range" ? "info" : "warning"}>
                  {st.upgrade}
                </Pill>,
                `${st.from} → ${st.to}`,
                fmtMedals(st.cost),
                fmtMedals(st.cumulative),
                fmtPct(st.after.coverage),
                fmtPct(st.after.activeEffective),
                fmtMult(st.after.value),
              ])}
            />
          </div>
        ) : (
          <Callout tone="neutral" title="Nothing left to buy">
            Range and bonus are both at max level.
          </Callout>
        )}
        <Text size="small" tone="tertiary">
          Every remaining upgrade from your current levels, ordered by coin gain per medal at
          each step. Blue = range, amber = bonus. Green rows are covered by your unspent medals;
          "Total" is the running cost.
        </Text>
      </Stack>

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
          Average coin multiplier per active-time kill vs. medals spent{" "}
          {chartFromScratch ? "starting from an unupgraded Golden Bot" : "on top of your current levels"}.
          "Range first" buys all range levels before any multiplier; "Multiplier first" the reverse;
          "Optimal mix" is the best reachable pair at each budget. The grey line shows the optimal
          mix without a Gilded Sniper for comparison. Coverage is extrapolated from your measured{" "}
          {fmtPct(coverage)} at {measuredAtRange}m. The table below samples the same three curves at
          round budgets and shows which levels the optimal mix lands on.
        </Text>
        <div style={{ overflowX: "auto" }}>
          <Table
            headers={["Medals spent", "Optimal levels", "Range · mult", "Optimal mix ×", "Range first ×", "Multiplier first ×"]}
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
            • Kills-in-range % is taken from your battle report at the range you measured it at and scaled to
            other ranges by covered area, i.e. (new range ÷ current range)², capped at uptime. The
            range is a circle, so area grows with the square of the range.
          </Text>
          <Text size="small">
            • This scaling is a rough guide only. It assumes kills are spread evenly over the
            circle, but enemies cluster along their approach and die where your damage lands, so
            the true effect of a range change can be quite different. The measured value at your
            current range is exact; every other range is an estimate.
          </Text>
          <Text size="small">
            • Gilded Sniper: each active-time kill outside the range gets the bonus with the
            rarity's chance. Share getting the bonus = in-range share + chance × (1 − in-range
            share), both measured over active-time kills.
          </Text>
          <Text size="small">
            • Score = average coin multiplier per kill made while the bot is active = 1 + share
            getting the bonus × (multiplier − 1). Kills outside the bot's duration are ignored.
            Enemies without the bonus still pay 1×, so this is not simply share × multiplier.
          </Text>
          <Text size="small">
            • Uptime = duration ÷ cooldown. The battle-report kills-in-range % is a share of all
            kills and already includes uptime, so it is capped at uptime and divided by it to get
            the share of active-time kills in range. Uptime only rescales the score, so it never
            changes the optimal split. Duration and cooldown upgrades are not planned.
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
