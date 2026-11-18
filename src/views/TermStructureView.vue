<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import BackLink from '@/components/BackLink.vue'
import TermStructureChart, {
  type CurveMonth,
  type CurvePoint,
  type CurveSeries,
} from '@/components/TermStructureChart.vue'
import { fetchPriceData, fetchProductSpreads } from '@/api/priceData'
import { DAILY_MINUTES } from '@/api/dataFileName'
import { useAutoRetry } from '@/composables/useAutoRetry'
import { usePageTitle } from '@/composables/usePageTitle'
import { MYT, formatDate, tradingDayKey } from '@/utils/time'

const props = defineProps<{ product: string }>()

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const FUTURES_MONTH_CODES = ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z']
/** The page opens on the latest day with at least this many contracts on the curve */
const MIN_DEFAULT_CONTRACTS = 3

usePageTitle(() => `${props.product} Curve`)

const route = useRoute()
const router = useRouter()

/** One outright contract and its close on each trading day */
interface Contract {
  /** Months since Jan 2000 */
  n: number
  label: string
  code: string
  /** Trading days with a close, oldest first */
  days: string[]
  closes: Map<string, number>
}

const contracts = ref<Contract[]>([])
let controller: AbortController | undefined
const { loading, error, errorHint, begin, succeed, fail } = useAutoRetry(load)

/** "Apr26" → months since Jan 2000 */
function monthNumber(contract: string): number {
  const i = MONTHS.indexOf(contract.slice(0, 3))
  return i < 0 ? NaN : Number(contract.slice(3)) * 12 + i
}

async function load() {
  controller?.abort()
  controller = new AbortController()
  const { signal } = controller
  begin()
  try {
    const body = await fetchProductSpreads(props.product, signal, 'Outright')
    // An API without `structure` ignores the filter and sends calendars: keep outrights only
    const outrights = body.data.filter((s) => s.structure === 'Outright' && s.intervals.length)
    const loaded = await Promise.all(
      outrights.map(async (s): Promise<Contract | null> => {
        const n = monthNumber(s.front)
        if (!Number.isFinite(n)) return null
        // Daily bars when there are any, else the longest bars there are
        const interval = s.intervals.some((i) => i.interval === DAILY_MINUTES)
          ? DAILY_MINUTES
          : Math.max(...s.intervals.map((i) => i.interval))
        const { data } = await fetchPriceData(s.id, interval, signal)
        const closes = new Map<string, number>()
        for (const bar of data) {
          // Daily bars are dated in UTC; intraday ones belong to the MYT trading day (from 06:00)
          const day =
            interval >= DAILY_MINUTES
              ? bar.timestamp.slice(0, 10)
              : tradingDayKey(bar.timestamp, MYT.zone, 6)
          closes.set(day, bar.close) // bars are oldest first: the day's last close wins
        }
        return {
          n,
          label: s.front,
          code: FUTURES_MONTH_CODES[n % 12]!,
          days: [...closes.keys()].sort(),
          closes,
        }
      }),
    )
    contracts.value = loaded
      .filter((c): c is Contract => !!c && c.days.length > 0)
      .sort((a, b) => a.n - b.n)
    succeed()
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    fail(e)
  }
}

onMounted(load)
watch(() => props.product, load)
onUnmounted(() => controller?.abort())

/** Every trading day any contract has a close on, oldest first */
const allDays = computed(() => [...new Set(contracts.value.flatMap((c) => c.days))].sort())

/** Index of the last element ≤ `x` in a sorted list, or -1 */
function lastAtOrBefore(list: string[], x: string): number {
  let lo = 0
  let hi = list.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (list[mid]! <= x) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}

/**
 * The curve on `day`: each contract's close that day. A contract still listed (it has closes
 * before and after) but without a trade that day shows its previous close, marked stale.
 */
function curveAt(day: string): Map<number, CurvePoint> {
  const out = new Map<number, CurvePoint>()
  for (const c of contracts.value) {
    const close = c.closes.get(day)
    if (close !== undefined) {
      out.set(c.n, { value: close })
      continue
    }
    if (day < c.days[0]! || day > c.days[c.days.length - 1]!) continue
    const prev = c.days[lastAtOrBefore(c.days, day)]
    if (prev) out.set(c.n, { value: c.closes.get(prev)!, stale: true })
  }
  return out
}

const selectedDay = ref<string | null>(null)

function defaultDay(days: string[]): string | null {
  for (let i = days.length - 1; i >= 0; i--) {
    if (curveAt(days[i]!).size >= MIN_DEFAULT_CONTRACTS) return days[i]!
  }
  return days[days.length - 1] ?? null
}

// Open on ?date= (or the trading day before it), else the default
watch(allDays, (days) => {
  if (!days.length) {
    selectedDay.value = null
    return
  }
  const fromUrl = typeof route.query.date === 'string' ? route.query.date : ''
  const i = fromUrl ? lastAtOrBefore(days, fromUrl) : -1
  selectedDay.value = i >= 0 ? days[i]! : defaultDay(days)
})

function syncUrl() {
  router.replace({ query: { ...route.query, date: selectedDay.value ?? undefined } })
}

function selectDay(day: string) {
  const i = lastAtOrBefore(allDays.value, day)
  selectedDay.value = allDays.value[Math.max(0, i)] ?? null
  syncUrl()
}

const dayIndex = computed(() => (selectedDay.value ? allDays.value.indexOf(selectedDay.value) : -1))

function stepDay(by: number) {
  const next = allDays.value[dayIndex.value + by]
  if (next) {
    selectedDay.value = next
    syncUrl()
  }
}

function onDateInput(e: Event) {
  const v = (e.target as HTMLInputElement).value
  if (v) selectDay(v)
}

const mainCurve = computed(() => (selectedDay.value ? curveAt(selectedDay.value) : new Map()))

const series = computed<CurveSeries[]>(() => {
  if (!selectedDay.value) return []
  return [
    {
      key: 'main',
      label: formatDate(selectedDay.value),
      color: 'var(--color-accent)',
      points: mainCurve.value,
    },
  ]
})

/** Every month from the nearest to the furthest contract on the curve, gaps included */
const axisMonths = computed<CurveMonth[]>(() => {
  const ns = series.value.flatMap((s) => [...s.points.keys()])
  if (!ns.length) return []
  const out: CurveMonth[] = []
  for (let n = Math.min(...ns); n <= Math.max(...ns); n++) {
    out.push({
      n,
      label: `${MONTHS[n % 12]}${String(Math.floor(n / 12)).padStart(2, '0')}`,
      code: FUTURES_MONTH_CODES[n % 12]!,
    })
  }
  return out
})

const priceFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const changeFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})
const fmt = (v: number) => priceFormat.format(v)

/** Front vs furthest contract on the selected day */
const shape = computed(() => {
  const pts = [...mainCurve.value.entries()].sort(([a], [b]) => a - b)
  if (pts.length < 2) return null
  const [fn, front] = pts[0]!
  const [bn, back] = pts[pts.length - 1]!
  const diff = back.value - front.value
  const label = diff > 0 ? 'Contango' : diff < 0 ? 'Backwardation' : 'Flat'
  return {
    label,
    tone: diff > 0 ? 'positive' : diff < 0 ? 'negative' : 'neutral',
    text: `${axisLabel(bn)} − ${axisLabel(fn)}: ${changeFormat.format(diff)}`,
  }
})

function axisLabel(n: number) {
  return `${MONTHS[n % 12]}${String(Math.floor(n / 12)).padStart(2, '0')}`
}

/** A row per contract on the selected day's curve */
const rows = computed(() => {
  const pts = [...mainCurve.value.entries()].sort(([a], [b]) => a - b)
  return pts.map(([n, p], i) => {
    const next = pts[i + 1]
    return {
      n,
      label: axisLabel(n),
      code: FUTURES_MONTH_CODES[n % 12]!,
      close: p.value,
      stale: !!p.stale,
      // Calendar spread to the next contract on the curve: this − next
      spread: next ? { value: p.value - next[1].value, to: axisLabel(next[0]) } : null,
    }
  })
})

const tone = (v: number | null) => (v === null || v === 0 ? '' : v > 0 ? 'up' : 'down')

const ariaLabel = computed(
  () =>
    `${props.product} futures curve on ${selectedDay.value ? formatDate(selectedDay.value) : '—'}: ` +
    rows.value.map((r) => `${r.label} ${fmt(r.close)}`).join(', '),
)
</script>

<template>
  <main>
    <BackLink to="/spreads">All spreads</BackLink>
    <h1>{{ product }} Curve</h1>
    <p class="crumb">
      Commodities · {{ product }} · Term structure<template v-if="contracts.length">
        · outright closes, {{ contracts.length }} contracts</template
      >
    </p>

    <div v-if="loading || error" class="state" :aria-busy="loading">
      <div v-if="error" role="alert">
        <p class="state-title">{{ error }}</p>
        <p class="state-hint">{{ errorHint }}</p>
        <button type="button" class="btn sm retry" @click="load">Retry now</button>
      </div>
      <template v-else>
        <span v-for="i in 4" :key="i" class="bar" aria-hidden="true" />
        <span class="sr-only" role="status">Loading the curve…</span>
      </template>
    </div>

    <div v-else-if="!contracts.length" class="state">
      <p class="state-title">No outright prices for {{ product }} yet</p>
      <p class="state-hint">
        Upload one file per contract under Admin, named like
        <code>{{ product }} Apr26_Daily.csv</code>.
      </p>
    </div>

    <template v-else-if="selectedDay">
      <div class="pickers">
        <div class="picker">
          <span class="picker-label">Date</span>
          <div class="date-row">
            <button
              type="button"
              class="icon-btn"
              aria-label="Previous trading day"
              :disabled="dayIndex <= 0"
              @click="stepDay(-1)"
            >
              <AppIcon name="arrow-left" :size="16" />
            </button>
            <input
              type="date"
              :value="selectedDay"
              :min="allDays[0]"
              :max="allDays[allDays.length - 1]"
              aria-label="Curve date"
              @change="onDateInput"
            />
            <button
              type="button"
              class="icon-btn flip"
              aria-label="Next trading day"
              :disabled="dayIndex >= allDays.length - 1"
              @click="stepDay(1)"
            >
              <AppIcon name="arrow-left" :size="16" />
            </button>
          </div>
        </div>

        <p v-if="shape" class="shape" :class="shape.tone">
          <span class="shape-pill">{{ shape.label }}</span>
          <span class="shape-text">{{ shape.text }}</span>
        </p>
      </div>

      <section class="panel">
        <TermStructureChart
          :months="axisMonths"
          :series="series"
          :format="fmt"
          :aria-label="ariaLabel"
        />
        <p class="note">
          Hollow dots: no trade that day, previous close shown. Gaps: no data for that month.
        </p>
      </section>

      <section class="group">
        <h2>Contracts on {{ formatDate(selectedDay) }}</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col" class="contract">Contract</th>
                <th scope="col" class="num">Close</th>
                <th scope="col" class="num">Spread to next</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.n">
                <th scope="row" class="contract">
                  <span class="contract-label">{{ r.label }}</span>
                  <span class="sub">{{ r.code }}</span>
                </th>
                <td class="num" :title="r.stale ? 'No trade that day: previous close' : undefined">
                  {{ fmt(r.close) }}<span v-if="r.stale" class="stale">*</span>
                </td>
                <td class="num">
                  <template v-if="r.spread">
                    <span :class="tone(r.spread.value)">{{
                      changeFormat.format(r.spread.value)
                    }}</span>
                    <span class="sub inline">vs {{ r.spread.to }}</span>
                  </template>
                  <span v-else class="missing">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
h1 {
  font-size: 1.6rem;
  font-weight: 600;
  color: var(--color-heading);
}

.crumb {
  margin-bottom: 1rem;
  font-size: 0.85rem;
  opacity: 0.6;
}

.pickers {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem 1.25rem;
  margin-bottom: 1rem;
}

.picker {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
}

.picker-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.date-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

input[type='date'] {
  min-height: 2.4rem;
  padding: 0.35rem 0.6rem;
  font: inherit;
  font-size: 0.95rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-heading);
  background: var(--color-background-soft);
  border: 1px solid var(--color-border-hover);
  border-radius: 10px;
  color-scheme: light dark;
}

.icon-btn {
  display: inline-grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
  color: var(--color-text);
  background: var(--color-background-soft);
  border: 1px solid var(--color-border-hover);
  border-radius: 10px;
  cursor: pointer;
}

.icon-btn:hover:not(:disabled) {
  background: var(--color-background-mute);
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.icon-btn.flip :deep(svg) {
  transform: scaleX(-1);
}

input:focus-visible,
.icon-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.shape {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.4rem;
  font-size: 0.85rem;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.shape-pill {
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-weight: 600;
  font-size: 0.8rem;
  border: 1px solid currentColor;
}

.shape.positive .shape-pill {
  color: var(--color-tone-positive);
}
.shape.negative .shape-pill {
  color: var(--color-tone-negative);
}
.shape.neutral .shape-pill {
  color: var(--color-tone-neutral);
}

.panel {
  padding: 0.75rem 0.75rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background-soft);
}

.note {
  margin: 0.25rem 0.25rem 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.group {
  margin-top: 1.5rem;
}

h2 {
  margin-bottom: 0.5rem;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 0.95rem;
}

th,
td {
  padding: 0.55rem 1rem;
  white-space: nowrap;
  border-bottom: 1px solid var(--color-border);
}

tbody tr:last-child > * {
  border-bottom: none;
}

thead th {
  background: var(--color-background-mute);
  color: var(--color-heading);
  font-weight: 600;
}

tbody tr:hover > * {
  background: var(--color-background-mute);
}

.contract {
  position: sticky;
  left: 0;
  z-index: 1;
  width: 1%;
  text-align: left;
  background: var(--color-background-soft);
  border-right: 1px solid var(--color-border);
}

thead .contract {
  background: var(--color-background-mute);
}

.contract-label {
  display: block;
  font-weight: 600;
  color: var(--color-heading);
}

.sub {
  display: block;
  font-size: 0.72rem;
  font-weight: normal;
  color: var(--color-text-muted);
}

.sub.inline {
  display: inline;
  margin-left: 0.4rem;
}

.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.up {
  color: var(--color-tone-positive);
}

.down {
  color: var(--color-tone-negative);
}

.stale,
.missing {
  color: var(--color-text-muted);
}

/* Loading, error and empty states */
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 2rem 1.25rem;
  text-align: center;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
}

.state-title {
  font-weight: 600;
  color: var(--color-heading);
}

.state-hint {
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

code {
  font-size: 0.8rem;
}

.retry {
  margin-top: 0.75rem;
}

.bar {
  width: 100%;
  height: 1.2rem;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    var(--color-background-mute) 0%,
    var(--color-border) 50%,
    var(--color-background-mute) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

@keyframes shimmer {
  from {
    background-position: 100% 0;
  }
  to {
    background-position: -100% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bar {
    animation: none;
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (max-width: 600px) {
  th,
  td {
    padding: 0.5rem 0.75rem;
  }
}
</style>
