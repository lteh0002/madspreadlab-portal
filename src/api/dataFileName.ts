/**
 * Upload files are named so the backend can tell which product they belong to:
 *
 *   MCA Oct26-Nov26 Calendar_15min.csv
 *   └┬┘ └─┬─┘ └─┬─┘ └──┬───┘ └─┬─┘
 *  product near   far  structure interval
 *
 * - product:   letters/digits, e.g. "MCA"
 * - near, far: 3-letter month + 2-digit year, e.g. "Oct26"; far must be after near
 * - structure: letters, e.g. "Calendar"
 * - interval:  minutes, e.g. "15min"
 * Single spaces between parts, an underscore before the interval, any allowed extension.
 */
export const DATA_FILE_EXAMPLE = 'MCA Oct26-Nov26 Calendar_15min'

export interface DataFileInfo {
  product: string
  /** e.g. "Oct26" (month normalised to "Oct") */
  near: string
  far: string
  structure: string
  /** Bar length in minutes, e.g. 15 */
  minutes: number
}

export type ParseResult = { ok: true; info: DataFileInfo } | { ok: false; reason: string }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const PATTERN = /^([A-Za-z0-9]+) ([A-Za-z]{3})(\d{2})-([A-Za-z]{3})(\d{2}) ([A-Za-z]+)_(\d+)min$/

/** Month index 0–11 for "oct"/"Oct"/"OCT", or -1 */
const monthIndex = (m: string) => MONTHS.findIndex((x) => x.toLowerCase() === m.toLowerCase())

/** Parse an upload's file name (with or without extension) */
export function parseDataFileName(fileName: string): ParseResult {
  const base = fileName.replace(/\.[^.]+$/, '')
  const m = PATTERN.exec(base)
  if (!m) {
    // Common slip: the OS adds " (1)" to duplicate downloads
    const hint = /\(\d+\)$/.test(base.trim()) ? ' Remove the " (1)" copy number.' : ''
    return {
      ok: false,
      reason: `"${fileName}" doesn't match the naming format "${DATA_FILE_EXAMPLE}".${hint}`,
    }
  }
  const [, product, nm, ny, fm, fy, structure, mins] = m as unknown as string[]

  const nearIdx = monthIndex(nm!)
  const farIdx = monthIndex(fm!)
  if (nearIdx < 0 || farIdx < 0) {
    const bad = nearIdx < 0 ? nm : fm
    return { ok: false, reason: `"${bad}" isn't a month. Use Jan, Feb, … Dec.` }
  }
  // Compare as months since 2000 so Dec26-Jan27 is in order
  if (Number(fy) * 12 + farIdx <= Number(ny) * 12 + nearIdx) {
    return {
      ok: false,
      reason: `The second month (${MONTHS[farIdx]}${fy}) must be after the first (${MONTHS[nearIdx]}${ny}).`,
    }
  }
  const minutes = Number(mins)
  if (minutes <= 0) return { ok: false, reason: 'The interval must be at least 1min.' }

  return {
    ok: true,
    info: {
      product: product!,
      near: `${MONTHS[nearIdx]}${ny}`,
      far: `${MONTHS[farIdx]}${fy}`,
      structure: structure!,
      minutes,
    },
  }
}
