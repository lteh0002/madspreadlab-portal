<script setup lang="ts">
import { computed, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import LineChart, { type ChartView, type LinePoint } from '@/components/LineChart.vue'
import {
  fetchPriceData,
  fetchProductSpreads,
  type ProductInfo,
  type ProductSpread,
} from '@/api/priceData'
import { SPREAD_SECTIONS } from '@/data/spreads'
import { MYT, tradingDayKey } from '@/utils/time'

/** Product name as stored in the database, e.g. "MCA" */
const props = defineProps<{ product: string }>()

/** The Spreads-page card that links here (e.g. Indices › Index Roll › MCA Roll), for the title and crumb */
const card = computed(() => {
  for (const section of SPREAD_SECTIONS)
    for (const group of section.groups)
      for (const s of group.spreads)
        if (s.routeName === 'product-chart' && s.routeParams?.product === props.product)
          return {
            spread: s,
            path: [section.title, group.title].filter(Boolean).join(' · '),
            interval: group.chartInterval,
            days: group.chartDays,
          }
  return null
})
const title = computed(() => card.value?.spread.pageTitle ?? `${props.product} Chart`)
/** Interval fixed by the card's group (e.g. 15 min for Index Roll); null = any */
const fixedInterval = computed(() => card.value?.interval ?? null)

/**
 * Opening window: T-`lastDay` … T-0 (set per group, e.g. T-5 for Index Roll). Older days are
 * labelled "T-X" and are reached by zooming out or the All button.
 */
const lastDay = computed(() => card.value?.days ?? 5)

const chartRef = useTemplateRef<InstanceType<typeof LineChart>>('chart')

const info = ref<ProductInfo | null>(null)
const spreads = ref<ProductSpread[]>([])
const spreadId = ref('')
const interval = ref(0)

const points = ref<LinePoint[]>([])
/**
 * The pickers, range buttons and "Close · …" line show only once there's a chart. They stay
 * while switching spread (the previous chart is still on screen, blurred, until the new one loads).
 */
const ready = computed(() => points.value.length > 0)
const view = ref<ChartView | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const truncated = ref(false)

/* ---------- Auto-retry after a failed request, like the cash table page ---------- */
const RETRY_SECONDS = 10
const retryIn = ref(0)
let retryTimer: ReturnType<typeof setInterval> | undefined

const errorHint = computed(() =>
  retryIn.value > 0 ? `Retrying in ${retryIn.value}s…` : 'Retrying…',
)

function stopRetryTimer() {
  clearInterval(retryTimer)
  retryTimer = undefined
}

/** Count down, then try again automatically */
function scheduleRetry() {
  stopRetryTimer()
  retryIn.value = RETRY_SECONDS
  retryTimer = setInterval(() => {
    retryIn.value -= 1
    if (retryIn.value <= 0) {
      stopRetryTimer()
      retry()
    }
  }, 1000)
}

/** Start of every request: cancel a pending auto-retry. While an error is showing, keep it up (with
 * "Retrying…") instead of flashing the loading state, so the screen doesn't flicker. */
function beginRequest() {
  stopRetryTimer()
  retryIn.value = 0
  if (!error.value) loading.value = true
}

function fail(e: unknown) {
  error.value = (e as Error).message
  loading.value = false
  scheduleRetry()
}

let spreadsCtl: AbortController | undefined
let barsCtl: AbortController | undefined

const spread = computed(() => spreads.value.find((s) => s.id === spreadId.value))
const intervals = computed(() =>
  (spread.value?.intervals ?? []).filter(
    (i) => fixedInterval.value === null || i.interval === fixedInterval.value,
  ),
)
const spreadLabel = (s: ProductSpread) => `${s.front}–${s.back} (${s.spreadName})`

/** How many bars fall within `days` of the newest bar */
/** Times are shown, and trading days split, in Malaysia time */
const ZONE = MYT
/**
 * Trading days start at 06:00 MYT, so a night session that runs past midnight (MCA trades
 * until ~02:00) counts with the day it started on, and no weekend days appear.
 */
const DAY_START_HOUR = 6

/** How many bars fall in the last `days` trading days (T-0 … T-(days-1)), split as the chart splits them */
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

/* ---------- Day strip: All, then one chip per day T-lastDay … T-0 ---------- */
/** Oldest day with a chip (T-lastDay, or fewer if there isn't that much data) */
const oldestChip = computed(() => Math.min(lastDay.value, dayRanges.value.length - 1))
/** T numbers with a chip, oldest (left) first: [5, 4, 3, 2, 1, 0] */
const chipDays = computed(() =>
  Array.from({ length: oldestChip.value + 1 }, (_, i) => oldestChip.value - i),
)

/** Show T-a … T-b. Order doesn't matter: the range always runs older → newer. */
function showDays(a: number, b: number) {
  const days = dayRanges.value
  const from = days[Math.max(a, b)]
  const to = days[Math.min(a, b)]
  if (from && to) chartRef.value?.showRange(from.first, to.last)
}
function showAll() {
  chartRef.value?.showRange(0, points.value.length - 1)
}

/** Opens on T-lastDay … T-0 */
const initialCount = computed(() => {
  const days = dayRanges.value
  if (!days.length) return 1
  return points.value.length - days[oldestChip.value]!.first
})

/**
 * Days the chart shows exactly, as { from, to } T numbers (from ≥ to), or null when the view
 * doesn't line up with whole chip days (after a pan or zoom). Drives the chip highlight.
 */
const selected = computed(() => {
  const v = view.value
  const days = dayRanges.value
  if (!v || !days.length) return null
  const from = chipDays.value.find((t) => days[t]!.first === v.first)
  const to = chipDays.value.find((t) => days[t]!.last === v.last)
  return from !== undefined && to !== undefined && from >= to ? { from, to } : null
})
const allActive = computed(
  () => !!view.value && view.value.first === 0 && view.value.last === points.value.length - 1,
)
const inSelection = (t: number) => !!selected.value && t <= selected.value.from && t >= selected.value.to

/*
 * Picking days: press a chip for that day; drag across chips (mouse or touch) or Shift-click
 * a second chip for a range. Keyboard: Enter/Space picks a day, Shift+Enter extends.
 */
let anchor: number | null = null
let dragging = false

function chipAt(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-day]')
  return el ? Number(el.dataset.day) : null
}
function onChipDown(e: PointerEvent, t: number) {
  if (e.button !== 0) return
  // Touch captures the pointer to the first chip; release so the drag can reach the others
  ;(e.target as Element).releasePointerCapture?.(e.pointerId)
  if (e.shiftKey && anchor !== null) {
    showDays(anchor, t)
  } else {
    anchor = t
    showDays(t, t)
  }
  dragging = true
  window.addEventListener('pointerup', endDrag, { once: true })
  window.addEventListener('pointercancel', endDrag, { once: true })
}
function onStripMove(e: PointerEvent) {
  if (!dragging || anchor === null) return
  const t = chipAt(e.clientX, e.clientY)
  if (t !== null) showDays(anchor, t)
}
function endDrag() {
  dragging = false
}
/** Keyboard only (pointer presses are handled on pointerdown; their click has detail ≥ 1) */
function onChipClick(e: MouseEvent, t: number) {
  if (e.detail !== 0) return
  if (e.shiftKey && anchor !== null) showDays(anchor, t)
  else {
    anchor = t
    showDays(t, t)
  }
}
onUnmounted(endDrag)

const period = computed(() => {
  const v = view.value
  if (!v || !points.value.length || v.fromDay === undefined) return ''
  const day = (t: number) => (t > lastDay.value ? 'T-X' : `T-${t}`)
  const days = v.fromDay === v.toDay ? day(v.toDay!) : `${day(v.fromDay)} – ${day(v.toDay!)}`
  return `${days} · ${v.count} bars`
})

async function loadSpreads() {
  spreadsCtl?.abort()
  spreadsCtl = new AbortController()
  beginRequest()
  points.value = []
  try {
    const res = await fetchProductSpreads(props.product, spreadsCtl.signal)
    info.value = res.product
    // With a fixed interval, only spreads that have data at it can be shown
    const fixed = fixedInterval.value
    spreads.value =
      fixed === null
        ? res.data
        : res.data.filter((s) => s.intervals.some((i) => i.interval === fixed))
    // Nearest contracts first; default to the fixed interval, else the shortest one
    const first = spreads.value[0]
    const nextId = first?.id ?? ''
    const nextInterval = fixed ?? first?.intervals[0]?.interval ?? 0
    const unchanged = nextId === spreadId.value && nextInterval === interval.value
    spreadId.value = nextId
    interval.value = nextInterval
    if (!first) {
      // Nothing to plot: done, and clear any error left from a failed earlier attempt
      error.value = null
      loading.value = false
    } else if (unchanged) {
      // The spreadId/interval watcher won't fire, so load the bars here
      loadBars()
    }
    // otherwise loading the bars is triggered by the spreadId/interval watcher
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    fail(e)
  }
}

async function loadBars() {
  if (!spreadId.value || !interval.value) return
  barsCtl?.abort()
  barsCtl = new AbortController()
  beginRequest()
  try {
    const res = await fetchPriceData(spreadId.value, interval.value, barsCtl.signal)
    points.value = res.data.map((b) => ({ date: b.timestamp, value: b.close }))
    truncated.value = res.truncated
    error.value = null
    loading.value = false
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    fail(e)
  }
}

// Picking another spread keeps the interval if that spread has it, else uses its shortest
watch(spreadId, () => {
  const ivs = intervals.value
  if (ivs.length && !ivs.some((i) => i.interval === interval.value))
    interval.value = ivs[0]!.interval
})
watch([spreadId, interval], loadBars)
watch(() => props.product, loadSpreads, { immediate: true })

function retry() {
  if (spreads.value.length) loadBars()
  else loadSpreads()
}

onUnmounted(() => {
  spreadsCtl?.abort()
  barsCtl?.abort()
  stopRetryTimer()
})
</script>

<template>
  <main>
    <RouterLink to="/spreads" class="back">← All spreads</RouterLink>
    <h1>{{ title }}</h1>
    <p class="crumb">
      <template v-if="card">{{ card.path }} · </template>
      <template v-if="info">{{ info.exchange }} · {{ info.currency }} · </template>Calendar spread
    </p>

    <section class="card" aria-label="Price chart">
      <header v-if="ready" class="card-head">
        <div class="pickers">
          <label class="picker">
            <span class="picker-label">Spread</span>
            <span class="select-wrap">
              <select v-model="spreadId" :disabled="!spreads.length">
                <option v-for="s in spreads" :key="s.id" :value="s.id">{{ spreadLabel(s) }}</option>
              </select>
              <AppIcon name="chevron-down" :size="16" class="select-chev" />
            </span>
          </label>
          <label class="picker">
            <span class="picker-label">Interval</span>
            <span class="select-wrap">
              <select v-model.number="interval" :disabled="intervals.length < 2">
                <option v-for="iv in intervals" :key="iv.interval" :value="iv.interval">
                  {{ iv.interval }} min
                </option>
              </select>
              <AppIcon
                v-if="intervals.length > 1"
                name="chevron-down"
                :size="16"
                class="select-chev"
              />
            </span>
          </label>
        </div>

        <div v-if="chipDays.length" class="ranges" role="group" aria-label="Days shown">
          <button
            type="button"
            title="All data"
            :class="{ active: allActive }"
            :aria-pressed="allActive"
            @click="showAll"
          >
            All
          </button>
          <span class="divider" aria-hidden="true" />
          <div class="day-strip" @pointermove="onStripMove">
            <button
              v-for="t in chipDays"
              :key="t"
              type="button"
              :data-day="t"
              :title="`T-${t} · drag or Shift-click for a range`"
              :class="{
                in: inSelection(t),
                start: inSelection(t) && t === selected?.from,
                end: inSelection(t) && t === selected?.to,
              }"
              :aria-pressed="inSelection(t)"
              @pointerdown="onChipDown($event, t)"
              @click="onChipClick($event, t)"
            >
              T-{{ t }}
            </button>
          </div>
        </div>
      </header>

      <p v-if="ready" class="period">
        Close<template v-if="period"> · {{ period }}</template>
        <span v-if="truncated"> · showing the most recent bars only</span>
      </p>

      <LineChart
        ref="chart"
        :points="points"
        :initial-count="initialCount"
        value-label="Close"
        relative-days
        :max-labelled-day="lastDay"
        :day-start-hour="DAY_START_HOUR"
        :display-zone="ZONE"
        :aria-label="`${product} ${spread ? spreadLabel(spread) : ''} closing price, ${period}`"
        :loading="loading"
        :error="error"
        :error-hint="errorHint"
        @view-change="view = $event"
        @retry="retry"
      >
        <template #empty>
          <span>
            No{{ fixedInterval ? ` ${fixedInterval}-min` : '' }} price data for {{ product }} yet.
            Upload one in <RouterLink to="/admin">Admin › Upload data</RouterLink>
          </span>
        </template>
      </LineChart>
      <p class="hint">
        T-0 = last trading day · T-X = before T-{{ lastDay }} · drag across days for a range · drag the chart to pan · scroll to zoom · times
        in Malaysia time (MYT)
      </p>
    </section>
  </main>
</template>

<style scoped>
.back {
  display: inline-block;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

h1 {
  font-size: 1.6rem;
  font-weight: 600;
  color: var(--color-heading);
}

.crumb {
  margin-bottom: 1.25rem;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.card {
  padding: 1.25rem 1.25rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--card-background);
  box-shadow: var(--shadow-card);
}

.card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.75rem;
}

.pickers {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.picker {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.picker-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
.select-wrap {
  position: relative;
  display: block;
}
select {
  -webkit-appearance: none;
  appearance: none;
  min-height: 2.4rem;
  padding: 0.35rem 2.2rem 0.35rem 0.75rem;
  font: inherit;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--color-heading);
  background: var(--color-background-soft);
  border: 1px solid var(--color-border-hover);
  border-radius: 10px;
  cursor: pointer;
  color-scheme: light dark;
}
select:disabled {
  cursor: default;
  opacity: 1;
  padding-right: 0.75rem;
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

.period {
  margin: 0.75rem 0 0.25rem;
  font-size: 0.85rem;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.hint {
  text-align: right;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.ranges {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-background-soft);
}
.ranges button {
  min-width: 2.75rem;
  min-height: 2rem;
  padding: 0.25rem 0.65rem;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 500;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}
.ranges button:hover:not(.active):not(.in):not(:disabled) {
  background: var(--color-background-mute);
}
.ranges button.active {
  background: var(--color-accent-solid);
  color: var(--color-on-accent);
}
.ranges button:disabled {
  opacity: 0.5;
  cursor: default;
}
.divider {
  align-self: stretch;
  width: 1px;
  margin: 0.2rem 0.25rem;
  background: var(--color-border);
}
/* Chips touch, so the selected days read as one continuous pill */
.day-strip {
  display: flex;
  touch-action: pan-y; /* horizontal drags select days; vertical still scrolls the page */
  user-select: none;
  -webkit-user-select: none;
}
.day-strip button {
  border-radius: 0;
}
.day-strip button:first-child {
  border-radius: 7px 0 0 7px;
}
.day-strip button:last-child {
  border-radius: 0 7px 7px 0;
}
.day-strip button.in {
  background: var(--color-accent-solid);
  color: var(--color-on-accent);
}
.day-strip button.in.start {
  border-top-left-radius: 7px;
  border-bottom-left-radius: 7px;
}
.day-strip button.in.end {
  border-top-right-radius: 7px;
  border-bottom-right-radius: 7px;
}
/* Faint seam between selected days so each chip is still readable */
.day-strip button.in:not(.start) {
  box-shadow: inset 1px 0 0 color-mix(in srgb, var(--color-on-accent) 25%, transparent);
}
.ranges button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
