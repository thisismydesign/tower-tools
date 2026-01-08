#!/usr/bin/env ruby
# Simple spec to verify convert.rb produces correct output
# Run with: ruby spec.rb

require 'tempfile'
require 'fileutils'

SCRIPT_PATH = File.expand_path('convert.rb', __dir__)
INPUT_PATH = File.expand_path('example/bulk_input.json', __dir__)
EXPECTED_OUTPUT_PATH = File.expand_path('example/bulk_output.csv', __dir__)

# Load the convert script to get access to convert_file function
load SCRIPT_PATH

def run_spec
  temp_dir = Dir.mktmpdir
  temp_input = File.join(temp_dir, 'input.json')
  temp_output = File.join(temp_dir, 'input.csv')

  begin
    FileUtils.cp(INPUT_PATH, temp_input)

    # Call convert_file directly
    convert_file(temp_input, temp_output)

    raise "Output file not created" unless File.exist?(temp_output)

    actual = File.read(temp_output)
    expected = File.read(EXPECTED_OUTPUT_PATH)

    if actual == expected
      puts "PASS: Output matches expected (#{actual.lines.size} lines)"
      true
    else
      actual_lines = actual.lines
      expected_lines = expected.lines

      puts "FAIL: Output differs"
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
  ensure
    FileUtils.rm_rf(temp_dir)
  end
end

# Only run if this file is executed directly (not when loaded by convert.rb)
if __FILE__ == $0
  exit(run_spec ? 0 : 1)
end
