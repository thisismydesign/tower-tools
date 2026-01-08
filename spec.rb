#!/usr/bin/env ruby
# Simple spec to verify convert.rb produces correct output
# Run with: ruby spec.rb

require 'tempfile'
require 'fileutils'

SCRIPT_PATH = File.expand_path('convert.rb', __dir__)

# Test files
BULK_INPUT_PATH = File.expand_path('example/bulk_input.json', __dir__)
BULK_EXPECTED_PATH = File.expand_path('example/bulk_output.csv', __dir__)
SINGLE_INPUT_PATH = File.expand_path('example/single_input.txt', __dir__)
SINGLE_EXPECTED_PATH = File.expand_path('example/single_output.txt', __dir__)

# Load the convert script to get access to convert functions
load SCRIPT_PATH

def compare_files(actual_path, expected_path, label)
  actual = File.read(actual_path)
  expected = File.read(expected_path)

  if actual == expected
    puts "PASS [#{label}]: Output matches expected (#{actual.lines.size} lines)"
    true
  else
    actual_lines = actual.lines
    expected_lines = expected.lines

    puts "FAIL [#{label}]: Output differs"
    puts "  Line count: expected #{expected_lines.size}, got #{actual_lines.size}"

    # Show first difference
    actual_lines.zip(expected_lines).each_with_index do |(a, e), i|
      next if a == e
      puts "  First diff at line #{i + 1}:"
      puts "    Expected: #{e&.chomp&.slice(0, 120)}..."
      puts "    Actual:   #{a&.chomp&.slice(0, 120)}..."
      break
    end
    false
  end
end

def test_json_to_csv
  temp_dir = Dir.mktmpdir
  temp_input = File.join(temp_dir, 'input.json')
  temp_output = File.join(temp_dir, 'input.csv')

  begin
    FileUtils.cp(BULK_INPUT_PATH, temp_input)
    convert_json_file(temp_input, temp_output)

    raise "Output file not created" unless File.exist?(temp_output)
    compare_files(temp_output, BULK_EXPECTED_PATH, "JSON → CSV")
  ensure
    FileUtils.rm_rf(temp_dir)
  end
end

def test_txt_to_txt
  temp_dir = Dir.mktmpdir
  temp_input = File.join(temp_dir, 'single_input.txt')
  temp_output = File.join(temp_dir, 'single_output.txt')

  begin
    FileUtils.cp(SINGLE_INPUT_PATH, temp_input)
    convert_txt_file(temp_input, temp_output)

    raise "Output file not created" unless File.exist?(temp_output)
    compare_files(temp_output, SINGLE_EXPECTED_PATH, "TXT → TXT")
  ensure
    FileUtils.rm_rf(temp_dir)
  end
end

# Only run if this file is executed directly
if __FILE__ == $0
  results = []
  results << test_json_to_csv
  results << test_txt_to_txt

  puts "---"
  if results.all?
    puts "All tests passed!"
    exit 0
  else
    puts "Some tests failed!"
    exit 1
  end
end
