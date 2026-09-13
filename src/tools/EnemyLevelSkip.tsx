import {
  Alert,
  Badge,
  Checkbox,
  Divider,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { LineChart } from "@mantine/charts";
import { Fragment } from "react";

import { useLocalStorage } from "@mantine/hooks";

import { DataTable, SectionCard, SliderField, Stat } from "../components";

/** Inputs survive reloads under `enemy-level-skip:<key>` in localStorage. */
function useSetting<T>(key: string, defaultValue: T) {
  return useLocalStorage<T>({ key: `enemy-level-skip:${key}`, defaultValue, getInitialValueInEffect: false });
}

// ----------------------------------------------------------------------------
// Game model
//
// Level -> skip chance (per the values you gave):
//   level 1   = 0.10%
//   level 10  = 0.55%
//   thereafter every 10 levels adds 0.50%  (i.e. +0.05% per level)
// => chance(L) = 0.10 + (L - 1) * 0.05   [percent]
//
// Workshop enhancement multiplier:
//   level 1  = 1% increase, +1% per level, up to level 60 = 1.60x
// => mult(W) = 1 + W * 0.01
//
// Free (utility) upgrade: a % slider (0-300%) interpreted as the number of
// skip levels gained per wave. 100% = 1 level/wave, 300% = 3 levels/wave.
//
// Skip reduction (tournament-league dependent). Two Battle Conditions:
//   Skip Reduction (multiply): skip chance is multiplied by x0.VAL (one-time
//     factor). VAL is tied to the BC level (set by league) and impacted by the
//     Skip Reduction Lab + the generic BC reduction lab.
//   Skip Decay: skip chance has VAL% subtracted, growing every N waves. VAL
//     starts at 1% (impacted by the generic BC reduction lab); N is set by the
//     BC level (league). The BC level is fixed by league and does not increase
//     during the run (like More Bosses).
// ----------------------------------------------------------------------------

const MAX_LEVEL = 699;
const MAX_WORKSHOP = 60;

function chanceFromLevel(level: number): number {
  if (level <= 0) return 0;
  return 0.1 + (level - 1) * 0.05; // percent
}

function workshopMult(workshop: number): number {
  return 1 + workshop * 0.01;
}

interface Tier {
  id: string;
  name: string;
  multiply: number; // Skip Reduction (multiply): skip chance * multiply
  subPerStep: number; // Skip Decay: percent subtracted per step
  stepWaves: number; // a decay step is reached every this many waves (N)
}

// Confirmed values per tournament league. Copper/Silver have no skip-reduction
// Battle Conditions (no multiply, no decay).
const TIERS: Tier[] = [
  { id: "copper", name: "Copper", multiply: 1.0, subPerStep: 0, stepWaves: 1 },
  { id: "silver", name: "Silver", multiply: 1.0, subPerStep: 0, stepWaves: 1 },
  { id: "gold", name: "Gold", multiply: 0.9, subPerStep: 1, stepWaves: 80 },
  { id: "platinum", name: "Platinum", multiply: 0.75, subPerStep: 1, stepWaves: 60 },
  { id: "champion", name: "Champion", multiply: 0.6, subPerStep: 1, stepWaves: 40 },
  { id: "legends", name: "Legends", multiply: 0.45, subPerStep: 1, stepWaves: 20 },
];

function round(n: number, d = 2): number {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

interface TrackResult {
  cumulative: number; // expected total level skips over the run
  peak: number; // highest per-wave skip chance (%)
  peakWave: number;
  maxedWave: number; // first wave the level cap (699) is reached, 0 if never
  finalChance: number; // skip chance (%) on the last wave
  startChance: number; // skip chance (%) at wave 1
  sampleWaves: number[];
  chanceSeries: number[]; // skip chance (%) at each sampled wave
  cumSeries: number[]; // cumulative expected skips at each sampled wave
}

interface TrackInput {
  startLevel: number;
  workshop: number;
  flat: number; // flat % skip bonus (modules / labs / relics)
}

// `flat` is added to the level-derived chance, then the tier reductions
// (overheat multiply + skip decay) apply to the whole sum.
function waveChance(
  level: number,
  wmult: number,
  flat: number,
  tier: Tier,
  wave: number,
): number {
  const base = chanceFromLevel(level) * wmult + flat;
  const afterMultiply = base * tier.multiply;
  const subtract = tier.subPerStep * Math.floor(wave / tier.stepWaves);
  return Math.max(0, Math.min(100, afterMultiply - subtract));
}

function newAcc(): TrackResult {
  return {
    cumulative: 0,
    peak: 0,
    peakWave: 0,
    maxedWave: 0,
    finalChance: 0,
    startChance: 0,
    sampleWaves: [],
    chanceSeries: [],
    cumSeries: [],
  };
}

function record(
  acc: TrackResult,
  level: number,
  wmult: number,
  flat: number,
  tier: Tier,
  w: number,
  waves: number,
  step: number,
): void {
  if (acc.maxedWave === 0 && level >= MAX_LEVEL) acc.maxedWave = w;
  const chance = waveChance(level, wmult, flat, tier, w);
  acc.cumulative += chance / 100;
  if (chance > acc.peak) {
    acc.peak = chance;
    acc.peakWave = w;
  }
  if (w === 1) acc.startChance = chance;
  acc.finalChance = chance;
  if (w === 1 || w === waves || w % step === 0) {
    acc.sampleWaves.push(w);
    acc.chanceSeries.push(round(chance, 3));
    acc.cumSeries.push(round(acc.cumulative, 1));
  }
}

// Coupled simulation. Free upgrades go only to tracks that are both included
// and below the 699 cap; they split 50/50 when both qualify, otherwise the
// single qualifying track receives the full rate (and levels up twice as fast).
function simulateBoth(
  h: TrackInput,
  a: TrackInput,
  hEnabled: boolean,
  aEnabled: boolean,
  freeRate: number,
  waves: number,
  tier: Tier,
): { health: TrackResult; attack: TrackResult } {
  const hMult = workshopMult(h.workshop);
  const aMult = workshopMult(a.workshop);
  const step = Math.max(1, Math.floor(waves / 60));

  let hLevel = h.startLevel;
  let aLevel = a.startLevel;

  const H = newAcc();
  const A = newAcc();

  for (let w = 1; w <= waves; w++) {
    const hActive = hEnabled && hLevel < MAX_LEVEL;
    const aActive = aEnabled && aLevel < MAX_LEVEL;

    if (hActive && aActive) {
      hLevel += freeRate / 2;
      aLevel += freeRate / 2;
    } else if (hActive) {
      hLevel += freeRate;
    } else if (aActive) {
      aLevel += freeRate;
    }
    if (hLevel > MAX_LEVEL) hLevel = MAX_LEVEL;
    if (aLevel > MAX_LEVEL) aLevel = MAX_LEVEL;

    record(H, hLevel, hMult, h.flat, tier, w, waves, step);
    record(A, aLevel, aMult, a.flat, tier, w, waves, step);
  }

  return { health: H, attack: A };
}

// ----------------------------------------------------------------------------
// UI
// ----------------------------------------------------------------------------

const HEALTH_COLOR = "blue";
const ATTACK_COLOR = "orange";
const DEFAULT_TIER_ID = "champion";

function TrackCard({
  title,
  color,
  enabled,
  setEnabled,
  startLevel,
  setStartLevel,
  cash,
  setCash,
  flat,
  setFlat,
  result,
}: {
  title: string;
  color: string;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  startLevel: number;
  setStartLevel: (v: number) => void;
  cash: number;
  setCash: (v: number) => void;
  flat: number;
  setFlat: (v: number) => void;
  result: TrackResult;
}) {
  return (
    <SectionCard
      title={title}
      trailing={
        <Badge color={color} variant={enabled ? "filled" : "light"}>
          {enabled ? "On" : "Off"}
        </Badge>
      }
    >
      <Stack gap="md">
        <Checkbox
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
          label="Include in calculation"
        />
        <SliderField
          label="Starting level skip"
          value={startLevel}
          min={0}
          max={MAX_LEVEL}
          onChange={setStartLevel}
        />
        <SliderField
          label="Cash upgrades (levels added at start)"
          value={cash}
          min={0}
          max={MAX_LEVEL}
          onChange={setCash}
        />
        <SliderField
          label="Flat skip bonus (modules, labs, relics)"
          value={flat}
          min={0}
          max={12}
          suffix="%"
          onChange={setFlat}
        />
        <Divider />
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            Start chance{" "}
            <Text span size="xs" fw={600}>
              {round(result.startChance, 3)}%
            </Text>
          </Text>
          <Text size="xs" c="dimmed">
            · Final chance{" "}
            <Text span size="xs" fw={600}>
              {round(result.finalChance, 3)}%
            </Text>
          </Text>
        </Group>
      </Stack>
    </SectionCard>
  );
}

export default function EnemyLevelSkip() {
  const [tierId, setTierId] = useSetting("tierId", DEFAULT_TIER_ID);
  const [bolt, setBolt] = useSetting("bolt", 9); // shared workshop enhancement
  const [freePct, setFreePct] = useSetting("freePct", 83);
  const [waves, setWaves] = useSetting("waves", 1000);

  const [healthOn, setHealthOn] = useSetting("healthOn", true);
  const [healthStart, setHealthStart] = useSetting("healthStart", 320);
  const [healthFlat, setHealthFlat] = useSetting("healthFlat", 10);
  const [healthCash, setHealthCash] = useSetting("healthCash", 50);

  const [attackOn, setAttackOn] = useSetting("attackOn", true);
  const [attackStart, setAttackStart] = useSetting("attackStart", 250);
  const [attackFlat, setAttackFlat] = useSetting("attackFlat", 12);
  const [attackCash, setAttackCash] = useSetting("attackCash", 0);

  const tier = TIERS.find((t) => t.id === tierId) ?? TIERS.find((t) => t.id === DEFAULT_TIER_ID)!;
  const freeRate = freePct / 100;

  // Cash upgrades are levels bought during the run, modeled as a one-time boost
  // to the starting level (per track), capped at 699.
  const healthStartEff = Math.min(MAX_LEVEL, healthStart + healthCash);
  const attackStartEff = Math.min(MAX_LEVEL, attackStart + attackCash);

  // While both tracks are below the cap they split 50/50; once one maxes out
  // (level 699) the other track receives the full rate. Resolved in one
  // coupled pass over the waves.
  const { health, attack } = simulateBoth(
    { startLevel: healthStartEff, workshop: bolt, flat: healthFlat },
    { startLevel: attackStartEff, workshop: bolt, flat: attackFlat },
    healthOn,
    attackOn,
    freeRate,
    waves,
    tier,
  );

  const tracks = [
    { name: "Health skip", label: "health", color: HEALTH_COLOR, result: health, on: healthOn },
    { name: "Attack skip", label: "attack", color: ATTACK_COLOR, result: attack, on: attackOn },
  ].filter((t) => t.on);

  // Both tracks share the wave axis and sampling, so any enabled one supplies it.
  const sampleWaves = tracks[0]?.result.sampleWaves ?? [];
  const chartSeries = tracks.map(({ name, color }) => ({ name, color }));
  const chartRows = (pick: (r: TrackResult) => number[]) =>
    sampleWaves.map((wave, i) => ({
      wave: String(wave),
      ...Object.fromEntries(tracks.map((t) => [t.name, pick(t.result)[i]])),
    }));

  const anyOn = tracks.length > 0;
  const hasWaves = waves > 0;

  return (
    <Stack gap="xl">
      <Stack gap={4}>
        <Title order={1}>Enemy Level Skip Planner</Title>
        <Text c="dimmed">
          The Tower — projects health &amp; attack level-skip chance across a run as free upgrades
          raise the skip level each wave and tournament reductions pull it back down.
        </Text>
      </Stack>

      {/* Controls */}
      <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg" verticalSpacing="lg">
        <SectionCard title="Run settings" trailing={<Badge variant="light">{tier.name}</Badge>}>
          <Stack gap="md">
            <Select
              label="Tournament tier (skip reduction)"
              value={tierId}
              onChange={(v) => v && setTierId(v)}
              data={TIERS.map((t) => ({ value: t.id, label: t.name }))}
              allowDeselect={false}
            />
            <SliderField
              label="Workshop enhancement"
              value={bolt}
              min={0}
              max={MAX_WORKSHOP}
              suffix={`(×${round(workshopMult(bolt))})`}
              onChange={setBolt}
            />
            <SliderField
              label="Free utility upgrade (levels/wave)"
              value={freePct}
              min={0}
              max={300}
              suffix={`% (${round(freeRate)}/wave)`}
              onChange={setFreePct}
            />
            <SliderField
              label="Waves survived"
              value={waves}
              min={0}
              max={3000}
              step={10}
              onChange={setWaves}
            />
          </Stack>
        </SectionCard>

        <TrackCard
          title="Enemy health level skip"
          color={HEALTH_COLOR}
          enabled={healthOn}
          setEnabled={setHealthOn}
          startLevel={healthStart}
          setStartLevel={setHealthStart}
          cash={healthCash}
          setCash={setHealthCash}
          flat={healthFlat}
          setFlat={setHealthFlat}
          result={health}
        />

        <TrackCard
          title="Enemy attack level skip"
          color={ATTACK_COLOR}
          enabled={attackOn}
          setEnabled={setAttackOn}
          startLevel={attackStart}
          setStartLevel={setAttackStart}
          cash={attackCash}
          setCash={setAttackCash}
          flat={attackFlat}
          setFlat={setAttackFlat}
          result={attack}
        />
      </SimpleGrid>

      {/* Summary */}
      {anyOn && hasWaves && (
        <Stack gap="sm">
          <Title order={2}>Run totals</Title>
          <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }} spacing="lg">
            {tracks.map(({ label, color, result }) => (
              <Fragment key={label}>
                <Stat
                  value={Math.round(result.cumulative).toLocaleString()}
                  label={`Total ${label} skips`}
                  color={color}
                />
                <Stat
                  value={result.maxedWave > 0 ? `wave ${result.maxedWave}` : "never"}
                  label={`${label[0].toUpperCase()}${label.slice(1)} maxes out (lvl ${MAX_LEVEL})`}
                />
              </Fragment>
            ))}
          </SimpleGrid>
        </Stack>
      )}

      {/* Charts */}
      {anyOn && hasWaves && sampleWaves.length > 1 && (
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
          <Stack gap="xs">
            <Title order={2}>Skip chance over the run</Title>
            <LineChart
              h={260}
              data={chartRows((r) => r.chanceSeries)}
              dataKey="wave"
              series={chartSeries}
              curveType="monotone"
              withDots={false}
              withLegend
              unit="%"
            />
            <Text size="xs" c="dimmed">
              Per-wave skip chance (%) vs. wave number. Rises as free upgrades push the level toward
              699, then bends down as the tier subtraction grows. Tier: {tier.name}.
            </Text>
          </Stack>
          <Stack gap="xs">
            <Title order={2}>Cumulative level skips</Title>
            <LineChart
              h={260}
              data={chartRows((r) => r.cumSeries)}
              dataKey="wave"
              series={chartSeries}
              curveType="monotone"
              withDots={false}
              withLegend
            />
            <Text size="xs" c="dimmed">
              Expected total level skips (count) vs. wave number, summing per-wave chance. Tier:{" "}
              {tier.name}.
            </Text>
          </Stack>
        </SimpleGrid>
      )}

      {(!anyOn || !hasWaves) && (
        <Alert variant="light" color="gray" title="Nothing to plot">
          {hasWaves
            ? "Enable at least one skip track (health or attack) to see results."
            : "Set waves above 0 to run the simulation."}
        </Alert>
      )}

      {/* Tier reference */}
      <Stack gap="xs">
        <Title order={2}>Tournament skip-reduction values</Title>
        <DataTable
          headers={[
            "League",
            "Skip Reduction (×)",
            "Skip Decay",
            "Every N waves",
            `Decay @ wave ${waves}`,
          ]}
          align={["left", "right", "right", "right", "right"]}
          highlightRow={TIERS.findIndex((t) => t.id === tierId)}
          rows={TIERS.map((t) => [
            t.name,
            `×${t.multiply}`,
            t.subPerStep > 0 ? `−${t.subPerStep}%` : "—",
            t.subPerStep > 0 ? String(t.stepWaves) : "—",
            t.subPerStep > 0 ? `−${round(t.subPerStep * Math.floor(waves / t.stepWaves), 1)}%` : "—",
          ])}
        />
        <Text size="xs" c="dimmed">
          Skip Reduction (multiply) is tied to the BC level set by league: Gold ×0.9, Platinum ×0.75,
          Champion ×0.6, Legends ×0.45. Skip Decay subtracts 1% every N waves: Gold 80, Platinum 60,
          Champion 40, Legends 20. BC levels are fixed by league and don't grow during the run.
        </Text>
      </Stack>

      <Alert variant="light" color="orange" title="Model assumptions (tell me to change any)">
        <Stack gap={4}>
          <Text size="sm">
            • Level → chance:{" "}
            <Text span size="sm" fw={600}>
              0.1% + (level − 1) × 0.05%
            </Text>{" "}
            (level 1 = 0.10%, level 10 = 0.55%, +0.5% per 10 levels). Max level 699 ≈ 35.0%.
          </Text>
          <Text size="sm">
            • Workshop multiplier:{" "}
            <Text span size="sm" fw={600}>
              1 + level × 0.01
            </Text>{" "}
            (level 60 = ×1.60).
          </Text>
          <Text size="sm">
            • Free utility upgrade % = total skip levels gained per wave (100% = 1 level/wave). Split
            50/50 between included tracks below 699; if one track is excluded or hits the 699 cap,
            the other receives the full rate and levels up twice as fast.
          </Text>
          <Text size="sm">
            • Flat skip bonus (modules / labs / relics) is added to the level-derived chance per
            track, then the reductions apply to the total.
          </Text>
          <Text size="sm">
            • Cash upgrades = levels bought during the run (per track), applied once at the start as
            a boost to that track's starting level, capped at 699.
          </Text>
          <Text size="sm">
            • Reduction order per wave:{" "}
            <Text span size="sm" fw={600}>
              (level chance + flat) × Skip Reduction − Skip Decay(wave)
            </Text>
            , where Skip Decay subtracts a cumulative 1% every N waves (N set by league).
          </Text>
          <Text size="sm">
            • "Total skips" = expected count = sum of per-wave skip chances over all waves.
          </Text>
        </Stack>
      </Alert>
    </Stack>
  );
}
