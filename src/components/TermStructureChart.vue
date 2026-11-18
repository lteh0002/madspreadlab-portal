<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'

/** A contract month on the x-axis */
export interface CurveMonth {
  /** Months since Jan 2000 */
  n: number
  /** "Apr26" */
  label: string
  /** Futures code, e.g. "J" */
  code: string
}

export interface CurvePoint {
  value: number
  /** True when the contract didn't trade that day and its previous close is shown */
  stale?: boolean
}

export interface CurveSeries {
  key: string
  /** Legend / tooltip name, e.g. "18/11/2026" or "1M ago · 17/10/2026" */
  label: string
  /** CSS colour, e.g. var(--color-accent) */
  color: string
  /** Drawn dashed and thinner (comparison curves) */
  dashed?: boolean
  /** By month number (CurveMonth.n); months without a value break the line */
  points: Map<number, CurvePoint>
}

const props = withDefaults(
  defineProps<{
    months: CurveMonth[]
    /** The first series is the main one: drawn last (on top) and listed first */
    series: CurveSeries[]
    /** Plot height in px */
    height?: number
    /** Formats prices on the axis and in the tooltip */
    format?: (v: number) => string
    ariaLabel?: string
  }>(),
  { height: 340, format: (v: number) => v.toLocaleString('en-US'), ariaLabel: 'Futures curve' },
)

const uid = useId()
const wrap = ref<HTMLDivElement | null>(null)
const width = ref(720)
let observer: ResizeObserver | undefined

onMounted(() => {
  if (!wrap.value) return
  width.value = wrap.value.clientWidth || width.value
  observer = new ResizeObserver(([entry]) => {
    if (entry) width.value = Math.max(240, Math.round(entry.contentRect.width))
  })
  observer.observe(wrap.value)
})
onBeforeUnmount(() => observer?.disconnect())

const PAD = { top: 16, right: 16, bottom: 34, left: 60 }
const plotW = computed(() => width.value - PAD.left - PAD.right)
const plotH = computed(() => props.height - PAD.top - PAD.bottom)

/** Centre of each month's column */
const step = computed(() => plotW.value / Math.max(1, props.months.length))
const xAt = (i: number) => PAD.left + step.value * (i + 0.5)
const indexOf = computed(() => new Map(props.months.map((m, i) => [m.n, i])))

/** Round axis ticks covering every value, with a little headroom */
const yScale = computed(() => {
  const values = props.series.flatMap((s) => [...s.points.values()].map((p) => p.value))
  if (!values.length) return { min: 0, max: 1, ticks: [0, 1] }
  let lo = Math.min(...values)
  let hi = Math.max(...values)
  if (lo === hi) {
    lo -= 1
    hi += 1
  }
  const raw = (hi - lo) / 5
  const mag = 10 ** Math.floor(Math.log10(raw))
  const nice = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw) ?? 10 * mag
  const min = Math.floor(lo / nice) * nice
  const max = Math.ceil(hi / nice) * nice
  const ticks: number[] = []
  for (let v = min; v <= max + nice / 2; v += nice) ticks.push(Number(v.toFixed(10)))
  return { min, max, ticks }
})
const yAt = (v: number) => {
  const { min, max } = yScale.value
  return PAD.top + plotH.value * (1 - (v - min) / (max - min || 1))
}

/** Each series as path segments: the line breaks over months without a value */
const drawn = computed(() =>
  props.series
    .map((s, si) => {
      const segments: string[] = []
      let current: string[] = []
      for (const [i, m] of props.months.entries()) {
        const p = s.points.get(m.n)
        if (!p) {
          if (current.length) segments.push(current.join(' '))
          current = []
          continue
        }
        current.push(`${current.length ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`)
      }
      if (current.length) segments.push(current.join(' '))
      const dots = [...s.points.entries()]
        .filter(([n]) => indexOf.value.has(n))
        .map(([n, p]) => ({ n, x: xAt(indexOf.value.get(n)!), y: yAt(p.value), stale: !!p.stale }))
      return { ...s, si, segments, dots }
    })
    // Main series on top
    .reverse(),
)

/** Show every month label when they fit, else every 2nd/3rd… */
const labelEvery = computed(() => Math.max(1, Math.ceil(46 / step.value)))

const hover = ref<number | null>(null)

function onMove(e: PointerEvent) {
  const svg = e.currentTarget as SVGSVGElement
  const x = e.clientX - svg.getBoundingClientRect().left
  const i = Math.floor((x - PAD.left) / step.value)
  hover.value = i >= 0 && i < props.months.length ? i : null
}

const tip = computed(() => {
  if (hover.value === null) return null
  const m = props.months[hover.value]!
  const rows = props.series.map((s) => ({
    key: s.key,
    label: s.label,
    color: s.color,
    point: s.points.get(m.n),
  }))
  if (!rows.some((r) => r.point)) return null
  const x = xAt(hover.value)
  // Keep the box inside the chart: flip to the left of the cursor on the right half
  const right = x > width.value / 2
  return { m, rows, x, right }
})
</script>

<template>
  <div ref="wrap" class="curve">
    <svg
      :width="width"
      :height="height"
      :viewBox="`0 0 ${width} ${height}`"
      role="img"
      :aria-labelledby="`${uid}-desc`"
      @pointermove="onMove"
      @pointerleave="hover = null"
    >
      <desc :id="`${uid}-desc`">{{ ariaLabel }}</desc>

      <!-- Price grid -->
      <g class="grid">
        <g v-for="t in yScale.ticks" :key="t">
          <line :x1="PAD.left" :x2="width - PAD.right" :y1="yAt(t)" :y2="yAt(t)" />
          <text :x="PAD.left - 8" :y="yAt(t)" text-anchor="end" dominant-baseline="middle">
            {{ format(t) }}
          </text>
        </g>
      </g>

      <!-- Contract months -->
      <g class="x-axis">
        <template v-for="(m, i) in months" :key="m.n">
          <text
            v-if="i % labelEvery === 0"
            :x="xAt(i)"
            :y="height - PAD.bottom + 18"
            text-anchor="middle"
            :class="{ on: hover === i }"
          >
            {{ m.label }}
          </text>
        </template>
      </g>

      <rect
        v-if="hover !== null"
        class="hover-col"
        :x="PAD.left + step * hover"
        :y="PAD.top"
        :width="step"
        :height="plotH"
      />

      <g v-for="s in drawn" :key="s.key" :style="{ color: s.color }">
        <path
          v-for="(d, k) in s.segments"
          :key="k"
          :d="d"
          class="line"
          :class="{ dashed: s.dashed }"
        />
        <circle
          v-for="p in s.dots"
          :key="p.n"
          :cx="p.x"
          :cy="p.y"
          :r="s.si === 0 ? 4 : 3"
          class="dot"
          :class="{ stale: p.stale, main: s.si === 0 }"
        />
      </g>
    </svg>

    <div
      v-if="tip"
      class="tip"
      :style="
        tip.right
          ? { right: `${width - tip.x + 12}px`, top: `${PAD.top}px` }
          : { left: `${tip.x + 12}px`, top: `${PAD.top}px` }
      "
      role="status"
    >
      <p class="tip-title">
        {{ tip.m.label }} <span class="tip-code">{{ tip.m.code }}</span>
      </p>
      <p v-for="r in tip.rows" :key="r.key" class="tip-row">
        <span class="swatch" :style="{ background: r.color }" />
        <span class="tip-label">{{ r.label }}</span>
        <span class="tip-value">
          {{ r.point ? format(r.point.value) : '—'
          }}<span v-if="r.point?.stale" title="No trade that day: previous close">*</span>
        </span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.curve {
  position: relative;
  width: 100%;
}

svg {
  display: block;
  touch-action: pan-y;
}

.grid line {
  stroke: var(--color-border);
}

.grid text,
.x-axis text {
  fill: var(--color-text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.x-axis text.on {
  fill: var(--color-heading);
  font-weight: 600;
}

.hover-col {
  fill: var(--color-accent-soft);
}

.line {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.25;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.line.dashed {
  stroke-width: 1.5;
  stroke-dasharray: 5 4;
}

.dot {
  fill: currentColor;
  stroke: var(--color-background-soft);
  stroke-width: 1.5;
}

/* Previous close carried over a day without a trade */
.dot.stale {
  fill: var(--color-background-soft);
  stroke: currentColor;
}

.tip {
  position: absolute;
  z-index: 2;
  min-width: 11rem;
  padding: 0.5rem 0.65rem;
  font-size: 0.8rem;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border-hover);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
  pointer-events: none;
}

.tip-title {
  margin-bottom: 0.25rem;
  font-weight: 600;
  color: var(--color-heading);
}

.tip-code {
  font-weight: normal;
  color: var(--color-text-muted);
}

.tip-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  white-space: nowrap;
}

.swatch {
  width: 10px;
  height: 3px;
  border-radius: 2px;
  flex: none;
}

.tip-label {
  flex: 1;
  color: var(--color-text-muted);
}

.tip-value {
  font-variant-numeric: tabular-nums;
  color: var(--color-heading);
}
</style>
