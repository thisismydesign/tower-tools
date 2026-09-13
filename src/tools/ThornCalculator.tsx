import {
  Alert,
  Badge,
  Checkbox,
  Divider,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";

import { useLocalStorage } from "@mantine/hooks";

import { DataTable, SectionCard, SliderField, Stat } from "../components";

/** Inputs survive reloads under `thorn-calculator:<key>` in localStorage. */
function useSetting<T>(key: string, defaultValue: T) {
  return useLocalStorage<T>({ key: `thorn-calculator:${key}`, defaultValue, getInitialValueInEffect: false });
}

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

/** Tiers shown in the resistance reference table (the first one is the last unaffected tier). */
const RESISTANT_TIERS = TIERS.filter((t) => t.tier >= 13);

const SUBMOD_OPTIONS = [
  { value: "none", label: "None" },
  { value: "epic", label: "Epic (+2%)" },
  { value: "legendary", label: "Legendary (+4%)" },
  { value: "mythic", label: "Mythic (+7%)" },
  { value: "ancestral", label: "Ancestral (+10%)" },
];

const TIER_OPTIONS = TIERS.map((t) => ({
  value: String(t.tier),
  label:
    t.thornsLvl > 0
      ? `Tier ${t.tier} (${effectivenessPct(t.thornsLvl)}% thorns, ${effectivenessPct(t.plasmaLvl)}% plasma)`
      : `Tier ${t.tier}`,
}));

const PLASMA_OPTIONS = PLASMA_LEVELS.map((p) => ({ value: String(p.level), label: p.label }));

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

// ----------------------------------------------------------------------------
// UI
// ----------------------------------------------------------------------------

export default function ThornCalculator() {
  const [thornPct, setThornPct] = useSetting("thornPct", 99);
  const [submodKey, setSubmodKey] = useSetting("submodKey", "ancestral");
  const [tier, setTier] = useSetting("tier", 1);
  const [plasmaLevel, setPlasmaLevel] = useSetting("plasmaLevel", 7);
  const [sharpFortitude, setSharpFortitude] = useSetting("sharpFortitude",
    false,
  );
  const [wallEnabled, setWallEnabled] = useSetting("wallEnabled", false);
  const [wallThornPct, setWallThornPct] = useSetting("wallThornPct", 20);

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
    <Stack gap="xl">
      <Stack gap={4}>
        <Title order={1}>Thorn Calculator</Title>
        <Text c="dimmed">
          The Tower — how many hits to kill regular enemies and bosses with thorns, accounting for
          submods, tier resistance, plasma cannon, wall thorns, and Sharp Fortitude.
        </Text>
      </Stack>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" verticalSpacing="lg">
        <SectionCard title="Thorn setup">
          <Stack gap="md">
            <SliderField
              label="Thorn damage %"
              value={thornPct}
              min={0}
              max={200}
              onChange={setThornPct}
              suffix="%"
            />
            <Select
              label="Thorn submod (armor)"
              value={submodKey}
              onChange={(v) => v && setSubmodKey(v)}
              allowDeselect={false}
              data={SUBMOD_OPTIONS}
            />
            <Select
              label="Tier (thorns & plasma effectiveness)"
              value={String(tier)}
              onChange={(v) => v && setTier(Number(v))}
              allowDeselect={false}
              data={TIER_OPTIONS}
            />
            <Divider />
            <Group align="center" gap="sm" wrap="nowrap">
              <Stack gap={2} style={{ flex: 1 }}>
                <Text size="sm" fw={600}>
                  Sharp Fortitude
                </Text>
                <Text size="xs" c="dimmed">
                  +1% wall thorn damage per subsequent hit
                </Text>
              </Stack>
              <Switch
                checked={sharpFortitude}
                onChange={(e) => setSharpFortitude(e.currentTarget.checked)}
              />
            </Group>
          </Stack>
        </SectionCard>

        <SectionCard
          title="Wall & boss tools"
          trailing={
            <Badge variant={wallEnabled ? "filled" : "light"}>
              {wallEnabled ? "Wall on" : "Tower"}
            </Badge>
          }
        >
          <Stack gap="md">
            <Checkbox
              checked={wallEnabled}
              onChange={(e) => setWallEnabled(e.currentTarget.checked)}
              label="Damage dealt by wall thorns (not tower)"
            />
            {wallEnabled && (
              <SliderField
                label="Wall thorns % of tower thorns"
                value={wallThornPct}
                min={1}
                max={20}
                onChange={setWallThornPct}
                suffix="%"
              />
            )}
            <Select
              label="Plasma Cannon (bosses only)"
              value={String(plasmaLevel)}
              onChange={(v) => v && setPlasmaLevel(Number(v))}
              allowDeselect={false}
              data={PLASMA_OPTIONS}
            />
          </Stack>
        </SectionCard>
      </SimpleGrid>

      {hasDamage && (
        <Stack gap="sm">
          <Title order={2}>Hits to kill</Title>
          <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing="lg">
            <Stat value={formatHits(result.enemyHits)} label="Regular enemies" color="blue" />
            <Stat value={formatHits(result.bossHits)} label="Bosses" color="orange" />
            <Stat value={`${round(result.totalThornPct)}%`} label="Total thorn %" />
            <Stat
              value={`${round(result.thornsEffPct)}%`}
              label={`Tier ${tier} thorns effectiveness`}
            />
            <Stat
              value={`${round(result.plasmaEffPct)}%`}
              label={`Tier ${tier} plasma effectiveness`}
            />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mt="xs">
            <SectionCard title="Regular enemies">
              <Stack gap={8}>
                <Text size="sm" c="dimmed">
                  Damage per hit{" "}
                  <Text span size="sm" fw={600}>
                    {round(result.perHitEnemyPct, 2)}%
                  </Text>{" "}
                  of max HP
                </Text>
                <Text size="sm" c="dimmed">
                  Source: {wallEnabled ? `wall at ${wallThornPct}% of tower thorns` : "tower thorns"}
                  {sharpFortitude && wallEnabled ? ", stacking +1%/hit" : ""}
                </Text>
              </Stack>
            </SectionCard>

            <SectionCard
              title="Bosses"
              trailing={
                <Badge color="orange" variant="light">
                  50% boss penalty
                </Badge>
              }
            >
              <Stack gap={8}>
                {result.plasmaDamagePct > 0 && (
                  <Text size="sm" c="dimmed">
                    Plasma Cannon first:{" "}
                    <Text span size="sm" fw={600}>
                      −{round(result.plasmaDamagePct, 2)}%
                    </Text>{" "}
                    HP → {round(result.bossHpAfterPlasma, 2)}% remaining
                  </Text>
                )}
                <Text size="sm" c="dimmed">
                  Thorn damage per hit{" "}
                  <Text span size="sm" fw={600}>
                    {round(result.perHitBossPct, 2)}%
                  </Text>{" "}
                  of max HP (50% boss reduction applied)
                </Text>
              </Stack>
            </SectionCard>
          </SimpleGrid>

          {result.bossHitRows.length > 0 && result.bossHitRows.length <= 13 && (
            <Stack gap="xs" mt="md">
              <Title order={2}>Boss thorn hit breakdown</Title>
              <DataTable
                headers={["Hit #", "Damage dealt", "Boss HP remaining"]}
                align={["right", "right", "right"]}
                rows={result.bossHitRows}
              />
              <Text size="xs" c="dimmed">
                After plasma cannon pre-damage. Boss thorn hits use 50% of listed thorn value.
              </Text>
            </Stack>
          )}
        </Stack>
      )}

      {!hasDamage && (
        <Alert variant="light" color="gray" title="No thorn damage">
          Set thorn damage above 0% to see hit counts.
        </Alert>
      )}

      <Stack gap="xs">
        <Title order={2}>Tier thorns &amp; plasma resistance</Title>
        <DataTable
          headers={["Tier", "Coin ×", "Thorns BC", "Thorns eff.", "Plasma BC", "Plasma eff."]}
          align={["left", "right", "right", "right", "right", "right"]}
          highlightRow={RESISTANT_TIERS.findIndex((t) => t.tier === tier)}
          rows={RESISTANT_TIERS.map((t) => [
            `Tier ${t.tier}`,
            String(t.coinBonus),
            t.thornsLvl > 0 ? String(t.thornsLvl) : "—",
            t.thornsLvl > 0 ? `${effectivenessPct(t.thornsLvl)}%` : "100%",
            t.plasmaLvl > 0 ? String(t.plasmaLvl) : "—",
            t.plasmaLvl > 0 ? `${effectivenessPct(t.plasmaLvl)}%` : "100%",
          ])}
        />
        <Text size="xs" c="dimmed">
          Tiers 1–13 have no static thorns/plasma resistance. From T14 onward, effectiveness = 100 −
          BC level (e.g. Thorns Resistance lvl 30 → 70% of normal thorn damage).
        </Text>
      </Stack>

      <Alert variant="light" color="orange" title="Model assumptions (tell me to change any)">
        <Stack gap={4}>
          <Text size="sm">
            • Total thorn % = your thorn % + armor submod (Epic +2, Legendary +4, Mythic +7,
            Ancestral +10).
          </Text>
          <Text size="sm">
            • Bosses take 50% of thorn damage. Regular enemies take the full amount.
          </Text>
          <Text size="sm">
            • Tier resistance: BC level reduces effectiveness — thorns/plasma deal (100 − level)% of
            normal damage (e.g. lvl 30 → 70%, lvl 90 → 10%).
          </Text>
          <Text size="sm">
            • Plasma Cannon fires once per boss, removing % of max HP before thorn hits begin.
          </Text>
          <Text size="sm">
            • Wall mode: all thorn damage is dealt by the wall at wallThorn% × tower thorn total.
            Sharp Fortitude stacks +1% per subsequent wall thorn hit only.
          </Text>
          <Text size="sm">
            • Hit count = smallest number of hits until cumulative damage exceeds 100% HP (after
            plasma pre-damage for bosses).
          </Text>
        </Stack>
      </Alert>
    </Stack>
  );
}
