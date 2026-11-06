export interface SpreadRow {
  /** ISO date, YYYY-MM-DD */
  date: string
  /** Short weekday name, e.g. "Mon" */
  day: string
  /** 1x6 cash value */
  cash1x6: number
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Placeholder rows: consecutive business days with deterministic fake values.
 * Replace with real data (API / store) later.
 */
export function makePlaceholderSpreads(count = 20, start = '2026-10-01'): SpreadRow[] {
  const rows: SpreadRow[] = []
  const d = new Date(`${start}T00:00:00Z`)
  let seed = 42

  while (rows.length < count) {
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) {
      // simple LCG so values are stable across reloads
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      const value = ((seed / 2 ** 31) * 2 - 1) * 15 // roughly -15..15

      rows.push({
        date: d.toISOString().slice(0, 10),
        day: WEEKDAYS[dow]!,
        cash1x6: Math.round(value * 100) / 100,
      })
    }
    d.setUTCDate(d.getUTCDate() + 1)
  }

  return rows
}
