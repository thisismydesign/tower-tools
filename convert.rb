#!/usr/bin/env ruby
require 'json'
require 'csv'
require 'time'

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
  'Tagged by Deathwave', 'Swamp Damage', 'Black Hole Damage',
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
  # Match: digits, dot, digits with trailing zeros, then optional suffix
  val = val.gsub(/(\d+\.\d*?)0+([A-Za-z]*)$/, '\1\2')

  # Remove trailing decimal point before suffix or end (e.g., 9.B -> 9B, 0. -> 0)
  val = val.sub(/\.([A-Za-z]*)$/, '\1')

  val
end

def convert_file(input_file, output_file)
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
  headers = ['_Date', '_Time'] + sorted_raw_keys

  CSV.open(output_file, 'w', col_sep: "\t", force_quotes: false) do |csv|
    csv << headers

    data.each do |record|
      date = Time.parse(record['date']).utc
      parsed_raw = parse_raw_data(record['rawData'] || '')

      # Override Battle Date with formatted JSON date
      parsed_raw['Battle Date'] = format_battle_date(date)

      row = [
        date.strftime('%Y-%m-%d'),
        date.strftime('%H:%M:%S')
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

# Main execution - only run when script is called directly
if __FILE__ == $0
  script_dir = File.dirname(File.expand_path(__FILE__))
  input_dir = File.join(script_dir, 'input')
  output_dir = File.join(script_dir, 'output')

  input_files = Dir.glob(File.join(input_dir, '*.json'))

  if input_files.empty?
    puts "No JSON files found in #{input_dir}"
    exit 0
  end

  input_files.each do |input_file|
    basename = File.basename(input_file, '.json')
    output_file = File.join(output_dir, "#{basename}.csv")

    record_count = convert_file(input_file, output_file)
    puts "Converted #{record_count} records: #{File.basename(input_file)} -> #{File.basename(output_file)}"
  end

  puts "Done. Processed #{input_files.length} file(s)."
end
