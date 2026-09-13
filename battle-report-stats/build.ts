#!/usr/bin/env node
// Builds battle-reports/00-stats.json from a folder of battle report .txt files.
// Standalone pipeline for the Battle Report Stats canvas — the CSV converter
// is untouched; only its parsing and key normalization are reused.
//
//   pnpm stats:battle-reports
//   pnpm stats:battle-reports -- --timezone Europe/Budapest \
//     --input battle-reports --output battle-reports/00-stats.json \
//     --tournament-detection-max-waves 3000 --placements battle-reports/placements.json
//
// Keys are the converter's canonical column names re-cast as camelCase, so
// every report era lands on the same JSON keys. Values are parsed into plain
// numbers (suffix notation like 35.63B, durations like "7h 47m 4s" become
// seconds); anything non-numeric stays a string.

import { realpathSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { battleInstant, normalizeValue, parseReport } from '../battle-report-converter/convert.ts'

// Wednesday and Saturday, in UTC — same rule as the CSV converter.
const TOURNAMENT_DAYS = [3, 6]

// Tournament runs happen at a league-specific tier; unmapped tiers surface
// as league: null in the JSON.
export const LEAGUE_BY_TIER: Record<number, string> = {
  1: 'Copper',
  3: 'Silver',
  5: 'Gold',
  8: 'Platinum',
  12: 'Champion',
  17: 'Legend',
}

// The game's abbreviated number ladder: K M B T q Q s S O N D, then AA, AB, …
const SUFFIX_EXPONENT: Record<string, number> = {
  K: 3, M: 6, B: 9, T: 12, q: 15, Q: 18, s: 21, S: 24, O: 27, N: 30, D: 33,
}

const DURATION_KEYS = new Set(['gameTime', 'realTime'])

const DURATION = /^(?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?$/

/** "255.41T" -> 2.5541e14, "$24.85B" -> 2.485e10; null when not a number. */
export function parseGameNumber(raw: string): number | null {
  const value = normalizeValue(raw.trim())
  const match = /^(-?\d+(?:\.\d+)?)([A-Za-z]{0,2})$/.exec(value)
  if (!match) return null

  const [, digits, suffix] = match
  const base = Number(digits)
  if (!suffix) return base

  if (suffix.length === 1) {
    const exponent = SUFFIX_EXPONENT[suffix]
    return exponent === undefined ? null : base * 10 ** exponent
  }

  // Two uppercase letters continue the ladder: AA = 1e36, each step ×1000.
  if (!/^[A-Z]{2}$/.test(suffix)) return null
  const steps = (suffix.charCodeAt(0) - 65) * 26 + (suffix.charCodeAt(1) - 65)
  return base * 10 ** (36 + steps * 3)
}

/** "1d 13h 57m 30s" -> seconds; null when the shape doesn't match. */
export function parseDuration(raw: string): number | null {
  const match = DURATION.exec(raw.trim())
  if (!match || match.slice(1).every((part) => part === undefined)) return null

  const [, d = '0', h = '0', m = '0', s = '0'] = match
  return ((Number(d) * 24 + Number(h)) * 60 + Number(m)) * 60 + Number(s)
}

/** Canonical column name -> JSON key: "Coins per hour" -> coinsPerHour. */
export function jsonKey(name: string): string {
  const words = name
    .replace(/\//g, ' Per ')
    .replace(/%/g, ' Pct ')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)

  return words
    .map((word, i) => (i === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase()))
    .join('')
}

export type ReportFields = Record<string, number | string>

export interface StatsReport {
  file: string
  /** UTC instant of the Battle Date, or null if unparseable. */
  battleDate: string | null
  runType: 'farm' | 'tournament' | null
  tier: number | null
  wave: number | null
  /** Tournament league from tier, when the run is a tournament. */
  league: string | null
  /** From the optional placements sidecar; reports themselves don't carry it. */
  placement: number | string | null
  fields: ReportFields
}

export interface StatsFile {
  meta: {
    generatedAt: string
    sourceDir: string
    timezone: string
    tournamentDetectionMaxWaves: number
    counts: { total: number; farm: number; tournament: number; unknown: number }
  }
  reports: StatsReport[]
}

export interface BuildOptions {
  inputDir: string
  outputFile: string
  timezone: string
  tournamentDetectionMaxWaves: number
  /** Optional JSON file mapping UTC date (YYYY-MM-DD) to tournament placement. */
  placementsFile?: string
  /** `false` returns the stats without touching disk. Defaults to `true`. */
  write?: boolean
}

function toFields(parsed: Record<string, string>): ReportFields {
  const fields: ReportFields = {}

  for (const [name, raw] of Object.entries(parsed)) {
    if (name === 'Battle Date') continue
    const key = jsonKey(name)

    if (DURATION_KEYS.has(key)) {
      fields[key] = parseDuration(raw) ?? raw
      continue
    }

    fields[key] = parseGameNumber(raw) ?? raw
  }

  return fields
}

/** Old reports lack per-hour rates; derive them so every era charts the same. */
function derivePerHour(fields: ReportFields): void {
  const realTime = fields.realTime
  if (typeof realTime !== 'number' || realTime <= 0) return

  const hours = realTime / 3600
  for (const [total, rate] of [
    ['coinsEarned', 'coinsPerHour'],
    ['cellsEarned', 'cellsPerHour'],
  ] as const) {
    if (fields[rate] === undefined && typeof fields[total] === 'number') {
      fields[rate] = (fields[total] as number) / hours
    }
  }
}

async function readPlacements(file?: string): Promise<Record<string, number | string>> {
  if (!file) return {}
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
}

export async function buildBattleReportStats(options: BuildOptions): Promise<StatsFile> {
  const { inputDir, outputFile, timezone, tournamentDetectionMaxWaves, placementsFile, write = true } = options

  const placements = await readPlacements(placementsFile)
  const names = (await readdir(inputDir)).filter((name) => name.endsWith('.txt')).sort()

  const reports = await Promise.all(
    names.map(async (name): Promise<StatsReport> => {
      const parsed = parseReport(await readFile(join(inputDir, name), 'utf8'))
      const fields = toFields(parsed)
      derivePerHour(fields)

      const instant = battleInstant(parsed['Battle Date'] ?? '', timezone)
      const tier = typeof fields.tier === 'number' ? fields.tier : null
      const wave = typeof fields.wave === 'number' ? fields.wave : null

      let runType: StatsReport['runType'] = null
      if (instant) {
        const isTournamentDay = TOURNAMENT_DAYS.includes(instant.getUTCDay())
        // Unknown wave count must not read as "below the threshold".
        runType =
          isTournamentDay && (wave ?? Infinity) < tournamentDetectionMaxWaves ? 'tournament' : 'farm'
      }

      const isTournament = runType === 'tournament'
      const utcDate = instant?.toISOString().slice(0, 10)

      return {
        file: name,
        battleDate: instant?.toISOString() ?? null,
        runType,
        tier,
        wave,
        league: isTournament && tier !== null ? LEAGUE_BY_TIER[tier] ?? null : null,
        placement: (isTournament && utcDate && placements[utcDate]) || null,
        fields,
      }
    }),
  )

  // Oldest first, so charts read left to right; undated reports sort last.
  reports.sort(
    (a, b) =>
      (a.battleDate ? Date.parse(a.battleDate) : Infinity) -
      (b.battleDate ? Date.parse(b.battleDate) : Infinity),
  )

  const counts = { total: reports.length, farm: 0, tournament: 0, unknown: 0 }
  for (const report of reports) {
    if (report.runType === 'farm') counts.farm += 1
    else if (report.runType === 'tournament') counts.tournament += 1
    else counts.unknown += 1
  }

  const stats: StatsFile = {
    meta: {
      generatedAt: new Date().toISOString(),
      sourceDir: inputDir,
      timezone,
      tournamentDetectionMaxWaves,
      counts,
    },
    reports,
  }

  if (write) await writeFile(outputFile, JSON.stringify(stats), 'utf8')
  return stats
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const flag = (name: string) => {
    const index = argv.indexOf(`--${name}`)
    if (index === -1) return undefined

    const value = argv[index + 1]
    return value === undefined || value.startsWith('--') ? undefined : value
  }

  const maxWaves = Number(flag('tournament-detection-max-waves') ?? 3000)
  if (!Number.isFinite(maxWaves) || maxWaves <= 0) {
    console.error('--tournament-detection-max-waves must be a positive number')
    process.exit(1)
  }

  const outputFile = flag('output') ?? 'battle-reports/00-stats.json'
  const stats = await buildBattleReportStats({
    inputDir: flag('input') ?? 'battle-reports',
    outputFile,
    timezone: flag('timezone') ?? 'Europe/Budapest',
    tournamentDetectionMaxWaves: maxWaves,
    placementsFile: flag('placements') ?? 'battle-reports/placements.json',
  })

  const { counts } = stats.meta
  console.log(
    `wrote ${counts.total} report(s) to ${outputFile} ` +
      `(${counts.farm} farm, ${counts.tournament} tournament, ${counts.unknown} unknown)`,
  )
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
