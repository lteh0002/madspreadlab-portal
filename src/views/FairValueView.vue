<script setup lang="ts">
import BackLink from '@/components/BackLink.vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { fetchFairValues, type ProductFairValues } from '@/api/fairValue'
import { useAutoRetry } from '@/composables/useAutoRetry'
import { MYT, dayKey } from '@/utils/time'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const FUTURES_MONTH_CODES = ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z']
/** Most decimals a column shows, however many the stored values have */
const MAX_DECIMALS = 4

const route = useRoute()
const router = useRouter()

const products = ref<ProductFairValues[]>([])
let controller: AbortController | undefined
const { loading, error, errorHint, begin, succeed, fail } = useAutoRetry(load)

async function load() {
  controller?.abort()
  controller = new AbortController()
  begin()
  try {
    products.value = await fetchFairValues(controller.signal)
    succeed()
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    fail(e)
  }
}

onMounted(load)
onUnmounted(() => controller?.abort())

/** "Nov26" → months since Jan 2000, or NaN */
function monthNumber(contract: string): number {
  const i = MONTHS.indexOf(contract.slice(0, 3))
  return i < 0 ? NaN : Number(contract.slice(3)) * 12 + i
}

/** This year in Malaysia time; the page opens on it when it has fair values */
const currentYear = Number(dayKey(new Date().toISOString(), MYT.zone).slice(0, 4))

interface ProductColumn {
  key: string
  name: string
  exchange: string
}

/** One product's fair value for one spread */
interface Entry {
  /** Roll length in months: 1 = monthly, 3 = quarterly */
  months: number
  /** Four-digit year of the front contract: the year the spread is listed under */
  year: number
  /** Front contract as months since 2000 */
  n: number
  /** "Nov26-Dec26" */
  key: string
  code: string
  product: ProductColumn
  /** Formatted, e.g. "-4.20" */
  value: string
}

interface SpreadRow {
  key: string
  n: number
  /** "Nov–Dec" */
  label: string
  /** "X-Z", plus the back contract's year when it's in the next one, e.g. "Z-F · Jan 2027" */
  sub: string
  /** Formatted fair value per product key; missing = no fair value for that product */
  cells: Record<string, string>
}

interface Table {
  months: number
  title: string
  products: ProductColumn[]
  /** Spreads of the selected year, by front month */
  rows: SpreadRow[]
}

function tableTitle(months: number) {
  if (months === 1) return 'Monthly'
  if (months === 3) return 'Quarterly'
  return `${months}-month`
}

function decimals(v: number) {
  const s = String(v)
  if (s.includes('e')) return MAX_DECIMALS
  const dot = s.indexOf('.')
  return dot < 0 ? 0 : Math.min(MAX_DECIMALS, s.length - dot - 1)
}

/** A row for front contract `n` rolling `months` ahead, e.g. Dec26 + 1 → "Dec–Jan", "Z-F · Jan 2027" */
function makeRow(n: number, months: number, code?: string): SpreadRow {
  const b = n + months
  const fm = n % 12
  const bm = b % 12
  const fy = Math.floor(n / 12)
  const by = Math.floor(b / 12)
  const yy = (y: number) => String(y).padStart(2, '0')
  const c = code ?? `${FUTURES_MONTH_CODES[fm]}-${FUTURES_MONTH_CODES[bm]}`
  return {
    key: `${MONTHS[fm]}${yy(fy)}-${MONTHS[bm]}${yy(by)}`,
    n,
    label: `${MONTHS[fm]}–${MONTHS[bm]}`,
    sub: by === fy ? c : `${c} · ${MONTHS[bm]} ${2000 + by}`,
    cells: {},
  }
}

/** Every fair value, formatted with the same precision down each product's column */
const entries = computed<Entry[]>(() => {
  const out: Entry[] = []
  for (const { product, spreads } of products.value) {
    const col = {
      key: `${product.exchange}:${product.name}`,
      name: product.name,
      exchange: product.exchange,
    }
    const byMonths = new Map<number, typeof spreads>()
    for (const s of spreads) {
      if (!byMonths.has(s.months)) byMonths.set(s.months, [])
      byMonths.get(s.months)!.push(s)
    }
    for (const [months, list] of byMonths) {
      const fmt = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: Math.max(...list.map((s) => decimals(s.fairValue))),
        maximumFractionDigits: MAX_DECIMALS,
        signDisplay: 'exceptZero',
      })
      for (const s of list) {
        const n = monthNumber(s.front)
        if (!Number.isFinite(n)) continue
        out.push({
          months,
          year: 2000 + Math.floor(n / 12),
          n,
          key: `${s.front}-${s.back}`,
          code: s.spreadName,
          product: col,
          value: fmt.format(s.fairValue),
        })
      }
    }
  }
  return out
})

/** Years that have fair values, oldest first */
const years = computed(() => [...new Set(entries.value.map((e) => e.year))].sort((a, b) => a - b))

/** The year in the URL (?year=2026) when it has data; else this year, or the nearest one */
const selectedYear = ref<number | null>(null)

function defaultYear(list: number[]): number | null {
  if (!list.length) return null
  if (list.includes(currentYear)) return currentYear
  const past = list.filter((y) => y < currentYear)
  return past.length ? past[past.length - 1]! : list[0]!
}

watch(years, (list) => {
  const fromUrl = Number(route.query.year)
  if (selectedYear.value !== null && list.includes(selectedYear.value)) return
  selectedYear.value = list.includes(fromUrl) ? fromUrl : defaultYear(list)
})

function onYearChange(e: Event) {
  const y = Number((e.target as HTMLSelectElement).value)
  selectedYear.value = y
  router.replace({ query: { ...route.query, year: String(y) } })
}

/** Every product with a fair value in any year, by name */
const allProducts = computed(() => {
  const byKey = new Map(entries.value.map((e) => [e.product.key, e.product]))
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name))
})

const HIDDEN_KEY = 'fairValue.hiddenProducts'

/** Products switched off with the chips. Stored as hidden (not shown) so new products start on. */
const hidden = ref<Set<string>>(readHidden())

function readHidden(): Set<string> {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]')
    return new Set(Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

watch(
  hidden,
  (set) => {
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set]))
    } catch {
      // storage blocked (private mode): the choice just isn't remembered
    }
  },
  { deep: true },
)

const visibleCount = computed(
  () => allProducts.value.filter((p) => !hidden.value.has(p.key)).length,
)

/** Switch a product on or off; the last one showing can't be switched off */
function toggleProduct(key: string) {
  if (hidden.value.has(key)) hidden.value.delete(key)
  else if (visibleCount.value > 1) hidden.value.add(key)
}

/**
 * One table per roll length for the selected year: a row per spread, a column per product
 * with a fair value that year. The monthly table always lists Jan–Feb … Dec–Jan.
 */
const tables = computed<Table[]>(() => {
  const year = selectedYear.value
  if (year === null) return []
  const byMonths = new Map<
    number,
    { products: Map<string, ProductColumn>; rows: Map<string, SpreadRow> }
  >()

  for (const e of entries.value) {
    if (e.year !== year || hidden.value.has(e.product.key)) continue
    let t = byMonths.get(e.months)
    if (!t) {
      t = { products: new Map(), rows: new Map() }
      if (e.months === 1) {
        const jan = (year - 2000) * 12
        for (let m = 0; m < 12; m++) {
          const r = makeRow(jan + m, 1)
          t.rows.set(r.key, r)
        }
      }
      byMonths.set(e.months, t)
    }
    t.products.set(e.product.key, e.product)
    let row = t.rows.get(e.key)
    if (!row) {
      row = makeRow(e.n, e.months, e.code)
      t.rows.set(e.key, row)
    }
    row.cells[e.product.key] = e.value
  }

  return [...byMonths.entries()]
    .sort(([a], [b]) => a - b)
    .map(([months, t]) => ({
      months,
      title: tableTitle(months),
      products: [...t.products.values()].sort((a, b) => a.name.localeCompare(b.name)),
      rows: [...t.rows.values()].sort((a, b) => a.n - b.n),
    }))
})
</script>

<template>
  <main>
    <BackLink to="/spreads">All spreads</BackLink>
    <h1>Fair Value</h1>
    <p class="crumb">Indices · Index Roll</p>

    <div v-if="loading || error" class="state" :aria-busy="loading">
      <template v-if="error">
        <div role="alert">
          <p class="state-title">{{ error }}</p>
          <p class="state-hint">{{ errorHint }}</p>
          <button type="button" class="btn sm retry" @click="load">Retry now</button>
        </div>
      </template>
      <template v-else>
        <span v-for="i in 4" :key="i" class="bar" aria-hidden="true" />
        <span class="sr-only" role="status">Loading fair values…</span>
      </template>
    </div>

    <div v-else-if="years.length === 0" class="state">
      <p class="state-title">No fair values yet</p>
      <p class="state-hint">
        Set <code>fairValue</code> on a spread in the <code>spreads</code> collection.
      </p>
    </div>

    <template v-else>
      <div class="pickers">
        <label class="picker">
          <span class="picker-label">Year</span>
          <span class="select-wrap">
            <select :value="selectedYear" @change="onYearChange">
              <option v-for="y in [...years].reverse()" :key="y" :value="y">{{ y }}</option>
            </select>
            <AppIcon name="chevron-down" :size="16" class="select-chev" />
          </span>
        </label>

        <div v-if="allProducts.length > 1" class="picker">
          <span id="products-label" class="picker-label">Products</span>
          <div class="seg" role="group" aria-labelledby="products-label">
            <button
              v-for="p in allProducts"
              :key="p.key"
              type="button"
              :class="{ active: !hidden.has(p.key) }"
              :aria-pressed="!hidden.has(p.key)"
              :disabled="!hidden.has(p.key) && visibleCount === 1"
              :title="`${p.name} (${p.exchange})`"
              @click="toggleProduct(p.key)"
            >
              {{ p.name }}
            </button>
          </div>
        </div>
      </div>

      <p v-if="tables.length === 0" class="state state-hint">
        No fair values for the selected products in {{ selectedYear }}.
      </p>

      <section v-for="t in tables" :key="t.months" class="group">
        <h2>{{ t.title }}</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col" class="spread">Spread</th>
                <th v-for="p in t.products" :key="p.key" scope="col" class="num">
                  {{ p.name }}
                  <span class="exchange">{{ p.exchange }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in t.rows" :key="r.key" :title="r.key">
                <th scope="row" class="spread">
                  <span class="spread-label">{{ r.label }}</span>
                  <span class="spread-sub">{{ r.sub }}</span>
                </th>
                <td
                  v-for="p in t.products"
                  :key="p.key"
                  class="num"
                  :class="{ missing: !r.cells[p.key] }"
                >
                  {{ r.cells[p.key] ?? '—' }}
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
  margin-bottom: 1.25rem;
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

/* Year dropdown */
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
  font-variant-numeric: tabular-nums;
  color: var(--color-heading);
  background: var(--color-background-soft);
  border: 1px solid var(--color-border-hover);
  border-radius: 10px;
  cursor: pointer;
  color-scheme: light dark;
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

.seg {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-background-soft);
}

.seg button {
  min-width: 3.5rem;
  min-height: 2rem;
  padding: 0.25rem 0.75rem;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.seg button:hover:not(.active) {
  background: var(--color-background-mute);
}

.seg button:disabled {
  cursor: default;
}

.seg button.active {
  background: var(--color-accent-solid);
  color: var(--color-on-accent);
}

.seg button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.group + .group {
  margin-top: 1.75rem;
}

h2 {
  margin-bottom: 0.5rem;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

/* Scrolls sideways only if there are more products than fit */
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
  padding: 0.6rem 1rem;
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

/* Spread column stays put if the products scroll sideways */
.spread {
  position: sticky;
  left: 0;
  z-index: 1;
  width: 1%;
  text-align: left;
  background: var(--color-background-soft);
  border-right: 1px solid var(--color-border);
}

thead .spread {
  background: var(--color-background-mute);
}

.spread-label {
  display: block;
  font-weight: 600;
  color: var(--color-heading);
}

.spread-sub {
  display: block;
  font-size: 0.72rem;
  font-weight: normal;
  color: var(--color-text-muted);
}

.exchange {
  display: block;
  font-size: 0.72rem;
  font-weight: normal;
  color: var(--color-text-muted);
}

.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

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
