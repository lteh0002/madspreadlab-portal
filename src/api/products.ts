import { API_BASE_URL, NETWORK_ERROR, errorMessage } from './client'

/** Which part of the Spreads page a product belongs to */
export type ProductType = 'indices' | 'commodities'

export const PRODUCT_TYPES: { value: ProductType; label: string }[] = [
  { value: 'indices', label: 'Indices' },
  { value: 'commodities', label: 'Commodities' },
]

/** A new product record for the database, as entered on the admin page */
export interface NewProduct {
  /** e.g. "1x6" */
  name: string
  /** Exchange code, e.g. "JPX" */
  exchange: string
  /** 3-letter ISO code, e.g. "JPY" */
  currency: string
  productType: ProductType
}

interface CreateProductResponse {
  /** The product as saved; optional so a bare 200/201 still works */
  data?: NewProduct
}

/**
 * POST /api/create-product
 * Body: { "name": "1x6", "exchange": "JPX", "currency": "JPY", "productType": "indices" }
 *
 * Resolves with the saved product. Rejects with a message to show the admin: the server's
 * `message` or `error` field when it sends one (e.g. for a duplicate product), else a generic one.
 */
export async function createProduct(
  product: NewProduct,
  signal?: AbortSignal,
): Promise<NewProduct> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}/api/create-product`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Exactly these fields, whatever else the object carries
      body: JSON.stringify({
        name: product.name,
        exchange: product.exchange,
        currency: product.currency,
        productType: product.productType,
      }),
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    // fetch() only rejects on network failure (server down, DNS, CORS, offline)
    throw new Error(NETWORK_ERROR)
  }
  if (!res.ok) throw new Error(await errorMessage(res))

  // A 201 with no body (or a non-JSON body) still counts as saved
  const body = (await res.json().catch(() => ({}))) as CreateProductResponse
  return body.data ?? product
}

/** File types the upload accepts. Must match what the backend can read (exceljs: no legacy .xls). */
export const UPLOAD_EXTENSIONS = ['.csv', '.xlsx'] as const
/** Largest file the upload accepts; matches the backend limit (under Vercel's 4.5 MB body cap) */
export const UPLOAD_MAX_BYTES = 4 * 1024 * 1024

/**
 * POST /api/upload-data   (multipart/form-data, one field: `file`)
 *
 * The file must be named like "MCA Oct26-Nov26 Calendar_15min.csv" (see ./dataFileName.ts);
 * the backend reads the product and series from that name, so nothing else is sent.
 * Columns: Timestamp (UTC), Open, High, Low, Close (extra columns are ignored).
 *
 * Resolves with the server's summary, e.g. "Imported 270 bars for MCA Oct26-Nov26 Calendar
 * (15 min): 270 new." Rejects with the server's reason (bad name, unknown product, bad rows…).
 */
export async function uploadProductData(file: File, signal?: AbortSignal): Promise<string> {
  const form = new FormData()
  form.append('file', file, file.name)

  let res: Response
  try {
    // No Content-Type header: the browser sets multipart/form-data with its boundary
    res = await fetch(`${API_BASE_URL}/api/upload-data`, { method: 'POST', body: form, signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new Error(NETWORK_ERROR)
  }
  if (!res.ok) throw new Error(await errorMessage(res))

  const body = (await res.json().catch(() => ({}))) as { message?: unknown }
  return typeof body.message === 'string' ? body.message : ''
}

/** One of a product's spreads, as listed on the Manage indices spreads page */
export interface ManagedSpread {
  id: string
  /** Futures month codes, e.g. "N-Q" */
  spreadName: string
  /** Contract months, e.g. "Jul26", "Aug26" */
  front: string
  back: string
  /** Months between the contracts: 1 = monthly roll, 3 = quarterly */
  months: number
  fairValue: number | null
  /** Price bars across all intervals */
  bars: number
}

export interface ManagedProduct {
  _id: string
  name: string
  exchange: string
  currency: string
  /** Missing on products created before the field existed */
  productType?: ProductType
  /** Newest contracts first */
  spreads: ManagedSpread[]
}

/**
 * GET /api/products[?productType=indices] — products with all their spreads (with or without
 * price data); only products of `productType` when it's given
 */
export async function fetchManagedProducts(
  productType?: ProductType,
  signal?: AbortSignal,
): Promise<ManagedProduct[]> {
  const qs = productType ? `?productType=${encodeURIComponent(productType)}` : ''
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}/api/products${qs}`, { signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new Error(NETWORK_ERROR)
  }
  if (!res.ok) throw new Error(await errorMessage(res))
  const body = (await res.json()) as { data?: ManagedProduct[] }
  return body.data ?? []
}

/**
 * PATCH /api/spreads/:id/fair-value   Body: { fairValue: number | null }
 * Sets a spread's fair value, or clears it with null. Resolves with the value as saved.
 */
export async function setSpreadFairValue(
  spreadId: string,
  fairValue: number | null,
  signal?: AbortSignal,
): Promise<number | null> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}/api/spreads/${encodeURIComponent(spreadId)}/fair-value`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fairValue }),
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new Error(NETWORK_ERROR)
  }
  if (!res.ok) throw new Error(await errorMessage(res))
  const body = (await res.json().catch(() => ({}))) as { data?: { fairValue?: number | null } }
  return body.data?.fairValue ?? fairValue
}
