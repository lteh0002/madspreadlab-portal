/**
 * Upload files are named so the backend can tell which product and series they belong to.
 * Three forms:
 *
 *   MCA Oct26-Nov26 Calendar_15min.csv          FCPO Apr26 1mo Butterfly_Daily.csv
 *   └┬┘ └─┬─┘ └─┬─┘ └──┬───┘ └─┬─┘              └┬─┘ └─┬─┘ └┬┘ └───┬───┘ └─┬─┘
 *  product near  far structure interval       product front gap structure interval
 *
 *   FCPO Apr26_Daily.csv      (an outright: one contract; "FCPO Apr26 Outright_Daily" also works)
 *
 * - product:   letters/digits, e.g. "MCA"
 * - near, far: 3-letter month + 2-digit year, e.g. "Oct26"; far must be after near
 * - front, gap: the first month and the gap between legs: "Apr26 1mo Butterfly" is
 *   Apr26 / May26 / Jun26, "Apr26 3mo Calendar" is Apr26 / Jul26
 * - structure: Calendar or Butterfly (any case; "Fly" also means Butterfly). In the first form
 *   any other word is read as Calendar, as before.
 * - interval:  minutes, e.g. "15min", or "Daily"
 * Single spaces between parts, an underscore before the interval, any allowed extension.
 *
 * Same rules as the API's src/utils/dataFileName.js (kept in sync by hand).
 */
export const DATA_FILE_EXAMPLE = 'MCA Oct26-Nov26 Calendar_15min'
export const DATA_FILE_EXAMPLE_GAP = 'FCPO Apr26 1mo Butterfly_Daily'
export const DATA_FILE_EXAMPLE_OUTRIGHT = 'FCPO Apr26_Daily'

/** Bar length of a "Daily" file, in minutes */
export const DAILY_MINUTES = 1440

export type Structure = 'Outright' | 'Calendar' | 'Butterfly'

export interface DataFileInfo {
  product: string
  /** First and last legs, e.g. "Apr26" / "Jun26" (month normalised to "Apr"); same for an outright */
  near: string
  far: string
  /** Every leg, e.g. ["Apr26", "May26", "Jun26"] for a butterfly */
  legs: string[]
  structure: Structure
  /** Bar length in minutes, e.g. 15; 1440 for Daily */
  minutes: number
}

export type ParseResult = { ok: true; info: DataFileInfo } | { ok: false; reason: string }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const RANGE_PATTERN =
  /^([A-Za-z0-9]+) ([A-Za-z]{3})(\d{2})-([A-Za-z]{3})(\d{2}) ([A-Za-z]+)_(\d+min|daily)$/i
const GAP_PATTERN = /^([A-Za-z0-9]+) ([A-Za-z]{3})(\d{2}) (\d+)mo ([A-Za-z]+)_(\d+min|daily)$/i
const OUTRIGHT_PATTERN = /^([A-Za-z0-9]+) ([A-Za-z]{3})(\d{2})(?: outright)?_(\d+min|daily)$/i

/** Month index 0–11 for "oct"/"Oct"/"OCT", or -1 */
const monthIndex = (m: string) => MONTHS.findIndex((x) => x.toLowerCase() === m.toLowerCase())
/** Months since 2000 → "Apr26" */
const label = (n: number) => `${MONTHS[n % 12]}${String(Math.floor(n / 12)).padStart(2, '0')}`

/** "butterfly" / "Fly" → "Butterfly", "calendar" → "Calendar", anything else → null */
function structureKind(word: string): Structure | null {
  const w = word.toLowerCase()
  if (w === 'butterfly' || w === 'fly') return 'Butterfly'
  if (w === 'calendar') return 'Calendar'
  return null
}

/** "15min" → 15, "Daily" → 1440, "0min" → null */
function intervalMinutes(text: string): number | null {
  if (text.toLowerCase() === 'daily') return DAILY_MINUTES
  const n = Number.parseInt(text, 10)
  return n > 0 ? n : null
}

/** "15 min", or "Daily" for 1440 */
export function intervalLabel(minutes: number) {
  return minutes === DAILY_MINUTES ? 'Daily' : `${minutes} min`
}

/** Parse an upload's file name (with or without extension) */
export function parseDataFileName(fileName: string): ParseResult {
  const base = fileName.replace(/\.[^.]+$/, '')
  const range = RANGE_PATTERN.exec(base)
  const gap = range ? null : GAP_PATTERN.exec(base)
  const outright = range || gap ? null : OUTRIGHT_PATTERN.exec(base)
  if (!range && !gap && !outright) {
    // Common slip: the OS adds " (1)" to duplicate downloads
    const hint = /\(\d+\)$/.test(base.trim()) ? ' Remove the " (1)" copy number.' : ''
    return {
      ok: false,
      reason: `"${fileName}" doesn't match the naming format "${DATA_FILE_EXAMPLE}", "${DATA_FILE_EXAMPLE_GAP}" or "${DATA_FILE_EXAMPLE_OUTRIGHT}".${hint}`,
    }
  }

  let product: string
  let legs: number[]
  let structure: Structure
  let interval: string
  if (range) {
    const [, p, nm, ny, fm, fy, word, iv] = range as unknown as string[]
    const nearIdx = monthIndex(nm!)
    const farIdx = monthIndex(fm!)
    if (nearIdx < 0 || farIdx < 0) {
      const bad = nearIdx < 0 ? nm : fm
      return { ok: false, reason: `"${bad}" isn't a month. Use Jan, Feb, … Dec.` }
    }
    // Compare as months since 2000 so Dec26-Jan27 is in order
    const near = Number(ny) * 12 + nearIdx
    const far = Number(fy) * 12 + farIdx
    if (far <= near) {
      return {
        ok: false,
        reason: `The second month (${label(far)}) must be after the first (${label(near)}).`,
      }
    }
    const kind = structureKind(word!) ?? 'Calendar'
    if (kind === 'Butterfly') {
      if ((far - near) % 2) {
        return {
          ok: false,
          reason: `A butterfly from ${label(near)} to ${label(far)} has no middle month. Name it like "${DATA_FILE_EXAMPLE_GAP}".`,
        }
      }
      legs = [near, (near + far) / 2, far]
    } else {
      legs = [near, far]
    }
    product = p!
    structure = kind
    interval = iv!
  } else if (outright) {
    const [, p, m, y, iv] = outright as unknown as string[]
    const idx = monthIndex(m!)
    if (idx < 0) return { ok: false, reason: `"${m}" isn't a month. Use Jan, Feb, … Dec.` }
    legs = [Number(y) * 12 + idx]
    product = p!
    structure = 'Outright'
    interval = iv!
  } else {
    const [, p, m, y, gapText, word, iv] = gap! as unknown as string[]
    const idx = monthIndex(m!)
    if (idx < 0) return { ok: false, reason: `"${m}" isn't a month. Use Jan, Feb, … Dec.` }
    const step = Number(gapText)
    if (step < 1) return { ok: false, reason: 'The gap between months must be at least 1mo.' }
    const kind = structureKind(word!)
    if (!kind)
      return { ok: false, reason: `"${word}" isn't a structure. Use Calendar or Butterfly.` }
    const front = Number(y) * 12 + idx
    legs = kind === 'Butterfly' ? [front, front + step, front + 2 * step] : [front, front + step]
    product = p!
    structure = kind
    interval = iv!
  }

  const minutes = intervalMinutes(interval)
  if (!minutes) return { ok: false, reason: 'The interval must be at least 1min.' }

  const legLabels = legs.map(label)
  return {
    ok: true,
    info: {
      product,
      near: legLabels[0]!,
      far: legLabels.at(-1)!,
      legs: legLabels,
      structure,
      minutes,
    },
  }
}
