# Tower Convert

Converts Tower game battle report JSON exports to CSV (tab-separated) format.

## Usage

```sh
ruby convert.rb <input.json>
```

This creates a `.csv` file in the same directory as the input file.

### Example

```sh
ruby convert.rb example/input.json
# Creates example/input.csv
```

## Testing

```sh
ruby spec.rb
```

Verifies that converting `example/input.json` produces output matching `example/output.csv`.
