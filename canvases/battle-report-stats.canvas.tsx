import { useCallback, useEffect, useRef, useState } from "react";
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
  Callout,
  Table,
  Button,
  useHostTheme,
} from "cursor/canvas";
// The cursor/canvas LineChart can't format tooltip/axis values or leave gaps
// in a series, so the charts use the underlying Mantine chart directly.
import { LineChart as MantineLineChart } from "@mantine/charts";

import type { StatsFile, StatsReport } from "../battle-report-stats/build.ts";

// ----------------------------------------------------------------------------
// Battle Report Stats
//
// Reads the JSON produced by `pnpm stats:battle-reports` (battle-reports/
// 00-stats.json by default; drop or pick another file to override). Farm shows
// coins/hour and cells/hour across runs; Tournaments shows league, tier,
// wave, and placement per tournament.
// ----------------------------------------------------------------------------

const DEFAULT_STATS_PATH = "battle-reports/00-stats.json";

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

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  const theme = useHostTheme();
  return (
    <div
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 18px",
        marginBottom: -1,
        cursor: "pointer",
        userSelect: "none",
        fontSize: 15,
        fontWeight: active ? 600 : 500,
        color: active ? theme.text.primary : theme.text.secondary,
        borderBottom: `2px solid ${active ? theme.accent.primary : "transparent"}`,
      }}
    >
      {label}
      {count !== undefined && (
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: theme.text.tertiary,
            background: theme.fill.tertiary,
            borderRadius: 999,
            padding: "1px 8px",
          }}
        >
          {count}
        </span>
      )}
    </div>
  );
}

const RANGE_OPTIONS = [
  { value: "all", label: "All runs" },
  { value: "100", label: "Last 100" },
  { value: "30", label: "Last 30" },
];

function RateChart({
  title,
  reports,
  fieldKey,
  logScale,
  tone,
}: {
  title: string;
  reports: StatsReport[];
  fieldKey: string;
  logScale: boolean;
  tone: "info" | "success";
}) {
  const points = reports
    .map((report) => ({ label: dateLabel(report), value: numericField(report, fieldKey) }))
    .filter((point): point is { label: string; value: number } => point.value !== null && point.value > 0);

  if (points.length === 0) {
    return (
      <Card>
        <CardHeader>{title}</CardHeader>
        <CardBody>
          <Text size="small" tone="tertiary">
            No runs with this value in the loaded data.
          </Text>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        trailing={
          <Text size="small" tone="tertiary">
            {points.length} runs
          </Text>
        }
      >
        {title}
      </CardHeader>
      <CardBody>
        <MantineLineChart
          h={260}
          data={points.map((point) => ({
            category: point.label,
            [title]: logScale ? Number(Math.log10(point.value).toFixed(3)) : point.value,
          }))}
          dataKey="category"
          series={[{ name: title, color: tone === "info" ? "blue.6" : "teal.6" }]}
          curveType="monotone"
          valueFormatter={(value) => (logScale ? value.toFixed(2) : formatGameNumber(value))}
        />
        <Text size="small" tone="tertiary">
          Latest: {formatGameNumber(points[points.length - 1].value)} · Best:{" "}
          {formatGameNumber(Math.max(...points.map((point) => point.value)))}
          {logScale ? " · y axis is log₁₀ of the value" : ""}
        </Text>
      </CardBody>
    </Card>
  );
}

const TIER_COLORS = [
  "blue.6",
  "teal.6",
  "orange.6",
  "violet.6",
  "red.6",
  "cyan.6",
  "yellow.6",
  "grape.6",
  "lime.6",
];

function tierLabel(report: StatsReport): string {
  return report.tier !== null ? `Tier ${report.tier}` : "Tier ?";
}

/** One series per tier: a tier change breaks the line, so a lone run at a
    tier shows as a single dot. */
function TierSplitChart({
  title,
  reports,
  valueOf,
  valueFormatter,
}: {
  title: string;
  reports: StatsReport[];
  valueOf: (report: StatsReport) => number | null;
  valueFormatter?: (value: number) => string;
}) {
  return (
    <Card>
      <CardHeader>{title}</CardHeader>
      <CardBody>
        <MantineLineChart
          h={260}
          data={reports.map((report) => {
            const value = valueOf(report);
            return {
              category: dateLabel(report),
              ...(value !== null ? { [tierLabel(report)]: value } : {}),
            };
          })}
          dataKey="category"
          series={[...new Set(reports.map(tierLabel))]
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .map((tier, index) => ({ name: tier, color: TIER_COLORS[index % TIER_COLORS.length] }))}
          curveType="monotone"
          connectNulls={false}
          withLegend
          valueFormatter={valueFormatter}
        />
      </CardBody>
    </Card>
  );
}

function FarmTab({ reports }: { reports: StatsReport[] }) {
  const [range, setRange] = useState("all");
  const [logScale, setLogScale] = useState(false);

  const shown = range === "all" ? reports : reports.slice(-Number(range));
  const latest = reports[reports.length - 1];

  return (
    <Stack gap={16}>
      <Row align="center" gap={12} wrap>
        <div style={{ width: 140 }}>
          <Select value={range} onChange={setRange} options={RANGE_OPTIONS} />
        </div>
        <Row align="center" gap={6}>
          <Toggle checked={logScale} onChange={setLogScale} size="sm" />
          <Text size="small" tone="secondary">
            Log scale
          </Text>
        </Row>
        <Spacer />
      </Row>

      <Grid columns="repeat(auto-fit, minmax(160px, 1fr))" gap={16}>
        <Stat value={String(reports.length)} label="Farm runs" />
        <Stat
          value={latest ? formatGameNumber(numericField(latest, "coinsPerHour")) : "—"}
          label="Latest coins/hour"
          tone="info"
        />
        <Stat
          value={latest ? formatGameNumber(numericField(latest, "cellsPerHour")) : "—"}
          label="Latest cells/hour"
          tone="success"
        />
        <Stat
          value={latest && latest.tier !== null ? `T${latest.tier}` : "—"}
          label="Latest tier"
        />
      </Grid>

      <RateChart title="Coins per hour" reports={shown} fieldKey="coinsPerHour" logScale={logScale} tone="info" />
      <RateChart title="Cells per hour" reports={shown} fieldKey="cellsPerHour" logScale={logScale} tone="success" />

      {shown.length > 0 && (
        <>
          <TierSplitChart title="Waves per run" reports={shown} valueOf={(report) => report.wave} />
          <TierSplitChart
            title="Time per run"
            reports={shown}
            valueOf={(report) =>
              typeof report.fields.realTime === "number"
                ? Number((report.fields.realTime / 3600).toFixed(2))
                : null
            }
            valueFormatter={(value) => `${value.toFixed(1)}h`}
          />
        </>
      )}
    </Stack>
  );
}

const LEAGUE_COLORS: Record<string, string> = {
  Copper: "orange.7",
  Silver: "gray.5",
  Gold: "yellow.6",
  Platinum: "cyan.5",
  Champion: "violet.6",
  Legend: "red.6",
};

function leagueLabel(report: StatsReport): string {
  return report.league ?? (report.tier !== null ? `Tier ${report.tier}?` : "Unknown");
}

function TournamentsTab({ reports }: { reports: StatsReport[] }) {
  const latest = reports[reports.length - 1];
  const bestWave = reports.reduce<number | null>(
    (best, report) => (report.wave !== null && (best === null || report.wave > best) ? report.wave : best),
    null,
  );
  const unknownTiers = [
    ...new Set(reports.filter((r) => r.league === null && r.tier !== null).map((r) => r.tier as number)),
  ].sort((a, b) => a - b);
  const hasPlacements = reports.some((report) => report.placement !== null);

  // Newest first for the table.
  const rows = [...reports].reverse();

  return (
    <Stack gap={16}>
      <Grid columns="repeat(auto-fit, minmax(160px, 1fr))" gap={16}>
        <Stat value={String(reports.length)} label="Tournaments" />
        <Stat
          value={latest ? latest.league ?? (latest.tier !== null ? `Tier ${latest.tier}?` : "—") : "—"}
          label="Current league"
          tone="info"
        />
        <Stat value={latest?.wave !== null && latest ? String(latest.wave) : "—"} label="Latest wave" />
        <Stat value={bestWave !== null ? String(bestWave) : "—"} label="Best wave" tone="success" />
      </Grid>

      {unknownTiers.length > 0 && (
        <Callout tone="warning" title="Unknown league for some tiers">
          No league mapping yet for tier{unknownTiers.length > 1 ? "s" : ""} {unknownTiers.join(", ")}.
          Add it to LEAGUE_BY_TIER in battle-report-stats/build.ts and rerun the stats build.
        </Callout>
      )}

      {reports.length > 0 && (
        <Card>
          <CardHeader>Waves per tournament</CardHeader>
          <CardBody>
            {/* One series per league: a league change breaks the line, so a
                single tournament spent in a league shows as a lone dot. */}
            <MantineLineChart
              h={220}
              data={reports.map((report) => ({
                category: dateLabel(report),
                ...(report.wave !== null ? { [leagueLabel(report)]: report.wave } : {}),
              }))}
              dataKey="category"
              series={[...new Set(reports.map(leagueLabel))].map((league) => ({
                name: league,
                color: LEAGUE_COLORS[league] ?? "gray.6",
              }))}
              curveType="monotone"
              connectNulls={false}
              withLegend
            />
          </CardBody>
        </Card>
      )}

      {!hasPlacements && (
        <Text size="small" tone="tertiary">
          Placements come from battle-reports/placements.json (UTC date → placement); battle reports
          themselves don't record them.
        </Text>
      )}

      <div style={{ overflowX: "auto" }}>
        <Table
          headers={["Date", "League", "Tier", "Wave", "Placement", "Coins earned"]}
          columnAlign={["left", "left", "right", "right", "right", "right"]}
          rows={rows.map((report) => [
            dateLabel(report),
            report.league ?? (report.tier !== null ? `Tier ${report.tier}?` : "—"),
            report.tier !== null ? String(report.tier) : "—",
            report.wave !== null ? String(report.wave) : "—",
            report.placement !== null ? String(report.placement) : "—",
            formatGameNumber(numericField(report, "coinsEarned")),
          ])}
          emptyMessage="No tournament runs in the loaded data."
        />
      </div>
    </Stack>
  );
}

export default function BattleReportStats() {
  const [stats, setStats] = useState<StatsFile | null>(null);
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"farm" | "tournaments">("farm");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const theme = useHostTheme();

  const loadText = useCallback((text: string, label: string) => {
    try {
      const parsed = JSON.parse(text) as StatsFile;
      if (!Array.isArray(parsed.reports)) throw new Error("no reports array");
      setStats(parsed);
      setSource(label);
      setError("");
    } catch {
      setError(`${label} is not a battle report stats JSON — run pnpm stats:battle-reports.`);
    }
  }, []);

  useEffect(() => {
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
    fetch(`${base}${DEFAULT_STATS_PATH}`)
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
  }, [loadText]);

  const loadFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      file.text().then((text) => loadText(text, file.name));
    },
    [loadText],
  );

  const farm = stats?.reports.filter((report) => report.runType === "farm") ?? [];
  const tournaments = stats?.reports.filter((report) => report.runType === "tournament") ?? [];

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
      style={dragging ? { outline: "2px dashed currentColor", outlineOffset: -2, borderRadius: 8 } : undefined}
    >
      <Stack gap={20} style={{ padding: 4 }}>
        <Stack gap={4}>
          <H1>Battle Report Stats</H1>
          <Text tone="secondary">
            The Tower — farm and tournament history from your battle reports. Loads{" "}
            {DEFAULT_STATS_PATH} by default; drag &amp; drop or pick another stats JSON.
          </Text>
        </Stack>

        <div style={{ borderBottom: `1px solid ${theme.stroke.secondary}` }}>
          <Row align="center" gap={4} wrap>
            <TabButton
              label="Farm"
              count={stats ? farm.length : undefined}
              active={tab === "farm"}
              onClick={() => setTab("farm")}
            />
            <TabButton
              label="Tournaments"
              count={stats ? tournaments.length : undefined}
              active={tab === "tournaments"}
              onClick={() => setTab("tournaments")}
            />
            <Spacer />
            {stats && (
              <Text size="small" tone="tertiary">
                {source} · {stats.reports.length} reports · generated{" "}
                {stats.meta.generatedAt.slice(0, 10)}
              </Text>
            )}
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              Load JSON…
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(e) => {
                loadFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </Row>
        </div>

        {error && !stats && (
          <Callout tone="neutral" title="No data loaded">
            {error}
          </Callout>
        )}
        {error && stats && (
          <Callout tone="warning" title="Load failed">
            {error} Showing the previously loaded data.
          </Callout>
        )}

        {stats && (tab === "farm" ? <FarmTab reports={farm} /> : <TournamentsTab reports={tournaments} />)}
      </Stack>
    </div>
  );
}
