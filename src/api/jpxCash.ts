import { API_BASE_URL, apiFetch, NETWORK_ERROR } from './client'

export interface JpxCashRecord {
  _id: string
  /** ISO timestamp, e.g. "2026-05-08T00:00:00.000Z" */
  date: string
  /** Session time, e.g. "10:30" */
  session: string
  source: string
  /** Spread identifier, e.g. "1x6" */
  spread_name?: string
  value: number
  createdAt: string
  updatedAt: string
}

interface JpxCashResponse {
  data: JpxCashRecord[]
}

export interface JpxCashQuery {
  spreadName?: string
  /** Inclusive start date, YYYY-MM-DD */
  from?: string
  /** Inclusive end date, YYYY-MM-DD */
  to?: string
  /** Only the most recent N dates that have data (used when from/to are not set) */
  latestDays?: number
}

/**
 * GET /api/jpx-cash?spread_name=1x6&from=2026-10-01&to=2026-10-31
 * GET /api/jpx-cash?spread_name=1x6&latest_days=30
 */
export async function fetchJpxCash(
  query: JpxCashQuery = {},
  signal?: AbortSignal,
): Promise<JpxCashRecord[]> {
  const params = new URLSearchParams()
  if (query.spreadName) params.set('spread_name', query.spreadName)
  if (query.from) params.set('from', query.from)
  if (query.to) params.set('to', query.to)
  if (query.latestDays) params.set('latest_days', String(query.latestDays))
  const qs = params.toString()

  let res: Response
  try {
    res = await apiFetch(`${API_BASE_URL}/api/jpx-cash${qs ? `?${qs}` : ''}`, { signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    // fetch() only rejects on network failure (server down, DNS, CORS, offline)
    throw new Error(NETWORK_ERROR)
  }
  if (!res.ok) {
    throw new Error(`The server returned an error (${res.status}).`)
  }
  const body = (await res.json()) as JpxCashResponse
  return body.data ?? []
}
