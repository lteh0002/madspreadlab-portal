<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import type { ChartSeries, ChartSpec, SeriesStyle, Tone, UnitDef } from '@/data/research'
import { formatAxisLabel, formatValue, signTone, toneColor, unitLabel } from '@/utils/reportFormat'

const props = defineProps<{
  chart: ChartSpec
  units?: Record<string, UnitDef>
  /** Names the chart for screen readers (the section title) */
  label?: string
}>()

const uid = useId()
const wrap = ref<HTMLElement | null>(null)
const width = ref(0)
const narrow = computed(() => width.value > 0 && width.value < 520)
const height = computed(() => (narrow.value ? 220 : 280))

let observer: ResizeObserver | undefined
onMounted(() => {
  if (!wrap.value) return
  width.value = wrap.value.clientWidth
  observer = new ResizeObserver(([entry]) => {
    if (entry) width.value = Math.floor(entry.contentRect.width)
  })
  observer.observe(wrap.value)
})
onBeforeUnmount(() => observer?.disconnect())

const isBar = computed(() => props.chart.kind === 'bar')
const n = computed(() => props.chart.x.values.length)
const yUnit = computed(() => props.chart.y?.unit)

// ---- series styling ----

interface StyledSeries extends ChartSeries {
  style: SeriesStyle
  color: string
  dash?: string
}

const SERIES_COLOR: Record<SeriesStyle, string> = {
  primary: 'var(--color-series-2)',
  comparison: 'var(--color-text-muted)',
  muted: 'var(--color-border-hover)',
}

const series = computed<StyledSeries[]>(() =>
  props.chart.series.map((s, i) => {
    const style = s.style ?? (i === 0 ? 'primary' : 'comparison')
    return {
      ...s,
      style,
      color: SERIES_COLOR[style],
      dash: style === 'comparison' && !isBar.value ? '5 4' : undefined,
    }
  }),
)

/** Colour of one point / bar: its own tone, then its sign, then the series colour */
function markTone(s: StyledSeries, i: number): Tone | undefined {
  return s.point_tone?.[i] ?? (s.tone_by_sign ? signTone(s.values[i]) : undefined)
}
function markColor(s: StyledSeries, i: number): string {
  const tone = markTone(s, i)
  return tone ? toneColor(tone) : s.color
}

// ---- scales ----

function niceTicks(min: number, max: number, count: number): number[] {
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1
    min -= pad
    max += pad
  }
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag
  const lo = Math.floor(min / step + 1e-9) * step
  const hi = Math.ceil(max / step - 1e-9) * step
  const digits = Math.max(0, -Math.floor(Math.log10(step)))
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(digits)))
  return ticks
}

const yTicks = computed(() => {
  const vals = series.value.flatMap((s) =>
    s.values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)),
  )
  if (!vals.length) return [0, 1]
  let min = Math.min(...vals)
  let max = Math.max(...vals)
  // Bars and areas grow from zero, so zero must be on the axis
  if (isBar.value || props.chart.kind === 'area') {
    min = Math.min(min, 0)
    max = Math.max(max, 0)
  }
  return niceTicks(min, max, narrow.value ? 4 : 5)
})

const tickText = (v: number) => formatValue(v, { format: 'number' })

const margin = computed(() => {
  const longest = Math.max(...yTicks.value.map((t) => tickText(t).length))
  return { top: 10, right: 12, bottom: 28, left: Math.max(28, longest * 7 + 12) }
})
const plot = computed(() => ({
  left: margin.value.left,
  top: margin.value.top,
  width: Math.max(10, width.value - margin.value.left - margin.value.right),
  height: height.value - margin.value.top - margin.value.bottom,
}))

const yMin = computed(() => yTicks.value[0]!)
const yMax = computed(() => yTicks.value[yTicks.value.length - 1]!)
function y(v: number): number {
  const { top, height: h } = plot.value
  return top + h - ((v - yMin.value) / (yMax.value - yMin.value || 1)) * h
}
const yZero = computed(() => y(Math.min(Math.max(0, yMin.value), yMax.value)))

/** Points sit 8px in from the edges so end markers aren't clipped; bars get a slot each */
const EDGE = 8
const slot = computed(() => plot.value.width / Math.max(1, n.value))
function x(i: number): number {
  const { left, width: w } = plot.value
  if (isBar.value) return left + slot.value * (i + 0.5)
  if (n.value <= 1) return left + w / 2
  return left + EDGE + (i * (w - 2 * EDGE)) / (n.value - 1)
}

const xTicks = computed(() => {
  const count = n.value
  if (!count) return []
  const labelWidth = narrow.value ? 62 : 76
  const maxLabels = Math.max(2, Math.floor(plot.value.width / labelWidth))
  const step = Math.ceil(count / maxLabels)
  const idx: number[] = []
  for (let i = 0; i < count; i += step) idx.push(i)
  // Always label the last point: beside the previous label if there's room, else instead of it
  const last = count - 1
  const prev = idx[idx.length - 1]!
  if (!isBar.value && prev !== last) {
    if (x(last) - x(prev) >= labelWidth) idx.push(last)
    else if (idx.length > 1) idx[idx.length - 1] = last
  }
  return idx.map((i) => ({ i, x: x(i), text: formatAxisLabel(props.chart.x.values[i]!) }))
})

// ---- marks ----

/** Line path through the values, broken at nulls */
function linePath(values: (number | null)[]): string {
  let d = ''
  let pen = false
  values.forEach((v, i) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      pen = false
      return
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
    pen = true
  })
  return d
}

/** Filled area down to zero, one closed shape per unbroken run */
function areaPath(values: (number | null)[]): string {
  let d = ''
  let run: number[] = []
  const flush = () => {
    if (run.length) {
      d += `M${x(run[0]!).toFixed(1)},${yZero.value.toFixed(1)}`
      for (const i of run) d += `L${x(i).toFixed(1)},${y(values[i] as number).toFixed(1)}`
      d += `L${x(run[run.length - 1]!).toFixed(1)},${yZero.value.toFixed(1)}Z`
    }
    run = []
  }
  values.forEach((v, i) => (typeof v === 'number' && Number.isFinite(v) ? run.push(i) : flush()))
  flush()
  return d
}

/** A bar from the baseline to `v`, rounded only at its data end */
function barPath(left: number, w: number, v: number): string {
  const y0 = yZero.value
  const y1 = y(v)
  const hgt = Math.abs(y1 - y0)
  if (hgt < 0.5) return ''
  const r = Math.min(4, w / 2, hgt)
  const right = left + w
  if (y1 < y0)
    return `M${left},${y0}V${y1 + r}Q${left},${y1} ${left + r},${y1}H${right - r}Q${right},${y1} ${right},${y1 + r}V${y0}Z`
  return `M${left},${y0}V${y1 - r}Q${left},${y1} ${left + r},${y1}H${right - r}Q${right},${y1} ${right},${y1 - r}V${y0}Z`
}

const bars = computed(() => {
  if (!isBar.value) return []
  const k = series.value.length
  const group = Math.min(slot.value * 0.62, 56 * k)
  const gap = k > 1 ? 2 : 0
  const w = (group - gap * (k - 1)) / k
  const out: { key: string; d: string; color: string }[] = []
  series.value.forEach((s, si) => {
    s.values.forEach((v, i) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) return
      const left = x(i) - group / 2 + si * (w + gap)
      const d = barPath(left, w, v)
      if (d) out.push({ key: `${si}-${i}`, d, color: markColor(s, i) })
    })
  })
  return out
})

/** Markers: every point on a scatter; on lines, only points that carry a tone */
const markers = computed(() => {
  if (isBar.value) return []
  const out: { key: string; cx: number; cy: number; color: string; square: boolean }[] = []
  series.value.forEach((s, si) => {
    const always = props.chart.kind === 'scatter'
    s.values.forEach((v, i) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) return
      const tone = markTone(s, i)
      if (!always && !s.point_tone) return
      out.push({
        key: `${si}-${i}`,
        cx: x(i),
        cy: y(v),
        color: tone ? toneColor(tone) : s.color,
        square: tone === 'negative',
      })
    })
  })
  return out
})

// ---- legend ----

const TONE_ORDER: Tone[] = ['positive', 'negative', 'neutral', 'info', 'warning']

const legend = computed(() => {
  const items: {
    key: string
    label: string
    kind: 'line' | 'bar' | 'dot' | 'square'
    color: string
    dash?: string
  }[] = []
  if (series.value.length > 1 || props.chart.kind === 'scatter')
    for (const s of series.value)
      items.push({
        key: `s-${s.name}`,
        label: s.name,
        kind: isBar.value ? 'bar' : props.chart.kind === 'scatter' ? 'dot' : 'line',
        color: s.color,
        dash: s.dash,
      })
  else if (series.value[0]?.point_tone_labels && !isBar.value) {
    const s = series.value[0]
    items.push({ key: `s-${s.name}`, label: s.name, kind: 'line', color: s.color, dash: s.dash })
  }
  for (const s of series.value) {
    const labels = s.point_tone_labels
    if (!labels) continue
    const used = new Set(s.point_tone)
    for (const t of TONE_ORDER)
      if (labels[t] && used.has(t))
        items.push({
          key: `t-${s.name}-${t}`,
          label: labels[t]!,
          kind: t === 'negative' ? 'square' : 'dot',
          color: toneColor(t),
        })
  }
  return items
})

// ---- hover ----

const active = ref<number | null>(null)
const svgEl = ref<SVGSVGElement | null>(null)

function indexAt(clientX: number): number | null {
  const svg = svgEl.value
  if (!svg || !n.value) return null
  const px = clientX - svg.getBoundingClientRect().left
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < n.value; i++) {
    const dist = Math.abs(x(i) - px)
    if (dist < bestDist) {
      best = i
      bestDist = dist
    }
  }
  return best
}

function onPointer(e: PointerEvent) {
  active.value = indexAt(e.clientX)
}
function onLeave(e: PointerEvent) {
  if (e.pointerType === 'mouse') active.value = null
}
function onKey(e: KeyboardEvent) {
  if (!n.value) return
  const cur = active.value ?? -1
  let next: number | null = null
  if (e.key === 'ArrowRight') next = Math.min(n.value - 1, cur + 1)
  else if (e.key === 'ArrowLeft') next = Math.max(0, cur < 0 ? n.value - 1 : cur - 1)
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = n.value - 1
  else if (e.key === 'Escape') {
    active.value = null
    return
  }
  if (next === null) return
  e.preventDefault()
  active.value = next
}

function seriesValueText(s: StyledSeries, v: number | null): string {
  return formatValue(v, {
    format: s.tone_by_sign ? 'signed' : 'number',
    unit: yUnit.value,
    units: props.units,
  })
}

const tooltip = computed(() => {
  const i = active.value
  if (i === null) return null
  const rows = series.value.map((s) => {
    const tone = markTone(s, i)
    return {
      name: s.name,
      color: markColor(s, i),
      value: seriesValueText(s, s.values[i] ?? null),
      toneLabel: tone ? s.point_tone_labels?.[tone] : undefined,
    }
  })
  const cx = x(i)
  const flip = cx > width.value / 2
  return { title: formatAxisLabel(props.chart.x.values[i]!), rows, cx, flip }
})

const yCaption = computed(() => {
  const label = props.chart.y?.label
  const unit = unitLabel(yUnit.value, props.units)
  if (label && unit && !label.toLowerCase().includes(unit.toLowerCase()))
    return `${label} (${unit})`
  return label || unit
})
</script>

<template>
  <figure class="chart">
    <ul v-if="legend.length" class="legend">
      <li v-for="l in legend" :key="l.key">
        <svg width="18" height="10" aria-hidden="true">
          <line
            v-if="l.kind === 'line'"
            x1="1"
            y1="5"
            x2="17"
            y2="5"
            :stroke="l.color"
            stroke-width="2"
            :stroke-dasharray="l.dash"
            stroke-linecap="round"
          />
          <rect
            v-else-if="l.kind === 'bar'"
            x="4"
            y="0"
            width="10"
            height="10"
            rx="2"
            :fill="l.color"
          />
          <rect
            v-else-if="l.kind === 'square'"
            x="4.5"
            y="0.5"
            width="9"
            height="9"
            rx="1"
            :fill="l.color"
          />
          <circle v-else cx="9" cy="5" r="4.5" :fill="l.color" />
        </svg>
        {{ l.label }}
      </li>
    </ul>
    <p v-if="yCaption" class="y-caption">{{ yCaption }}</p>

    <div ref="wrap" class="plot-wrap" :style="{ height: `${height}px` }">
      <svg
        v-if="width > 0"
        ref="svgEl"
        :width="width"
        :height="height"
        role="img"
        tabindex="0"
        :aria-label="`${label ?? 'Chart'}. Use the arrow keys to read each point.`"
        :aria-describedby="`${uid}-data`"
        @pointermove="onPointer"
        @pointerdown="onPointer"
        @pointerleave="onLeave"
        @keydown="onKey"
        @blur="active = null"
      >
        <!-- grid + y axis -->
        <g class="grid">
          <line
            v-for="t in yTicks"
            :key="t"
            :x1="plot.left"
            :x2="plot.left + plot.width"
            :y1="y(t)"
            :y2="y(t)"
          />
        </g>
        <line
          v-if="yMin < 0 && yMax > 0"
          class="zero"
          :x1="plot.left"
          :x2="plot.left + plot.width"
          :y1="yZero"
          :y2="yZero"
        />
        <g class="axis-text">
          <text
            v-for="t in yTicks"
            :key="t"
            :x="plot.left - 8"
            :y="y(t)"
            text-anchor="end"
            dominant-baseline="middle"
          >
            {{ tickText(t) }}
          </text>
          <text
            v-for="t in xTicks"
            :key="t.i"
            :x="t.x"
            :y="plot.top + plot.height + 18"
            text-anchor="middle"
          >
            {{ t.text }}
          </text>
        </g>

        <!-- hover band / crosshair, under the marks -->
        <template v-if="active !== null">
          <rect
            v-if="isBar"
            class="hover-band"
            :x="x(active) - slot / 2"
            :y="plot.top"
            :width="slot"
            :height="plot.height"
            rx="4"
          />
          <line
            v-else
            class="crosshair"
            :x1="x(active)"
            :x2="x(active)"
            :y1="plot.top"
            :y2="plot.top + plot.height"
          />
        </template>

        <!-- marks: muted and comparison series first, primary on top -->
        <template v-if="!isBar">
          <g v-for="s in [...series].reverse()" :key="s.name">
            <path
              v-if="chart.kind === 'area'"
              :d="areaPath(s.values)"
              :fill="s.color"
              class="area"
            />
            <path
              v-if="chart.kind !== 'scatter'"
              :d="linePath(s.values)"
              fill="none"
              :stroke="s.color"
              :stroke-width="s.style === 'primary' ? 2 : 1.5"
              :stroke-dasharray="s.dash"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          </g>
          <g class="markers">
            <template v-for="m in markers" :key="m.key">
              <rect
                v-if="m.square"
                :x="m.cx - 4.5"
                :y="m.cy - 4.5"
                width="9"
                height="9"
                rx="1.5"
                :fill="m.color"
              />
              <circle v-else :cx="m.cx" :cy="m.cy" r="5" :fill="m.color" />
            </template>
          </g>
        </template>
        <g v-else>
          <path v-for="b in bars" :key="b.key" :d="b.d" :fill="b.color" />
        </g>

        <!-- active points -->
        <template v-if="active !== null && !isBar">
          <template v-for="s in series" :key="s.name">
            <circle
              v-if="typeof s.values[active] === 'number'"
              class="active-dot"
              :cx="x(active)"
              :cy="y(s.values[active] as number)"
              r="6"
              :fill="markColor(s, active)"
            />
          </template>
        </template>
      </svg>

      <div
        v-if="tooltip"
        class="tooltip"
        :class="{ flip: tooltip.flip }"
        :style="{ left: `${tooltip.cx}px` }"
        role="status"
      >
        <p class="tt-title">{{ tooltip.title }}</p>
        <p v-for="r in tooltip.rows" :key="r.name" class="tt-row">
          <span class="tt-swatch" :style="{ background: r.color }" />
          <span class="tt-name">{{ r.name }}</span>
          <span class="tt-value">{{ r.value }}</span>
          <span v-if="r.toneLabel" class="tt-tone">{{ r.toneLabel }}</span>
        </p>
      </div>
    </div>

    <!-- The same data as a table, for screen readers -->
    <table :id="`${uid}-data`" class="sr-only">
      <caption>
        {{
          label ?? 'Chart data'
        }}
      </caption>
      <thead>
        <tr>
          <th scope="col">{{ chart.x.label ?? 'X' }}</th>
          <th v-for="s in series" :key="s.name" scope="col">{{ s.name }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(xv, i) in chart.x.values" :key="i">
          <th scope="row">{{ formatAxisLabel(xv) }}</th>
          <td v-for="s in series" :key="s.name">{{ seriesValueText(s, s.values[i] ?? null) }}</td>
        </tr>
      </tbody>
    </table>
  </figure>
</template>

<style scoped>
.chart {
  margin: 0;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1rem;
  margin-bottom: 0.4rem;
  padding: 0;
  list-style: none;
  font-size: 0.82rem;
  color: var(--color-text);
}
.legend li {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.y-caption {
  margin-bottom: 0.25rem;
  font-size: 0.72rem;
  color: var(--color-text-muted);
}

.plot-wrap {
  position: relative;
  width: 100%;
}
svg {
  display: block;
  overflow: visible;
  touch-action: pan-y;
  cursor: crosshair;
}
svg:focus {
  outline: none;
}
svg:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 4px;
  border-radius: 4px;
}

.grid line {
  stroke: var(--color-border);
  stroke-width: 1;
}
.zero {
  stroke: var(--color-border-hover);
  stroke-width: 1;
}
.axis-text text {
  fill: var(--color-text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.area {
  opacity: 0.14;
}
/* A ring in the page colour keeps overlapping markers apart */
.markers > *,
.active-dot {
  stroke: var(--color-background);
  stroke-width: 2;
}
.crosshair {
  stroke: var(--color-text-muted);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}
.hover-band {
  fill: var(--color-background-mute);
}

.tooltip {
  position: absolute;
  top: 0;
  z-index: 2;
  min-width: 140px;
  max-width: 240px;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--color-border-hover);
  border-radius: 10px;
  background: var(--color-background-soft);
  box-shadow: 0 10px 30px -12px rgba(0, 0, 0, 0.6);
  font-size: 0.8rem;
  pointer-events: none;
  transform: translateX(12px);
}
.tooltip.flip {
  transform: translateX(calc(-100% - 12px));
}
.tt-title {
  margin-bottom: 0.2rem;
  font-weight: 600;
  color: var(--color-heading);
}
.tt-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  white-space: nowrap;
}
.tt-swatch {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 2px;
}
.tt-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--color-text-muted);
}
.tt-value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-heading);
}
.tt-tone {
  color: var(--color-text-muted);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
