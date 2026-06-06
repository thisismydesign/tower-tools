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
  Checkbox,
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
// UI helpers
// ----------------------------------------------------------------------------

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  const theme = useHostTheme();
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <Stack gap={4}>
      <Row align="center" gap={8}>
        <Text size="small" tone="secondary">
          {label}
        </Text>
        <Spacer />
        <div style={{ width: 64 }}>
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
          <Text size="small" tone="tertiary">
            {suffix}
          </Text>
        ) : null}
      </Row>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(clamp(Number((e.target as HTMLInputElement).value)))}
        style={{ width: "100%", accentColor: theme.accent.primary, cursor: "pointer" }}
      />
    </Stack>
  );
}

function TrackCard({
  title,
  tone,
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
  tone: "info" | "warning";
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
    <Card>
      <CardHeader trailing={<Pill tone={tone} active={enabled}>{enabled ? "On" : "Off"}</Pill>}>
        {title}
      </CardHeader>
      <CardBody>
        <Stack gap={12}>
          <Checkbox checked={enabled} onChange={setEnabled} label="Include in calculation" />
          <SliderRow
            label="Starting level skip"
            value={startLevel}
            min={0}
            max={MAX_LEVEL}
            onChange={setStartLevel}
          />
          <SliderRow
            label="Cash upgrades (levels added at start)"
            value={cash}
            min={0}
            max={MAX_LEVEL}
            onChange={setCash}
          />
          <SliderRow
            label="Flat skip bonus (modules, labs, relics)"
            value={flat}
            min={0}
            max={12}
            suffix="%"
            onChange={setFlat}
          />
          <Divider />
          <Row gap={8} wrap>
            <Text size="small" tone="tertiary">
              Start chance <Text size="small" weight="semibold">{round(result.startChance, 3)}%</Text>
            </Text>
            <Text size="small" tone="tertiary">
              · Final chance <Text size="small" weight="semibold">{round(result.finalChance, 3)}%</Text>
            </Text>
          </Row>
        </Stack>
      </CardBody>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Canvas
// ----------------------------------------------------------------------------

export default function EnemyLevelSkipPlanner() {
  const theme = useHostTheme();

  const [tierId, setTierId] = useCanvasState("tierId", "champion");
  const [bolt, setBolt] = useCanvasState("bolt", 9); // shared workshop enhancement
  const [freePct, setFreePct] = useCanvasState("freePct", 83);
  const [waves, setWaves] = useCanvasState("waves", 1000);

  const [healthOn, setHealthOn] = useCanvasState("healthOn", true);
  const [healthStart, setHealthStart] = useCanvasState("healthStart", 320);
  const [healthFlat, setHealthFlat] = useCanvasState("healthFlat", 10);
  const [healthCash, setHealthCash] = useCanvasState("healthCash", 50);

  const [attackOn, setAttackOn] = useCanvasState("attackOn", true);
  const [attackStart, setAttackStart] = useCanvasState("attackStart", 250);
  const [attackFlat, setAttackFlat] = useCanvasState("attackFlat", 12);
  const [attackCash, setAttackCash] = useCanvasState("attackCash", 0);

  const tier = TIERS.find((t) => t.id === tierId) ?? TIERS[4];
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

  // Charts share the wave axis from whichever enabled track has it; both use
  // the same wave count so sampling is identical.
  const categories = (healthOn ? health : attack).sampleWaves.map((w) => String(w));

  const chanceSeries = [
    healthOn ? { name: "Health skip", data: health.chanceSeries, tone: "info" as const } : null,
    attackOn ? { name: "Attack skip", data: attack.chanceSeries, tone: "warning" as const } : null,
  ].filter((s): s is { name: string; data: number[]; tone: "info" | "warning" } => s !== null);

  const cumSeries = [
    healthOn ? { name: "Health skip", data: health.cumSeries, tone: "info" as const } : null,
    attackOn ? { name: "Attack skip", data: attack.cumSeries, tone: "warning" as const } : null,
  ].filter((s): s is { name: string; data: number[]; tone: "info" | "warning" } => s !== null);

  const anyOn = healthOn || attackOn;
  const hasWaves = waves > 0;

  return (
    <Stack gap={20} style={{ padding: 4 }}>
      <Stack gap={4}>
        <H1>Enemy Level Skip Planner</H1>
        <Text tone="secondary">
          The Tower — projects health & attack level-skip chance across a run as free upgrades
          raise the skip level each wave and tournament reductions pull it back down.
        </Text>
      </Stack>

      {/* Controls */}
      <Grid columns="minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)" gap={16} align="start">
        <Card>
          <CardHeader trailing={<Pill size="sm">{tier.name}</Pill>}>Run settings</CardHeader>
          <CardBody>
            <Stack gap={14}>
              <Stack gap={4}>
                <Text size="small" tone="secondary">
                  Tournament tier (skip reduction)
                </Text>
                <Select
                  value={tierId}
                  onChange={setTierId}
                  options={TIERS.map((t) => ({ value: t.id, label: t.name }))}
                />
              </Stack>
              <SliderRow
                label="Bolt — workshop enhancement"
                value={bolt}
                min={0}
                max={MAX_WORKSHOP}
                suffix={`(×${round(workshopMult(bolt))})`}
                onChange={setBolt}
              />
              <SliderRow
                label="Free utility upgrade (levels/wave)"
                value={freePct}
                min={0}
                max={300}
                suffix={`%  (${round(freeRate)}/wave total)`}
                onChange={setFreePct}
              />
              <SliderRow
                label="Waves survived"
                value={waves}
                min={0}
                max={3000}
                step={10}
                onChange={setWaves}
              />
            </Stack>
          </CardBody>
        </Card>

        <TrackCard
          title="Enemy health level skip"
          tone="info"
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
          tone="warning"
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
      </Grid>

      {/* Summary */}
      {anyOn && hasWaves && (
        <Stack gap={10}>
          <H2>Run totals</H2>
          <Grid columns={healthOn && attackOn ? 4 : 2} gap={16}>
            {healthOn && (
              <>
                <Stat
                  value={Math.round(health.cumulative).toLocaleString()}
                  label="Total health skips"
                  tone="info"
                />
                <Stat
                  value={health.maxedWave > 0 ? `wave ${health.maxedWave}` : "never"}
                  label="Health maxes out (lvl 699)"
                />
              </>
            )}
            {attackOn && (
              <>
                <Stat
                  value={Math.round(attack.cumulative).toLocaleString()}
                  label="Total attack skips"
                  tone="warning"
                />
                <Stat
                  value={attack.maxedWave > 0 ? `wave ${attack.maxedWave}` : "never"}
                  label="Attack maxes out (lvl 699)"
                />
              </>
            )}
          </Grid>
        </Stack>
      )}

      {/* Charts */}
      {anyOn && hasWaves && categories.length > 1 && (
        <Grid columns="minmax(0, 1fr) minmax(0, 1fr)" gap={16}>
          <Stack gap={6}>
            <H2>Skip chance over the run</H2>
            <LineChart categories={categories} series={chanceSeries} valueSuffix="%" height={260} />
            <Text size="small" tone="tertiary">
              Per-wave skip chance (%) vs. wave number. Rises as free upgrades push the level toward
              699, then bends down as the tier subtraction grows. Tier: {tier.name}.
            </Text>
          </Stack>
          <Stack gap={6}>
            <H2>Cumulative level skips</H2>
            <LineChart categories={categories} series={cumSeries} height={260} />
            <Text size="small" tone="tertiary">
              Expected total level skips (count) vs. wave number, summing per-wave chance. Tier:{" "}
              {tier.name}.
            </Text>
          </Stack>
        </Grid>
      )}

      {(!anyOn || !hasWaves) && (
        <Callout tone="neutral" title="Nothing to plot">
          {hasWaves
            ? "Enable at least one skip track (health or attack) to see results."
            : "Set waves above 0 to run the simulation."}
        </Callout>
      )}

      {/* Tier reference */}
      <Stack gap={6}>
        <H2>Tournament skip-reduction values</H2>
        <Table
          headers={["League", "Skip Reduction (×)", "Skip Decay", "Every N waves", "Decay @ wave 1000"]}
          columnAlign={["left", "right", "right", "right", "right"]}
          rowTone={TIERS.map((t) => (t.id === tierId ? "info" : undefined))}
          rows={TIERS.map((t) => [
            t.name,
            `×${t.multiply}`,
            t.subPerStep > 0 ? `−${t.subPerStep}%` : "—",
            t.subPerStep > 0 ? String(t.stepWaves) : "—",
            t.subPerStep > 0 ? `−${round(t.subPerStep * Math.floor(1000 / t.stepWaves), 1)}%` : "—",
          ])}
        />
        <Text size="small" tone="tertiary">
          Skip Reduction (multiply) is tied to the BC level set by league: Gold ×0.9, Platinum ×0.75,
          Champion ×0.6, Legends ×0.45. Skip Decay subtracts 1% every N waves: Gold 80, Platinum 60,
          Champion 40, Legends 20. BC levels are fixed by league and don't grow during the run.
        </Text>
      </Stack>

      <Callout tone="warning" title="Model assumptions (tell me to change any)">
        <Stack gap={4}>
          <Text size="small">
            • Level → chance: <Text size="small" weight="semibold">0.1% + (level − 1) × 0.05%</Text>{" "}
            (level 1 = 0.10%, level 10 = 0.55%, +0.5% per 10 levels). Max level 699 ≈ 35.0%.
          </Text>
          <Text size="small">
            • Workshop multiplier: <Text size="small" weight="semibold">1 + level × 0.01</Text> (level
            60 = ×1.60).
          </Text>
          <Text size="small">
            • Free utility upgrade % = total skip levels gained per wave (100% = 1 level/wave).
            Split 50/50 between included tracks below 699; if one track is excluded or hits the 699
            cap, the other receives the full rate and levels up twice as fast.
          </Text>
          <Text size="small">
            • Flat skip bonus (modules / labs / relics) is added to the level-derived chance per
            track, then the reductions apply to the total.
          </Text>
          <Text size="small">
            • Cash upgrades = levels bought during the run (per track), applied once at the start as
            a boost to that track's starting level, capped at 699.
          </Text>
          <Text size="small">
            • Reduction order per wave: <Text size="small" weight="semibold">(level chance + flat) ×
            Skip Reduction − Skip Decay(wave)</Text>, where Skip Decay subtracts a cumulative 1% every
            N waves (N set by league).
          </Text>
          <Text size="small">
            • "Total skips" = expected count = sum of per-wave skip chances over all waves.
          </Text>
        </Stack>
      </Callout>
    </Stack>
  );
}
