# Tower Tools

A collection of tools for the mobile game [The Tower](https://the-tower-idle-tower-defense.fandom.com/).

## Tools

### Enemy Level Skip Calculator

Projects how many enemy levels you skip over a run — for both the health and attack tracks — based on your current skip level, workshop enhancement, free upgrade rate, and tournament-tier skip reductions (overheat and skip decay). Adjust the inputs to see your per-wave skip chance, cumulative skips, and where each track maxes out.

https://thisismydesign.github.io/tower-tools/

### Battle Report Converter

Converts Tower game battle reports to CSV/TXT (tab-separated) format. Lives in `battle-report-converter/`.

Place files in the `battle-report-converter/input/` folder, then run:

```sh
cd battle-report-converter
ruby convert.rb
```

- `.json` files (bulk exports) → `.csv` in `output/`
- `.txt` files (single reports) → `.txt` with `Key<TAB>Value` format in `output/`

Existing files are overwritten.

#### Testing

```sh
cd battle-report-converter
ruby spec.rb
```

Verifies both conversion scenarios:
- `example/bulk_input.json` → `example/bulk_output.csv`
- `example/single_input.txt` → `example/single_output.txt`

## Deployment

### Canvases

The interactive tools are authored as [Cursor Canvases](https://cursor.com/docs/agent/tools/canvas) — single-file React components (`.cursor/canvases/*.canvas.tsx`) that import only from `cursor/canvas` and render beside the chat in the Cursor IDE.

To make them usable by anyone, the same source is built into a static web app. A Vite alias (and a matching `tsconfig` path) resolves the `cursor/canvas` import to the [`@thisismydesign/cursor-canvas-web`](https://github.com/thisismydesign/cursor-canvas-web) Mantine-backed shim, so the canvas runs unchanged in the browser. The build output is hosted on GitHub Pages.

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
