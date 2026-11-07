<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { UTC, tradingDayKey, type DisplayZone } from '@/utils/time'

export interface LinePoint {
  /** Daily: YYYY-MM-DD. Intraday: a full ISO timestamp (UTC), e.g. 2026-09-28T02:15:00.000Z */
  date: string
  value: number
}

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
  }>(),
  {
    initialCount: 65,
    valueLabel: 'Value',
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
/** How far the tooltip may spill into the axis gutters on either side of the plot */
const GUTTER_PX = 40
/** Horizontal room each rotated time label needs on a T-n axis */
const TIME_LABEL_PX = 22
/** Axis-drag scaling sensitivity per pixel dragged */
const AXIS_SPEED = 0.005

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
const hitEl = ref<HTMLElement | null>(null)

/** Plot width in CSS px, so rotated time labels can be spaced to never overlap */
const plotEl = ref<HTMLElement | null>(null)
const plotWidth = ref(800)
let resizeObs: ResizeObserver | undefined
onMounted(() => {
  if (!plotEl.value || typeof ResizeObserver === 'undefined') return
  resizeObs = new ResizeObserver(([entry]) => {
    if (entry) plotWidth.value = entry.contentRect.width
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

const valueFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const changeFmt = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})
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
    longDate: new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
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
/** "T-3", or "T-X" for days older than `maxLabelledDay` */
const dayLabel = (t: number) =>
  props.maxLabelledDay !== null && t > props.maxLabelledDay ? 'T-X' : `T-${t}`
const tLabel = (i: number) => dayLabel(days.value.t[i]!)

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

  // y fits the points on screen (TradingView-style auto scale), unless the user has set a range
  let min = Infinity
  let max = -Infinity
  if (yRange.value) {
    ;({ min, max } = yRange.value)
  } else {
    for (let i = i0; i <= i1; i++) {
      min = Math.min(min, pts[i]!.value)
      max = Math.max(max, pts[i]!.value)
    }
    const pad = (max - min || Math.abs(max) || 1) * 0.08
    min -= pad
    max += pad
  }
  const y = (val: number) => (1 - (val - min) / (max - min)) * H
  const pct = (u: number, total: number) => `${((u / total) * 100).toFixed(3)}%`

  const step = niceStep(max - min, 4)
  const decimals = Math.max(0, -Math.floor(Math.log10(step)))
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
  const area = `${line}L${x(i1).toFixed(1)},${H} L${x(i0).toFixed(1)},${H} Z`

  const last = pts[n - 1]!
  return {
    n,
    yMin: min,
    yMax: max,
    grid,
    daySeparators,
    timeTicks,
    dayLabels,
    axisSeps,
    line,
    area,
    yTicks,
    xTicks,
    // The latest value stays on the right axis even when panned into the past
    lastTag: { label: valueFmt.format(last.value), top: pct(clamp(y(last.value), 0, H), H) },
    atLatest: v.end >= n - 0.51,
    at: (i: number) => ({
      left: pct(x(i), W),
      top: pct(y(pts[i]!.value), H),
      fx: x(i) / W,
      // false when a manual y range has pushed the point off the plot
      inside: y(pts[i]!.value) >= 0 && y(pts[i]!.value) <= H,
    }),
  }
})

/** Blur the chart: while loading, on error, or when there's nothing to plot */
const veiled = computed(() => props.loading || !!props.error || !chart.value)

function tooltipSide(fx: number): 'right' | 'left' | 'center' {
  const at = fx * plotWidth.value
  if (at + TOOLTIP_PX <= plotWidth.value + GUTTER_PX && fx <= 0.6) return 'right'
  if (at - TOOLTIP_PX >= -GUTTER_PX) return 'left'
  if (at + TOOLTIP_PX <= plotWidth.value + GUTTER_PX) return 'right'
  return 'center'
}

const tip = computed(() => {
  const c = chart.value
  const i = shown.value?.i ?? null
  if (!c || i === null || i >= c.n) return null
  const p = props.points[i]!
  const prev = props.points[i - 1]
  const pos = c.at(i)
  const d = toDate(p.date)
  // The bar's own calendar date (and time, for intraday) in the display zone
  const when = intraday.value
    ? `${fmt.value.longDate.format(d)} · ${fmt.value.timeOfDay.format(d)} ${zone.value.label}`
    : fmt.value.longDate.format(d)
  return {
    ...pos,
    synced: shown.value!.synced,
    // Right of the crosshair if it fits, else left, else (very narrow plots) centred on top
    side: tooltipSide(pos.fx),
    // With T-n labels: the trading day as the heading, the actual date and time beneath it
    date: props.relativeDays ? tLabel(i) : when,
    when: props.relativeDays ? when : '',
    value: valueFmt.format(p.value),
    change: prev ? changeFmt.format(p.value - prev.value) : '—',
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

function plotFraction(clientX: number) {
  const rect = hitEl.value!.getBoundingClientRect()
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
    updateHover(plotFraction(e.clientX).fx)
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
  const { fx, width, height } = plotFraction(e.clientX)
  if (drag) {
    setView(drag.start - ((e.clientX - drag.x) / width) * drag.span, drag.span)
    // With a manual price range, dragging also pans up and down (auto scale has nothing to pan)
    const r = drag.yRange
    if (r) {
      const shift = ((e.clientY - drag.y) / height) * (r.max - r.min)
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

function onWheel(e: WheelEvent) {
  if (!view.value || props.locked) return // locked: let the page scroll
  e.preventDefault() // the chart owns the wheel, like TradingView
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
  let dx = e.deltaX * unit
  let dy = e.deltaY * unit
  if (e.shiftKey && !dx) [dx, dy] = [dy, 0] // shift + wheel pans
  const { fx, width } = plotFraction(e.clientX)
  // Horizontal scroll (trackpad swipe) pans; vertical scroll and pinch zoom
  if (Math.abs(dx) > Math.abs(dy)) panBy(dx / width)
  else zoomBy(Math.exp(dy * ZOOM_SPEED), clamp(fx, 0, 1))
  updateHover(fx)
}

/* ---------- Axis scaling: drag or scroll on an axis to stretch it, double-click to reset ---------- */

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
  if (!c || props.locked) return
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
          <span v-for="t in chart.yTicks" :key="t.label" class="y-tick" :style="{ top: t.top }">
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
          <span class="last-tag" :style="{ top: chart.lastTag.top }">{{
            chart.lastTag.label
          }}</span>

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
            <path class="grid" :d="chart.grid" />
            <path v-if="chart.daySeparators" class="day-sep" :d="chart.daySeparators" />
            <path :d="chart.area" :fill="`url(#${gradId})`" />
            <path class="line" :d="chart.line" />
          </svg>

          <div
            ref="hitEl"
            class="hit"
            :class="{ dragging, locked }"
            :tabindex="locked ? undefined : 0"
            :aria-label="
              locked
                ? undefined
                : 'Chart. Drag or use the arrow keys to pan; scroll or press + and − to zoom; Home and End jump to the oldest and newest data; Page Up and Page Down stretch the price axis, A resets it.'
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
              <div v-if="tip.inside" class="dot" :style="{ left: tip.left, top: tip.top }" />
              <div
                class="tooltip"
                :class="[tip.side, { synced: tip.synced }]"
                :style="{ left: tip.side === 'center' ? '50%' : tip.left }"
              >
                <span class="tip-date">{{ tip.date }}</span>
                <span v-if="tip.when" class="tip-when">{{ tip.when }}</span>
                <span class="tip-row">
                  <span>{{ valueLabel }}</span
                  ><strong>{{ tip.value }}</strong>
                </span>
                <span class="tip-row muted">
                  <span>{{ intraday ? 'Change' : 'Day change' }}</span
                  ><span>{{ tip.change }}</span>
                </span>
              </div>
            </template>
          </div>

          <!-- Axis handles: drag or scroll to stretch, double-click to reset (price: auto fit; time: default view) -->
          <template v-if="!locked">
            <div
              v-for="side in ['left', 'right']"
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
            v-if="yRange && !locked"
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
          <button type="button" class="retry" @click="$emit('retry')">Retry</button>
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
.tip-row.muted {
  color: var(--color-text-muted);
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

.retry {
  padding: 0.35rem 0.9rem;
  font: inherit;
  font-size: 0.85rem;
  border: 1px solid var(--color-border-hover);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
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
