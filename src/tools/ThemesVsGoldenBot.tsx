import { LineChart } from "@mantine/charts";
import { Alert, Badge, Divider, Group, Select, SimpleGrid, Stack, Text, Title } from "@mantine/core";
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
  cumulativeCost,
  evaluate,
  fmtMedals,
  fmtMult,
  fmtPct,
  nextUpgrades,
  round,
  type Model,
  type UpgradeStep,
} from "../model/goldenBot";

/** Golden Bot inputs are shared with the Golden Bot planner (same localStorage keys). */
function useBotSetting<T>(key: string, defaultValue: T) {
  return useLocalStorage<T>({ key: `golden-bot-sniper:${key}`, defaultValue, getInitialValueInEffect: false });
}

/** Inputs specific to this tool live under `themes-vs-golden-bot:<key>`. */
function useSetting<T>(key: string, defaultValue: T) {
  return useLocalStorage<T>({ key: `themes-vs-golden-bot:${key}`, defaultValue, getInitialValueInEffect: false });
}

// ----------------------------------------------------------------------------
// Model
//
// Themes: every theme adds a flat % to one "Themes bonus" total that multiplies
//   ALL coins earned (T, e.g. 1.658x). A new background adds +0.8 percentage
//   points, a tower skin +0.4, so the relative coin gain is  delta / T.
//   Each event offers one of each, for 250 and 150 medals.
//
// Golden Bot: coins scale with 1 + s * (V - 1), where V is the average coin
//   multiplier per kill while the bot is active (see src/model/goldenBot.ts)
//   and s is the share of coins earned inside the bot's active window.
//   s = 100 % is the planner's assumption (all income during the bot);
//   s = uptime means coins are spread evenly over the run.
//   Relative gain of an upgrade = (1 + s(V' - 1)) / (1 + s(V - 1)) - 1.
//
// Both gains are "% more coins per run", so they compare directly. Per-100-medal
// rate = gain / cost * 100.
// ----------------------------------------------------------------------------

const THEME_MAX = 3;

/** What each event sells: percentage points added to the themes total, and the medal price. */
const BACKGROUND = { name: "Background", bonus: 0.8, cost: 250 };
const SKIN = { name: "Tower skin", bonus: 0.4, cost: 150 };

interface ThemeOption {
  id: "background" | "skin";
  name: string;
  bonus: number; // percentage points added to the themes total
  cost: number; // medals
}

interface Priced {
  gain: number; // % more coins
  ratePer100: number; // % more coins per 100 medals
}

function price(gain: number, cost: number): Priced {
  return { gain, ratePer100: cost > 0 ? (gain / cost) * 100 : 0 };
}

/** Relative coin gain of adding `bonus` percentage points to a themes total of `total` (×). */
function themeGain(total: number, bonus: number): number {
  return total > 0 ? (bonus / 100 / total) * 100 : 0;
}

/** Whole-run coin multiplier from Golden Bot when `share`% of coins are earned while it is active. */
function runMultiplier(value: number, share: number): number {
  return 1 + (share / 100) * (value - 1);
}

function fmtRate(v: number): string {
  return `${round(v, 3).toFixed(3)}%`;
}

function fmtGain(v: number): string {
  return `+${round(v, 2).toFixed(2)}%`;
}

function medalsPerPercent(rate: number): string {
  return rate > 0 ? fmtMedals(Math.round(100 / rate)) : "—";
}

export default function ThemesVsGoldenBot() {
  const [themesTotal, setThemesTotal] = useSetting("themesTotal", 1.658);
  const [coinShare, setCoinShare] = useSetting("coinShare", 100);

  const [totalMedals, setTotalMedals] = useBotSetting("totalMedals", 17000);
  const [sniperId, setSniperId] = useBotSetting("sniperId", "ancestral");
  const [rangeLevel, setRangeLevel] = useBotSetting("rangeLevel", 20);
  const [extraRange, setExtraRange] = useBotSetting("extraRange", 7);
  const [bonusLevel, setBonusLevel] = useBotSetting("bonusLevel", 16);
  const [coverage, setCoverage] = useBotSetting("coverage", 20);
  const [measuredAtRange, setMeasuredAtRange] = useBotSetting("measuredAtRange", 67);
  const [duration, setDuration] = useBotSetting("duration", 26);
  const [cooldown, setCooldown] = useBotSetting("cooldown", 100);

  const sniper = SNIPER_RARITIES.find((r) => r.id === sniperId) ?? SNIPER_RARITIES[0];
  const uptime = cooldown > 0 ? Math.min(100, (duration / cooldown) * 100) : 100;
  const coverageAboveUptime = coverage > uptime + 1e-9;
  const shareBelowUptime = coinShare < uptime - 1e-9;

  const model: Model = {
    extraRange,
    refRangeMeters: measuredAtRange,
    refCoverage: coverage,
    uptime,
    sniperChance: sniper.chance,
  };

  const current = evaluate(model, rangeLevel, bonusLevel);
  const currentRun = runMultiplier(current.value, coinShare);
  const spentSoFar = cumulativeCost(rangeLevel) + cumulativeCost(bonusLevel);
  const overspent = totalMedals < spentSoFar;
  const unspent = Math.max(0, totalMedals - spentSoFar);

  // --- Themes ---
  const themes: ThemeOption[] = [
    { id: "background", ...BACKGROUND },
    { id: "skin", ...SKIN },
  ];
  const themePrice = (t: ThemeOption) => price(themeGain(themesTotal, t.bonus), t.cost);
  const priced = themes.map((t) => ({ ...t, ...themePrice(t) }));
  const background = priced[0];
  const skin = priced[1];
  const eventBundle = price(themeGain(themesTotal, BACKGROUND.bonus + SKIN.bonus), BACKGROUND.cost + SKIN.cost);

  // --- Golden Bot: every remaining upgrade, best gain per medal first ---
  const path = nextUpgrades(model, rangeLevel, bonusLevel);
  const pricedPath = path.map((st, i) => {
    const before = i === 0 ? currentRun : runMultiplier(path[i - 1].after.value, coinShare);
    const after = runMultiplier(st.after.value, coinShare);
    return { ...st, ...price(before > 0 ? (after / before - 1) * 100 : 0, st.cost) };
  });
  const nextStep = pricedPath[0] ?? null;
  const botMaxed = path.length === 0;

  /** Golden Bot steps that pay more per medal than the theme, and what they cost together. */
  const stepsBeating = (t: Priced) => {
    const better = pricedPath.filter((st) => st.ratePer100 > t.ratePer100 + 1e-12);
    return { count: better.length, cost: better.reduce((sum, st) => sum + st.cost, 0) };
  };

  type Verdict = { buy: boolean; label: string; reason: string };
  const verdictFor = (t: ThemeOption & Priced): Verdict => {
    if (botMaxed) return { buy: true, label: "Buy", reason: "Golden Bot is maxed, nothing else to spend medals on." };
    const better = stepsBeating(t);
    if (better.count === 0) {
      return {
        buy: true,
        label: "Buy",
        reason: `Beats every remaining Golden Bot upgrade (next: ${fmtRate(nextStep!.ratePer100)} per 100 medals).`,
      };
    }
    if (unspent >= better.cost + t.cost) {
      return {
        buy: true,
        label: "Buy, after Golden Bot",
        reason: `${better.count} Golden Bot upgrade${better.count === 1 ? "" : "s"} (${fmtMedals(better.cost)} medals) pay more, but your ${fmtMedals(unspent)} unspent covers them and this too.`,
      };
    }
    return {
      buy: false,
      label: "Golden Bot first",
      reason: `${better.count} Golden Bot upgrade${better.count === 1 ? "" : "s"} (${fmtMedals(better.cost)} medals) pay more per medal than this, and you can't afford both.`,
    };
  };
  const verdicts = { background: verdictFor(background), skin: verdictFor(skin) };

  // --- Chart: marginal Golden Bot value along the upgrade path vs. the flat theme rates ---
  const chartData = pricedPath.map((st) => ({
    medals: st.cumulative,
    label: `${fmtMedals(st.cumulative)} · ${st.upgrade} ${st.from}→${st.to}`,
    "Golden Bot upgrade": round(st.ratePer100, 4),
  }));
  const chartMax = Math.max(
    background.ratePer100,
    skin.ratePer100,
    ...pricedPath.map((st) => st.ratePer100),
    0.01,
  );

  const rateCell = (rate: number, reference: number) => (
    <Text span size="sm" fw={600} c={rate > reference + 1e-12 ? "green" : "red"}>
      {fmtRate(rate)}
    </Text>
  );

  return (
    <Stack gap="xl">
      <Stack gap={4}>
        <Title order={1}>Themes vs. Golden Bot</Title>
        <Text c="dimmed">
          The Tower — are the event themes (background +{BACKGROUND.bonus}% coins for {BACKGROUND.cost}{" "}
          medals, tower skin +{SKIN.bonus}% for {SKIN.cost}) worth more than putting the same medals
          into Golden Bot?
        </Text>
      </Stack>

      <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg" verticalSpacing="lg">
        <SectionCard title="Themes" trailing={<Badge variant="light">{fmtMult(themesTotal)} total</Badge>}>
          <Stack gap="md">
            <NumberField
              label="Themes bonus"
              hint="Total coin bonus from all your themes, as a multiplier"
              value={themesTotal}
              min={1}
              max={THEME_MAX}
              step={0.001}
              suffix="×"
              onChange={setThemesTotal}
            />
            <Divider />
            <DataTable
              headers={["Per event", "Coins", "Medals"]}
              align={["left", "right", "right"]}
              rows={[
                [BACKGROUND.name, `+${BACKGROUND.bonus}%`, fmtMedals(BACKGROUND.cost)],
                [SKIN.name, `+${SKIN.bonus}%`, fmtMedals(SKIN.cost)],
              ]}
            />
            <Text size="xs" c="dimmed">
              Every event sells one of each. The bonus is added to your themes total above.
            </Text>
          </Stack>
        </SectionCard>

        <SectionCard
          title="Golden Bot stats"
          trailing={
            <Badge variant="light" title="Shared with the Golden Bot + Gilded Sniper planner">
              {fmtMedals(spentSoFar)} spent
            </Badge>
          }
        >
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
          trailing={<Badge variant={sniper.chance > 0 ? "filled" : "light"}>{sniper.chance}% sniper</Badge>}
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
            <Divider />
            <NumberField
              label="Coins earned while Golden Bot is active"
              hint={`100% = all income lands in the bot's window (the planner's assumption). ${fmtPct(uptime, 0)} (the uptime) = coins spread evenly over the run.`}
              value={coinShare}
              min={0}
              max={100}
              suffix="%"
              onChange={setCoinShare}
            />
          </Stack>
        </SectionCard>
      </SimpleGrid>

      <Stack gap="sm">
        <Title order={2}>Coins per 100 medals</Title>
        <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md">
          <Stat
            value={fmtRate(background.ratePer100)}
            label={`Background · +${BACKGROUND.bonus}% for ${fmtMedals(BACKGROUND.cost)}`}
            color={verdicts.background.buy ? "green" : undefined}
          />
          <Stat
            value={fmtRate(skin.ratePer100)}
            label={`Tower skin · +${SKIN.bonus}% for ${fmtMedals(SKIN.cost)}`}
            color={verdicts.skin.buy ? "green" : undefined}
          />
          <Stat
            value={botMaxed ? "—" : fmtRate(nextStep!.ratePer100)}
            label={
              botMaxed
                ? "Golden Bot · maxed"
                : `Golden Bot · next: ${nextStep!.upgrade} ${nextStep!.from}→${nextStep!.to} for ${fmtMedals(nextStep!.cost)}`
            }
            color="blue"
          />
        </SimpleGrid>
        <Text size="xs" c="dimmed">
          How many % more coins per run each option adds for every 100 medals. A theme adds its
          bonus on top of your {fmtMult(themesTotal)} total, so it is worth {fmtGain(background.gain)}{" "}
          coins (background) or {fmtGain(skin.gain)} (skin). A Golden Bot level moves your avg coin ×
          while active from {fmtMult(current.value)}
          {nextStep ? ` to ${fmtMult(nextStep.after.value)}` : ""}, which is{" "}
          {nextStep ? fmtGain(nextStep.gain) : "—"} coins when {coinShare}% of income is earned while
          the bot is active.
        </Text>
      </Stack>

      <Stack gap="sm">
        <Title order={2}>Verdict</Title>
        <DataTable
          headers={["Option", "Cost", "Coin gain", "Per 100 medals", "Medals per +1%", "Verdict"]}
          align={["left", "right", "right", "right", "right", "left"]}
          rows={[
            ...priced.map((t) => {
              const v = verdicts[t.id];
              return [
                <Text key="n" span size="sm" fw={600}>
                  {t.name}
                </Text>,
                fmtMedals(t.cost),
                fmtGain(t.gain),
                nextStep ? rateCell(t.ratePer100, nextStep.ratePer100) : fmtRate(t.ratePer100),
                medalsPerPercent(t.ratePer100),
                <Stack key="v" gap={2}>
                  <Badge variant="light" color={v.buy ? "green" : "orange"} style={{ width: "fit-content" }}>
                    {v.label}
                  </Badge>
                  <Text size="xs" c="dimmed">
                    {v.reason}
                  </Text>
                </Stack>,
              ];
            }),
            [
              <Text key="n" span size="sm" fw={600}>
                Both themes this event
              </Text>,
              fmtMedals(BACKGROUND.cost + SKIN.cost),
              fmtGain(eventBundle.gain),
              nextStep ? rateCell(eventBundle.ratePer100, nextStep.ratePer100) : fmtRate(eventBundle.ratePer100),
              medalsPerPercent(eventBundle.ratePer100),
              <Text key="v" size="xs" c="dimmed">
                Background and skin together
              </Text>,
            ],
            [
              <Text key="n" span size="sm" fw={600}>
                Golden Bot, next upgrade
              </Text>,
              nextStep ? fmtMedals(nextStep.cost) : "—",
              nextStep ? fmtGain(nextStep.gain) : "—",
              nextStep ? fmtRate(nextStep.ratePer100) : "—",
              nextStep ? medalsPerPercent(nextStep.ratePer100) : "—",
              <Text key="v" size="xs" c="dimmed">
                {nextStep ? `${nextStep.upgrade} ${nextStep.from} → ${nextStep.to}` : "Range and bonus are both maxed"}
              </Text>,
            ],
          ]}
        />
        <Text size="xs" c="dimmed">
          Green rates beat your next Golden Bot upgrade, red ones don't. Themes are only on offer
          during their event while Golden Bot can be bought any time, so "Buy, after Golden Bot"
          means: the better bot upgrades and the theme both fit in your unspent medals, so buy the
          bot levels first and still take the theme before the event ends.
        </Text>
      </Stack>

      {coverageAboveUptime && (
        <Alert variant="light" color="red" title="Kills in range exceeds uptime">
          {fmtPct(coverage)} of kills can't be inside the range if the bot is only active{" "}
          {fmtPct(uptime)} of the time. Check the duration, cooldown, or the battle-report value.
          Coverage is capped at uptime.
        </Alert>
      )}

      {shareBelowUptime && (
        <Alert variant="light" color="orange" title="Coin share is below uptime">
          The bot is active {fmtPct(uptime)} of the time, so less than that share of coins in its
          window would mean the bot fires when income is below average. Usually it is at least the
          uptime.
        </Alert>
      )}

      {overspent && (
        <Alert variant="light" color="red" title="Total is below what you've spent">
          Your current levels cost {fmtMedals(spentSoFar)} medals, more than the total entered.
          Raise the total or lower the levels.
        </Alert>
      )}

      <Stack gap="xs">
        <Group align="center" gap="sm">
          <Title order={2}>Where the themes fall in the Golden Bot path</Title>
          {!botMaxed && (
            <Badge variant="light" color="blue">
              {stepsBeating(background).count} of {path.length} upgrades beat the background,{" "}
              {stepsBeating(skin).count} beat the skin
            </Badge>
          )}
        </Group>
        {pricedPath.length > 0 ? (
          <>
            <LineChart
              h={280}
              data={chartData}
              dataKey="medals"
              series={[{ name: "Golden Bot upgrade", color: "blue.6" }]}
              curveType="stepAfter"
              withDots={pricedPath.length <= 60}
              yAxisProps={{ domain: [0, round(chartMax * 1.1, 3)] }}
              xAxisProps={{ tickFormatter: (v: number) => fmtMedals(v), type: "number", domain: [0, "dataMax"] }}
              valueFormatter={(v) => fmtRate(v)}
              tooltipProps={{
                labelFormatter: (_label: unknown, payload: Array<{ payload?: { label?: string } }>) =>
                  payload?.[0]?.payload?.label ?? "",
              }}
              referenceLines={[
                {
                  y: round(background.ratePer100, 4),
                  label: `Background ${fmtRate(background.ratePer100)}`,
                  color: "green.6",
                  labelPosition: "insideTopLeft",
                },
                {
                  y: round(skin.ratePer100, 4),
                  label: `Skin ${fmtRate(skin.ratePer100)}`,
                  color: "orange.6",
                  labelPosition: "insideBottomLeft",
                },
              ]}
            />
            <Text size="xs" c="dimmed">
              % more coins per 100 medals of each remaining Golden Bot upgrade, against the medals
              spent to get there from your current levels. The flat lines are the background (green)
              and skin (orange). Golden Bot upgrades above a line are better than that theme, those
              below are worse. Buying a theme lowers its own line only slightly (its bonus is spread
              over a bigger total), so the lines are drawn at your current themes bonus.
            </Text>
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              <DataTable
                headers={["#", "Upgrade", "Level", "Cost", "Total", "Avg coin × while active", "Coin gain", "Per 100 medals", "vs. background", "vs. skin"]}
                align={["right", "left", "right", "right", "right", "right", "right", "right", "left", "left"]}
                highlightRow={(r) => pricedPath[r].cumulative <= unspent}
                rows={pricedPath.map((st: UpgradeStep & Priced) => [
                  String(st.step),
                  <Badge key={st.step} variant="light" color={st.upgrade === "Range" ? "blue" : "orange"}>
                    {st.upgrade}
                  </Badge>,
                  `${st.from} → ${st.to}`,
                  fmtMedals(st.cost),
                  fmtMedals(st.cumulative),
                  fmtMult(st.after.value),
                  fmtGain(st.gain),
                  fmtRate(st.ratePer100),
                  <Badge key="b" variant="light" color={st.ratePer100 > background.ratePer100 + 1e-12 ? "green" : "gray"}>
                    {st.ratePer100 > background.ratePer100 + 1e-12 ? "better" : "worse"}
                  </Badge>,
                  <Badge key="s" variant="light" color={st.ratePer100 > skin.ratePer100 + 1e-12 ? "green" : "gray"}>
                    {st.ratePer100 > skin.ratePer100 + 1e-12 ? "better" : "worse"}
                  </Badge>,
                ])}
              />
            </div>
            <Text size="xs" c="dimmed">
              Every remaining Golden Bot upgrade from your current levels in the planner's order
              (best coin gain per medal first). Highlighted rows are covered by your unspent medals.
            </Text>
          </>
        ) : (
          <Alert variant="light" color="gray" title="Golden Bot is maxed">
            Range and bonus are both at max level, so every medal left goes to themes.
          </Alert>
        )}
      </Stack>

      <Alert variant="light" color="orange" title="Model assumptions">
        <Stack gap={4}>
          <Text size="sm">
            • Themes: each theme adds a flat % to one themes total that multiplies all coins. A +
            {BACKGROUND.bonus}% background takes {fmtMult(themesTotal)} to {fmtMult(themesTotal + BACKGROUND.bonus / 100)},
            i.e. {fmtGain(background.gain)} coins, no matter when or where they are earned. The gain
            per theme shrinks a little as the total grows.
          </Text>
          <Text size="sm">
            • Golden Bot: the same model as the Golden Bot + Gilded Sniper planner (avg coin × while
            active = 1 + share of active-time kills getting the bonus × (multiplier − 1), coverage
            scaled with range²). Its inputs are shared with that page.
          </Text>
          <Text size="sm">
            • Whole-run coins from Golden Bot = 1 + coin share × (avg coin × while active − 1). The
            planner assumes all income lands in the bot's window (coin share 100%), which favours
            Golden Bot the most; lower the share if a meaningful part of your coins comes from
            outside it. The share never changes which Golden Bot upgrade is best, only how it
            compares to themes.
          </Text>
          <Text size="sm">
            • Both gains are relative (% more coins per run), so every other coin multiplier
            cancels out. Only Golden Bot range and bonus levels are considered as the
            alternative; duration and cooldown upgrades are not.
          </Text>
          <Text size="sm">
            • Range extrapolation is a rough guide: it assumes kills are spread evenly over the
            bot's circle, which they are not. Golden Bot rates are estimates, theme rates are exact.
          </Text>
        </Stack>
      </Alert>
    </Stack>
  );
}
