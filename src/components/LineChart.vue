<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { UTC, tradingDayKey, type DisplayZone } from '@/utils/time'

export interface LinePoint {
  /** Daily: YYYY-MM-DD. Intraday: a full ISO timestamp (UTC), e.g. 2026-09-28T02:15:00.000Z */
  date: string
  /** The close (or the only value); the line runs through it */
  value: number
  /** The bar's open, high and low, for `priceStyle: 'candles'`; a bar without them is drawn flat at `value` */
  open?: number
  high?: number
  low?: number
  /** Ask / bid volume of this bar, drawn in the volume pane (see the `volume` prop) */
  aVol?: number
  bVol?: number
}

/** How the price is drawn: a line through each close, or a candle per bar (open/high/low/close) */
export type PriceStyle = 'line' | 'candles'

/** The volume pane under the line: off, or `sides` = AVol bars up and BVol bars down from a shared zero line */
export type VolumeView = 'off' | 'sides'

/** The slice of `points` currently on screen */
export interface ChartView {
  /** First and last fully visible points' `date` (same format as LinePoint.date) */
  from: string
  to: string
  /** Number of points across the visible width */
  count: number
  /** True when the newest point is at the right edge */
  atLatest: boolean
  /** Total points loaded */
  total: number
  /** Indices of the first and last fully visible points */
  first: number
  last: number
  /** With `relativeDays`: trading-day numbers of the first and last visible points (T-n → n) */
  fromDay?: number
  toDay?: number
}

const props = withDefaults(
  defineProps<{
    /** All loaded points, oldest first. The chart shows a window of them that can be panned and zoomed. */
    points: LinePoint[]
    /** Points visible when data first arrives */
    initialCount?: number
    /** Name of the value in the tooltip, e.g. "Close" */
    valueLabel?: string
    /** Line through the closes, or OHLC candles */
    priceStyle?: PriceStyle
    /** Volume pane under the line, sharing its time axis, pan/zoom and crosshair */
    volume?: VolumeView
    /**
     * Share of the plot's `height` the volume pane takes, at the bottom (the line keeps the rest,
     * so turning the pane on doesn't make the chart taller)
     */
    volumeShare?: number
    /**
     * With the volume pane on: false hides the line (and its price axis), so the pane fills the
     * whole `height` on its own
     */
    showLine?: boolean
    /** Shown in the volume pane when the points on screen have no AVol / BVol */
    volumeEmptyText?: string
    /** Describes the chart for screen readers */
    ariaLabel?: string
    loading?: boolean
    /** When set, the chart is blurred behind this message and a Retry button */
    error?: string | null
    /** Shown under the error, e.g. "Retrying in 8s…" */
    errorHint?: string
    /** Shown over the blurred placeholder when there are no points (or use the #empty slot) */
    emptyText?: string
    /**
     * Label time as trading days back from the last day instead of dates: the last day in the
     * data is T-0, the day before it T-1, and so on. Days are the distinct calendar dates of
     * `points` in `displayZone`.
     */
    relativeDays?: boolean
    /** With `relativeDays`: days older than T-`maxLabelledDay` are all labelled "T-X" */
    maxLabelledDay?: number | null
    /**
     * With `relativeDays`: hour (in `displayZone`) a trading day starts. 0 = midnight. Use e.g. 6
     * so a night session running past midnight counts with the day it started.
     */
    dayStartHour?: number
    /**
     * Fixed view: no drag, wheel or keyboard pan/zoom (wheel and swipes scroll the page instead).
     * The view only changes through showRange/showLatest. Hover/tap still shows the tooltip.
     */
    locked?: boolean
    /** Zone intraday times are shown in (and days split by), e.g. MYT. Plain dates are unaffected. */
    displayZone?: DisplayZone
    /** Plot height in px (axis labels sit outside it). Phones cap it at 260px. */
    height?: number
    /**
     * Crosshair key hovered on another chart (see the `hover-key` event). This chart shows its
     * crosshair on its own point with the same key, if it has one on screen.
     */
    syncKey?: string | null
    /** A reference level drawn as a dashed horizontal line (e.g. fair value); null = none */
    refValue?: number | null
    /** Label before the reference value, e.g. "FV" */
    refLabel?: string
    /**
     * The product's minimum price move, e.g. 0.05: price axis lines then fall on whole numbers of
     * ticks (1, 2, 5, 10 … ticks apart) and the crosshair's price snaps to a tick. null = any step.
     */
    tickSize?: number | null
  }>(),
  {
    initialCount: 65,
    valueLabel: 'Value',
    priceStyle: 'line',
    volume: 'off',
    volumeShare: 0.4,
    showLine: true,
    volumeEmptyText: 'No AVol / BVol in this data',
    ariaLabel: 'Line chart',
    loading: false,
    error: null,
    errorHint: '',
    emptyText: 'No data for this range.',
    relativeDays: false,
    maxLabelledDay: null,
    dayStartHour: 0,
    locked: false,
    displayZone: () => UTC,
    height: 360,
    syncKey: null,
    refValue: null,
    refLabel: '',
    tickSize: null,
  },
)

const emit = defineEmits<{
  retry: []
  'view-change': [view: ChartView]
  /**
   * The hovered point's crosshair key, or null when the pointer leaves: "T-2 10:45" (trading day
   * and time of day) with `relativeDays`, else the point's date. Pass it to other charts'
   * `syncKey` to line their crosshairs up on the same moment.
   */
  'hover-key': [key: string | null]
}>()

/** SVG user units; the plot stretches to its box, lines keep a constant stroke width */
const W = 1000
const H = 360
/** Fewest points you can zoom in to */
const MIN_SPAN = 5
/** Wheel zoom sensitivity per pixel of scroll */
const ZOOM_SPEED = 0.002
/** Room the tooltip needs beside the crosshair (its widest line plus the 14px gap) */
const TOOLTIP_PX = 215
/** Same, for the compact tooltip on narrow plots (phones) */
const TOOLTIP_COMPACT_PX = 135
/** Plots narrower than this (CSS px) get the compact tooltip */
const COMPACT_BELOW_PX = 520
/** How far the tooltip may spill into the axis gutters on either side of the plot */
const GUTTER_PX = 40
/** Horizontal room each rotated time label needs on a T-n axis */
const TIME_LABEL_PX = 22
/** Axis-drag scaling sensitivity per pixel dragged */
const AXIS_SPEED = 0.005
/** Space between the line plot and the volume pane, px */
const PANE_GAP_PX = 14
/** Share of each bar slot a volume bar fills (the rest is the gap between bars) */
const BAR_FILL = 0.7

const gradId = `line-area-${useId()}`

/** Decorative stand-in drawn (blurred) when there's nothing to plot yet */
const PLACEHOLDER = (() => {
  const line = `M0,250 C110,210 190,280 300,225 S500,120 620,170 S840,95 ${W},135`
  return {
    line,
    area: `${line} L${W},${H} L0,${H} Z`,
    grid: [0.2, 0.4, 0.6, 0.8].map((f) => `M0 ${f * H} H${W}`).join(' '),
  }
})()
const hover = ref<number | null>(null)
/** The pointer is over the volume pane (not the line plot): the tooltip then shows AVol / BVol */
const hoverInPane = ref(false)
/** The pointer's height over the plot, in SVG units (0 … H), for the crosshair's horizontal line */
const pointerY = ref<number | null>(null)
const hitEl = ref<HTMLElement | null>(null)

/** Plot width in CSS px, so rotated time labels can be spaced to never overlap */
const plotEl = ref<HTMLElement | null>(null)
const plotWidth = ref(800)
/** Plot height in CSS px (line plot + volume pane), to split it between the two */
const plotHeight = ref(0)
let resizeObs: ResizeObserver | undefined
onMounted(() => {
  if (!plotEl.value || typeof ResizeObserver === 'undefined') return
  resizeObs = new ResizeObserver(([entry]) => {
    if (!entry) return
    plotWidth.value = entry.contentRect.width
    plotHeight.value = entry.contentRect.height
  })
  resizeObs.observe(plotEl.value)
})
onBeforeUnmount(() => resizeObs?.disconnect())

/**
 * Visible window in index units. Point i sits at x = (i - start) / (end - start).
 * Bounds are half a slot outside the data so edge points aren't drawn on the border.
 */
const view = ref<{ start: number; end: number } | null>(null)

/**
 * Value range set by the user (dragging the price axis, or panning vertically after that).
 * null = auto: y fits the points on screen.
 */
const yRange = ref<{ min: number; max: number } | null>(null)

/** Below this many prices on screen, auto scale shows them all (too few to call any stray) */
const ROBUST_MIN_VALUES = 20
/** Share of prices at each end left out when finding where most of them trade */
const ROBUST_TAIL = 0.02
/** How far past that core range (in multiples of its height) a price may be and still be fitted */
const ROBUST_REACH = 1

/**
 * The range auto scale fits: every price except strays far from where most of them trade (e.g. a
 * bad tick). The core is the middle 96% of prices; anything more than one core-height beyond it
 * is left off the scale. `outliers` counts them; `all` is the full range including them.
 */
function robustRange(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const all = { min: sorted[0]!, max: sorted[sorted.length - 1]! }
  if (sorted.length < ROBUST_MIN_VALUES) return { ...all, all, outliers: 0 }
  const last = sorted.length - 1
  const lo = sorted[Math.floor(ROBUST_TAIL * last)]!
  const hi = sorted[Math.ceil((1 - ROBUST_TAIL) * last)]!
  const reach = (hi - lo) * ROBUST_REACH
  let min = Infinity
  let max = -Infinity
  let outliers = 0
  for (const v of sorted) {
    if (v < lo - reach || v > hi + reach) outliers++
    else {
      min = Math.min(min, v)
      max = Math.max(max, v)
    }
  }
  return { min, max, all, outliers }
}

const valueFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const DAY_MS = 86_400_000
/**
 * "2026-09-28" (daily) or an ISO timestamp (intraday). Timestamps from the database are UTC;
 * one without a zone suffix is read as UTC too (browsers would otherwise take it as local time).
 */
const toDate = (iso: string) =>
  new Date(
    iso.length === 10 ? `${iso}T00:00:00Z` : /(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`,
  )

/** Points carry a time of day (e.g. 15-minute bars) rather than one value per date */
const intraday = computed(() => (props.points[0]?.date.length ?? 0) > 10)

/** Zone for intraday times; plain dates are calendar days already and are shown as such */
const zone = computed(() => (intraday.value ? props.displayZone : UTC))
const fmt = computed(() => {
  const timeZone = zone.value.zone
  return {
    shortDate: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone }),
    monthYear: new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit', timeZone }),
    /** Tooltip date, e.g. "15/09/2026" */
    tipDate: new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone,
    }),
    timeOfDay: new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone,
    }),
  }
})
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/**
 * Per point: its trading day counted back from the last day (`t`, last day = 0) and whether it
 * is the first point of its day (`dayStart`). Used when `relativeDays` is on.
 */
const days = computed(() => {
  const keys = props.points.map((p) => tradingDayKey(p.date, zone.value.zone, props.dayStartHour))
  const t = new Array<number>(keys.length)
  const dayStart = new Array<boolean>(keys.length)
  let n = 0
  for (let i = keys.length - 1; i >= 0; i--) {
    if (i < keys.length - 1 && keys[i] !== keys[i + 1]) n++
    t[i] = n
  }
  for (let i = 0; i < keys.length; i++) dayStart[i] = i === 0 || keys[i] !== keys[i - 1]
  return { t, dayStart }
})
const isNum = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

const candles = computed(() => props.priceStyle === 'candles')
/** A point's open/high/low/close; missing sides fall back to the close (a flat bar) */
function ohlc(p: LinePoint) {
  const c = p.value
  const o = isNum(p.open) ? p.open : c
  return {
    o,
    h: Math.max(isNum(p.high) ? p.high : c, o, c),
    l: Math.min(isNum(p.low) ? p.low : c, o, c),
    c,
  }
}

/**
 * Per point: AVol + BVol summed from the first bar of its trading day up to and including it
 * (null until a bar of that day has a volume). A bar missing one side adds just the side it has.
 */
const dayVolume = computed(() => {
  const { dayStart } = days.value
  let sum: number | null = null
  return props.points.map((p, i) => {
    if (dayStart[i]) sum = null
    if (isNum(p.aVol) || isNum(p.bVol))
      sum = (sum ?? 0) + (isNum(p.aVol) ? p.aVol : 0) + (isNum(p.bVol) ? p.bVol : 0)
    return sum
  })
})

/** "T-3", or "T-X" for days older than `maxLabelledDay` */
const dayLabel = (t: number) =>
  props.maxLabelledDay !== null && t > props.maxLabelledDay ? 'T-X' : `T-${t}`
const tLabel = (i: number) => dayLabel(days.value.t[i]!)

/** The reference level, when set to a real number */
const refLevel = computed(() =>
  typeof props.refValue === 'number' && Number.isFinite(props.refValue) ? props.refValue : null,
)

/* ---------- Volume pane ---------- */

const volumeOn = computed(() => props.volume !== 'off')
/** Volume pane alone: no line, the pane takes the whole plot */
const lineHidden = computed(() => volumeOn.value && !props.showLine)
/**
 * Vertical split of the SVG's H units: the line plot is 0…lineH, the volume pane paneTop…H.
 * Measured from the plot's real height, so it holds when phones cap the line plot's height.
 */
const bands = computed(() => {
  if (!volumeOn.value) return { lineH: H, paneTop: H }
  if (lineHidden.value) return { lineH: 0, paneTop: 0 }
  const total = plotHeight.value || props.height
  const paneTop = H * (1 - clamp(props.volumeShare, 0.1, 0.9))
  return { lineH: paneTop - (H * PANE_GAP_PX) / total, paneTop }
})
const volFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

/* ---------- Crosshair sync between charts ---------- */

/** Point i's crosshair key: "T-2 10:45" on T-n charts (intraday), else its date */
function hoverKey(i: number) {
  const p = props.points[i]!
  if (!props.relativeDays) return p.date
  const t = `T-${days.value.t[i]}`
  return intraday.value ? `${t} ${fmt.value.timeOfDay.format(toDate(p.date))}` : t
}
/** Crosshair key → point index (the first point with that key) */
const keyIndex = computed(() => {
  const map = new Map<string, number>()
  for (let i = 0; i < props.points.length; i++) {
    const k = hoverKey(i)
    if (!map.has(k)) map.set(k, i)
  }
  return map
})
watch(hover, (i) => emit('hover-key', i === null ? null : hoverKey(i)))

/** The point under this chart's own pointer, else the one hovered on another chart */
const shown = computed(() => {
  if (hover.value !== null) return { i: hover.value, synced: false }
  const v = view.value
  const i = props.syncKey == null ? undefined : keyIndex.value.get(props.syncKey)
  // only when that point is on screen here
  if (i === undefined || !v || i < v.start || i > v.end) return null
  return { i, synced: true }
})

/** A 1/2/5 × 10^k step giving about `count` intervals */
function niceStep(span: number, count: number) {
  const raw = span / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const n = raw / mag
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag
}

/** The product's tick size, when set to a usable number */
const tick = computed(() =>
  typeof props.tickSize === 'number' && Number.isFinite(props.tickSize) && props.tickSize > 0
    ? props.tickSize
    : null,
)

/** Rounds away float noise, e.g. 0.05 × 3 = 0.15000000000000002 → 0.15 */
const tidy = (v: number) => Number(v.toPrecision(12))

/** Decimal places a number needs, e.g. 0.25 → 2, 5 → 0 */
function decimalsOf(v: number) {
  const s = String(tidy(v))
  const e = s.indexOf('e-')
  if (e >= 0) return Number(s.slice(e + 2)) + (s.slice(0, e).split('.')[1]?.length ?? 0)
  return s.split('.')[1]?.length ?? 0
}

/**
 * Price axis step for a visible range: about 4 intervals. With a tick size it is always a whole
 * number of ticks: the usual round step (1, 2, 5, 10 …) when that is one, else 1, 2, 5, 10 … ticks.
 */
function axisStep(span: number) {
  const nice = niceStep(span, 4)
  const t = tick.value
  if (t === null) return nice
  const ticks = nice / t
  if (ticks >= 1 && Math.abs(ticks - Math.round(ticks)) < 1e-9) return nice
  return tidy(t * Math.max(1, niceStep(span / t, 4)))
}

/* ---------- Viewport ---------- */

function clampSpan(span: number) {
  const max = Math.max(props.points.length, 1)
  return clamp(span, Math.min(MIN_SPAN, max), max)
}

function setView(start: number, span: number) {
  const n = props.points.length
  if (!n) return
  span = clampSpan(span)
  start = clamp(start, -0.5, n - 0.5 - span)
  view.value = { start, end: start + span }

  const first = clamp(Math.ceil(start), 0, n - 1)
  const last = clamp(Math.floor(start + span), 0, n - 1)
  emit('view-change', {
    from: props.points[first]!.date,
    to: props.points[last]!.date,
    count: Math.round(span),
    atLatest: start + span >= n - 0.51,
    total: n,
    first,
    last,
    ...(props.relativeDays && { fromDay: days.value.t[first], toDay: days.value.t[last] }),
  })
}

/** Show the newest `count` points (Infinity = everything) */
function showLatest(count: number) {
  const span = clampSpan(count)
  setView(props.points.length - 0.5 - span, span)
}

/**
 * Fit points `first` … `last` (indices, inclusive) to the width, e.g. one trading day.
 * A range shorter than the minimum zoom is centred instead.
 */
function showRange(first: number, last: number) {
  const span = clampSpan(last - first + 1)
  setView((first + last) / 2 - span / 2, span)
}

const span = () => (view.value ? view.value.end - view.value.start : props.initialCount)

/** Pan by a fraction of the visible width (positive = towards newer data) */
function panBy(fraction: number) {
  if (view.value) setView(view.value.start + fraction * span(), span())
}

/** Zoom by `factor` (< 1 zooms in), keeping the point under `fx` (0–1 across the plot) fixed */
function zoomBy(factor: number, fx = 0.5) {
  const v = view.value
  if (!v) return
  const old = v.end - v.start
  const next = clampSpan(old * factor)
  setView(v.start + fx * old - fx * next, next)
}

// New data (another spread, a refetch): keep the current zoom, jump to the newest points
watch(
  () => props.points,
  (pts, old) => {
    hover.value = null
    yRange.value = null // new values: fit them again
    if (!pts.length) view.value = null
    else showLatest(old?.length && view.value ? span() : props.initialCount)
  },
  { immediate: true },
)

/** Back to auto-fitting the price axis */
function resetYScale() {
  yRange.value = null
}

defineExpose({ showLatest, showRange, resetYScale })

/* ---------- Geometry for the visible window ---------- */

const chart = computed(() => {
  const pts = props.points
  const n = pts.length
  const v = view.value
  if (!n || !v) return null

  const width = v.end - v.start
  const x = (i: number) => ((i - v.start) / width) * W
  // one point past each edge so the line runs off the plot instead of stopping short
  const i0 = clamp(Math.floor(v.start), 0, n - 1)
  const i1 = clamp(Math.ceil(v.end), 0, n - 1)

  // y fits the points on screen (TradingView-style auto scale), unless the user has set a range.
  // Auto scale fits where most prices trade: a stray far-off price runs off the plot instead of
  // squashing everything else (the "Show all" button or dragging the price axis brings it in).
  const values: number[] = []
  for (let i = i0; i <= i1; i++) {
    // candles fit their wicks; the line only its closes
    if (candles.value) {
      const { h, l } = ohlc(pts[i]!)
      values.push(h, l)
    } else values.push(pts[i]!.value)
  }
  const fit = robustRange(values)
  const withPad = (r: { min: number; max: number }) => {
    let { min: lo, max: hi } = r
    // keep the reference line in view too
    if (refLevel.value !== null) {
      lo = Math.min(lo, refLevel.value)
      hi = Math.max(hi, refLevel.value)
    }
    const pad = (hi - lo || Math.abs(hi) || 1) * 0.08
    return { min: lo - pad, max: hi + pad }
  }
  const { min, max } = yRange.value ?? withPad(fit)
  // The line plot fills the top band; the volume pane (when on) sits below it
  const { lineH, paneTop } = bands.value
  const y = (val: number) => (1 - (val - min) / (max - min)) * lineH
  const pct = (u: number, total: number) => `${((u / total) * 100).toFixed(3)}%`

  const step = axisStep(max - min)
  const decimals = decimalsOf(step)
  const yTicks: { label: string; top: string }[] = []
  let grid = ''
  for (let val = Math.ceil(min / step) * step; val <= max; val += step) {
    grid += `M0 ${y(val).toFixed(1)} H${W} `
    yTicks.push({ label: val.toFixed(decimals), top: pct(y(val), H) })
  }

  // Date ticks sit on fixed index multiples so they glide with the data while panning
  const every = Math.max(1, Math.round(niceStep(width, 6)))
  const xTicks: { key: number; label: string; left: string }[] = []
  const firstVisible = Math.ceil(Math.max(v.start, 0))
  const lastVisible = Math.floor(Math.min(v.end, n - 1))
  const { t, dayStart } = days.value

  // Days older than T-maxLabelledDay ("T-X") get no separators or axis labels, only the line
  const labelled = (i: number) => props.maxLabelledDay === null || t[i]! <= props.maxLabelledDay

  // Day separators: a vertical line where each labelled trading day starts, halfway between the
  // previous day's last bar and this day's first bar (the very first bar has nothing before it)
  let daySeparators = ''
  if (props.relativeDays)
    for (let i = Math.max(1, firstVisible); i <= Math.min(lastVisible + 1, n - 1); i++)
      if (dayStart[i] && labelled(i)) daySeparators += `M${x(i - 0.5).toFixed(1)} 0 V${H} `

  // T-n charts get a two-level axis (like Excel's grouped category axis): row 1 is each bar's
  // time, rotated; row 2 is the trading day, centred under its visible bars; dividers between days
  const timeTicks: { key: number; label: string; left: string }[] = []
  const dayLabels: { key: number; label: string; left: string }[] = []
  const axisSeps: { key: number; left: string }[] = []
  if (props.relativeDays) {
    if (intraday.value) {
      // Every k-th bar, k sized to the plot's pixel width; fixed index multiples so labels glide
      const k = Math.max(1, Math.ceil((width * TIME_LABEL_PX) / Math.max(plotWidth.value, 1)))
      for (let i = Math.ceil(firstVisible / k) * k; i <= lastVisible; i += k)
        if (labelled(i))
          timeTicks.push({
            key: i,
            label: fmt.value.timeOfDay.format(toDate(pts[i]!.date)),
            left: pct(x(i), W),
          })
    }
    let dayFirst = firstVisible
    for (let i = firstVisible; i <= lastVisible; i++) {
      if (i < lastVisible && !dayStart[i + 1]) continue // not the day's last visible bar
      if (labelled(i))
        dayLabels.push({ key: t[i]!, label: tLabel(i), left: pct(x((dayFirst + i) / 2), W) })
      dayFirst = i + 1
    }
    for (let i = Math.max(1, firstVisible); i <= Math.min(lastVisible + 1, n - 1); i++)
      if (dayStart[i] && labelled(i)) axisSeps.push({ key: i, left: pct(x(i - 0.5), W) })
  }

  let tickLabel: (d: Date) => string
  if (intraday.value) {
    // Pick the label by how much time is on screen: days → "28 Sep", one or two days → "28 Sep 14:00", hours → "14:00"
    const visibleMs = toDate(pts[i1]!.date).getTime() - toDate(pts[i0]!.date).getTime()
    tickLabel =
      visibleMs > 3 * DAY_MS
        ? (d) => fmt.value.shortDate.format(d)
        : visibleMs > DAY_MS
          ? (d) => `${fmt.value.shortDate.format(d)} ${fmt.value.timeOfDay.format(d)}`
          : (d) => fmt.value.timeOfDay.format(d)
  } else {
    const dayFmt = width > 200 ? fmt.value.monthYear : fmt.value.shortDate
    tickLabel = (d) => dayFmt.format(d)
  }
  if (!props.relativeDays)
    for (let i = Math.ceil(Math.max(v.start, 0) / every) * every; i <= lastVisible; i += every)
      xTicks.push({ key: i, label: tickLabel(toDate(pts[i]!.date)), left: pct(x(i), W) })

  let line = ''
  for (let i = i0; i <= i1; i++)
    line += `${i > i0 ? 'L' : 'M'}${x(i).toFixed(1)},${y(pts[i]!.value).toFixed(1)} `
  const area = `${line}L${x(i1).toFixed(1)},${lineH.toFixed(1)} L${x(i0).toFixed(1)},${lineH.toFixed(1)} Z`
  const candlePaths = candles.value ? candleShapes(i0, i1, x, y, (W / width) * BAR_FILL) : null

  const pane = volumeOn.value ? volumePane(i0, i1, x, (W / width) * BAR_FILL, paneTop, pct) : null

  const last = pts[n - 1]!
  return {
    n,
    yMin: min,
    yMax: max,
    // Auto scale left stray prices off: how many, and the range that shows them all
    offScale: yRange.value ? 0 : fit.outliers,
    fullRange: withPad(fit.all),
    grid,
    daySeparators,
    timeTicks,
    dayLabels,
    axisSeps,
    line,
    area,
    candles: candlePaths,
    pane,
    lineH,
    yTicks,
    xTicks,
    // The latest value stays on the right axis even when panned into the past
    // Reference line, when it falls within the plot (a manual y range can push it off)
    ref:
      refLevel.value !== null && y(refLevel.value) >= 0 && y(refLevel.value) <= lineH
        ? {
            d: `M0 ${y(refLevel.value).toFixed(1)} H${W}`,
            top: pct(y(refLevel.value), H),
            label: `${props.refLabel ? `${props.refLabel} ` : ''}${valueFmt.format(refLevel.value)}`,
          }
        : null,
    lastTag: { label: valueFmt.format(last.value), top: pct(clamp(y(last.value), 0, lineH), H) },
    atLatest: v.end >= n - 0.51,
    at: (i: number) => ({
      left: pct(x(i), W),
      top: pct(y(pts[i]!.value), H),
      fx: x(i) / W,
      // false when a manual y range has pushed the point off the plot
      inside: y(pts[i]!.value) >= 0 && y(pts[i]!.value) <= lineH,
    }),
  }
})

/**
 * Candles for points i0…i1, in SVG units: up (close ≥ open) and down, each a path of wicks
 * (high to low) and a path of bodies (open to close). A body never gets thinner than about a
 * pixel, so a bar that opened and closed at the same price still shows as a tick.
 */
function candleShapes(
  i0: number,
  i1: number,
  x: (i: number) => number,
  y: (v: number) => number,
  bodyW: number,
) {
  const minBody = H / Math.max(plotHeight.value || props.height, 1)
  const out = { upWick: '', upBody: '', downWick: '', downBody: '' }
  for (let i = i0; i <= i1; i++) {
    const { o, h, l, c } = ohlc(props.points[i]!)
    const up = c >= o
    const cx = x(i)
    const wick = `M${cx.toFixed(1)},${y(h).toFixed(1)} V${y(l).toFixed(1)} `
    let top = y(Math.max(o, c))
    let len = y(Math.min(o, c)) - top
    if (len < minBody) {
      top -= (minBody - len) / 2
      len = minBody
    }
    const body = `M${(cx - bodyW / 2).toFixed(2)},${top.toFixed(2)} h${bodyW.toFixed(2)} v${len.toFixed(2)} h${(-bodyW).toFixed(2)} Z `
    if (up) {
      out.upWick += wick
      out.upBody += body
    } else {
      out.downWick += wick
      out.downBody += body
    }
  }
  return out
}

/**
 * Bars of the volume pane for points i0…i1, in SVG units: `up` paths rise from the zero line,
 * `down` paths hang below it: AVol up, BVol down, both on one scale (the larger of the two on
 * screen), so their lengths compare directly.
 */
function volumePane(
  i0: number,
  i1: number,
  x: (i: number) => number,
  barW: number,
  top: number,
  pct: (u: number, total: number) => string,
) {
  const pts = props.points
  // A sliver of room so the tallest bar doesn't touch the pane's edge
  const pad = (H - top) * 0.04
  const mid = (top + H) / 2
  const half = mid - top - pad
  const bar = (i: number, len: number, dir: 1 | -1) => {
    const x0 = (x(i) - barW / 2).toFixed(1)
    return `M${x0},${mid.toFixed(1)} v${(-dir * len).toFixed(2)} h${barW.toFixed(2)} v${(dir * len).toFixed(2)} Z `
  }

  let up = ''
  let down = ''
  let scale = 0
  for (let i = i0; i <= i1; i++) {
    const { aVol, bVol } = pts[i]!
    if (isNum(aVol)) scale = Math.max(scale, aVol)
    if (isNum(bVol)) scale = Math.max(scale, bVol)
  }
  if (scale > 0)
    for (let i = i0; i <= i1; i++) {
      const { aVol, bVol } = pts[i]!
      if (isNum(aVol) && aVol > 0) up += bar(i, (aVol / scale) * half, 1)
      if (isNum(bVol) && bVol > 0) down += bar(i, (bVol / scale) * half, -1)
    }

  return {
    empty: scale === 0,
    up,
    down,
    frame: `M0 ${top.toFixed(1)} H${W}`,
    zero: `M0 ${mid.toFixed(1)} H${W}`,
    // Pane's own axis: top and bottom of the scale, zero in the middle
    ticks: [
      { key: 'top', label: volFmt.format(scale), top: pct(mid - half, H) },
      { key: 'zero', label: '0', top: pct(mid, H) },
      { key: 'bot', label: volFmt.format(scale), top: pct(mid + half, H) },
    ],
    // Direct labels for the up and down halves, in the right gutter
    upLabel: 'AVol',
    downLabel: 'BVol',
    middle: pct(mid, H),
  }
}

/** Blur the chart: while loading, on error, or when there's nothing to plot */
const veiled = computed(() => props.loading || !!props.error || !chart.value)

/** Narrow plot (phones): a smaller tooltip so it covers less of the chart */
const compactTip = computed(() => plotWidth.value < COMPACT_BELOW_PX)

function tooltipSide(fx: number): 'right' | 'left' | 'center' {
  const room = compactTip.value ? TOOLTIP_COMPACT_PX : TOOLTIP_PX
  const at = fx * plotWidth.value
  if (at + room <= plotWidth.value + GUTTER_PX && fx <= 0.6) return 'right'
  if (at - room >= -GUTTER_PX) return 'left'
  if (at + room <= plotWidth.value + GUTTER_PX) return 'right'
  return 'center'
}

const tip = computed(() => {
  const c = chart.value
  const i = shown.value?.i ?? null
  if (!c || i === null || i >= c.n) return null
  const p = props.points[i]!
  const pos = c.at(i)
  const d = toDate(p.date)
  // The bar's own calendar date (and time, for intraday) in the display zone
  const when = intraday.value
    ? `${fmt.value.tipDate.format(d)} · ${fmt.value.timeOfDay.format(d)} ${zone.value.label}`
    : fmt.value.tipDate.format(d)
  // Over the volume pane: the volume readout; over the line: its value. Crosshairs mirrored from
  // another chart show the line's value (unless this chart shows the pane alone).
  const synced = shown.value!.synced
  const inPane = lineHidden.value || (volumeOn.value && hoverInPane.value && !synced)
  return {
    ...pos,
    synced,
    inPane,
    // Right of the crosshair if it fits, else left, else (very narrow plots) centred on top
    side: tooltipSide(pos.fx),
    // With T-n labels: the trading day as the heading, the actual date and time beneath it
    date: props.relativeDays ? tLabel(i) : when,
    when: props.relativeDays ? when : '',
    value: valueFmt.format(p.value),
    // Candles: the bar's open, high, low and close
    ohlc: candles.value
      ? (() => {
          const { o, h, l, c } = ohlc(p)
          return [
            { k: 'Open', v: valueFmt.format(o) },
            { k: 'High', v: valueFmt.format(h) },
            { k: 'Low', v: valueFmt.format(l) },
            { k: 'Close', v: valueFmt.format(c) },
          ]
        })()
      : null,
    // Over the line: volume traded so far that day, from its first bar to this one (needs AVol / BVol)
    dayVol: (() => {
      const total = dayVolume.value[i]
      if (inPane || total == null) return null
      return {
        label: intraday.value ? 'Day vol' : 'Vol',
        value: valueFmt.format(total),
      }
    })(),
    // Over the volume pane: both sides of this bar
    vol: inPane
      ? {
          a: isNum(p.aVol) ? valueFmt.format(p.aVol) : '–',
          b: isNum(p.bVol) ? valueFmt.format(p.bVol) : '–',
        }
      : null,
  }
})

/**
 * The crosshair's horizontal line, at the pointer's height (only under this chart's own pointer,
 * not one mirrored from another chart). Over the line plot it carries the price at that height on
 * the right axis; over the volume pane, just the line.
 */
const hLine = computed(() => {
  const c = chart.value
  const yU = pointerY.value
  if (!c || yU === null || shown.value?.synced !== false) return null
  const { lineH } = bands.value
  const overLine = !lineHidden.value && yU <= lineH
  if (!overLine) return { top: `${((yU / H) * 100).toFixed(3)}%`, label: null }
  let price = c.yMax - (yU / lineH) * (c.yMax - c.yMin)
  // With a tick size: snap to the nearest tick, and the line to that price's height
  const t = tick.value
  if (t !== null) price = tidy(Math.round(price / t) * t)
  const at = t === null ? yU : ((c.yMax - price) / (c.yMax - c.yMin)) * lineH
  return {
    top: `${((clamp(at, 0, lineH) / H) * 100).toFixed(3)}%`,
    label:
      t === null
        ? valueFmt.format(price)
        : price.toLocaleString('en-US', {
            minimumFractionDigits: decimalsOf(t),
            maximumFractionDigits: decimalsOf(t),
          }),
  }
})

/* ---------- Pointer, wheel & keyboard ---------- */

let drag: {
  x: number
  y: number
  start: number
  span: number
  yRange: { min: number; max: number } | null
} | null = null
const dragging = ref(false)

function plotFraction(clientX: number, clientY?: number) {
  const rect = hitEl.value!.getBoundingClientRect()
  if (clientY !== undefined) {
    pointerY.value = clamp(((clientY - rect.top) / rect.height) * H, 0, H)
    // Split at the middle of the gap between the line plot and the volume pane
    const { lineH, paneTop } = bands.value
    if (volumeOn.value) hoverInPane.value = pointerY.value >= (lineH + paneTop) / 2
  }
  return { fx: (clientX - rect.left) / rect.width, width: rect.width, height: rect.height }
}

function updateHover(fx: number) {
  const v = view.value
  if (!v) return
  const n = props.points.length
  const i = Math.round(v.start + fx * (v.end - v.start))
  hover.value = clamp(i, Math.max(0, Math.ceil(v.start)), Math.min(n - 1, Math.floor(v.end)))
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0 || !view.value) return
  if (props.locked) {
    // No panning: a tap just shows the tooltip for the bar under the finger
    updateHover(plotFraction(e.clientX, e.clientY).fx)
    return
  }
  hitEl.value?.setPointerCapture(e.pointerId)
  drag = {
    x: e.clientX,
    y: e.clientY,
    start: view.value.start,
    span: span(),
    yRange: yRange.value,
  }
  dragging.value = true
}

function onPointerMove(e: PointerEvent) {
  const { fx, width, height } = plotFraction(e.clientX, e.clientY)
  if (drag) {
    setView(drag.start - ((e.clientX - drag.x) / width) * drag.span, drag.span)
    // With a manual price range, dragging also pans up and down (auto scale has nothing to pan)
    const r = drag.yRange
    if (r) {
      const shift = ((e.clientY - drag.y) / ((height * bands.value.lineH) / H)) * (r.max - r.min)
      yRange.value = { min: r.min + shift, max: r.max + shift }
    }
  }
  updateHover(fx)
}

function endDrag(e: PointerEvent) {
  if (hitEl.value?.hasPointerCapture(e.pointerId)) hitEl.value.releasePointerCapture(e.pointerId)
  drag = null
  dragging.value = false
}

function onPointerLeave(e: PointerEvent) {
  // Locked (mobile): a tap's tooltip stays after the finger lifts, until the next tap
  if (props.locked && e.pointerType !== 'mouse') return
  if (!drag) hover.value = null
}

/** Ctrl or Cmd held while scrolling. Browsers also report a trackpad pinch as Ctrl + wheel. */
const isZoomGesture = (e: WheelEvent) => e.ctrlKey || e.metaKey

function onWheel(e: WheelEvent) {
  if (!view.value || props.locked) return // locked: let the page scroll
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
  let dx = e.deltaX * unit
  let dy = e.deltaY * unit
  if (e.shiftKey && !dx) [dx, dy] = [dy, 0] // shift + wheel pans
  const pan = Math.abs(dx) > Math.abs(dy)
  if (!pan && !isZoomGesture(e)) return // a plain vertical scroll moves the page
  e.preventDefault() // also stops the browser's own page zoom on Ctrl + wheel
  const { fx, width } = plotFraction(e.clientX, e.clientY)
  // Horizontal scroll (trackpad swipe) pans; Ctrl/Cmd + vertical scroll and pinch zoom
  if (pan) panBy(dx / width)
  else zoomBy(Math.exp(dy * ZOOM_SPEED), clamp(fx, 0, 1))
  updateHover(fx)
}

/* ---------- Axis scaling: drag or Ctrl/Cmd + scroll on an axis to stretch it, double-click to reset ---------- */

let axisDrag:
  | { kind: 'y'; pos: number; min: number; max: number }
  | { kind: 'x'; pos: number; start: number; span: number }
  | null = null

/** Scale the price range by `factor` (> 1 shows more values) around its middle */
function scaleY(min: number, max: number, factor: number) {
  const mid = (min + max) / 2
  const half = Math.max(((max - min) / 2) * factor, Math.abs(mid) * 1e-9 || 1e-9)
  yRange.value = { min: mid - half, max: mid + half }
}

function onAxisDown(e: PointerEvent, kind: 'x' | 'y') {
  const c = chart.value
  if (e.button !== 0 || !c || !view.value || props.locked) return
  e.preventDefault()
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  hover.value = null
  axisDrag =
    kind === 'y'
      ? { kind, pos: e.clientY, min: c.yMin, max: c.yMax }
      : { kind, pos: e.clientX, start: view.value.start, span: span() }
}

function onAxisMove(e: PointerEvent) {
  const d = axisDrag
  if (!d) return
  if (d.kind === 'y') {
    // Drag down to squash the line (more values on screen), up to stretch it
    scaleY(d.min, d.max, Math.exp((e.clientY - d.pos) * AXIS_SPEED))
  } else {
    // Drag right to spread the bars out (zoom in), left to fit more; the right edge stays put
    const next = clampSpan(d.span * Math.exp(-(e.clientX - d.pos) * AXIS_SPEED))
    setView(d.start + d.span - next, next)
  }
}

function onAxisUp(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement
  if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
  axisDrag = null
}

function onAxisWheel(e: WheelEvent, kind: 'x' | 'y') {
  const c = chart.value
  if (!c || props.locked || !isZoomGesture(e)) return // a plain scroll moves the page
  e.preventDefault()
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
  const delta = (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * unit
  if (kind === 'y') scaleY(c.yMin, c.yMax, Math.exp(delta * ZOOM_SPEED))
  else zoomBy(Math.exp(delta * ZOOM_SPEED), 1)
}

function onAxisReset(kind: 'x' | 'y') {
  if (kind === 'y') resetYScale()
  else showLatest(props.initialCount)
}

function onKeydown(e: KeyboardEvent) {
  if (props.locked) return
  const c = chart.value
  const actions: Record<string, () => void> = {
    // Price axis: PageUp/PageDown stretch/squash it, A returns to auto scale
    PageUp: () => c && scaleY(c.yMin, c.yMax, 0.8),
    PageDown: () => c && scaleY(c.yMin, c.yMax, 1.25),
    a: resetYScale,
    ArrowLeft: () => panBy(-0.1),
    ArrowRight: () => panBy(0.1),
    '+': () => zoomBy(0.8),
    '=': () => zoomBy(0.8),
    '-': () => zoomBy(1.25),
    Home: () => setView(-0.5, span()),
    End: () => showLatest(span()),
  }
  const act = actions[e.key]
  if (!act) return
  e.preventDefault()
  hover.value = null
  act()
}
</script>

<template>
  <div
    class="chart"
    :class="{ grouped: relativeDays }"
    :style="{ '--plot-h': `${height}px` }"
    :aria-busy="loading"
  >
    <div ref="plotEl" class="plot">
      <!-- Everything drawn lives in the stage, which is blurred while loading, on error, or with no data -->
      <div class="stage" :class="{ veiled: veiled }" :inert="veiled || undefined">
        <template v-if="chart">
          <span
            v-for="t in lineHidden ? [] : chart.yTicks"
            :key="t.label"
            class="y-tick"
            :style="{ top: t.top }"
          >
            {{ t.label }}
          </span>
          <div class="x-axis">
            <span v-for="t in chart.xTicks" :key="t.key" class="x-tick" :style="{ left: t.left }">
              {{ t.label }}
            </span>
            <!-- T-n charts: rotated times, then trading days, with dividers through both rows -->
            <span
              v-for="tk in chart.timeTicks"
              :key="`time-${tk.key}`"
              class="x-time"
              :style="{ left: tk.left }"
            >
              {{ tk.label }}
            </span>
            <span
              v-for="d in chart.dayLabels"
              :key="`day-${d.key}`"
              class="x-day"
              :style="{ left: d.left }"
            >
              {{ d.label }}
            </span>
            <span
              v-for="sep in chart.axisSeps"
              :key="`sep-${sep.key}`"
              class="x-sep"
              :style="{ left: sep.left }"
            />
          </div>
          <span v-if="chart.ref && !lineHidden" class="ref-tag" :style="{ top: chart.ref.top }">{{
            chart.ref.label
          }}</span>
          <span v-if="!lineHidden" class="last-tag" :style="{ top: chart.lastTag.top }">{{
            chart.lastTag.label
          }}</span>
          <template v-if="chart.pane">
            <template v-if="!chart.pane.empty">
              <span
                v-for="t in chart.pane.ticks"
                :key="`vol-${t.key}`"
                class="y-tick vol-tick"
                :style="{ top: t.top }"
                >{{ t.label }}</span
              >
              <!-- Direct labels in the right gutter, beside the half of the pane each side fills -->
              <span class="vol-label" :style="{ top: chart.pane.ticks[0]!.top }">
                <span class="vol-swatch" aria-hidden="true" />{{ chart.pane.upLabel }}
              </span>
              <span class="vol-label" :style="{ top: chart.pane.ticks[2]!.top }">
                <span class="vol-swatch b" aria-hidden="true" />{{ chart.pane.downLabel }}
              </span>
            </template>
            <span v-else class="vol-empty" :style="{ top: chart.pane.middle }">{{
              volumeEmptyText
            }}</span>
          </template>

          <svg
            class="svg"
            :viewBox="`0 0 ${W} ${H}`"
            preserveAspectRatio="none"
            role="img"
            :aria-label="ariaLabel"
          >
            <defs>
              <linearGradient :id="gradId" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--color-accent)" stop-opacity="0.2" />
                <stop offset="100%" stop-color="var(--color-accent)" stop-opacity="0" />
              </linearGradient>
            </defs>
            <template v-if="!lineHidden">
              <path class="grid" :d="chart.grid" />
              <path v-if="chart.daySeparators" class="day-sep" :d="chart.daySeparators" />
              <template v-if="chart.candles">
                <path class="wick up" :d="chart.candles.upWick" />
                <path class="wick down" :d="chart.candles.downWick" />
                <path class="body up" :d="chart.candles.upBody" />
                <path class="body down" :d="chart.candles.downBody" />
              </template>
              <template v-else>
                <path :d="chart.area" :fill="`url(#${gradId})`" />
                <path class="line" :d="chart.line" />
              </template>
              <path v-if="chart.ref" class="ref-line" :d="chart.ref.d" />
            </template>
            <g v-if="chart.pane">
              <path v-if="!lineHidden" class="grid" :d="chart.pane.frame" />
              <path class="vol-bar" :d="chart.pane.up" />
              <path class="vol-bar b" :d="chart.pane.down" />
              <path v-if="!chart.pane.empty" class="vol-zero" :d="chart.pane.zero" />
            </g>
          </svg>

          <div
            ref="hitEl"
            class="hit"
            :class="{ dragging, locked }"
            :tabindex="locked ? undefined : 0"
            :aria-label="
              locked
                ? undefined
                : 'Chart. Drag or use the arrow keys to pan; hold Ctrl or Command and scroll, pinch, or press + and − to zoom; Home and End jump to the oldest and newest data; Page Up and Page Down stretch the price axis, A resets it.'
            "
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="endDrag"
            @pointercancel="endDrag"
            @pointerleave="onPointerLeave"
            @wheel="onWheel"
            @keydown="onKeydown"
          >
            <template v-if="tip">
              <div class="crosshair" :style="{ left: tip.left }" />
              <template v-if="hLine">
                <div class="crosshair-h" :style="{ top: hLine.top }" />
                <span v-if="hLine.label" class="cursor-tag" :style="{ top: hLine.top }">{{
                  hLine.label
                }}</span>
              </template>
              <div
                v-if="tip.inside && !tip.inPane && !tip.ohlc"
                class="dot"
                :style="{ left: tip.left, top: tip.top }"
              />
              <div
                class="tooltip"
                :class="[tip.side, { synced: tip.synced, compact: compactTip }]"
                :style="{ left: tip.side === 'center' ? '50%' : tip.left }"
              >
                <span class="tip-date">{{ tip.date }}</span>
                <span v-if="tip.when" class="tip-when">{{ tip.when }}</span>
                <template v-if="!tip.inPane && tip.ohlc">
                  <span v-for="r in tip.ohlc" :key="r.k" class="tip-row">
                    <span>{{ r.k }}</span
                    ><strong>{{ r.v }}</strong>
                  </span>
                </template>
                <span v-else-if="!tip.inPane" class="tip-row">
                  <span>{{ valueLabel }}</span
                  ><strong>{{ tip.value }}</strong>
                </span>
                <span v-if="tip.dayVol" class="tip-row">
                  <span>{{ tip.dayVol.label }}</span
                  ><strong>{{ tip.dayVol.value }}</strong>
                </span>
                <template v-if="tip.vol">
                  <span class="tip-row">
                    <span><span class="vol-swatch" aria-hidden="true" />AVol</span
                    ><strong>{{ tip.vol.a }}</strong>
                  </span>
                  <span class="tip-row">
                    <span><span class="vol-swatch b" aria-hidden="true" />BVol</span
                    ><strong>{{ tip.vol.b }}</strong>
                  </span>
                </template>
              </div>
            </template>
          </div>

          <!-- Axis handles: drag or Ctrl/Cmd + scroll to stretch, double-click to reset (price: auto fit; time: default view) -->
          <template v-if="!locked">
            <div
              v-for="side in lineHidden ? [] : ['left', 'right']"
              :key="side"
              class="axis-hit y"
              :class="side"
              title="Drag to stretch the price axis · double-click for auto scale"
              @pointerdown="onAxisDown($event, 'y')"
              @pointermove="onAxisMove"
              @pointerup="onAxisUp"
              @pointercancel="onAxisUp"
              @wheel="onAxisWheel($event, 'y')"
              @dblclick="onAxisReset('y')"
            />
            <div
              class="axis-hit x"
              title="Drag to stretch the time axis · double-click to reset"
              @pointerdown="onAxisDown($event, 'x')"
              @pointermove="onAxisMove"
              @pointerup="onAxisUp"
              @pointercancel="onAxisUp"
              @wheel="onAxisWheel($event, 'x')"
              @dblclick="onAxisReset('x')"
            />
          </template>

          <button
            v-if="chart.offScale && !lineHidden"
            type="button"
            class="auto-scale"
            :title="`${chart.offScale} price${chart.offScale > 1 ? 's' : ''} far from the rest ${chart.offScale > 1 ? 'are' : 'is'} off the scale. Show ${chart.offScale > 1 ? 'them' : 'it'} too`"
            @click="yRange = chart.fullRange"
          >
            Show all prices
          </button>
          <button
            v-else-if="yRange && !lineHidden"
            type="button"
            class="auto-scale"
            title="Fit the price axis to the data on screen"
            @click="resetYScale"
          >
            Auto scale
          </button>

          <button
            v-if="!chart.atLatest && !locked"
            type="button"
            class="to-latest"
            aria-label="Jump to latest"
            title="Jump to latest"
            @click="showLatest(span())"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M6 6l6 6-6 6M13 6l6 6-6 6" />
            </svg>
          </button>
        </template>

        <!-- Nothing to plot yet: a faint stand-in chart, so the blur has a shape behind it -->
        <svg
          v-else
          class="svg placeholder"
          :viewBox="`0 0 ${W} ${H}`"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path class="grid" :d="PLACEHOLDER.grid" />
          <path class="placeholder-area" :d="PLACEHOLDER.area" />
          <path class="line" :d="PLACEHOLDER.line" />
        </svg>
      </div>

      <div v-if="loading && !error" class="state" role="status">
        <span class="shimmer" aria-hidden="true" />
        <span class="state-card">
          <span class="spinner" aria-hidden="true" />
          Loading chart…
        </span>
      </div>
      <div v-else-if="error" class="state" role="alert">
        <span class="state-card column">
          <span class="state-title">{{ error }}</span>
          <span v-if="errorHint" class="state-hint">{{ errorHint }}</span>
          <button type="button" class="btn sm retry" @click="$emit('retry')">Retry</button>
        </span>
      </div>
      <div v-else-if="!chart" class="state" role="status">
        <span class="state-card">
          <slot name="empty">{{ emptyText }}</slot>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chart {
  /* gutters: y-axis labels left, latest-value tag right, date labels below */
  padding: 0.5rem 4rem 1.75rem 3rem;
}
/* Room for the two-level T-n axis: rotated times, then the trading day */
.chart.grouped {
  padding-bottom: 5.5rem;
}

.plot {
  position: relative;
  /* the line plot, and the volume pane under it when that's on, share this height */
  height: var(--plot-h, 360px);
}

.svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* clip the line where it runs off the panned window */
  overflow: hidden;
}

.x-axis {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.day-sep {
  fill: none;
  stroke: var(--color-border-hover);
  stroke-width: 1;
  stroke-dasharray: 4 4;
  vector-effect: non-scaling-stroke;
}

.grid {
  fill: none;
  stroke: var(--color-border);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.line {
  fill: none;
  stroke: var(--color-accent);
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

/* Candles: green up, red down; wicks a hairline at any zoom */
.wick {
  fill: none;
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.wick.up {
  stroke: var(--color-candle-up);
}
.wick.down {
  stroke: var(--color-candle-down);
}
.body.up {
  fill: var(--color-candle-up);
}
.body.down {
  fill: var(--color-candle-down);
}

/* Volume pane: AVol in the line's accent, BVol in the second-series colour */
.vol-bar {
  fill: var(--color-accent);
  opacity: 0.85;
}
.vol-bar.b {
  fill: var(--color-series-2);
}
.vol-zero {
  fill: none;
  stroke: var(--color-border-hover);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.vol-tick {
  font-size: 0.72rem;
}
.vol-label,
.vol-empty {
  position: absolute;
  font-size: 0.72rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  pointer-events: none;
}
.vol-label {
  left: calc(100% + 0.6rem);
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  transform: translateY(-50%);
  line-height: 1.2;
}
.vol-empty {
  left: 50%;
  transform: translate(-50%, -50%);
}
.vol-swatch {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 0.35rem;
  border-radius: 2px;
  background: var(--color-accent);
}
.vol-label .vol-swatch {
  margin-right: 0;
}
.vol-swatch.b {
  background: var(--color-series-2);
}

.ref-line {
  fill: none;
  stroke: var(--color-reference);
  stroke-width: 1.5;
  stroke-dasharray: 6 4;
  vector-effect: non-scaling-stroke;
}
/* Its label sits just above the line at the left edge of the plot */
.ref-tag {
  position: absolute;
  left: 0.4rem;
  transform: translateY(calc(-100% - 2px));
  padding: 0 0.3rem;
  border-radius: 4px;
  background: color-mix(in srgb, var(--color-background-soft) 75%, transparent);
  color: var(--color-reference);
  font-size: 0.75rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
}

.y-tick,
.x-tick,
.last-tag {
  position: absolute;
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--color-text-muted);
}
.y-tick {
  right: calc(100% + 0.6rem);
  transform: translateY(-50%);
}
.x-tick {
  top: calc(100% + 0.5rem);
  transform: translateX(-50%);
}

/* Two-level T-n axis */
.x-time,
.x-day {
  position: absolute;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
}
.x-time {
  top: calc(100% + 0.45rem);
  font-size: 0.72rem;
  line-height: 1;
  /* vertical, reading bottom-to-top like a spreadsheet axis */
  writing-mode: vertical-rl;
  transform: translateX(-50%) rotate(180deg);
}
.x-day {
  top: calc(100% + 3.65rem);
  transform: translateX(-50%);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text);
}
.x-sep {
  position: absolute;
  top: 100%;
  height: 5.25rem;
  border-left: 1px dashed var(--color-border-hover);
}
.last-tag {
  left: calc(100% + 0.6rem);
  transform: translateY(-50%);
  padding: 0.1rem 0.45rem;
  border-radius: 6px;
  background: var(--color-accent-solid);
  color: var(--color-on-accent);
  font-weight: 600;
}

.hit {
  position: absolute;
  inset: 0;
  cursor: crosshair;
  /* horizontal drags pan the chart; vertical swipes still scroll the page on touch */
  touch-action: pan-y;
  user-select: none;
  border-radius: 4px;
}
.hit.locked {
  cursor: default;
  /* nothing to drag: every swipe scrolls the page */
  touch-action: auto;
}
.hit.dragging {
  cursor: grabbing;
}
.hit:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 4px;
}

.to-latest {
  position: absolute;
  right: 0.5rem;
  bottom: 0.5rem;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border-hover);
  border-radius: 8px;
  background: var(--color-surface-raised);
  color: var(--color-heading);
  cursor: pointer;
}
.to-latest svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.to-latest:hover {
  border-color: var(--color-accent);
}
.to-latest:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.crosshair {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--color-border-hover);
  pointer-events: none;
}

.crosshair-h {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--color-border-hover);
  pointer-events: none;
}

/* Price at the crosshair's height, on the right axis (over the latest-value tag) */
.cursor-tag {
  position: absolute;
  left: calc(100% + 0.6rem);
  z-index: 1;
  transform: translateY(-50%);
  padding: 0.1rem 0.45rem;
  border-radius: 6px;
  background: var(--color-heading);
  color: var(--color-background-soft);
  font-size: 0.8rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
}

.dot {
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-accent);
  box-shadow: 0 0 0 2px var(--color-background-soft);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.tooltip {
  position: absolute;
  top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 170px;
  padding: 0.6rem 0.75rem;
  border-radius: 10px;
  border: 1px solid var(--color-border-hover);
  background: var(--color-surface-raised);
  box-shadow: var(--shadow-card);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  transform: translateX(14px);
  pointer-events: none;
}
/* Crosshair mirrored from another chart: same readout, a touch quieter */
.tooltip.synced {
  opacity: 0.85;
}
.tooltip.left {
  transform: translateX(calc(-100% - 14px));
}
/* Not enough room on either side (narrow phones): centred over the plot instead */
.tooltip.center {
  transform: translateX(-50%);
  max-width: calc(100% + 5rem);
}
/* Narrow plots (phones): tighter and smaller so less of the chart is covered */
.tooltip.compact {
  gap: 0.05rem;
  min-width: 0;
  padding: 0.35rem 0.5rem;
  border-radius: 8px;
  font-size: 0.7rem;
  line-height: 1.3;
  transform: translateX(8px);
}
.tooltip.compact.left {
  transform: translateX(calc(-100% - 8px));
}
.tooltip.compact.center {
  transform: translateX(-50%);
}
.tooltip.compact .tip-when {
  margin-top: 0;
  font-size: 0.65rem;
}
.tooltip.compact .tip-row {
  gap: 0.6rem;
}
.tip-when {
  margin-top: -0.15rem;
  font-size: 0.8rem;
  color: var(--color-text-muted);
  white-space: nowrap;
}
.tip-date {
  font-weight: 600;
  color: var(--color-heading);
}
.tip-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}
.tip-row strong {
  font-weight: 600;
  color: var(--color-heading);
}

/* Invisible strips over the axis gutters that stretch the axes */
.axis-hit {
  position: absolute;
  touch-action: none;
  user-select: none;
}
.axis-hit.y {
  top: 0;
  bottom: 0;
  cursor: ns-resize;
}
.axis-hit.y.left {
  right: 100%;
  width: 3rem;
}
.axis-hit.y.right {
  left: 100%;
  width: 3.5rem;
}
.axis-hit.x {
  top: 100%;
  left: 0;
  right: 0;
  height: 1.75rem;
  cursor: ew-resize;
}
.grouped .axis-hit.x {
  height: 5.25rem;
}

.auto-scale {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  padding: 0.2rem 0.6rem;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 500;
  border: 1px solid var(--color-border-hover);
  border-radius: 6px;
  background: var(--color-surface-raised);
  color: var(--color-heading);
  cursor: pointer;
}
.auto-scale:hover {
  border-color: var(--color-accent);
}
.auto-scale:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* ---------- Loading / error / empty: blur the chart, message on top ---------- */
.stage {
  position: absolute;
  inset: 0;
  transition:
    filter 0.2s,
    opacity 0.2s;
}
.stage.veiled {
  filter: blur(6px);
  opacity: 0.45;
  pointer-events: none;
  user-select: none;
}
.placeholder .line {
  stroke: var(--color-text-muted);
  opacity: 0.6;
}
.placeholder-area {
  fill: var(--color-accent-soft);
}

.state {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}
.state-card {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  max-width: min(420px, 90%);
  padding: 0.7rem 1.1rem;
  border: 1px solid var(--color-border-hover);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-background-soft) 85%, transparent);
  box-shadow: var(--shadow-card);
  color: var(--color-text);
  text-align: center;
}
.state-card :deep(a) {
  white-space: nowrap;
}
.state-card.column {
  flex-direction: column;
  gap: 0.65rem;
}
.state-hint {
  margin-top: -0.35rem;
  font-size: 0.8rem;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
.state-title {
  font-weight: 600;
  color: var(--color-heading);
}

/* A soft band of light sweeping across the blurred chart while it loads */
.shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    100deg,
    transparent 30%,
    color-mix(in srgb, var(--color-accent) 12%, transparent) 50%,
    transparent 70%
  );
  background-size: 250% 100%;
  animation: shimmer 1.6s ease-in-out infinite;
}
@keyframes shimmer {
  from {
    background-position: 120% 0;
  }
  to {
    background-position: -20% 0;
  }
}
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--color-border-hover);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .shimmer,
  .spinner {
    animation: none;
  }
  .stage {
    transition: none;
  }
}

@media (max-width: 600px) {
  .chart {
    padding-right: 3.5rem;
  }
  .plot {
    height: min(var(--plot-h, 360px), 260px);
  }
}
</style>
