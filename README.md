# Tower Tools

A collection of tools for the mobile game [The Tower](https://the-tower-idle-tower-defense.fandom.com/).

## Tools

### Enemy Level Skip Calculator

An interactive Cursor Canvas (`.cursor/canvases/enemy-level-skip.canvas.tsx`) that models enemy level skip chance based on level, workshop enhancement, free upgrade, and tournament-tier skip reductions (overheat and skip decay).

Open it as a canvas beside the chat in Cursor to explore the values interactively.

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
