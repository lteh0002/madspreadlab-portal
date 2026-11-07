import { API_BASE_URL, NETWORK_ERROR, errorMessage } from './client'

export interface SpreadInterval {
  /** Bar length in minutes, e.g. 15 */
  interval: number
  bars: number
  /** ISO timestamps of the first and last bar */
  from: string
  to: string
}

export interface ProductSpread {
  id: string
  /** Futures month codes, e.g. "V-X" */
  spreadName: string
  /** Contract months, e.g. "Oct26", "Nov26" */
  front: string
  back: string
  /** Fair value of the spread, when one has been set (null or absent otherwise) */
  fairValue?: number | null
  /** Intervals that have data, shortest first */
  intervals: SpreadInterval[]
}

export interface ProductInfo {
  _id: string
  name: string
  exchange: string
  currency: string
}

export interface PriceBar {
  /** Bar start, ISO timestamp (UTC) */
  timestamp: string
  open: number
  high: number
  low: number
  close: number
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    // fetch() only rejects on network failure (server down, DNS, CORS, offline)
    throw new Error(NETWORK_ERROR)
  }
  if (!res.ok) throw new Error(await errorMessage(res))
  return (await res.json()) as T
}

/** GET /api/spreads?product=MCA — the product and its spreads that have price data */
export function fetchProductSpreads(product: string, signal?: AbortSignal) {
  return getJson<{ product: ProductInfo; data: ProductSpread[] }>(
    `/api/spreads?product=${encodeURIComponent(product)}`,
    signal,
  )
}

/** GET /api/price-data?spreadId=…&interval=15 — OHLC bars, oldest first */
export async function fetchPriceData(spreadId: string, interval: number, signal?: AbortSignal) {
  const qs = new URLSearchParams({ spreadId, interval: String(interval) })
  const body = await getJson<{ data: PriceBar[]; truncated: boolean }>(
    `/api/price-data?${qs}`,
    signal,
  )
  return body
}
