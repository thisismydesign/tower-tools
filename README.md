# Tower Convert

Converts Tower game battle report JSON exports to CSV (tab-separated) format.

## Usage

Place JSON files in the `bulk_input/` folder, then run:

```sh
ruby convert.rb
```

CSV files will be created in the `bulk_output/` folder with the same base name. Existing files are overwritten.

## Testing

```sh
ruby spec.rb
```

Verifies that converting `example/bulk_input.json` produces output matching `example/bulk_output.csv`.
