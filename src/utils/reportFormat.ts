import type { Tone, UnitDef, ValueFormat } from '@/data/research'

/** Real minus sign, so negatives line up with "+" in tabular figures */
const MINUS = '−'

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** YYYY-MM-DD (read as that calendar day) or a full ISO timestamp (read in UTC); null if neither */
function parseDay(value: string): Date | null {
  if (!ISO_DAY.test(value)) return null
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** A date as "2 Feb 2021" (`long`) or "2 Feb 21". Anything that isn't an ISO date comes back as is. */
export function formatReportDate(value: string, style: 'long' | 'short' = 'short'): string {
  const d = parseDay(value)
  if (!d) return value
  const year = String(d.getUTCFullYear())
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${style === 'long' ? year : year.slice(2)}`
}

/** An x-axis label: YYYY-MM-DD → "Mar 21"; anything else as written */
export function formatAxisLabel(value: string | number): string {
  if (typeof value === 'number') return String(value)
  const d = parseDay(value)
  return d ? `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}` : value
}

function number(v: number, decimals: number | undefined, defaultMax: number): string {
  return Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? defaultMax,
  })
}

export interface FormatOptions {
  format?: ValueFormat
  decimals?: number
  /** A key of `meta.units`, or plain text shown after the value */
  unit?: string
  units?: Record<string, UnitDef>
}

/**
 * How a value is shown on a metric tile, axis, tooltip or table cell.
 *
 * - `integer` 1,986 · `number` 1,986.5 (up to 2 decimals unless `decimals`)
 * - `signed` +184 / −30 · `percent` takes a fraction: 0.61 → 61%
 * - `currency` like `number`, with the unit as prefix when it has no prefix/suffix of its own
 * - `date` 2 Feb 21 · `text` as written
 *
 * Strings are shown as written (whatever the format, except `date`); null/undefined → "—".
 */
export function formatValue(value: unknown, opts: FormatOptions = {}): string {
  if (value === null || value === undefined || value === '') return '—'
  const { format, decimals, unit, units } = opts

  if (typeof value === 'string') {
    if (format === 'date') return formatReportDate(value)
    return value
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value)

  let text: string
  switch (format) {
    case 'integer':
      text = number(Math.round(value), 0, 0)
      break
    case 'percent':
      return `${value < 0 ? MINUS : ''}${number(value * 100, decimals, 0)}%`
    case 'signed':
      text = number(value, decimals, 2)
      text = (value > 0 ? '+' : value < 0 ? MINUS : '') + withUnit(text, unit, units, false)
      return text
    case 'date':
      return String(value)
    default:
      text = number(value, decimals, 2)
  }
  return (value < 0 ? MINUS : '') + withUnit(text, unit, units, format === 'currency')
}

function withUnit(
  text: string,
  unit: string | undefined,
  units: Record<string, UnitDef> | undefined,
  currency: boolean,
): string {
  if (!unit) return text
  const def = units?.[unit]
  if (def && (def.prefix || def.suffix)) return `${def.prefix ?? ''}${text}${def.suffix ?? ''}`
  const name = def?.label ?? unit
  return currency ? `${name} ${text}` : `${text} ${name}`
}

/** Short unit name for an axis title, e.g. "points" */
export function unitLabel(unit: string | undefined, units?: Record<string, UnitDef>): string {
  if (!unit) return ''
  const def = units?.[unit]
  return def?.label ?? def?.suffix?.trim() ?? def?.prefix?.trim() ?? unit
}

/** The tone of a number by its sign: above zero positive, below negative, zero neutral */
export function signTone(value: unknown): Tone | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral'
}

/** CSS colour for a tone */
export function toneColor(tone: Tone | undefined): string {
  switch (tone) {
    case 'positive':
      return 'var(--color-tone-positive)'
    case 'negative':
      return 'var(--color-tone-negative)'
    case 'info':
      return 'var(--color-series-2)'
    case 'warning':
      return 'var(--color-reference)'
    case 'neutral':
      return 'var(--color-tone-neutral)'
    default:
      return 'currentColor'
  }
}

/** "entry_z" / "entryZ" → "Entry z" */
export function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Splits text into plain and **bold** runs, for rendering without v-html */
export function richRuns(text: string): { text: string; bold: boolean }[] {
  const runs: { text: string; bold: boolean }[] = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), bold: false })
    runs.push({ text: m[1]!, bold: true })
    last = m.index + m[0].length
  }
  if (last < text.length) runs.push({ text: text.slice(last), bold: false })
  return runs
}
