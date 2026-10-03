import { describe, expect, it } from 'vitest'

import { tournamentDate } from './convert.ts'

describe('tournamentDate', () => {
  it('returns the UTC date for a run on a tournament day', () => {
    expect(tournamentDate(new Date('2026-09-19T22:13:00Z'))).toBe('2026-09-19')
  })

  it('counts a run in the grace period toward the previous tournament day', () => {
    expect(tournamentDate(new Date('2026-09-20T00:33:00Z'))).toBe('2026-09-19')
    expect(tournamentDate(new Date('2026-09-20T01:59:00Z'))).toBe('2026-09-19')
  })

  it('returns null once the grace period is over', () => {
    expect(tournamentDate(new Date('2026-09-20T02:00:00Z'))).toBeNull()
  })

  it('keeps the start of a tournament day on that day', () => {
    expect(tournamentDate(new Date('2026-09-19T01:00:00Z'))).toBe('2026-09-19')
  })

  it('returns null on other days', () => {
    expect(tournamentDate(new Date('2026-09-18T12:00:00Z'))).toBeNull()
  })
})
