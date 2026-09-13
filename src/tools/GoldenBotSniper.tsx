import { LineChart } from "@mantine/charts";
import { Alert, Badge, Divider, Group, Select, SimpleGrid, Stack, Switch, Text, Title } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";

import { DataTable, LevelValueField, NumberField, SectionCard, Stat } from "../components";
import {
  BONUS_BASE,
  BONUS_MAX_LEVEL,
  BONUS_PER_LEVEL,
  RANGE_BASE,
  RANGE_MAX_LEVEL,
  RANGE_PER_LEVEL,
  SNIPER_RARITIES,
  bestReachable,
  bonusMultiplier,
  cumulativeCost,
  evaluate,
  fmtMedals,
  fmtMult,
  fmtPct,
  nextUpgrades,
  rangeMeters,
  round,
  sequentialLevels,
  type Evaluation,
  type Model,
} from "../model/goldenBot";

/** Inputs survive reloads under `golden-bot-sniper:<key>` in localStorage. */
function useSetting<T>(key: string, defaultValue: T) {
  return useLocalStorage<T>({ key: `golden-bot-sniper:${key}`, defaultValue, getInitialValueInEffect: false });
}

// The game model lives in src/model/goldenBot.ts; see the comment there.

function ScenarioStats({
  title,
  subtitle,
  ev,
  gain,
  color,
}: {
  title: string;
  subtitle?: string;
  ev: Evaluation;
  gain: string;
  color?: "blue" | "green";
}) {
  return (
    <Stack gap="sm">
      <Group align="center" gap="sm">
        <Title order={2}>{title}</Title>
        <Badge variant="light" color={color ?? "gray"}>{`R${ev.rangeLevel} / B${ev.bonusLevel}`}</Badge>
        {subtitle && (
          <Text size="xs" c="dimmed">
            {subtitle}
          </Text>
        )}
      </Group>
      {/* Fixed column count so the coin row lines up with the columns above it. */}
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing="md">
        <Stat value={`${ev.meters}m`} label="Range" />
        <Stat value={`${round(ev.multiplier, 1)}×`} label="Multiplier" />
        <Stat value={fmtPct(ev.coverage)} label="Kills in range" />
        <Stat value={fmtPct(ev.activeCoverage)} label="In range while active" />
        <Stat value={fmtPct(ev.activeEffective)} label="Getting bonus while active" color="blue" />
        <Stat value={fmtMult(ev.value)} label="Avg coin × while active" color={color ?? "blue"} />
        <Stat value={fmtMult(ev.wholeRun)} label="Whole-run coin ×" color={color ?? "blue"} />
        <Stat value={gain} label="Coins vs. no Sniper" color={color} />
      </SimpleGrid>
    </Stack>
  );
}

export default function GoldenBotSniper() {
  const [totalMedals, setTotalMedals] = useSetting("totalMedals", 17000);
  const [sniperId, setSniperId] = useSetting("sniperId", "ancestral");
  const [rangeLevel, setRangeLevel] = useSetting("rangeLevel", 20);
  const [extraRange, setExtraRange] = useSetting("extraRange", 7);
  const [bonusLevel, setBonusLevel] = useSetting("bonusLevel", 16);
  const [coverage, setCoverage] = useSetting("coverage", 20);
  const [measuredAtRange, setMeasuredAtRange] = useSetting("measuredAtRange", 67);
  const [duration, setDuration] = useSetting("duration", 26);
  const [cooldown, setCooldown] = useSetting("cooldown", 100);
  const [chartFromScratch, setChartFromScratch] = useSetting("chartFromScratch", true);

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
  const chartData = budgets.map((b) => {
    const rf = sequentialLevels(chartStartRange, chartStartBonus, b, "range");
    const bf = sequentialLevels(chartStartRange, chartStartBonus, b, "bonus");
    return {
      medals: fmtMedals(b),
      "Optimal mix": round(bestReachable(model, chartStartRange, chartStartBonus, b).target.value, 3),
      "Range first": round(evaluate(model, rf.rangeLevel, rf.bonusLevel).value, 3),
      "Multiplier first": round(evaluate(model, bf.rangeLevel, bf.bonusLevel).value, 3),
      "Optimal, no sniper": round(bestReachable(noSniperModel, chartStartRange, chartStartBonus, b).target.value, 3),
    };
  });
  const chartSeries = [
    { name: "Optimal mix", color: "green.6" },
    { name: "Range first", color: "blue.6" },
    { name: "Multiplier first", color: "orange.6" },
    { name: "Optimal, no sniper", color: "gray.5" },
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
      fmtMult(opt.wholeRun),
      fmtMult(evaluate(model, rf.rangeLevel, rf.bonusLevel).value),
      fmtMult(evaluate(model, bf.rangeLevel, bf.bonusLevel).value),
    ];
  });

  return (
    <Stack gap="xl">
      <Stack gap={4}>
        <Title order={1}>Golden Bot + Gilded Sniper Planner</Title>
        <Text c="dimmed">
          The Tower — where to put Golden Bot medals (range vs. coin multiplier) when the Gilded
          Sniper cannon module gives out-of-range kills a chance to receive active coin bonuses.
        </Text>
      </Stack>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" verticalSpacing="lg">
        <SectionCard title="Golden Bot stats" trailing={<Badge variant="light">{fmtMedals(spentSoFar)} spent</Badge>}>
          <Stack gap="md">
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
        </SectionCard>

        <SectionCard
          title="Tower stats"
          trailing={
            <Badge variant={sniper.chance > 0 ? "filled" : "light"}>{sniper.chance}% sniper</Badge>
          }
        >
          <Stack gap="md">
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
            <Select
              label="Gilded Sniper rarity"
              description="Chance that a kill outside the range still receives all active coin bonuses."
              value={sniperId}
              onChange={(v) => v && setSniperId(v)}
              allowDeselect={false}
              data={SNIPER_RARITIES.map((r) => ({ value: r.id, label: r.label }))}
            />
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
        </SectionCard>
      </SimpleGrid>

      <Stack gap="lg">
        <ScenarioStats title="Right now, without Sniper" ev={currentNoSniper} gain="—" />
        <Divider />
        <ScenarioStats title="Right now, with Sniper" ev={current} gain={gainVsBase(current.value)} color="blue" />
        <Divider />
        <ScenarioStats
          title="Optimal Golden Bot with Sniper"
          subtitle={`best split of ${fmtMedals(totalMedals)} medals from level 0 / 0, ${fmtMedals(ideal.cost)} used`}
          ev={ideal.target}
          gain={gainVsBase(ideal.target.value)}
          color="green"
        />
        <Text size="xs" c="dimmed">
          Only kills made while Golden Bot is active count. The bot is active {fmtPct(uptime)} of
          the time ({duration}s every {cooldown}s), so your {fmtPct(coverage)} kills-in-range means{" "}
          {fmtPct(current.activeCoverage)} of active-time kills are inside the circle. Avg coin ×
          while active = 1 + (share of active-time kills getting the bonus) × (multiplier − 1);
          kills that miss the bonus still pay 1×. Gilded Sniper adds {sniper.chance}% of the{" "}
          {fmtPct(100 - current.activeCoverage)} of active-time kills outside the circle.
          Whole-run coin × spreads the same gain over all kills, 1 + uptime × (avg coin × while
          active − 1), assuming coins are spread evenly over the run.
        </Text>
      </Stack>

      {coverageAboveUptime && (
        <Alert variant="light" color="red" title="Kills in range exceeds uptime">
          {fmtPct(coverage)} of kills can't be inside the range if the bot is only active{" "}
          {fmtPct(uptime)} of the time. Check the duration, cooldown, or the battle-report value.
          Coverage is capped at uptime below.
        </Alert>
      )}

      {overspent && (
        <Alert variant="light" color="red" title="Total is below what you've spent">
          Your current levels cost {fmtMedals(spentSoFar)} medals, more than the total entered.
          Raise the total or lower the levels.
        </Alert>
      )}

      <Alert variant="light" color="orange" title="Read this before you spend">
        <Stack gap={6}>
          <Text size="sm">
            <Text span size="sm" fw={600}>
              1. Only range vs. bonus.
            </Text>{" "}
            This planner splits medals between Golden Bot range and coin bonus. Duration and
            cooldown only set the uptime and are assumed to match UW sync. When using Galaxy
            Compressor you might want to prioritise duration & cooldown, which is not covered here.
          </Text>
          <Text size="sm">
            <Text span size="sm" fw={600}>
              2. Only coins during Golden Bot count.
            </Text>{" "}
            Players make almost all their income while Golden Bot is active, because the other
            coin multipliers go off at the same time. Kills outside its duration are treated as
            worth 0, so every number here is per kill made while the bot is active.
          </Text>
          <Text size="sm">
            <Text span size="sm" fw={600}>
              3. The score is relative, not your total income.
            </Text>{" "}
            Other coin multipliers stack on top of Golden Bot and cancel out. "Avg coin × while
            active" is how much more a kill in the bot's window pays; "Whole-run coin ×" spreads
            that over the whole run, which is why it is much lower.
          </Text>
          <Text size="sm">
            <Text span size="sm" fw={600}>
              4. Enemies are not evenly spread.
            </Text>{" "}
            The model assumes kills are spread evenly, but they are not. There might be useful
            range breakpoints where Golden Bot reliably covers Black Holes.
          </Text>
          <Text size="sm">
            <Text span size="sm" fw={600}>
              5. A direction, not an answer.
            </Text>{" "}
            Many other things can affect these numbers. Use the result to decide which upgrade
            to lean toward, not as a precise target.
          </Text>
        </Stack>
      </Alert>

      <Stack gap="xs">
        <Group align="center" gap="sm">
          <Title order={2}>Next upgrades</Title>
          <Badge variant="light" color={affordableSteps > 0 ? "green" : "gray"}>
            {affordableSteps} of {path.length} affordable with {fmtMedals(unspent)} unspent
          </Badge>
        </Group>
        {path.length > 0 ? (
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            <DataTable
              headers={["#", "Upgrade", "Level", "Cost", "Total", "Kills in range", "Getting bonus while active", "Avg coin × while active", "Whole-run coin ×"]}
              align={["right", "left", "right", "right", "right", "right", "right", "right", "right"]}
              highlightRow={(r) => path[r].cumulative <= unspent}
              rows={path.map((st) => [
                String(st.step),
                <Badge key={st.step} variant="light" color={st.upgrade === "Range" ? "blue" : "orange"}>
                  {st.upgrade}
                </Badge>,
                `${st.from} → ${st.to}`,
                fmtMedals(st.cost),
                fmtMedals(st.cumulative),
                fmtPct(st.after.coverage),
                fmtPct(st.after.activeEffective),
                fmtMult(st.after.value),
                fmtMult(st.after.wholeRun),
              ])}
            />
          </div>
        ) : (
          <Alert variant="light" color="gray" title="Nothing left to buy">
            Range and bonus are both at max level.
          </Alert>
        )}
        <Text size="xs" c="dimmed">
          Every remaining upgrade from your current levels, ordered by coin gain per medal at
          each step. Blue = range, orange = bonus. Highlighted rows are covered by your unspent
          medals; "Total" is the running cost.
        </Text>
      </Stack>

      <Stack gap="xs">
        <Group align="center" justify="space-between">
          <Title order={2}>Strategy comparison</Title>
          <Switch
            checked={chartFromScratch}
            onChange={(e) => setChartFromScratch(e.currentTarget.checked)}
            label={chartFromScratch ? "From level 0 / 0" : "From current levels"}
            labelPosition="left"
          />
        </Group>
        <LineChart
          h={280}
          data={chartData}
          dataKey="medals"
          series={chartSeries}
          curveType="monotone"
          withLegend
          withDots={false}
          valueFormatter={(v) => fmtMult(v)}
        />
        <Text size="xs" c="dimmed">
          Average coin multiplier per active-time kill vs. medals spent{" "}
          {chartFromScratch ? "starting from an unupgraded Golden Bot" : "on top of your current levels"}.
          "Range first" buys all range levels before any multiplier; "Multiplier first" the reverse;
          "Optimal mix" is the best reachable pair at each budget. The grey line shows the optimal
          mix without a Gilded Sniper for comparison. Coverage is extrapolated from your measured{" "}
          {fmtPct(coverage)} at {measuredAtRange}m. The table below samples the same three curves at
          round budgets and shows which levels the optimal mix lands on.
        </Text>
        <DataTable
          headers={["Medals spent", "Optimal levels", "Range · mult", "Optimal mix ×", "Optimal whole-run ×", "Range first ×", "Multiplier first ×"]}
          align={["right", "left", "left", "right", "right", "right", "right"]}
          rows={milestoneRows}
        />
      </Stack>

      <Stack gap="xs">
        <Title order={2}>Golden Bot upgrade reference</Title>
        <DataTable
          headers={["Upgrade", "Base", "Per level", "Levels", "Max", "Medals to max"]}
          align={["left", "right", "right", "right", "right", "right"]}
          rows={[
            ["Range", `${RANGE_BASE}m`, `+${RANGE_PER_LEVEL}m`, String(RANGE_MAX_LEVEL), `${rangeMeters(RANGE_MAX_LEVEL, 0)}m`, fmtMedals(cumulativeCost(RANGE_MAX_LEVEL))],
            ["Bonus", `${BONUS_BASE.toFixed(1)}×`, `+${BONUS_PER_LEVEL}×`, String(BONUS_MAX_LEVEL), `${bonusMultiplier(BONUS_MAX_LEVEL).toFixed(1)}×`, fmtMedals(cumulativeCost(BONUS_MAX_LEVEL))],
          ]}
        />
        <Text size="xs" c="dimmed">
          Every level costs 100 medals + 40 per level already bought (level 1 = 100, level 2 = 140,
          … level 30 = 1,260). Source: the-tower-idle-tower-defense.fandom.com/wiki/Golden_Bot.
        </Text>
      </Stack>

      <Alert variant="light" color="orange" title="Model assumptions">
        <Stack gap={4}>
          <Text size="sm">
            • Golden Bot range = 20m + 2m × level + extra range. Coin bonus = 2.0× + 0.2× × level.
            Tower-range amplification scales all ranges equally, so it cancels out.
          </Text>
          <Text size="sm">
            • Kills-in-range % is taken from your battle report at the range you measured it at and scaled to
            other ranges by covered area, i.e. (new range ÷ current range)², capped at uptime. The
            range is a circle, so area grows with the square of the range.
          </Text>
          <Text size="sm">
            • This scaling is a rough guide only. It assumes kills are spread evenly over the
            circle, but enemies cluster along their approach and die where your damage lands, so
            the true effect of a range change can be quite different. The measured value at your
            current range is exact; every other range is an estimate.
          </Text>
          <Text size="sm">
            • Gilded Sniper: each active-time kill outside the range gets the bonus with the
            rarity's chance. Share getting the bonus = in-range share + chance × (1 − in-range
            share), both measured over active-time kills.
          </Text>
          <Text size="sm">
            • Score = average coin multiplier per kill made while the bot is active = 1 + share
            getting the bonus × (multiplier − 1). Kills outside the bot's duration are ignored.
            Enemies without the bonus still pay 1×, so this is not simply share × multiplier.
          </Text>
          <Text size="sm">
            • Uptime = duration ÷ cooldown. The battle-report kills-in-range % is a share of all
            kills and already includes uptime, so it is capped at uptime and divided by it to get
            the share of active-time kills in range. Partial sync with your other multipliers does
            not change the split: every activation is assumed to look like the average one, so
            dropping unsynced activations changes how many kills count, not their mix. Duration
            and cooldown upgrades are not planned.
          </Text>
          <Text size="sm">
            • Orbs, black hole and golden tower bonuses are unaffected by Golden Bot upgrades and
            are left out. Bosses and elites are treated like any other kill.
          </Text>
        </Stack>
      </Alert>
    </Stack>
  );
}
