#!/usr/bin/env ruby
require 'json'
require 'csv'
require 'time'
require 'set'

SECTION_HEADERS = ['Battle Report', 'Combat', 'Utility', 'Enemies Destroyed', 'Bots', 'Guardian'].freeze

KNOWN_KEYS = [
  'Battle Date', 'Game Time', 'Real Time', 'Tier', 'Wave', 'Killed By',
  'Coins earned', 'Coins per hour', 'Cash earned', 'Interest earned',
  'Gem Blocks Tapped', 'Cells Earned', 'Reroll Shards Earned',
  'Damage dealt', 'Damage Taken', 'Damage Taken Wall', 'Damage Taken While Berserked',
  'Damage Gain From Berserk', 'Death Defy', 'Lifesteal',
  'Projectiles Damage', 'Projectiles Count', 'Thorn damage', 'Orb Damage',
  'Enemies Hit by Orbs', 'Land Mine Damage', 'Land Mines Spawned',
  'Rend Armor Damage', 'Death Ray Damage', 'Smart Missile Damage',
  'Inner Land Mine Damage', 'Chain Lightning Damage', 'Death Wave Damage',
  'Tagged by Deathwave', 'Swamp Damage', 'Black Hole Damage', 'Electrons Damage',
  'Waves Skipped', 'Recovery Packages', 'Free Attack Upgrade',
  'Free Defense Upgrade', 'Free Utility Upgrade', 'HP From Death Wave',
  'Coins From Death Wave', 'Cash From Golden Tower', 'Coins From Golden Tower',
  'Coins From Black Hole', 'Coins From Spotlight', 'Coins From Orb',
  'Coins from Coin Upgrade', 'Coins from Coin Bonuses',
  'Total Enemies', 'Basic', 'Fast', 'Tank', 'Ranged', 'Boss', 'Protector',
  'Total Elites', 'Vampires', 'Rays', 'Scatters', 'Saboteur', 'Commander', 'Overcharge',
  'Destroyed By Orbs', 'Destroyed by Thorns', 'Destroyed by Death Ray',
  'Destroyed by Land Mine', 'Destroyed in Spotlight',
  'Flame Bot Damage', 'Thunder Bot Stuns', 'Golden Bot Coins Earned',
  'Destroyed in Golden Bot',
  'Damage', 'Summoned enemies', 'Guardian coins stolen', 'Coins Fetched',
  'Gems', 'Medals', 'Reroll Shards', 'Cannon Shards', 'Armor Shards',
  'Generator Shards', 'Core Shards', 'Common Modules', 'Rare Modules'
].freeze

KEYS_BY_LENGTH = KNOWN_KEYS.sort_by { |k| -k.length }.freeze

def parse_raw_data(raw_data)
  result = {}
  lines = raw_data.split("\n")

  lines.each do |line|
    next if line.strip.empty?
    next if SECTION_HEADERS.include?(line.strip)

    matched_key = KEYS_BY_LENGTH.find { |key| line.start_with?(key) }
    if matched_key
      value = line[matched_key.length..].strip
      result[matched_key] = value
    end
  end

  result
end

def format_battle_date(date)
  date.strftime('%b %d, %Y %H:%M')
end

def normalize_value(val)
  return val if val.nil? || val.empty?

  # Strip leading $ from currency values
  val = val.sub(/^\$/, '')

  # Strip leading x from multiplier values (e.g., x0.00 -> 0.00)
  val = val.sub(/^x/, '')

  # Remove trailing zeros after decimal point (e.g., 480.90B -> 480.9B)
  val = val.gsub(/(\d+\.\d*?)0+([A-Za-z]*)$/, '\1\2')

  # Remove trailing decimal point before suffix or end (e.g., 9.B -> 9B, 0. -> 0)
  val = val.sub(/\.([A-Za-z]*)$/, '\1')

  val
end

# Determine if a run is tournament or farm
# Tournament: Wednesday or Saturday with waves < 1500
# Farm: everything else
def determine_run_type(date, waves)
  day_of_week = date.wday  # 0=Sunday, 3=Wednesday, 6=Saturday
  is_tournament_day = [3, 6].include?(day_of_week)
  
  if is_tournament_day && waves < 1500
    'tournament'
  else
    'farm'
  end
end

# Convert JSON export (multiple records) to CSV
def convert_json_file(input_file, output_file)
  data = JSON.parse(File.read(input_file))

  # Sort by date descending (newest first)
  data.sort_by! { |record| record['date'] }.reverse!

  # Collect all keys from all records for consistent columns
  all_raw_keys = Set.new
  data.each do |record|
    parsed = parse_raw_data(record['rawData'] || '')
    all_raw_keys.merge(parsed.keys)
  end

  other_keys = (all_raw_keys - ['Battle Date']).to_a.sort_by(&:downcase)
  sorted_raw_keys = ['Battle Date'] + other_keys
  headers = ['_Date', '_Time', '_Run Type'] + sorted_raw_keys

  CSV.open(output_file, 'w', col_sep: "\t", force_quotes: false) do |csv|
    csv << headers

    data.each do |record|
      date = Time.parse(record['date']).utc
      parsed_raw = parse_raw_data(record['rawData'] || '')
      waves = record['waves'] || 0

      # Override Battle Date with formatted JSON date
      parsed_raw['Battle Date'] = format_battle_date(date)

      # Determine run type (tournament or farm)
      run_type = determine_run_type(date, waves)

      row = [
        date.strftime('%Y-%m-%d'),
        date.strftime('%H:%M:%S'),
        run_type
      ]

      sorted_raw_keys.each do |key|
        val = parsed_raw[key]
        row << (val.to_s.empty? ? nil : normalize_value(val))
      end

      csv << row
    end
  end

  # Remove trailing newline to match expected format
  content = File.read(output_file)
  File.write(output_file, content.chomp)

  data.length
end

# Convert single TXT report to TXT with key<TAB>value format
def convert_txt_file(input_file, output_file)
  raw_data = File.read(input_file)
  parsed = parse_raw_data(raw_data)

  # Sort keys: Battle Date first, then alphabetically by lowercase
  other_keys = (parsed.keys - ['Battle Date']).sort_by(&:downcase)
  sorted_keys = ['Battle Date'] + other_keys

  # Build output with key<TAB>value on each line
  lines = sorted_keys.map do |key|
    "#{key}\t#{normalize_value(parsed[key])}"
  end

  File.write(output_file, lines.join("\n"))

  1
end

# Main execution - only run when script is called directly
if __FILE__ == $0
  script_dir = File.dirname(File.expand_path(__FILE__))
  input_dir = File.join(script_dir, 'input')
  output_dir = File.join(script_dir, 'output')

  json_files = Dir.glob(File.join(input_dir, '*.json'))
  txt_files = Dir.glob(File.join(input_dir, '*.txt'))

  if json_files.empty? && txt_files.empty?
    puts "No JSON or TXT files found in #{input_dir}"
    exit 0
  end

  # Process JSON files -> CSV
  json_files.each do |input_file|
    basename = File.basename(input_file, '.json')
    output_file = File.join(output_dir, "#{basename}.csv")

    record_count = convert_json_file(input_file, output_file)
    puts "Converted #{record_count} records: #{File.basename(input_file)} -> #{File.basename(output_file)}"
  end

  # Process TXT files -> TXT
  txt_files.each do |input_file|
    basename = File.basename(input_file, '.txt')
    # Replace _input with _output, or append _output if no _input suffix
    output_basename = basename.sub(/_input$/, '_output')
    output_basename = "#{basename}_output" if output_basename == basename
    output_file = File.join(output_dir, "#{output_basename}.txt")

    convert_txt_file(input_file, output_file)
    puts "Converted: #{File.basename(input_file)} -> #{File.basename(output_file)}"
  end

  total = json_files.length + txt_files.length
  puts "Done. Processed #{total} file(s)."
end
