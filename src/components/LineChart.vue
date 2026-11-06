<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'

export interface LinePoint {
  /** YYYY-MM-DD */
  date: string
  value: number
}

/** The slice of `points` currently on screen */
export interface ChartView {
  /** First and last fully visible dates, YYYY-MM-DD */
  from: string
  to: string
  /** Number of points across the visible width */
  count: number
  /** True when the newest point is at the right edge */
  atLatest: boolean
  /** Total points loaded */
  total: number
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
    error?: string | null
  }>(),
  { initialCount: 65, valueLabel: 'Value', ariaLabel: 'Line chart', loading: false, error: null },
)

const emit = defineEmits<{ retry: []; 'view-change': [view: ChartView] }>()

/** SVG user units; the plot stretches to its box, lines keep a constant stroke width */
const W = 1000
const H = 360
/** Fewest points you can zoom in to */
const MIN_SPAN = 5
/** Wheel zoom sensitivity per pixel of scroll */
const ZOOM_SPEED = 0.002

const gradId = `line-area-${useId()}`
const hover = ref<number | null>(null)
const hitEl = ref<HTMLElement | null>(null)

/**
 * Visible window in index units. Point i sits at x = (i - start) / (end - start).
 * Bounds are half a slot outside the data so edge points aren't drawn on the border.
 */
const view = ref<{ start: number; end: number } | null>(null)

const shortDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const monthYear = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
})
const longDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const valueFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const changeFmt = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`)
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

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
  })
}

/** Show the newest `count` points (Infinity = everything) */
function showLatest(count: number) {
  const span = clampSpan(count)
  setView(props.points.length - 0.5 - span, span)
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
    if (!pts.length) view.value = null
    else showLatest(old?.length && view.value ? span() : props.initialCount)
  },
  { immediate: true },
)

defineExpose({ showLatest })

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

  // y fits the points on screen (TradingView-style auto scale)
  let min = Infinity
  let max = -Infinity
  for (let i = i0; i <= i1; i++) {
    min = Math.min(min, pts[i]!.value)
    max = Math.max(max, pts[i]!.value)
  }
  const pad = (max - min || Math.abs(max) || 1) * 0.08
  min -= pad
  max += pad
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
  const dateFmt = width > 200 ? monthYear : shortDate
  const xTicks: { key: number; label: string; left: string }[] = []
  for (
    let i = Math.ceil(Math.max(v.start, 0) / every) * every;
    i <= Math.min(v.end, n - 1);
    i += every
  )
    xTicks.push({ key: i, label: dateFmt.format(toDate(pts[i]!.date)), left: pct(x(i), W) })

  let line = ''
  for (let i = i0; i <= i1; i++)
    line += `${i > i0 ? 'L' : 'M'}${x(i).toFixed(1)},${y(pts[i]!.value).toFixed(1)} `
  const area = `${line}L${x(i1).toFixed(1)},${H} L${x(i0).toFixed(1)},${H} Z`

  const last = pts[n - 1]!
  return {
    n,
    grid,
    line,
    area,
    yTicks,
    xTicks,
    // The latest value stays on the right axis even when panned into the past
    lastTag: { label: valueFmt.format(last.value), top: pct(clamp(y(last.value), 0, H), H) },
    atLatest: v.end >= n - 0.51,
    at: (i: number) => ({ left: pct(x(i), W), top: pct(y(pts[i]!.value), H), fx: x(i) / W }),
  }
})

const tip = computed(() => {
  const c = chart.value
  const i = hover.value
  if (!c || i === null || i >= c.n) return null
  const p = props.points[i]!
  const prev = props.points[i - 1]
  const pos = c.at(i)
  return {
    ...pos,
    flip: pos.fx > 0.6,
    date: longDate.format(toDate(p.date)),
    value: valueFmt.format(p.value),
    change: prev ? changeFmt.format(p.value - prev.value) : '—',
  }
})

/* ---------- Pointer, wheel & keyboard ---------- */

let drag: { x: number; start: number; span: number } | null = null
const dragging = ref(false)

function plotFraction(clientX: number) {
  const rect = hitEl.value!.getBoundingClientRect()
  return { fx: (clientX - rect.left) / rect.width, width: rect.width }
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
  hitEl.value?.setPointerCapture(e.pointerId)
  drag = { x: e.clientX, start: view.value.start, span: span() }
  dragging.value = true
}

function onPointerMove(e: PointerEvent) {
  const { fx, width } = plotFraction(e.clientX)
  if (drag) setView(drag.start - ((e.clientX - drag.x) / width) * drag.span, drag.span)
  updateHover(fx)
}

function endDrag(e: PointerEvent) {
  if (hitEl.value?.hasPointerCapture(e.pointerId)) hitEl.value.releasePointerCapture(e.pointerId)
  drag = null
  dragging.value = false
}

function onPointerLeave() {
  if (!drag) hover.value = null
}

function onWheel(e: WheelEvent) {
  if (!view.value) return
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

function onKeydown(e: KeyboardEvent) {
  const actions: Record<string, () => void> = {
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
  <div class="chart" :aria-busy="loading">
    <div class="plot">
      <template v-if="chart">
        <span v-for="t in chart.yTicks" :key="t.label" class="y-tick" :style="{ top: t.top }">
          {{ t.label }}
        </span>
        <div class="x-axis">
          <span v-for="t in chart.xTicks" :key="t.key" class="x-tick" :style="{ left: t.left }">
            {{ t.label }}
          </span>
        </div>
        <span class="last-tag" :style="{ top: chart.lastTag.top }">{{ chart.lastTag.label }}</span>

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
          <path :d="chart.area" :fill="`url(#${gradId})`" />
          <path class="line" :d="chart.line" />
        </svg>

        <div
          ref="hitEl"
          class="hit"
          :class="{ dragging }"
          tabindex="0"
          aria-label="Chart. Drag or use the arrow keys to pan; scroll or press + and − to zoom; Home and End jump to the oldest and newest data."
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
            <div class="dot" :style="{ left: tip.left, top: tip.top }" />
            <div class="tooltip" :class="{ flip: tip.flip }" :style="{ left: tip.left }">
              <span class="tip-date">{{ tip.date }}</span>
              <span class="tip-row">
                <span>{{ valueLabel }}</span
                ><strong>{{ tip.value }}</strong>
              </span>
              <span class="tip-row muted">
                <span>Day change</span><span>{{ tip.change }}</span>
              </span>
            </div>
          </template>
        </div>

        <button
          v-if="!chart.atLatest"
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

      <div v-if="loading && !error" class="state">Loading…</div>
      <div v-else-if="error" class="state">
        <span>{{ error }}</span>
        <button type="button" class="retry" @click="$emit('retry')">Retry</button>
      </div>
      <div v-else-if="!chart" class="state">No data for this range.</div>
    </div>
  </div>
</template>

<style scoped>
.chart {
  /* gutters: y-axis labels left, latest-value tag right, date labels below */
  padding: 0.5rem 4rem 1.75rem 3rem;
}

.plot {
  position: relative;
  height: 360px;
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
.tooltip.flip {
  transform: translateX(calc(-100% - 14px));
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

.state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  color: var(--color-text-muted);
  font-size: 0.9rem;
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
    height: 260px;
  }
}
</style>
