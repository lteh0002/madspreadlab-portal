/**
 * Research reports: one JSON file per report in `src/data/research/reports/`, in the format set
 * by `src/data/research/research-report.schema.json` (see the README beside it). The Research page
 * lists every file there; each opens at /research/<meta.id>.
 *
 * The files are written by hand or by a backtest script, so they're checked here as they load.
 * A report whose top level is broken is left out; a broken section is left out of its report.
 * Either way the problem is logged to the console (and shown on the page in dev).
 */

export type Tone = 'positive' | 'negative' | 'neutral' | 'info' | 'warning'
export type ValueFormat = 'integer' | 'number' | 'signed' | 'percent' | 'currency' | 'date' | 'text'

export interface UnitDef {
  label?: string
  prefix?: string
  suffix?: string
}

export interface ReportMeta {
  id: string
  title: string
  subtitle?: string
  market?: string
  instrument_type?: string
  status?: string
  /** YYYY-MM-DD */
  as_of?: string
  author?: string | null
  tags?: string[]
  /** Units referenced by `unit` on metrics, chart axes and columns, e.g. { pts: { suffix: ' pts' } } */
  units?: Record<string, UnitDef>
}

interface SectionBase {
  id: string
  title?: string
}

export interface RulesSection extends SectionBase {
  type: 'rules'
  items: { label?: string; text: string }[]
  params?: Record<string, unknown>
}

export interface MetricItem {
  key: string
  label: string
  value: number | string | null
  format?: ValueFormat
  decimals?: number
  unit?: string
  note?: string
  tone?: Tone
}

export interface MetricsSection extends SectionBase {
  type: 'metrics'
  items: MetricItem[]
}

export type SeriesStyle = 'primary' | 'comparison' | 'muted'

export interface ChartSeries {
  name: string
  values: (number | null)[]
  style?: SeriesStyle
  /** Bars (or points) above zero / below zero take the positive / negative tone */
  tone_by_sign?: boolean
  /** A tone per point, drawn as a coloured marker on the line */
  point_tone?: Tone[]
  /** Legend text for each tone used in `point_tone`, e.g. { positive: 'Win', negative: 'Stopped' } */
  point_tone_labels?: Partial<Record<Tone, string>>
}

export interface ChartSpec {
  kind: 'line' | 'bar' | 'scatter' | 'area'
  x: { label?: string; values: (string | number)[] }
  y?: { label?: string; unit?: string }
  series: ChartSeries[]
}

export interface ChartSection extends SectionBase {
  type: 'chart'
  chart: ChartSpec
}

export interface TableColumn {
  key: string
  label: string
  type: 'string' | 'number' | 'date' | 'badge'
  format?: ValueFormat
  unit?: string
  hidden?: boolean
  tone_by_sign?: boolean
  /** For badges: the tone of each value, e.g. { Held: 'positive', Stopped: 'negative' } */
  options?: Record<string, Tone>
}

export type TableRow = Record<string, unknown> & { details?: Record<string, unknown> }

export interface TableSection extends SectionBase {
  type: 'table'
  group_by?: string
  default_sort?: { key?: string; dir?: 'asc' | 'desc' }
  columns: TableColumn[]
  rows: TableRow[]
}

export interface CalloutSection extends SectionBase {
  type: 'callout'
  text: string
  tone?: Tone
}

export interface NotesSection extends SectionBase {
  type: 'notes'
  items: string[]
}

export interface TextSection extends SectionBase {
  type: 'text'
  text: string
}

export type ReportSection =
  | RulesSection
  | MetricsSection
  | ChartSection
  | TableSection
  | CalloutSection
  | NotesSection
  | TextSection

export interface ResearchReport {
  schema_version: '1.0'
  meta: ReportMeta
  sections: ReportSection[]
  /** Problems found while loading (sections left out); not part of the file */
  problems: string[]
}

const TONES = new Set<string>(['positive', 'negative', 'neutral', 'info', 'warning'])
const CHART_KINDS = new Set<string>(['line', 'bar', 'scatter', 'area'])
const COLUMN_TYPES = new Set<string>(['string', 'number', 'date', 'badge'])

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isArr = Array.isArray

/** Why a section can't be drawn, or null when it's fine */
function sectionProblem(s: unknown): string | null {
  if (!isObj(s)) return 'not an object'
  if (!isStr(s.id)) return 'missing "id"'
  switch (s.type) {
    case 'rules':
      if (!isArr(s.items) || !s.items.every((i) => isObj(i) && isStr(i.text)))
        return '"items" must be a list of { text }'
      return null
    case 'metrics':
      if (
        !isArr(s.items) ||
        !s.items.every((i) => isObj(i) && isStr(i.key) && isStr(i.label) && 'value' in i)
      )
        return '"items" must be a list of { key, label, value }'
      return null
    case 'chart': {
      const c = s.chart
      if (!isObj(c)) return 'missing "chart"'
      if (!CHART_KINDS.has(c.kind as string)) return `unknown chart kind "${String(c.kind)}"`
      if (!isObj(c.x) || !isArr(c.x.values)) return 'missing "chart.x.values"'
      if (!isArr(c.series) || !c.series.length) return 'no "chart.series"'
      const n = c.x.values.length
      for (const sr of c.series) {
        if (!isObj(sr) || !isStr(sr.name) || !isArr(sr.values))
          return 'each series needs { name, values }'
        if (sr.values.length !== n)
          return `series "${sr.name}" has ${sr.values.length} values but x has ${n}`
        if (isArr(sr.point_tone) && sr.point_tone.length !== n)
          return `series "${sr.name}" has ${sr.point_tone.length} point tones but x has ${n}`
      }
      return null
    }
    case 'table':
      if (
        !isArr(s.columns) ||
        !s.columns.every(
          (c) => isObj(c) && isStr(c.key) && isStr(c.label) && COLUMN_TYPES.has(c.type as string),
        )
      )
        return '"columns" must be a list of { key, label, type }'
      if (!isArr(s.rows) || !s.rows.every(isObj)) return '"rows" must be a list of objects'
      return null
    case 'callout':
      if (!isStr(s.text)) return 'missing "text"'
      if (s.tone !== undefined && !TONES.has(s.tone as string))
        return `unknown tone "${String(s.tone)}"`
      return null
    case 'notes':
      if (!isArr(s.items) || !s.items.every(isStr)) return '"items" must be a list of strings'
      return null
    case 'text':
      return isStr(s.text) ? null : 'missing "text"'
    default:
      return `unknown section type "${String(s.type)}"`
  }
}

/** Checks one file; returns the report (minus broken sections), or a reason it can't be shown */
function parseReport(file: string, data: unknown): ResearchReport | string {
  if (!isObj(data)) return `${file}: not a JSON object`
  if (data.schema_version !== '1.0')
    return `${file}: schema_version is ${JSON.stringify(data.schema_version)}, expected "1.0"`
  const meta = data.meta
  if (!isObj(meta) || !isStr(meta.id) || !meta.id || !isStr(meta.title))
    return `${file}: "meta" needs an "id" and a "title"`
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(meta.id))
    return `${file}: meta.id "${meta.id}" must be URL-safe (letters, digits, dashes)`
  if (!isArr(data.sections)) return `${file}: "sections" must be a list`

  const problems: string[] = []
  const sections: ReportSection[] = []
  data.sections.forEach((s, i) => {
    const problem = sectionProblem(s)
    if (problem) {
      const name = isObj(s) && isStr(s.id) ? `"${s.id}"` : `#${i + 1}`
      problems.push(`Section ${name} left out: ${problem}`)
    } else sections.push(s as unknown as ReportSection)
  })
  return {
    schema_version: '1.0',
    meta: meta as unknown as ReportMeta,
    sections,
    problems,
  }
}

const files = import.meta.glob<unknown>('./research/reports/*.json', {
  eager: true,
  import: 'default',
})

/** Files that couldn't be shown at all, with the reason */
export const REPORT_LOAD_ERRORS: string[] = []

/** Every report that loaded, newest `as_of` first */
export const RESEARCH_REPORTS: ResearchReport[] = (() => {
  const byId = new Map<string, ResearchReport>()
  for (const [path, data] of Object.entries(files)) {
    const file = path.split('/').pop()!
    const result = parseReport(file, data)
    if (typeof result === 'string') {
      REPORT_LOAD_ERRORS.push(result)
      continue
    }
    if (byId.has(result.meta.id)) {
      REPORT_LOAD_ERRORS.push(`${file}: another report already uses the id "${result.meta.id}"`)
      continue
    }
    for (const p of result.problems) console.warn(`[research] ${file}: ${p}`)
    byId.set(result.meta.id, result)
  }
  for (const e of REPORT_LOAD_ERRORS) console.warn(`[research] ${e}`)
  return [...byId.values()].sort(
    (a, b) =>
      (b.meta.as_of ?? '').localeCompare(a.meta.as_of ?? '') ||
      a.meta.title.localeCompare(b.meta.title),
  )
})()

export function findReport(id: string): ResearchReport | undefined {
  return RESEARCH_REPORTS.find((r) => r.meta.id === id)
}
