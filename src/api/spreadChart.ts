export interface ClosePoint {
  /** YYYY-MM-DD */
  date: string
  close: number
}

export interface SpreadChartQuery {
  /** Spread identifier, e.g. "1x6" */
  spreadName: string
  /** Only the most recent N trading days; omit for the full history */
  latestDays?: number
}

/**
 * Closing prices for a spread, oldest first.
 *
 * PLACEHOLDER: there is no endpoint yet, so this returns a made-up random walk
 * (stable per spread). Replace the body with a fetch to the real endpoint once it
 * exists. See fetchJpxCash in ./jpxCash.ts for the request and error-handling pattern.
 */
export async function fetchSpreadCloses(
  query: SpreadChartQuery,
  signal?: AbortSignal,
): Promise<ClosePoint[]> {
  await new Promise((resolve) => setTimeout(resolve, 250)) // mimic network latency
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const all = placeholderSeries(query.spreadName)
  return query.latestDays ? all.slice(-query.latestDays) : all
}

function placeholderSeries(seed: string, days = 750): ClosePoint[] {
  let h = 1779033703
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }

  // Weekdays ending today, oldest first
  const dates: string[] = []
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  while (dates.length < days) {
    const wd = d.getUTCDay()
    if (wd !== 0 && wd !== 6) dates.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() - 1)
  }
  dates.reverse()

  let anchor = 40 + rand() * 40
  let close = anchor
  return dates.map((date) => {
    anchor += (rand() - 0.5) * 0.6
    close += (rand() - 0.5) * 2 + (anchor - close) * 0.05
    return { date, close: Math.round(close * 10) / 10 }
  })
}
