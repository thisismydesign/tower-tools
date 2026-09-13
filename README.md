# Tower Tools

A collection of tools for the mobile game [The Tower](https://the-tower-idle-tower-defense.fandom.com/).

**Web app:** [thisismydesign.github.io/tower-tools](https://thisismydesign.github.io/tower-tools/)

## Tools

### Enemy Level Skip Calculator

Projects how many enemy levels you skip over a run — for both the health and attack tracks — based on your current skip level, workshop enhancement, free upgrade rate, and tournament-tier skip reductions (overheat and skip decay). Adjust the inputs to see your per-wave skip chance, cumulative skips, and where each track maxes out.

### Thorn Calculator

Estimates how many hits it takes to kill regular enemies and bosses with thorns. Set your thorn damage %, armor submod, tier, plasma cannon level, wall thorns, and Sharp Fortitude to see per-hit damage, boss hit breakdown after plasma pre-damage, and a tier resistance reference table.

### Golden Bot + Gilded Sniper Planner

Finds the best split of medals between Golden Bot range and coin multiplier when the Gilded Sniper cannon module gives out-of-range kills a chance (10-40% by rarity) to receive active coin bonuses. Enter your total medals (including what is already invested in Golden Bot), current range/bonus levels, extra range, the "kills in Golden Bot range" percentage from a battle report, and the sniper rarity to get the target levels, an ordered upgrade path, and a range-first vs. multiplier-first vs. optimal comparison.

### Submod Reroll Calculator

Works out how many reroll shards it takes to land a specific sub-module effect. Pick the module type, target rarity, locked slots, and banned effects to see the per-slot and per-reroll hit chance, the expected (average) shard cost, and a shards-by-confidence table.

### Battle Report Importer

Pulls battle reports out of Gmail drafts and writes each one to `battle-reports/` (gitignored), named after the battle's own timestamp — `2026.07.11 15:29.txt`. Lives in `battle-report-importer/`.

Set `EMAIL_ADDRESS` and `IMAP_PASSWORD` (https://myaccount.google.com/apppasswords) in `.env` at the repo root. Then run:

```sh
pnpm import:battle-reports              # everything
pnpm import:battle-reports -- --limit 5 # newest n only
```

Matching happens server-side via IMAP `SEARCH`, so non-reports are never downloaded, and the mailbox is opened read-only. Built on [`@thisismydesign/imap-importer`](https://www.npmjs.com/package/@thisismydesign/imap-importer). Files with the same battle timestamp overwrite.

### Battle Report Converter

Combines a folder of battle report `.txt` files into one tab-separated CSV. Lives in `battle-report-converter/`.

```sh
pnpm convert:battle-reports -- \
  --timezone Europe/Budapest \
  --input battle-reports \
  --output battle-reports/00-combined.csv \
  --tournament-detection-max-waves 3000
```

`--timezone` says which zone the reports' times are in. Run type and the `_Date`/`_Time` columns are stored in **UTC**. A run on a Wednesday or Saturday UTC below `--tournament-detection-max-waves` is a tournament; everything else is a farm.

Importable too — passing `write: false` returns the CSV as a string instead of writing it:

```ts
const csv = await convertBattleReports({
  timezone: 'Europe/Budapest',
  inputDir: 'battle-reports',
  outputFile: 'battle-reports/00-combined.csv',
  tournamentDetectionMaxWaves: 3000,
  write: false,
})
```

### Battle Report Stats

A tool with Farm and Tournaments tabs: coins/hour and cells/hour charts across farm runs — plus headline tiles for the coins/day the latest rate projects to and the all-time peak coins/minute (from each report's `Highest Coins / Minute` record, which only newer reports carry) — and league/tier/wave/placement per tournament. It reads `battle-reports/00-stats.json` by default (served by the dev server); drag & drop or pick another stats JSON in the UI.

The JSON comes from a standalone generator in `battle-report-stats/` — it parses the `.txt` reports directly (reusing the converter's key normalization so renamed report keys land on the same camelCase JSON keys), parses game numbers (`35.63B`) and durations into plain numbers, and stamps each report with its UTC battle date and run type using the same tournament detection as the converter:

```sh
pnpm stats:battle-reports   # battle-reports/*.txt -> battle-reports/00-stats.json
```

Defaults (`--input battle-reports --output battle-reports/00-stats.json --timezone Europe/Budapest --tournament-detection-max-waves 3000`) can all be overridden with flags.

Tournament league is derived from the run's tier (`LEAGUE_BY_TIER` in `battle-report-stats/build.ts`: 1 Copper, 3 Silver, 5 Gold, 8 Platinum, 12 Champion, 17 Legend). Placements aren't in the reports — an optional `battle-reports/placements.json` mapping UTC date to placement (`{"2026-07-25": 3}`) fills that column.

## Deployment

### Web app

A plain React + [Mantine](https://mantine.dev/) single-page app under `src/`, hosted on GitHub Pages:

```
src/
  main.tsx          React root + MantineProvider
  App.tsx           AppShell layout, nav, hash routing — the tool list lives here
  components/       Stat, SectionCard, DataTable, SliderField (bits Mantine doesn't ship)
  tools/<Tool>.tsx  one self-contained file per tool
```

Each tool is a single default-exported React component; inputs persist via Mantine's `useLocalStorage`. To add one, drop `src/tools/<Tool>.tsx` in and add a line to `TOOLS` in `src/App.tsx` — its `id` doubles as the `#/<id>` route.

### Running and deploying

Tool versions (Node, pnpm) are pinned in `.tool-versions` and managed with [mise](https://mise.jdx.dev/).

```sh
mise install        # install Node + pnpm from .tool-versions
pnpm install
pnpm dev            # local dev server
pnpm build          # static build -> dist/
pnpm typecheck      # tsc --noEmit
```

Deployment is automated: `.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`. The Vite `base` defaults to `/tower-tools/`; override with the `BASE_PATH` env var if the repo is renamed. Enable Pages once under Settings -> Pages -> Source: GitHub Actions.
