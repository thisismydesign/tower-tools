# Tower Tools

A collection of tools for the mobile game [The Tower](https://the-tower-idle-tower-defense.fandom.com/).

**Web app:** [thisismydesign.github.io/tower-tools](https://thisismydesign.github.io/tower-tools/)

## Tools

### Enemy Level Skip Calculator

Projects how many enemy levels you skip over a run — for both the health and attack tracks — based on your current skip level, workshop enhancement, free upgrade rate, and tournament-tier skip reductions (overheat and skip decay). Adjust the inputs to see your per-wave skip chance, cumulative skips, and where each track maxes out.

### Thorn Calculator

Estimates how many hits it takes to kill regular enemies and bosses with thorns. Set your thorn damage %, armor submod, tier, plasma cannon level, wall thorns, and Sharp Fortitude to see per-hit damage, boss hit breakdown after plasma pre-damage, and a tier resistance reference table.

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

## Deployment

### Canvases

Web dashboards and tools. Live at `canvases/<name>.canvas.tsx`. Built on `cursor/canvas` package, deployed to the web via [`@thisismydesign/cursor-canvas-web`](https://github.com/thisismydesign/cursor-canvas-web) Mantine-backed shim. Hosted on GitHub Pages.

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
