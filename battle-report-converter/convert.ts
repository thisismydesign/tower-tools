#!/usr/bin/env node
// Converts a folder of battle report .txt files into one tab-separated CSV.
//
//   pnpm convert:battle-reports -- --timezone Europe/Budapest \
//     --input battle-reports --output battle-reports/combined.csv \
//     --tournament-detection-max-waves 3000
//
// Battle Date lines are wall-clock time in the given timezone; run type and
// the _Date/_Time columns are derived from the corresponding UTC instant.

import { realpathSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { isValid, parse } from 'date-fns'
import { fromZonedTime } from 'date-fns-tz'

import { canonicalKey } from './key-map.ts'

const BATTLE_DATE_FORMAT = 'MMM dd, yyyy HH:mm'

// Wednesday and Saturday, in UTC.
const TOURNAMENT_DAYS = [3, 6]

// A value starts at the first token beginning with a digit, $, or x<digit>.
const KEY_VALUE = /^(.+?)\s((?:\$?\d|x\d).*)$/
// These two carry non-numeric values, so they never match the rule above.
const TEXT_KEYS = ['Battle Date', 'Killed By']

export interface ConvertOptions {
  /** Folder of .txt battle reports. */
  inputDir: string
  /** Where to write the CSV. */
  outputFile: string
  /** IANA zone the reports' Battle Date times are expressed in. */
  timezone: string
  /** Runs below this wave count on a tournament day are tournaments. */
  tournamentDetectionMaxWaves: number
  /** `false` returns the CSV without touching disk. Defaults to `true`. */
  write?: boolean
}

/**
 * Splits a report body into its key/value pairs.
 *
 * Section headers are tracked rather than dropped: the current format reuses
 * a bare key under several sections ("Thorns" is both damage dealt and enemies
 * hit), so section plus key is what identifies a value. Keys are then mapped
 * onto the older, self-describing vocabulary so both eras share columns.
 */
export function parseReport(body: string): Record<string, string> {
  const result: Record<string, string> = {}
  let section = ''

  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line) continue

    // Matched with or without a value: a run that ended without dying writes
    // a bare "Killed By", which must not be mistaken for a section header.
    const textKey = TEXT_KEYS.find((key) => line === key || line.startsWith(`${key} `))
    if (textKey) {
      result[textKey] = line.slice(textKey.length).trim()
      continue
    }

    const match = KEY_VALUE.exec(line)
    if (match) result[canonicalKey(section, match[1])] = match[2].trim()
    else section = line
  }

  return result
}

/** Strips currency and multiplier prefixes and trailing decimal noise. */
export function normalizeValue(value: string): string {
  if (!value) return value

  return value
    .replace(/^\$/, '')
    .replace(/^x/, '')
    // Newer reports annotate kill counts with a share, e.g. "35636 [21.9%]".
    // Older ones give a bare count, so drop it to keep the column numeric.
    .replace(/\s*\[[\d.]+%\]$/, '')
    .replace(/(\d+\.\d*?)0+([A-Za-z]*)$/, '$1$2')
    .replace(/\.([A-Za-z]*)$/, '$1')
}

/** The UTC instant a report's Battle Date refers to, or null if unparseable. */
export function battleInstant(battleDate: string, timezone: string): Date | null {
  const naive = parse(battleDate, BATTLE_DATE_FORMAT, new Date())
  if (!isValid(naive)) return null

  const instant = fromZonedTime(naive, timezone)
  return isValid(instant) ? instant : null
}

function runType(instant: Date, waves: number, tournamentWaveCount: number): string {
  const isTournamentDay = TOURNAMENT_DAYS.includes(instant.getUTCDay())
  return isTournamentDay && waves < tournamentWaveCount ? 'tournament' : 'farm'
}

function assertTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
  } catch {
    throw new Error(`Unknown timezone: ${timezone}`)
  }
}

export async function convertBattleReports(options: ConvertOptions): Promise<string> {
  const { inputDir, outputFile, timezone, tournamentDetectionMaxWaves, write = true } = options

  assertTimezone(timezone)

  const names = (await readdir(inputDir)).filter((name) => name.endsWith('.txt')).sort()

  const reports = await Promise.all(
    names.map(async (name) => {
      const fields = parseReport(await readFile(join(inputDir, name), 'utf8'))
      return { name, fields, instant: battleInstant(fields['Battle Date'] ?? '', timezone) }
    }),
  )

  // Newest first; reports without a usable Battle Date sort last.
  reports.sort((a, b) => (b.instant?.getTime() ?? -Infinity) - (a.instant?.getTime() ?? -Infinity))

  const keys = new Set<string>()
  for (const report of reports) for (const key of Object.keys(report.fields)) keys.add(key)

  const otherKeys = [...keys]
    .filter((key) => key !== 'Battle Date')
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
  const dataKeys = ['Battle Date', ...otherKeys]

  const rows = [['_Date', '_Time', '_Run Type', ...dataKeys]]

  for (const { fields, instant } of reports) {
    // Unknown wave count must not read as "below the threshold", which would
    // classify the run as a tournament on a tournament day.
    const waves = fields['Wave'] ? Number(fields['Wave'].replace(/[^\d]/g, '')) : Infinity

    rows.push([
      instant ? instant.toISOString().slice(0, 10) : '',
      instant ? instant.toISOString().slice(11, 19) : '',
      instant ? runType(instant, waves, tournamentDetectionMaxWaves) : '',
      ...dataKeys.map((key) => normalizeValue(fields[key] ?? '')),
    ])
  }

  const csv = rows.map((row) => row.join('\t')).join('\n')
  if (write) await writeFile(outputFile, csv, 'utf8')

  return csv
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const flag = (name: string) => {
    const index = argv.indexOf(`--${name}`)
    if (index === -1) return undefined

    // A missing value would otherwise swallow the next flag as its argument.
    const value = argv[index + 1]
    return value === undefined || value.startsWith('--') ? undefined : value
  }

  const timezone = flag('timezone')
  const inputDir = flag('input')
  const outputFile = flag('output')
  const maxWaves = Number(flag('tournament-detection-max-waves'))

  if (!timezone || !inputDir || !outputFile || !Number.isFinite(maxWaves) || maxWaves <= 0) {
    console.error(
      'Usage: convert.ts --timezone <IANA zone> --input <dir> --output <file> --tournament-detection-max-waves <n>',
    )
    process.exit(1)
  }

  const csv = await convertBattleReports({
    inputDir,
    outputFile,
    timezone,
    tournamentDetectionMaxWaves: maxWaves,
  })

  const lines = csv.split('\n').length - 1
  console.log(`converted ${lines} report(s) to ${outputFile}`)
}

// realpath both sides: argv[1] may be a symlink into this file.
const invokedDirectly =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
