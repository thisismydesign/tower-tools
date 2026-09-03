import { LineChart } from "@mantine/charts";
import {
  Alert,
  Badge,
  Button,
  FileButton,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { useEffect, useRef, useState } from "react";

import type { StatsFile, StatsReport } from "../../battle-report-stats/build.ts";
import { DataTable, SectionCard, Stat } from "../components";

// ----------------------------------------------------------------------------
// Battle Report Stats
//
// Reads the JSON produced by `pnpm stats:battle-reports` (battle-reports/
// 00-stats.json by default; drop or pick another file to override). Farm shows
// coins/hour and cells/hour across runs, plus projected coins/day and the
// all-time peak coins/minute; Tournaments shows league, tier, wave, and
// placement per tournament.
// ----------------------------------------------------------------------------

// ---- Formatting ------------------------------------------------------------

// Mirrors the game's abbreviated number ladder used in the reports.
const SUFFIXES: Array<[number, string]> = [
  [1e33, "D"],
  [1e30, "N"],
  [1e27, "O"],
  [1e24, "S"],
  [1e21, "s"],
  [1e18, "Q"],
  [1e15, "q"],
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

function formatGameNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  for (const [factor, suffix] of SUFFIXES) {
    if (Math.abs(value) >= factor) return `${(value / factor).toFixed(2)}${suffix}`;
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function dateLabel(report: StatsReport): string {
  return report.battleDate ? report.battleDate.slice(0, 10) : report.file;
}

function numericField(report: StatsReport, key: string): number | null {
  const value = report.fields[key];
  return typeof value === "number" ? value : null;
}

/** The run with the largest value for `key`, ignoring runs that don't carry it. */
function bestBy(reports: StatsReport[], key: string): { report: StatsReport; value: number } | null {
  return reports.reduce<{ report: StatsReport; value: number } | null>((best, report) => {
    const value = numericField(report, key);
    return value !== null && (best === null || value > best.value) ? { report, value } : best;
  }, null);
}

function tierLabel(report: StatsReport): string {
  return report.tier !== null ? `Tier ${report.tier}` : "Tier ?";
}

function leagueLabel(report: StatsReport): string {
  return report.league ?? (report.tier !== null ? `Tier ${report.tier}?` : "Unknown");
}

// ---- Charts ----------------------------------------------------------------

const COINS_COLOR = "blue";
const PEAK_COINS_COLOR = "grape";
const CELLS_COLOR = "teal";

const TIER_COLORS = ["blue", "teal", "orange", "violet", "red", "cyan", "yellow", "grape", "lime"];

const LEAGUE_COLORS: Record<string, string> = {
  Copper: "orange.7",
  Silver: "gray.5",
  Gold: "yellow.6",
  Platinum: "cyan.5",
  Champion: "violet.6",
  Legend: "red.6",
};

type Series = { name: string; color: string };

/** One series per tier, ordered numerically so colors stay stable as tiers are added. */
function tierSeries(reports: StatsReport[]): Series[] {
  return [...new Set(reports.map(tierLabel))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name, i) => ({ name, color: TIER_COLORS[i % TIER_COLORS.length] }));
}

function leagueSeries(reports: StatsReport[]): Series[] {
  return [...new Set(reports.map(leagueLabel))].map((name) => ({
    name,
    color: LEAGUE_COLORS[name] ?? "gray.6",
  }));
}

/** A single per-run rate (coins/hour, cells/hour) plotted over time. */
function RateChart({
  title,
  reports,
  fieldKey,
  logScale,
  color,
}: {
  title: string;
  reports: StatsReport[];
  fieldKey: string;
  logScale: boolean;
  color: string;
}) {
  const points = reports
    .map((report) => ({ label: dateLabel(report), value: numericField(report, fieldKey) }))
    .filter(
      (point): point is { label: string; value: number } => point.value !== null && point.value > 0,
    );

  if (points.length === 0) {
    return (
      <SectionCard title={title}>
        <Text size="sm" c="dimmed">
          No runs with this value in the loaded data.
        </Text>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={title}
      trailing={
        <Text size="xs" c="dimmed">
          {points.length} runs
        </Text>
      }
    >
      <LineChart
        h={260}
        data={points.map((point) => ({
          category: point.label,
          [title]: logScale ? Number(Math.log10(point.value).toFixed(3)) : point.value,
        }))}
        dataKey="category"
        series={[{ name: title, color }]}
        curveType="monotone"
        valueFormatter={(value) => (logScale ? value.toFixed(2) : formatGameNumber(value))}
      />
      <Text size="xs" c="dimmed" mt="xs">
        Latest: {formatGameNumber(points[points.length - 1].value)} · Best:{" "}
        {formatGameNumber(Math.max(...points.map((point) => point.value)))}
        {logScale ? " · y axis is log₁₀ of the value" : ""}
      </Text>
    </SectionCard>
  );
}

/** Each run lands on the series named by `groupOf` (tier, league). A group
    change breaks the line, so a lone run in a group shows as a single dot. */
function GroupedLineChart({
  title,
  reports,
  series,
  groupOf,
  valueOf,
  valueFormatter,
  h = 260,
}: {
  title: string;
  reports: StatsReport[];
  series: Series[];
  groupOf: (report: StatsReport) => string;
  valueOf: (report: StatsReport) => number | null;
  valueFormatter?: (value: number) => string;
  h?: number;
}) {
  return (
    <SectionCard title={title}>
      <LineChart
        h={h}
        data={reports.map((report) => {
          const value = valueOf(report);
          return { category: dateLabel(report), ...(value !== null ? { [groupOf(report)]: value } : {}) };
        })}
        dataKey="category"
        series={series}
        curveType="monotone"
        connectNulls={false}
        withLegend
        valueFormatter={valueFormatter}
      />
    </SectionCard>
  );
}

// ---- Farm tab --------------------------------------------------------------

const HOURS_PER_DAY = 24;

const RANGE_OPTIONS = [
  { value: "all", label: "All runs" },
  { value: "100", label: "Last 100" },
  { value: "30", label: "Last 30" },
];

function FarmTab({ reports }: { reports: StatsReport[] }) {
  const [range, setRange] = useState("all");
  const [logScale, setLogScale] = useState(false);

  const shown = range === "all" ? reports : reports.slice(-Number(range));
  const latest = reports[reports.length - 1];
  const tiers = tierSeries(shown);

  // A day of farming at the pace of the most recent run.
  const latestCoinsPerHour = latest ? numericField(latest, "coinsPerHour") : null;
  const coinsPerDay = latestCoinsPerHour === null ? null : latestCoinsPerHour * HOURS_PER_DAY;
  // Peak minute is a per-run record, so the all-time peak is the best of them.
  const peakCoinsPerMinute = bestBy(reports, "highestCoinsPerMinute");

  return (
    <Stack gap="lg">
      <Group align="center" gap="lg">
        <Select
          w={140}
          value={range}
          onChange={(v) => v && setRange(v)}
          data={RANGE_OPTIONS}
          allowDeselect={false}
        />
        <Switch
          checked={logScale}
          onChange={(e) => setLogScale(e.currentTarget.checked)}
          label="Log scale"
        />
      </Group>

      <SimpleGrid cols={{ base: 2, lg: 4 }} spacing="lg">
        <Stat value={String(reports.length)} label="Farm runs" />
        <Stat
          value={formatGameNumber(latestCoinsPerHour)}
          label="Latest coins/hour"
          color={COINS_COLOR}
        />
        <Stat
          value={latest ? formatGameNumber(numericField(latest, "cellsPerHour")) : "—"}
          label="Latest cells/hour"
          color={CELLS_COLOR}
        />
        <Stat value={latest && latest.tier !== null ? `T${latest.tier}` : "—"} label="Latest tier" />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 2, lg: 4 }} spacing="lg">
        <Stat
          value={formatGameNumber(coinsPerDay)}
          label="Coins/day at the latest rate"
          color={COINS_COLOR}
        />
        <Stat
          value={formatGameNumber(peakCoinsPerMinute?.value)}
          label={
            peakCoinsPerMinute
              ? `Peak coins/minute (${dateLabel(peakCoinsPerMinute.report)})`
              : "Peak coins/minute"
          }
          color={PEAK_COINS_COLOR}
        />
      </SimpleGrid>

      <RateChart
        title="Coins per hour"
        reports={shown}
        fieldKey="coinsPerHour"
        logScale={logScale}
        color={COINS_COLOR}
      />
      <RateChart
        title="Cells per hour"
        reports={shown}
        fieldKey="cellsPerHour"
        logScale={logScale}
        color={CELLS_COLOR}
      />

      {shown.length > 0 && (
        <>
          <GroupedLineChart
            title="Waves per run"
            reports={shown}
            series={tiers}
            groupOf={tierLabel}
            valueOf={(report) => report.wave}
          />
          <GroupedLineChart
            title="Time per run"
            reports={shown}
            series={tiers}
            groupOf={tierLabel}
            valueOf={(report) => {
              const seconds = numericField(report, "realTime");
              return seconds === null ? null : Number((seconds / 3600).toFixed(2));
            }}
            valueFormatter={(value) => `${value.toFixed(1)}h`}
          />
        </>
      )}
    </Stack>
  );
}

// ---- Tournaments tab -------------------------------------------------------

function TournamentsTab({ reports }: { reports: StatsReport[] }) {
  const latest = reports[reports.length - 1];

  // Leagues rank by their tier; "best" is the highest league ever reached,
  // and best wave is the highest wave within that league.
  const bestTier = reports.reduce<number | null>(
    (best, report) =>
      report.tier !== null && (best === null || report.tier > best) ? report.tier : best,
    null,
  );
  const bestLeagueRuns = reports.filter((report) => report.tier === bestTier);
  const best = bestLeagueRuns[0];
  const bestWave = bestLeagueRuns.reduce<number | null>(
    (max, report) =>
      report.wave !== null && (max === null || report.wave > max) ? report.wave : max,
    null,
  );
  const unknownTiers = [
    ...new Set(
      reports.filter((r) => r.league === null && r.tier !== null).map((r) => r.tier as number),
    ),
  ].sort((a, b) => a - b);
  const hasPlacements = reports.some((report) => report.placement !== null);

  // Newest first for the table.
  const rows = [...reports].reverse();

  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 2, lg: 4 }} spacing="lg">
        <Stat value={latest ? leagueLabel(latest) : "—"} label="Current league" color="blue" />
        <Stat
          value={latest?.wave !== null && latest ? String(latest.wave) : "—"}
          label="Latest wave"
        />
        <Stat value={best ? leagueLabel(best) : "—"} label="Best league" color="teal" />
        <Stat
          value={bestWave !== null ? String(bestWave) : "—"}
          label={best ? `Best wave (${leagueLabel(best)})` : "Best wave"}
          color="teal"
        />
      </SimpleGrid>

      {unknownTiers.length > 0 && (
        <Alert variant="light" color="orange" title="Unknown league for some tiers">
          No league mapping yet for tier{unknownTiers.length > 1 ? "s" : ""} {unknownTiers.join(", ")}
          . Add it to LEAGUE_BY_TIER in battle-report-stats/build.ts and rerun the stats build.
        </Alert>
      )}

      {reports.length > 0 && (
        <GroupedLineChart
          title="Waves per tournament"
          reports={reports}
          series={leagueSeries(reports)}
          groupOf={leagueLabel}
          valueOf={(report) => report.wave}
          h={220}
        />
      )}

      {!hasPlacements && (
        <Text size="xs" c="dimmed">
          Placements come from battle-reports/placements.json (UTC date → placement); battle reports
          themselves don't record them.
        </Text>
      )}

      <DataTable
        headers={["Date", "League", "Tier", "Wave", "Placement"]}
        align={["left", "left", "right", "right", "right"]}
        rows={rows.map((report) => [
          dateLabel(report),
          leagueLabel(report),
          report.tier !== null ? String(report.tier) : "—",
          report.wave !== null ? String(report.wave) : "—",
          report.placement !== null ? String(report.placement) : "—",
        ])}
        emptyMessage="No tournament runs in the loaded data."
      />
    </Stack>
  );
}

// ---- Tool ------------------------------------------------------------------

const DEFAULT_STATS_PATH = "battle-reports/00-stats.json";

export default function BattleReportStats() {
  const [stats, setStats] = useState<StatsFile | null>(null);
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const resetFilePicker = useRef<() => void>(null);

  const loadText = (text: string, label: string) => {
    try {
      const parsed = JSON.parse(text) as StatsFile;
      if (!Array.isArray(parsed.reports)) throw new Error("no reports array");
      setStats(parsed);
      setSource(label);
      setError("");
    } catch {
      setError(`${label} is not a battle report stats JSON — run pnpm stats:battle-reports.`);
    }
  };

  const loadFile = (file: File | null | undefined) => {
    if (!file) return;
    file.text().then((text) => loadText(text, file.name));
    // Clear the picker so choosing the same file again reloads it.
    resetFilePicker.current?.();
  };

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}${DEFAULT_STATS_PATH}`)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.text();
      })
      .then((text) => loadText(text, DEFAULT_STATS_PATH))
      .catch(() => {
        setError(
          `Couldn't load ${DEFAULT_STATS_PATH} — run pnpm stats:battle-reports, or drop a stats JSON here.`,
        );
      });
  }, []);

  const tabs = [
    { value: "farm", label: "Farm", runType: "farm", Panel: FarmTab },
    { value: "tournaments", label: "Tournaments", runType: "tournament", Panel: TournamentsTab },
  ].map((tab) => ({
    ...tab,
    reports: stats?.reports.filter((report) => report.runType === tab.runType) ?? [],
  }));

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        loadFile(e.dataTransfer.files[0]);
      }}
      style={
        dragging
          ? { outline: "2px dashed currentColor", outlineOffset: -2, borderRadius: 8 }
          : undefined
      }
    >
      <Stack gap="xl">
        <Stack gap={4}>
          <Title order={1}>Battle Report Stats</Title>
          <Text c="dimmed">
            The Tower — farm and tournament history from your battle reports. Loads{" "}
            {DEFAULT_STATS_PATH} by default; drag &amp; drop or pick another stats JSON.
          </Text>
        </Stack>

        {/* keepMounted off: only the visible tab builds its charts. */}
        <Tabs defaultValue="farm" keepMounted={false}>
          <Tabs.List>
            {tabs.map((tab) => (
              <Tabs.Tab
                key={tab.value}
                value={tab.value}
                rightSection={
                  stats && (
                    <Badge size="sm" variant="light">
                      {tab.reports.length}
                    </Badge>
                  )
                }
              >
                {tab.label}
              </Tabs.Tab>
            ))}
            <Group gap="sm" ml="auto" pb={6}>
              {stats && (
                <Text size="xs" c="dimmed">
                  {source} · {stats.reports.length} reports · generated{" "}
                  {stats.meta.generatedAt.slice(0, 10)}
                </Text>
              )}
              <FileButton onChange={loadFile} accept="application/json,.json" resetRef={resetFilePicker}>
                {(props) => (
                  <Button {...props} size="xs" variant="default">
                    Load JSON…
                  </Button>
                )}
              </FileButton>
            </Group>
          </Tabs.List>

          {error && (
            <Alert
              variant="light"
              color={stats ? "orange" : "gray"}
              title={stats ? "Load failed" : "No data loaded"}
              mt="lg"
            >
              {error}
              {stats && " Showing the previously loaded data."}
            </Alert>
          )}

          {stats &&
            tabs.map((tab) => (
              <Tabs.Panel key={tab.value} value={tab.value} pt="lg">
                <tab.Panel reports={tab.reports} />
              </Tabs.Panel>
            ))}
        </Tabs>
      </Stack>
    </div>
  );
}
