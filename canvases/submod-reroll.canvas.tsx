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
  useCanvasState,
  useHostTheme,
} from "cursor/canvas";

// ----------------------------------------------------------------------------
// Submod Reroll Calculator
//
// How many reroll shards it takes to hit a specific sub-module effect.
// A reroll rolls every unlocked slot: each slot first rolls a rarity
// (fixed odds below), then picks uniformly among the module type's effects
// available at that rarity, excluding banned effects and effects already
// locked on the module. Locking slots raises the shard cost per reroll.
//
// Pool sizes per rarity from the Sub-Module Effects wiki page
// (https://the-tower-idle-tower-defense.fandom.com/wiki/Sub-Module_Effects).
// ----------------------------------------------------------------------------

const RARITIES = ["common", "rare", "epic", "legendary", "mythic", "ancestral"] as const;
type Rarity = (typeof RARITIES)[number];

const RARITY_LABEL: Record<Rarity, string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
  mythic: "Mythic",
  ancestral: "Ancestral",
};

/** Chance that a single slot roll comes up at each rarity. */
const RARITY_ODDS: Record<Rarity, number> = {
  common: 0.462,
  rare: 0.4,
  epic: 0.1,
  legendary: 0.025,
  mythic: 0.01,
  ancestral: 0.003,
};

/** Number of distinct effects each module type can roll at each rarity. */
const POOL: Record<string, Record<Rarity, number>> = {
  cannon: { common: 5, rare: 10, epic: 14, legendary: 17, mythic: 17, ancestral: 17 },
  armor: { common: 3, rare: 6, epic: 15, legendary: 16, mythic: 17, ancestral: 17 },
  generator: { common: 7, rare: 7, epic: 13, legendary: 13, mythic: 13, ancestral: 13 },
  core: { common: 8, rare: 9, epic: 15, legendary: 26, mythic: 26, ancestral: 26 },
};

const MODULE_OPTIONS = [
  { value: "cannon", label: "Cannon (attack)" },
  { value: "armor", label: "Armor (defense)" },
  { value: "generator", label: "Generator (utility)" },
  { value: "core", label: "Core (ultimate weapons)" },
];

const TOTAL_SLOTS = 6;

/** Shard cost of one reroll, indexed by number of locked slots. */
const REROLL_COST = [10, 40, 160, 500, 1000, 1600];

const CONFIDENCES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99];

interface CalcResult {
  perSlotChance: number;
  perRerollChance: number;
  costPerReroll: number;
  expectedRerolls: number;
  expectedShards: number;
  rows: Array<{ confidence: number; rerolls: number; shards: number }>;
}

function calculate(
  moduleKey: string,
  targetRarity: Rarity,
  locks: number,
  bans: number,
  orBetter: boolean,
): CalcResult {
  const pool = POOL[moduleKey] ?? POOL.cannon;
  const startIdx = RARITIES.indexOf(targetRarity);
  const rarities = orBetter ? RARITIES.slice(startIdx) : [targetRarity];

  // Chance one slot roll lands the wanted effect: roll the rarity, then pick
  // it out of that rarity's pool minus banned and locked effects (the target
  // itself always remains, hence the clamp to 1).
  let perSlotChance = 0;
  for (const r of rarities) {
    const effective = Math.max(1, pool[r] - bans - locks);
    perSlotChance += RARITY_ODDS[r] / effective;
  }

  const slotsRolling = TOTAL_SLOTS - locks;
  const perRerollChance = 1 - Math.pow(1 - perSlotChance, slotsRolling);
  const costPerReroll = REROLL_COST[locks] ?? REROLL_COST[0];

  const expectedRerolls = perRerollChance > 0 ? 1 / perRerollChance : Infinity;

  const rows = CONFIDENCES.map((confidence) => {
    const rerolls =
      perRerollChance > 0
        ? Math.ceil(Math.log(1 - confidence) / Math.log(1 - perRerollChance))
        : Infinity;
    return { confidence, rerolls, shards: rerolls * costPerReroll };
  });

  return {
    perSlotChance,
    perRerollChance,
    costPerReroll,
    expectedRerolls,
    expectedShards: expectedRerolls * costPerReroll,
    rows,
  };
}

function formatInt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

function formatPct(p: number, digits = 2): string {
  return `${(p * 100).toFixed(digits)}%`;
}

function NumberField({
  label,
  value,
  min,
  max,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  hint?: string;
  onChange: (v: number) => void;
}) {
  const theme = useHostTheme();
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
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
      </Row>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(clamp(Number((e.target as HTMLInputElement).value)))}
        style={{ width: "100%", accentColor: theme.accent.primary, cursor: "pointer" }}
      />
      {hint ? (
        <Text size="small" tone="tertiary">
          {hint}
        </Text>
      ) : null}
    </Stack>
  );
}

export default function SubmodRerollCalculator() {
  const [moduleKey, setModuleKey] = useCanvasState("moduleKey", "cannon");
  const [targetRarity, setTargetRarity] = useCanvasState<Rarity>("targetRarity", "ancestral");
  const [locks, setLocks] = useCanvasState("locks", 0);
  const [bans, setBans] = useCanvasState("bans", 0);
  const [orBetter, setOrBetter] = useCanvasState("orBetter", true);

  const pool = POOL[moduleKey] ?? POOL.cannon;
  const result = calculate(moduleKey, targetRarity, locks, bans, orBetter);

  return (
    <Stack gap={20} style={{ padding: 4 }}>
      <Stack gap={4}>
        <H1>Submod Reroll Calculator</H1>
        <Text tone="secondary">
          The Tower — how many reroll shards it takes to land a specific sub-module effect, by
          module type, locked slots, bans, and target rarity.
        </Text>
      </Stack>

      <Grid columns="repeat(auto-fit, minmax(280px, 1fr))" gap={16} align="start">
        <Card>
          <CardHeader>Target</CardHeader>
          <CardBody>
            <Stack gap={14}>
              <Stack gap={4}>
                <Text size="small" tone="secondary">
                  Module type
                </Text>
                <Select value={moduleKey} onChange={setModuleKey} options={MODULE_OPTIONS} />
              </Stack>
              <Stack gap={4}>
                <Text size="small" tone="secondary">
                  Rarity of the effect you want
                </Text>
                <Select
                  value={targetRarity}
                  onChange={(v) => setTargetRarity(v as Rarity)}
                  options={RARITIES.map((r) => ({
                    value: r,
                    label: `${RARITY_LABEL[r]} (${formatPct(RARITY_ODDS[r], 1)} roll chance)`,
                  }))}
                />
              </Stack>
              <Divider />
              <Row align="center" gap={8}>
                <Stack gap={2} style={{ flex: 1 }}>
                  <Text size="small" weight="semibold">
                    Count higher rarities as a hit
                  </Text>
                  <Text size="small" tone="tertiary">
                    Rolling the same effect at a higher rarity also succeeds
                  </Text>
                </Stack>
                <Toggle checked={orBetter} onChange={setOrBetter} />
              </Row>
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>Module state</CardHeader>
          <CardBody>
            <Stack gap={14}>
              <NumberField
                label="Locked slots"
                value={locks}
                min={0}
                max={TOTAL_SLOTS - 1}
                onChange={setLocks}
                hint={`${TOTAL_SLOTS - locks} of ${TOTAL_SLOTS} slots reroll at ${
                  REROLL_COST[locks]
                } shards per reroll`}
              />
              <NumberField
                label="Banned effects"
                value={bans}
                min={0}
                max={10}
                onChange={setBans}
                hint="Banned effects are removed from the roll pool"
              />
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Grid columns="repeat(auto-fit, minmax(160px, 1fr))" gap={16}>
        <Stat value={formatPct(result.perSlotChance, 3)} label="Hit chance per slot roll" />
        <Stat
          value={formatPct(result.perRerollChance, 2)}
          label={`Hit chance per reroll (${TOTAL_SLOTS - locks} slots)`}
          tone="info"
        />
        <Stat value={formatInt(result.costPerReroll)} label="Shards per reroll" />
        <Stat value={formatInt(result.expectedShards)} label="Expected shards (average)" tone="warning" />
      </Grid>

      <Stack gap={6}>
        <H2>Shards needed by confidence</H2>
        <div style={{ overflowX: "auto" }}>
          <Table
            headers={["Chance of having it", "Rerolls", "Shards"]}
            columnAlign={["left", "right", "right"]}
            rowTone={result.rows.map((row) => (row.confidence === 0.5 ? "info" : undefined))}
            rows={result.rows.map((row) => [
              formatPct(row.confidence, 0),
              formatInt(row.rerolls),
              formatInt(row.shards),
            ])}
          />
        </div>
        <Text size="small" tone="tertiary">
          Reading: after spending that many shards, that's your cumulative chance of having hit
          the effect at least once. The average (expected) cost is above the 50% row because of
          the long unlucky tail.
        </Text>
      </Stack>

      <Stack gap={6}>
        <H2>Roll pool for {MODULE_OPTIONS.find((m) => m.value === moduleKey)?.label}</H2>
        <div style={{ overflowX: "auto" }}>
          <Table
            headers={["Rarity", "Roll chance", "Effects in pool", "After bans & locks"]}
            columnAlign={["left", "right", "right", "right"]}
            rowTone={RARITIES.map((r) =>
              r === targetRarity ? "info" : undefined,
            )}
            rows={RARITIES.map((r) => [
              RARITY_LABEL[r],
              formatPct(RARITY_ODDS[r], 1),
              String(pool[r]),
              String(Math.max(1, pool[r] - bans - locks)),
            ])}
          />
        </div>
      </Stack>

      <Callout tone="warning" title="Model assumptions (tell me to change any)">
        <Stack gap={4}>
          <Text size="small">
            • Each rerolled slot first rolls a rarity (46.2 / 40 / 10 / 2.5 / 1.0 / 0.3%), then
            picks uniformly among the module type's effects available at that rarity.
          </Text>
          <Text size="small">
            • Banned effects and effects locked on the module are removed from every rarity pool
            (the game never rolls a duplicate of an effect already on the module).
          </Text>
          <Text size="small">
            • The module has all {TOTAL_SLOTS} submod slots open. Reroll costs by locked slots:
            0→10, 1→40, 2→160, 3→500, 4→1,000, 5→1,600 shards.
          </Text>
          <Text size="small">
            • Slots within one reroll are treated as independent; in-game they can't duplicate
            each other, which makes the true odds a hair better than shown.
          </Text>
          <Text size="small">
            • Pool sizes per rarity come from the Sub-Module Effects wiki table (effects listed
            "n/a" at a rarity can't roll at that rarity).
          </Text>
        </Stack>
      </Callout>
    </Stack>
  );
}
