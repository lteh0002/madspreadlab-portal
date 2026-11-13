import { API_BASE_URL, apiFetch, NETWORK_ERROR, errorMessage } from './client'
import type { ProductInfo } from './priceData'

export interface FairValueSpread {
  id: string
  /** Futures month codes, e.g. "X-Z" */
  spreadName: string
  /** Contract months, e.g. "Nov26", "Dec26" */
  front: string
  back: string
  /** Months between the contracts: 1 = monthly roll, 3 = quarterly */
  months: number
  fairValue: number
}

export interface ProductFairValues {
  product: ProductInfo
  /** Oldest contracts first, expired ones included */
  spreads: FairValueSpread[]
}

/** GET /api/fair-values — every spread with a `fairValue` (spreads collection), by product */
export async function fetchFairValues(signal?: AbortSignal): Promise<ProductFairValues[]> {
  let res: Response
  try {
    res = await apiFetch(`${API_BASE_URL}/api/fair-values`, { signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    // fetch() only rejects on network failure (server down, DNS, CORS, offline)
    throw new Error(NETWORK_ERROR)
  }
  if (!res.ok) throw new Error(await errorMessage(res))
  const body = (await res.json()) as { data?: ProductFairValues[] }
  return body.data ?? []
}
