import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { toDate, formatDeadline, formatShortDate } from './dates.js'

describe('toDate', () => {
  it('returns null for null/undefined', () => {
    expect(toDate(null)).toBeNull()
    expect(toDate(undefined)).toBeNull()
  })

  it('unwraps Firestore Timestamp via toDate()', () => {
    const fakeDate = new Date('2026-04-01T00:00:00Z')
    const ts = { toDate: () => fakeDate }
    expect(toDate(ts)).toBe(fakeDate)
  })

  it('unwraps serialized Timestamp via seconds', () => {
    const result = toDate({ seconds: 1711929600, nanoseconds: 0 })
    expect(result.getTime()).toBe(1711929600 * 1000)
  })

  it('parses ISO strings', () => {
    expect(toDate('2026-04-01T00:00:00Z').toISOString()).toBe('2026-04-01T00:00:00.000Z')
  })

  it('passes Date through as Date (via new Date copy)', () => {
    const d = new Date('2026-04-01T00:00:00Z')
    const out = toDate(d)
    expect(out.getTime()).toBe(d.getTime())
  })
})

describe('formatDeadline', () => {
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-21T12:00:00Z'))
  })
  afterAll(() => vi.useRealTimers())

  it('returns empty string when absent', () => {
    expect(formatDeadline(null)).toBe('')
    expect(formatDeadline(undefined)).toBe('')
  })

  it('Today when deadline has already passed earlier today', () => {
    // NOTE: current impl uses Math.ceil on fractional days, so a deadline
    // later *today* rounds up to diff=1 and displays as "Tomorrow". Only
    // past-or-exactly-now within the same calendar day shows as "Today".
    // See spawn_task: Fix deadline display: "Today" shows as "Tomorrow".
    expect(formatDeadline('2026-04-21T06:00:00Z')).toBe('Today')
  })

  it('Tomorrow for +1 day', () => {
    expect(formatDeadline('2026-04-22T12:00:00Z')).toBe('Tomorrow')
  })

  it('Yesterday for -1 day', () => {
    expect(formatDeadline('2026-04-20T12:00:00Z')).toBe('Yesterday')
  })

  it('Nd ago for past', () => {
    expect(formatDeadline('2026-04-18T12:00:00Z')).toBe('3d ago')
  })

  it('Nd for near future within a week', () => {
    expect(formatDeadline('2026-04-26T12:00:00Z')).toBe('5d')
  })
})

describe('formatShortDate', () => {
  it('renders month and day', () => {
    expect(formatShortDate(new Date('2026-04-21T12:00:00Z'))).toMatch(/Apr/)
  })
})
