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
  Toggle,
  TextInput,
  Callout,
  Table,
  Divider,
  Pill,
  useCanvasState,
  useHostTheme,
} from "cursor/canvas";

// ----------------------------------------------------------------------------
// Game model
//
// Thorns deal % of enemy max HP per hit. Bosses take 50% of that value.
// Total thorn % = workshop/modules (user input) + armor submod by rarity.
// Tiers 1–13: no thorns/plasma resistance (100% effectiveness).
// Tiers 14+: BC level is resistance; effectiveness = 100 − level (% of normal damage dealt).
// Plasma Cannon fires once when a boss enters range, shaving % of max HP.
// Wall Thorns: when enabled, all thorn damage comes from the wall at
//   wallThorn% of the tower's total thorn value.
// Sharp Fortitude: +1% wall thorn damage per subsequent hit (stacking).
// ----------------------------------------------------------------------------

const THORN_SUBMOD: Record<string, number> = {
  none: 0,
  epic: 2,
  legendary: 4,
  mythic: 7,
  ancestral: 10,
};

const PLASMA_LEVELS = [
  { level: 0, pct: 0, label: "Off" },
  { level: 1, pct: 30, label: "Level 1 (30%)" },
  { level: 2, pct: 34, label: "Level 2 (34%)" },
  { level: 3, pct: 38, label: "Level 3 (38%)" },
  { level: 4, pct: 42, label: "Level 4 (42%)" },
  { level: 5, pct: 46, label: "Level 5 (46%)" },
  { level: 6, pct: 50, label: "Level 6 (50%)" },
  { level: 7, pct: 54, label: "Level 7 (54%)" },
];

interface TierRow {
  tier: number;
  coinBonus: number;
  thornsLvl: number;
  plasmaLvl: number;
}

/** Static tier battle conditions — BC level equals % damage dealt for thorns / plasma. */
const TIERS: TierRow[] = [
  { tier: 1, coinBonus: 1, thornsLvl: 0, plasmaLvl: 0 },
  { tier: 2, coinBonus: 1.8, thornsLvl: 0, plasmaLvl: 0 },
  { tier: 3, coinBonus: 2.6, thornsLvl: 0, plasmaLvl: 0 },
  { tier: 4, coinBonus: 3.4, thornsLvl: 0, plasmaLvl: 0 },
  { tier: 5, coinBonus: 4.2, thornsLvl: 0, plasmaLvl: 0 },
  { tier: 6, coinBonus: 5, thornsLvl: 0, plasmaLvl: 0 },
  { tier: 7, coinBonus: 5.8, thornsLvl: 0, plasmaLvl: 0 },
  { tier: 8, coinBonus: 6.6, thornsLvl: 0, plasmaLvl: 0 },
  { tier: 9, coinBonus: 7.5, thornsLvl: 0, plasmaLvl: 0 },
  { tier: 10, coinBonus: 8.7, thornsLvl: 0, plasmaLvl: 0 },
  { tier: 11, coinBonus: 10.3, thornsLvl: 0, plasmaLvl: 0 },
  { tier: 12, coinBonus: 12.2, thornsLvl: 0, plasmaLvl: 0 },
  { tier: 13, coinBonus: 14.7, thornsLvl: 0, plasmaLvl: 0 },
  { tier: 14, coinBonus: 17.6, thornsLvl: 20, plasmaLvl: 20 },
  { tier: 15, coinBonus: 21.3, thornsLvl: 30, plasmaLvl: 30 },
  { tier: 16, coinBonus: 25.2, thornsLvl: 40, plasmaLvl: 40 },
  { tier: 17, coinBonus: 29.1, thornsLvl: 50, plasmaLvl: 50 },
  { tier: 18, coinBonus: 33.0, thornsLvl: 60, plasmaLvl: 60 },
  { tier: 19, coinBonus: 40, thornsLvl: 70, plasmaLvl: 70 },
  { tier: 20, coinBonus: 48, thornsLvl: 80, plasmaLvl: 80 },
  { tier: 21, coinBonus: 60, thornsLvl: 90, plasmaLvl: 90 },
];

function effectivenessPct(bcLvl: number): number {
  return bcLvl === 0 ? 100 : 100 - bcLvl;
}

function round(n: number, d = 2): number {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

function hitsToKill(baseDamagePct: number, sharpFortitude: boolean): number {
  if (baseDamagePct <= 0) return Infinity;
  let hp = 100;
  let hit = 0;
  while (hp > 0 && hit < 10_000) {
    hit += 1;
    const stackMult = sharpFortitude ? 1 + (hit - 1) * 0.01 : 1;
    hp -= baseDamagePct * stackMult;
  }
  return hit;
}

function formatHits(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return String(n);
}

interface CalcInput {
  thornPct: number;
  submodKey: string;
  tier: number;
  plasmaLevel: number;
  sharpFortitude: boolean;
  wallEnabled: boolean;
  wallThornPct: number;
}

interface CalcResult {
  totalThornPct: number;
  thornsEffPct: number;
  plasmaEffPct: number;
  towerThornEffPct: number;
  perHitEnemyPct: number;
  perHitBossPct: number;
  enemyHits: number;
  bossHits: number;
  bossHpAfterPlasma: number;
  plasmaDamagePct: number;
  bossHitRows: string[][];
}

function calculate(input: CalcInput): CalcResult {
  const submod = THORN_SUBMOD[input.submodKey] ?? 0;
  const totalThornPct = input.thornPct + submod;
  const tierRow = TIERS.find((t) => t.tier === input.tier) ?? TIERS[0];
  const thornsEff = effectivenessPct(tierRow.thornsLvl) / 100;
  const plasmaEff = effectivenessPct(tierRow.plasmaLvl) / 100;

  const towerThornEffPct = totalThornPct * thornsEff;
  const thornSourcePct = input.wallEnabled
    ? towerThornEffPct * (input.wallThornPct / 100)
    : towerThornEffPct;

  const perHitEnemyPct = thornSourcePct;
  const perHitBossPct = thornSourcePct * 0.5;

  const plasmaBase = PLASMA_LEVELS.find((p) => p.level === input.plasmaLevel)?.pct ?? 0;
  const plasmaDamagePct = plasmaBase * plasmaEff;
  const bossHpAfterPlasma = Math.max(0, 100 - plasmaDamagePct);

  let bossHits = 0;
  let hp = bossHpAfterPlasma;
  const bossHitRows: string[][] = [];

  if (perHitBossPct <= 0) {
    bossHits = Infinity;
  } else {
    while (hp > 0 && bossHits < 10_000) {
      bossHits += 1;
      const stackMult = input.sharpFortitude && input.wallEnabled ? 1 + (bossHits - 1) * 0.01 : 1;
      const dealt = perHitBossPct * stackMult;
      hp -= dealt;
      if (bossHitRows.length < 12) {
        bossHitRows.push([
          String(bossHits),
          `${round(dealt, 2)}%`,
          `${round(Math.max(0, hp), 2)}%`,
        ]);
      }
    }
    if (bossHitRows.length === 12 && bossHits > 12) {
      bossHitRows.push(["…", "…", "…"]);
    }
  }

  return {
    totalThornPct,
    thornsEffPct: effectivenessPct(tierRow.thornsLvl),
    plasmaEffPct: effectivenessPct(tierRow.plasmaLvl),
    towerThornEffPct,
    perHitEnemyPct,
    perHitBossPct,
    enemyHits: hitsToKill(perHitEnemyPct, input.sharpFortitude && input.wallEnabled),
    bossHits,
    bossHpAfterPlasma,
    plasmaDamagePct,
    bossHitRows,
  };
}

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

export default function ThornCalculator() {
  const [thornPct, setThornPct] = useCanvasState("thornPct", 99);
  const [submodKey, setSubmodKey] = useCanvasState("submodKey", "ancestral");
  const [tier, setTier] = useCanvasState("tier", 1);
  const [plasmaLevel, setPlasmaLevel] = useCanvasState("plasmaLevel", 7);
  const [sharpFortitude, setSharpFortitude] = useCanvasState("sharpFortitude", false);
  const [wallEnabled, setWallEnabled] = useCanvasState("wallEnabled", false);
  const [wallThornPct, setWallThornPct] = useCanvasState("wallThornPct", 20);

  const result = calculate({
    thornPct,
    submodKey,
    tier,
    plasmaLevel,
    sharpFortitude,
    wallEnabled,
    wallThornPct,
  });

  const hasDamage = result.perHitEnemyPct > 0;

  return (
    <Stack gap={20} style={{ padding: 4 }}>
      <Stack gap={4}>
        <H1>Thorn Calculator</H1>
        <Text tone="secondary">
          The Tower — how many hits to kill regular enemies and bosses with thorns, accounting for
          submods, tier resistance, plasma cannon, wall thorns, and Sharp Fortitude.
        </Text>
      </Stack>

      <Grid columns="repeat(auto-fit, minmax(280px, 1fr))" gap={16} align="start">
        <Card>
          <CardHeader>Thorn setup</CardHeader>
          <CardBody>
            <Stack gap={14}>
              <SliderRow
                label="Thorn damage %"
                value={thornPct}
                min={0}
                max={200}
                onChange={setThornPct}
                suffix="%"
              />
              <Stack gap={4}>
                <Text size="small" tone="secondary">
                  Thorn submod (armor)
                </Text>
                <Select
                  value={submodKey}
                  onChange={setSubmodKey}
                  options={[
                    { value: "none", label: "None" },
                    { value: "epic", label: "Epic (+2%)" },
                    { value: "legendary", label: "Legendary (+4%)" },
                    { value: "mythic", label: "Mythic (+7%)" },
                    { value: "ancestral", label: "Ancestral (+10%)" },
                  ]}
                />
              </Stack>
              <Stack gap={4}>
                <Text size="small" tone="secondary">
                  Tier (thorns & plasma effectiveness)
                </Text>
                <Select
                  value={String(tier)}
                  onChange={(v) => setTier(Number(v))}
                  options={TIERS.map((t) => {
                    const thEff = effectivenessPct(t.thornsLvl);
                    const plEff = effectivenessPct(t.plasmaLvl);
                    return {
                      value: String(t.tier),
                      label:
                        t.thornsLvl > 0
                          ? `Tier ${t.tier} (${thEff}% thorns, ${plEff}% plasma)`
                          : `Tier ${t.tier}`,
                    };
                  })}
                />
              </Stack>
              <Divider />
              <Row align="center" gap={8}>
                <Stack gap={2} style={{ flex: 1 }}>
                  <Text size="small" weight="semibold">
                    Sharp Fortitude
                  </Text>
                  <Text size="small" tone="tertiary">
                    +1% wall thorn damage per subsequent hit
                  </Text>
                </Stack>
                <Toggle checked={sharpFortitude} onChange={setSharpFortitude} />
              </Row>
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader trailing={<Pill active={wallEnabled}>{wallEnabled ? "Wall on" : "Tower"}</Pill>}>
            Wall & boss tools
          </CardHeader>
          <CardBody>
            <Stack gap={14}>
              <Checkbox
                checked={wallEnabled}
                onChange={setWallEnabled}
                label="Damage dealt by wall thorns (not tower)"
              />
              {wallEnabled && (
                <SliderRow
                  label="Wall thorns % of tower thorns"
                  value={wallThornPct}
                  min={1}
                  max={20}
                  onChange={setWallThornPct}
                  suffix="%"
                />
              )}
              <Stack gap={4}>
                <Text size="small" tone="secondary">
                  Plasma Cannon (bosses only)
                </Text>
                <Select
                  value={String(plasmaLevel)}
                  onChange={(v) => setPlasmaLevel(Number(v))}
                  options={PLASMA_LEVELS.map((p) => ({ value: String(p.level), label: p.label }))}
                />
              </Stack>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      {hasDamage && (
        <Stack gap={10}>
          <H2>Hits to kill</H2>
          <Grid columns="repeat(auto-fit, minmax(160px, 1fr))" gap={16}>
            <Stat value={formatHits(result.enemyHits)} label="Regular enemies" tone="info" />
            <Stat value={formatHits(result.bossHits)} label="Bosses" tone="warning" />
            <Stat
              value={`${round(result.totalThornPct)}%`}
              label="Total thorn %"
            />
            <Stat
              value={`${round(result.thornsEffPct)}%`}
              label={`Tier ${tier} thorns effectiveness`}
            />
            <Stat
              value={`${round(result.plasmaEffPct)}%`}
              label={`Tier ${tier} plasma effectiveness`}
            />
          </Grid>

          <Grid columns="repeat(auto-fit, minmax(280px, 1fr))" gap={16} align="start">
            <Card>
              <CardHeader>Regular enemies</CardHeader>
              <CardBody>
                <Stack gap={8}>
                  <Row gap={8} wrap>
                    <Text size="small" tone="tertiary">
                      Damage per hit{" "}
                      <Text size="small" weight="semibold">
                        {round(result.perHitEnemyPct, 2)}%
                      </Text>{" "}
                      of max HP
                    </Text>
                  </Row>
                  <Text size="small" tone="tertiary">
                    Source: {wallEnabled ? `wall at ${wallThornPct}% of tower thorns` : "tower thorns"}
                    {sharpFortitude && wallEnabled ? ", stacking +1%/hit" : ""}
                  </Text>
                </Stack>
              </CardBody>
            </Card>

            <Card>
              <CardHeader trailing={<Pill size="sm" tone="warning">50% boss penalty</Pill>}>Bosses</CardHeader>
              <CardBody>
                <Stack gap={8}>
                  {result.plasmaDamagePct > 0 && (
                    <Text size="small" tone="tertiary">
                      Plasma Cannon first:{" "}
                      <Text size="small" weight="semibold">
                        −{round(result.plasmaDamagePct, 2)}%
                      </Text>{" "}
                      HP → {round(result.bossHpAfterPlasma, 2)}% remaining
                    </Text>
                  )}
                  <Text size="small" tone="tertiary">
                    Thorn damage per hit{" "}
                    <Text size="small" weight="semibold">
                      {round(result.perHitBossPct, 2)}%
                    </Text>{" "}
                    of max HP (50% boss reduction applied)
                  </Text>
                </Stack>
              </CardBody>
            </Card>
          </Grid>

          {result.bossHitRows.length > 0 && result.bossHitRows.length <= 13 && (
            <Stack gap={6}>
              <H2>Boss thorn hit breakdown</H2>
              <div style={{ overflowX: "auto" }}>
                <Table
                  headers={["Hit #", "Damage dealt", "Boss HP remaining"]}
                  columnAlign={["right", "right", "right"]}
                  rows={result.bossHitRows}
                />
              </div>
              <Text size="small" tone="tertiary">
                After plasma cannon pre-damage. Boss thorn hits use 50% of listed thorn value.
              </Text>
            </Stack>
          )}
        </Stack>
      )}

      {!hasDamage && (
        <Callout tone="neutral" title="No thorn damage">
          Set thorn damage above 0% to see hit counts.
        </Callout>
      )}

      <Stack gap={6}>
        <H2>Tier thorns & plasma resistance</H2>
        <div style={{ overflowX: "auto" }}>
          <Table
            headers={["Tier", "Coin ×", "Thorns BC", "Thorns eff.", "Plasma BC", "Plasma eff."]}
            columnAlign={["left", "right", "right", "right", "right", "right"]}
            rowTone={TIERS.filter((t) => t.tier >= 13).map((t) =>
              t.tier === tier ? "info" : undefined,
            )}
            rows={TIERS.filter((t) => t.tier >= 13).map((t) => [
              `Tier ${t.tier}`,
              String(t.coinBonus),
              t.thornsLvl > 0 ? String(t.thornsLvl) : "—",
              t.thornsLvl > 0 ? `${effectivenessPct(t.thornsLvl)}%` : "100%",
              t.plasmaLvl > 0 ? String(t.plasmaLvl) : "—",
              t.plasmaLvl > 0 ? `${effectivenessPct(t.plasmaLvl)}%` : "100%",
            ])}
          />
        </div>
        <Text size="small" tone="tertiary">
          Tiers 1–13 have no static thorns/plasma resistance. From T14 onward, effectiveness = 100
          − BC level (e.g. Thorns Resistance lvl 30 → 70% of normal thorn damage).
        </Text>
      </Stack>

      <Callout tone="warning" title="Model assumptions (tell me to change any)">
        <Stack gap={4}>
          <Text size="small">
            • Total thorn % = your thorn % + armor submod (Epic +2, Legendary +4, Mythic +7,
            Ancestral +10).
          </Text>
          <Text size="small">
            • Bosses take 50% of thorn damage. Regular enemies take the full amount.
          </Text>
          <Text size="small">
            • Tier resistance: BC level reduces effectiveness — thorns/plasma deal (100 − level)%
            of normal damage (e.g. lvl 30 → 70%, lvl 90 → 10%).
          </Text>
          <Text size="small">
            • Plasma Cannon fires once per boss, removing % of max HP before thorn hits begin.
          </Text>
          <Text size="small">
            • Wall mode: all thorn damage is dealt by the wall at wallThorn% × tower thorn total.
            Sharp Fortitude stacks +1% per subsequent wall thorn hit only.
          </Text>
          <Text size="small">
            • Hit count = smallest number of hits until cumulative damage exceeds 100% HP (after
            plasma pre-damage for bosses).
          </Text>
        </Stack>
      </Callout>
    </Stack>
  );
}
