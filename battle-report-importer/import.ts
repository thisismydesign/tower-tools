#!/usr/bin/env node
// Imports Tower battle reports from Gmail drafts and writes each body to
// battle-reports/, named after the battle's own timestamp.
//
//   pnpm import:battle-reports
//   pnpm import:battle-reports --limit 10

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'
import { format, parse } from 'date-fns'
import { importMessages } from '@thisismydesign/imap-importer'

const HERE = dirname(fileURLToPath(import.meta.url))

dotenv.config({ path: join(HERE, '..', '.env') })

const OUTPUT_DIR = join(HERE, '..', 'battle-reports')

// Reports carry their own date line, e.g. "Battle Date Jul 06, 2026 14:59".
const BATTLE_DATE = /^Battle Date (.+)$/m
const BATTLE_DATE_FORMAT = 'MMM dd, yyyy HH:mm'
const FILE_NAME_FORMAT = 'yyyy.MM.dd HH:mm'

/** The battle's own date, taken from the report's Battle Date line. */
function battleDate(body: string): Date {
  const match = BATTLE_DATE.exec(body)
  if (!match) throw new Error('report has no Battle Date line')

  return parse(match[1].trim(), BATTLE_DATE_FORMAT, new Date())
}

async function main(): Promise<void> {
  const limitFlag = process.argv.indexOf('--limit')
  const limit = limitFlag === -1 ? undefined : Number(process.argv[limitFlag + 1])

  const { EMAIL_ADDRESS, IMAP_PASSWORD } = process.env
  if (!EMAIL_ADDRESS || !IMAP_PASSWORD) {
    console.error('EMAIL_ADDRESS and IMAP_PASSWORD must be set in .env')
    process.exit(1)
  }

  await mkdir(OUTPUT_DIR, { recursive: true })

  // write: false keeps messages in memory so we can name files ourselves;
  // match becomes a server-side IMAP SEARCH, so non-reports never download.
  const { matched, imported } = await importMessages({
    host: 'imap.gmail.com',
    user: EMAIL_ADDRESS,
    password: IMAP_PASSWORD,
    folder: '[Gmail]/Drafts',
    match: 'Battle Report',
    format: 'json',
    write: false,
    limit,
  })

  let written = 0
  let skipped = 0

  for (const message of imported) {
    const body = message.record?.text
    if (!body) {
      skipped++
      continue
    }

    // A draft can match the search without being a report we can date; skip
    // it rather than losing the rest of the batch.
    try {
      const stamp = format(battleDate(body), FILE_NAME_FORMAT)
      await writeFile(join(OUTPUT_DIR, `${stamp}.txt`), body, 'utf8')
      written++
    } catch {
      skipped++
    }
  }

  console.log(
    `matched ${matched}, wrote ${written} to ${OUTPUT_DIR}${skipped ? `, skipped ${skipped}` : ''}`,
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
