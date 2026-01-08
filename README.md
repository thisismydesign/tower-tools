# Tower Convert

Converts Tower game battle reports to CSV/TXT (tab-separated) format.

## Usage

Place files in the `input/` folder, then run:

```sh
ruby convert.rb
```

- `.json` files (bulk exports) → `.csv` in `output/`
- `.txt` files (single reports) → `.txt` with `Key<TAB>Value` format in `output/`

Existing files are overwritten.

## Testing

```sh
ruby spec.rb
```

Verifies that converting `example/bulk_input.json` produces output matching `example/bulk_output.csv`.
