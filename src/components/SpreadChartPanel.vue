<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import LineChart, {
  type ChartView,
  type LinePoint,
  type VolumeView,
} from '@/components/LineChart.vue'
import { fetchPriceData, type PriceBar, type ProductSpread } from '@/api/priceData'
import { useAutoRetry } from '@/composables/useAutoRetry'
import { MYT, tradingDayKey } from '@/utils/time'

/** Days shown, shared by every chart on the page: all data, or T-from … T-to (from ≥ to) */
export type DaySelection = { all: true } | { from: number; to: number }

export type { VolumeView }

/** Share of the chart's height the volume pane takes under the price (the chart doesn't grow) */
const VOLUME_SHARE = 0.4

/**
 * One chart card: one of the product's spreads, its bars at the page's interval, showing the
 * page's day selection.
 */
const props = defineProps<{
  product: string
  spread: ProductSpread
  /** When set, the title is a dropdown to switch to any of these spreads (newest first) */
  options?: ProductSpread[]
  /** Bar length in minutes, shared by every chart on the page */
  interval: number
  days: DaySelection
  /** Days older than T-lastDay are labelled "T-X" */
  lastDay: number
  /** No drag or zoom (small screens) */
  locked: boolean
  /** Plot height in px */
  height: number
  /** Crosshair key hovered on any chart on the page ("T-2 10:45"), to line this one up */
  hoverKey: string | null
  /** Draw this spread's fair value on the chart (when it has one; price only) */
  showFairValue: boolean
  /** Volume pane under the close price: off, or AVol up / BVol down */
  volume: VolumeView
  /** With the volume pane on: false shows the volume chart alone, without the close price */
  showPrice: boolean
  /** Interval fixed by the Spreads-page group (for the empty message); null = any */
  fixedInterval: number | null
}>()

const emit = defineEmits<{
  /** A spread picked in the title dropdown (only with `options`) */
  select: [id: string]
  /** This chart's hovered crosshair key, or null when the pointer leaves */
  'hover-key': [key: string | null]
  /** How many trading days this chart's data covers */
  'day-count': [count: number]
}>()

/** Times are shown, and trading days split, in Malaysia time */
const ZONE = MYT
/**
 * Trading days start at 06:00 MYT, so a night session that runs past midnight (MCA trades
 * until ~02:00) counts with the day it started on, and no weekend days appear.
 */
const DAY_START_HOUR = 6

const chartRef = useTemplateRef<InstanceType<typeof LineChart>>('chart')

const bars = ref<PriceBar[]>([])
const volumeOn = computed(() => props.volume !== 'off')
const priceShown = computed(() => !volumeOn.value || props.showPrice)
/** Close price, with AVol / BVol for the volume pane (files uploaded without them have none) */
const points = computed<LinePoint[]>(() =>
  bars.value.map((b) => ({ date: b.timestamp, value: b.close, aVol: b.aVol, bVol: b.bVol })),
)
const truncated = ref(false)
const view = ref<ChartView | null>(null)

const spreadLabel = computed(() => `${props.spread.front}–${props.spread.back}`)
const fairValueFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 })
/** "FV 12.5", or '' when this spread has no fair value */
const fairValue = computed(() => {
  const v = props.spread.fairValue
  return typeof v === 'number' && Number.isFinite(v) ? fairValueFmt.format(v) : ''
})
const optionLabel = (s: ProductSpread) => `${s.front}–${s.back}`
function onSelect(e: Event) {
  emit('select', (e.target as HTMLSelectElement).value)
}

/* ---------- Loading the bars (the previous chart stays on screen, blurred, until new ones arrive) ---------- */

const { loading, error, errorHint, begin, succeed, fail } = useAutoRetry(() => loadBars())
let ctl: AbortController | undefined

/*
 * Load only once the chart comes near the screen, so a page of many rolls opens fast. Until
 * then it shows the blurred loading placeholder. Once in view it stays loaded.
 */
const LOAD_AHEAD_PX = 300
const panelEl = ref<HTMLElement | null>(null)
const active = ref(false)
let seenObs: IntersectionObserver | undefined
onMounted(() => {
  if (!panelEl.value || typeof IntersectionObserver === 'undefined') {
    active.value = true
    return
  }
  seenObs = new IntersectionObserver(
    ([entry]) => {
      if (!entry?.isIntersecting) return
      active.value = true
      seenObs?.disconnect()
    },
    { rootMargin: `${LOAD_AHEAD_PX}px 0px` },
  )
  seenObs.observe(panelEl.value)
})
onUnmounted(() => seenObs?.disconnect())

async function loadBars() {
  if (!active.value) return
  ctl?.abort()
  if (!props.interval) {
    bars.value = []
    succeed()
    return
  }
  ctl = new AbortController()
  begin()
  try {
    const res = await fetchPriceData(props.spread.id, props.interval, ctl.signal)
    bars.value = res.data
    truncated.value = res.truncated
    succeed()
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    fail(e)
  }
}
watch(() => [props.spread.id, props.interval, active.value], loadBars, { immediate: true })
onUnmounted(() => ctl?.abort())

/* ---------- Trading days ---------- */

/**
 * Bar index range of each trading day, newest first: dayRanges[t] is T-t's { first, last }.
 * Split exactly as the chart splits days.
 */
const dayRanges = computed(() => {
  const pts = points.value
  const ranges: { first: number; last: number }[] = []
  let prevKey = ''
  for (let i = pts.length - 1; i >= 0; i--) {
    const key = tradingDayKey(pts[i]!.date, ZONE.zone, DAY_START_HOUR)
    if (key !== prevKey) ranges.push({ first: i, last: i })
    else ranges[ranges.length - 1]!.first = i
    prevKey = key
  }
  return ranges
})
watch(
  () => dayRanges.value.length,
  (n) => emit('day-count', n),
  { immediate: true },
)

/** Opens on T-lastDay … T-0 (or as many days as there are) */
const initialCount = computed(() => {
  const days = dayRanges.value
  if (!days.length) return 1
  return points.value.length - days[Math.min(props.lastDay, days.length - 1)]!.first
})

/**
 * Show the page's day selection. Days this chart doesn't have are clamped to its oldest day.
 * Re-applied when new data arrives (spread or interval switch, retry), after the DOM update so
 * it runs after the chart has placed its own default view.
 */
function applyDays() {
  const c = chartRef.value
  const days = dayRanges.value
  const sel = props.days
  if (!c || !days.length) return
  if ('all' in sel) return c.showRange(0, points.value.length - 1)
  const oldest = days.length - 1
  const from = days[Math.min(sel.from, oldest)]!
  const to = days[Math.min(sel.to, oldest)]!
  c.showRange(from.first, to.last)
}
watch(
  [() => props.days, points],
  async () => {
    await nextTick()
    applyDays()
  },
  { flush: 'post' },
)

const period = computed(() => {
  const v = view.value
  if (!v || !points.value.length || v.fromDay === undefined) return ''
  const day = (t: number) => (t > props.lastDay ? 'T-X' : `T-${t}`)
  const days = v.fromDay === v.toDay ? day(v.toDay!) : `${day(v.fromDay)} – ${day(v.toDay!)}`
  return `${days} · ${v.count} bars`
})
</script>

<template>
  <section ref="panelEl" class="panel" :aria-label="`${spreadLabel} chart`">
    <header class="panel-head">
      <span v-if="options && options.length > 1" class="select-wrap">
        <select :value="spread.id" aria-label="Contract months" @change="onSelect">
          <option v-for="s in options" :key="s.id" :value="s.id">
            {{ optionLabel(s) }}
          </option>
        </select>
        <AppIcon name="chevron-down" :size="16" class="select-chev" />
      </span>
      <h2 v-else class="panel-title">{{ spreadLabel }}</h2>
      <span class="panel-code">{{ spread.spreadName }}</span>
      <span v-if="fairValue" class="fair-value" :title="`Fair value: ${fairValue}`">
        FV <strong>{{ fairValue }}</strong>
      </span>
    </header>

    <p class="period">
      <span v-if="priceShown" class="key"
        ><span class="swatch line" aria-hidden="true" />Close</span
      >
      <template v-if="volumeOn">
        <span class="key"><span class="swatch" aria-hidden="true" />AVol</span>
        <span class="key"><span class="swatch b" aria-hidden="true" />BVol</span>
      </template>
      <template v-if="period"> · {{ period }}</template>
      <span v-if="truncated"> · most recent bars only</span>
    </p>

    <LineChart
      ref="chart"
      :points="points"
      :height="height"
      :initial-count="initialCount"
      value-label="Close"
      :volume="volume"
      :volume-share="VOLUME_SHARE"
      :show-line="priceShown"
      volume-empty-text="No AVol / BVol in this data. Re-upload the file with those columns."
      relative-days
      :locked="locked"
      :max-labelled-day="lastDay"
      :day-start-hour="DAY_START_HOUR"
      :display-zone="ZONE"
      :aria-label="`${product} ${spreadLabel} ${[priceShown && 'closing price', volumeOn && 'ask and bid volume'].filter(Boolean).join(' with ')}, ${period}`"
      :loading="loading"
      :error="error"
      :error-hint="errorHint"
      :sync-key="hoverKey"
      :ref-value="showFairValue && priceShown ? spread.fairValue : null"
      ref-label="FV"
      @hover-key="emit('hover-key', $event)"
      @view-change="view = $event"
      @retry="loadBars"
    >
      <template #empty>
        <span>
          No{{ fixedInterval ? ` ${fixedInterval}-min` : '' }} price data for this spread yet.
          Upload one in <RouterLink to="/admin">Admin › Upload data</RouterLink>
        </span>
      </template>
    </LineChart>
  </section>
</template>

<style scoped>
.panel {
  min-width: 0;
  padding: 1rem 1rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--card-background);
  box-shadow: var(--shadow-card);
}

.panel-head {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.select-wrap {
  position: relative;
  display: block;
  min-width: 0;
}
select {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  min-height: 2.2rem;
  padding: 0.3rem 2.2rem 0.3rem 0.7rem;
  font: inherit;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-heading);
  background: var(--color-background-soft);
  border: 1px solid var(--color-border-hover);
  border-radius: 10px;
  cursor: pointer;
  color-scheme: light dark;
  text-overflow: ellipsis;
}
select:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.select-chev {
  position: absolute;
  top: 50%;
  right: 0.7rem;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  pointer-events: none;
}
.panel-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-heading);
}
.fair-value {
  flex: none;
  align-self: center;
  /* pushed to the card's top-right corner */
  margin-left: auto;
  padding: 0.1rem 0.5rem;
  border: 1px solid var(--color-border-hover);
  border-radius: 999px;
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
  white-space: nowrap;
}
.fair-value strong {
  font-weight: 600;
  color: var(--color-heading);
}
.panel-code {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.period {
  margin: 0.5rem 0 0.25rem;
  font-size: 0.85rem;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
/* Series key: the close line, then (volume pane on) AVol and BVol bars */
.key {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-right: 0.6rem;
}
.key:last-of-type {
  margin-right: 0;
}
.swatch {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--color-accent);
}
.swatch.line {
  width: 14px;
  height: 3px;
}
.swatch.b {
  background: var(--color-series-2);
}
</style>
