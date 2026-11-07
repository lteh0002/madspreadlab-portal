<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import LineChart, { type LinePoint } from '@/components/LineChart.vue'
import SpreadChartPanel, { type DaySelection } from '@/components/SpreadChartPanel.vue'
import { fetchProductSpreads, type ProductInfo, type ProductSpread } from '@/api/priceData'
import { SPREAD_SECTIONS } from '@/data/spreads'
import { useAutoRetry } from '@/composables/useAutoRetry'

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

/* ---------- Layout: 1–3 charts per row ---------- */

type PerRow = 1 | 2 | 3
const PER_ROW_OPTIONS: PerRow[] = [1, 2, 3]
/** Plot height in px by charts per row; kept compact so several fit on screen */
const CHART_HEIGHTS: Record<PerRow, number> = { 1: 260, 2: 240, 3: 220 }

const perRow = ref<PerRow>(1)
/** Rolls the viewer has unticked in the Charts dropdown (the first chart always shows) */
const hiddenIds = ref<string[]>([])

/*
 * The viewer's charts-per-row choice is remembered per product in this browser. A convenience
 * only: everything works without it.
 */
const storageKey = computed(() => `product-chart:${props.product}`)
function readSaved(): { perRow?: unknown; hidden?: unknown } {
  try {
    const v = JSON.parse(localStorage.getItem(storageKey.value) ?? '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}
function save() {
  try {
    localStorage.setItem(
      storageKey.value,
      JSON.stringify({ perRow: perRow.value, hidden: hiddenIds.value }),
    )
  } catch {
    // storage blocked or full: the layout just isn't remembered
  }
}
watch([perRow, hiddenIds], save, { deep: true })

/* ---------- The product's spreads: one chart each, newest contract month first ---------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Oct26" → 2026 * 12 + 9, for sorting; unparseable months sort last */
function contractMonth(code: string) {
  const m = /^([A-Za-z]{3})(\d{2})$/.exec(code.trim())
  const month = m
    ? MONTHS.indexOf(m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1).toLowerCase())
    : -1
  return m && month >= 0 ? (2000 + Number(m[2])) * 12 + month : -Infinity
}
const newestFirst = (a: ProductSpread, b: ProductSpread) =>
  contractMonth(b.front) - contractMonth(a.front) || contractMonth(b.back) - contractMonth(a.back)

const info = ref<ProductInfo | null>(null)
const spreads = ref<ProductSpread[]>([])
const interval = ref(0)

const { loading, error, errorHint, begin, succeed, fail } = useAutoRetry(() => loadSpreads())
let spreadsCtl: AbortController | undefined

async function loadSpreads() {
  spreadsCtl?.abort()
  spreadsCtl = new AbortController()
  begin()
  try {
    const res = await fetchProductSpreads(props.product, spreadsCtl.signal)
    info.value = res.product
    // With a fixed interval, only spreads that have data at it can be shown
    const fixed = fixedInterval.value
    spreads.value = (
      fixed === null
        ? [...res.data]
        : res.data.filter((s) => s.intervals.some((i) => i.interval === fixed))
    ).sort(newestFirst)
    succeed()
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    fail(e)
  }
}

/** Placeholder chart before the spreads load (loading, error, or no data) */
const NO_POINTS: LinePoint[] = []

/* ---------- Interval: shared by every chart ---------- */

/** Intervals every spread has (else the newest spread's), limited to the fixed interval */
const intervals = computed(() => {
  const used = spreads.value
  const allowed = (iv: number) => fixedInterval.value === null || iv === fixedInterval.value
  const firstIvs = (used[0]?.intervals ?? []).map((i) => i.interval).filter(allowed)
  const common = firstIvs.filter((iv) =>
    used.every((s) => s.intervals.some((i) => i.interval === iv)),
  )
  return common.length ? common : firstIvs
})
// Keep the interval if every chart still has it, else use the shortest available
watch(
  intervals,
  (ivs) => {
    if (!ivs.includes(interval.value)) interval.value = ivs[0] ?? 0
  },
  { immediate: true },
)

/* ---------- Days: All, then one chip per day T-lastDay … T-0, shared by every chart ---------- */

/** Trading days each chart's data covers, by spread id */
const dayCounts = reactive(new Map<string, number>())
const maxDays = computed(() =>
  Math.max(0, ...visibleSpreads.value.map((s) => dayCounts.get(s.id) ?? 0)),
)

/** Oldest day with a chip (T-lastDay, or fewer if no chart has that much data) */
const oldestChip = computed(() => Math.min(lastDay.value, maxDays.value - 1))
/** T numbers with a chip, oldest (left) first: [5, 4, 3, 2, 1, 0] */
const chipDays = computed(() =>
  Array.from({ length: oldestChip.value + 1 }, (_, i) => oldestChip.value - i),
)

/** Crosshair key hovered on any chart ("T-2 10:45"); every chart shows its crosshair there */
const hoverKey = ref<string | null>(null)

const daySel = ref<DaySelection>({ from: lastDay.value, to: 0 })

/** Show T-a … T-b on every chart. Order doesn't matter: the range always runs older → newer. */
function showDays(a: number, b: number) {
  daySel.value = { from: Math.max(a, b), to: Math.min(a, b) }
}
function showAll() {
  daySel.value = { all: true }
}

const selected = computed(() => ('all' in daySel.value ? null : daySel.value))
const allActive = computed(() => 'all' in daySel.value)
const inSelection = (t: number) =>
  !!selected.value && t <= selected.value.from && t >= selected.value.to

/*
 * Small screens get a dropdown instead of the chips. It drives the same selection, so charts,
 * chips and dropdown always agree. Values: "all" or "from-to".
 */
const dayLabel = (t: number) => `T-${t}`
const dayOptions = computed(() => {
  const days = chipDays.value
  if (!days.length) return []
  const oldest = days[0]!
  const opts = [
    { value: 'all', label: 'All data' },
    { value: `${oldest}-0`, label: `${dayLabel(oldest)} → T-0` },
    ...days.map((t) => ({ value: `${t}-${t}`, label: dayLabel(t) })),
  ]
  // A span picked another way (chip drag, Shift-click) gets its own entry so the box shows it
  const sel = selected.value
  if (sel && !opts.some((o) => o.value === `${sel.from}-${sel.to}`))
    opts.splice(2, 0, {
      value: `${sel.from}-${sel.to}`,
      label: `${dayLabel(sel.from)} → ${dayLabel(sel.to)}`,
    })
  return opts
})
const dayChoice = computed(() => {
  const sel = selected.value
  return sel ? `${sel.from}-${sel.to}` : 'all'
})
function onDayChoice(e: Event) {
  const value = (e.target as HTMLSelectElement).value
  if (value === 'all') return showAll()
  const [from, to] = value.split('-').map(Number)
  if (from !== undefined && to !== undefined) showDays(from, to)
}

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

/*
 * Compact mode: when the page is too narrow for the chip strip (iPhone SE and similar), show
 * the Days dropdown instead, one chart per row, and lock the charts (no drag/zoom) so they
 * always show exactly the dropdown's pick. Measured on the page itself, so it follows the real
 * space available, whatever the screen size, browser zoom or text size.
 */
const COMPACT_BELOW_PX = 480
const pageEl = ref<HTMLElement | null>(null)
const compact = ref(false)
let pageObs: ResizeObserver | undefined
onMounted(() => {
  const el = pageEl.value
  if (!el) return
  const measure = (w: number) => (compact.value = w < COMPACT_BELOW_PX)
  measure(el.getBoundingClientRect().width)
  if (typeof ResizeObserver === 'undefined') return
  pageObs = new ResizeObserver(([entry]) => entry && measure(entry.contentRect.width))
  pageObs.observe(el)
})
onUnmounted(() => pageObs?.disconnect())

/** The first chart's spread: the newest roll unless the viewer picks another */
const mainId = ref('')
const mainSpread = computed(
  () => spreads.value.find((s) => s.id === mainId.value) ?? spreads.value[0],
)
/**
 * The charts on screen: the first chart's spread, then (unless hidden) the rolls before it,
 * each the next earlier contract month that has data (months without data are skipped), e.g.
 * Oct26–Nov26, Sep26–Oct26, Jul26–Aug26 … Rolls newer than the first chart's come last.
 */
const orderedSpreads = computed(() => {
  const main = mainSpread.value
  if (!main) return []
  const at = spreads.value.indexOf(main) // spreads are newest first
  return [main, ...spreads.value.slice(at + 1), ...spreads.value.slice(0, at)]
})

/** Charts shown at first, and how many more each "Show more" adds */
const HISTORY_PAGE = 6
/** How many charts are shown with every roll on (grows with "Show more"; per visit only) */
const shownCount = ref(HISTORY_PAGE)
/** Ticked rolls in chart order: the first chart, then the others not hidden */
const tickedSpreads = computed(() => {
  const hidden = new Set(hiddenIds.value)
  return orderedSpreads.value.filter((s, i) => i === 0 || !hidden.has(s.id))
})
const visibleSpreads = computed(() => tickedSpreads.value.slice(0, shownCount.value))
/** Ticked rolls not on screen yet (behind "Show more") */
const moreCount = computed(() => Math.max(0, tickedSpreads.value.length - shownCount.value))
function showMore() {
  shownCount.value += HISTORY_PAGE
}
function showFewer() {
  shownCount.value = HISTORY_PAGE
}
/* ---------- Charts dropdown: a tickbox per roll ---------- */

const isTicked = (s: ProductSpread, i: number) => i === 0 || !hiddenIds.value.includes(s.id)
function setTicked(id: string, on: boolean) {
  const rest = hiddenIds.value.filter((h) => h !== id)
  hiddenIds.value = on ? rest : [...rest, id]
}
function tickAll() {
  hiddenIds.value = []
}
/** Untick everything but the first chart */
function tickFirstOnly() {
  hiddenIds.value = orderedSpreads.value.slice(1).map((s) => s.id)
}

const rollsOpen = ref(false)
const rollsEl = ref<HTMLElement | null>(null)
/** Close on a press outside the dropdown, or Escape */
function onDocPointer(e: PointerEvent) {
  if (rollsOpen.value && !rollsEl.value?.contains(e.target as Node)) rollsOpen.value = false
}
function onDocKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && rollsOpen.value) {
    rollsOpen.value = false
    rollsEl.value?.querySelector<HTMLElement>('.rolls-btn')?.focus()
  }
}
onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer)
  document.addEventListener('keydown', onDocKey)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointer)
  document.removeEventListener('keydown', onDocKey)
})

const columns = computed<PerRow>(() =>
  compact.value || visibleSpreads.value.length < 2 ? 1 : perRow.value,
)

/* ---------- Start (again) for each product; last, as it runs at once and uses everything above ---------- */
watch(
  () => props.product,
  () => {
    spreads.value = []
    mainId.value = ''
    shownCount.value = HISTORY_PAGE
    info.value = null
    dayCounts.clear()
    const saved = Number(readSaved().perRow)
    perRow.value = PER_ROW_OPTIONS.includes(saved as PerRow) ? (saved as PerRow) : 1
    const hidden = readSaved().hidden
    hiddenIds.value = Array.isArray(hidden)
      ? hidden.filter((id): id is string => typeof id === 'string')
      : []
    rollsOpen.value = false
    daySel.value = { from: lastDay.value, to: 0 }
    loadSpreads()
  },
  { immediate: true },
)
onUnmounted(() => spreadsCtl?.abort())
</script>

<template>
  <main ref="pageEl">
    <RouterLink to="/spreads" class="back">← All spreads</RouterLink>
    <h1>{{ title }}</h1>
    <p class="crumb">
      <template v-if="card">{{ card.path }} · </template>
      <template v-if="info">{{ info.exchange }} · {{ info.currency }} · </template>Calendar spread
    </p>

    <!-- Before the spreads load (or when there are none): one placeholder chart -->
    <section v-if="!spreads.length" class="card" aria-label="Price chart">
      <LineChart
        :points="NO_POINTS"
        :height="CHART_HEIGHTS[1]"
        relative-days
        :loading="loading"
        :error="error"
        :error-hint="errorHint"
        @retry="loadSpreads"
      >
        <template #empty>
          <span>
            No{{ fixedInterval ? ` ${fixedInterval}-min` : '' }} price data for {{ product }} yet.
            Upload one in <RouterLink to="/admin">Admin › Upload data</RouterLink>
          </span>
        </template>
      </LineChart>
    </section>

    <template v-else>
      <!-- Settings shared by every chart: interval, layout and the days shown -->
      <section class="card controls" aria-label="Chart settings">
        <div class="pickers">
          <label class="picker">
            <span class="picker-label">Interval</span>
            <span class="select-wrap">
              <select v-model.number="interval" :disabled="intervals.length < 2">
                <option v-for="iv in intervals" :key="iv" :value="iv">{{ iv }} min</option>
              </select>
              <AppIcon
                v-if="intervals.length > 1"
                name="chevron-down"
                :size="16"
                class="select-chev"
              />
            </span>
          </label>

          <div v-if="spreads.length > 1" ref="rollsEl" class="picker rolls">
            <span id="rolls-label" class="picker-label">Charts</span>
            <button
              type="button"
              class="rolls-btn"
              aria-haspopup="true"
              :aria-expanded="rollsOpen"
              aria-controls="rolls-menu"
              @click="rollsOpen = !rollsOpen"
            >
              {{ tickedSpreads.length }} of {{ spreads.length }} shown
              <AppIcon name="chevron-down" :size="16" class="rolls-chev" />
            </button>
            <div
              v-if="rollsOpen"
              id="rolls-menu"
              class="rolls-menu"
              role="group"
              aria-labelledby="rolls-label"
            >
              <div class="rolls-actions">
                <button type="button" @click="tickAll">Show all</button>
                <button type="button" @click="tickFirstOnly">First only</button>
              </div>
              <ul class="rolls-list">
                <li v-for="(s, i) in orderedSpreads" :key="s.id">
                  <label class="roll-option" :class="{ fixed: i === 0 }">
                    <input
                      type="checkbox"
                      :checked="isTicked(s, i)"
                      :disabled="i === 0"
                      @change="setTicked(s.id, ($event.target as HTMLInputElement).checked)"
                    />
                    <span class="roll-name">{{ s.front }}–{{ s.back }}</span>
                    <span class="roll-code">
                      {{ s.spreadName }}<template v-if="i === 0"> · first chart</template>
                    </span>
                  </label>
                </li>
              </ul>
            </div>
          </div>

          <div v-if="!compact && visibleSpreads.length > 1" class="picker">
            <span id="per-row-label" class="picker-label">Charts per row</span>
            <div class="seg" role="group" aria-labelledby="per-row-label">
              <button
                v-for="n in PER_ROW_OPTIONS"
                :key="n"
                type="button"
                :class="{ active: perRow === n }"
                :aria-pressed="perRow === n"
                :title="`${n} chart${n > 1 ? 's' : ''} per row`"
                @click="perRow = n"
              >
                {{ n }}
              </button>
            </div>
          </div>
        </div>

        <!-- Small screens: the same choice as a dropdown -->
        <label v-if="compact && dayOptions.length" class="picker days-picker">
          <span class="picker-label">Days</span>
          <span class="select-wrap">
            <select :value="dayChoice" @change="onDayChoice">
              <option v-for="o in dayOptions" :key="o.value" :value="o.value">
                {{ o.label }}
              </option>
            </select>
            <AppIcon name="chevron-down" :size="16" class="select-chev" />
          </span>
        </label>

        <div v-if="!compact && chipDays.length" class="ranges" role="group" aria-label="Days shown">
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
      </section>

      <div class="grid" :class="`per-${columns}`">
        <SpreadChartPanel
          v-for="(s, i) in visibleSpreads"
          :key="s.id"
          :product="product"
          :spread="s"
          :options="i === 0 ? spreads : undefined"
          @select="mainId = $event"
          :interval="interval"
          :days="daySel"
          :last-day="lastDay"
          :locked="compact"
          :height="CHART_HEIGHTS[columns]"
          :fixed-interval="fixedInterval"
          :hover-key="hoverKey"
          @hover-key="hoverKey = $event"
          @day-count="dayCounts.set(s.id, $event)"
        />
      </div>

      <div v-if="moreCount || shownCount > HISTORY_PAGE" class="more">
        <button v-if="moreCount" type="button" class="more-btn" @click="showMore">
          Show {{ Math.min(moreCount, HISTORY_PAGE) }} more
          <span class="more-count"
            >· {{ moreCount }} earlier roll{{ moreCount > 1 ? 's' : '' }} not shown</span
          >
        </button>
        <button
          v-if="shownCount > HISTORY_PAGE"
          type="button"
          class="more-btn quiet"
          @click="showFewer"
        >
          Show fewer
        </button>
      </div>
    </template>
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

.controls {
  display: flex;
  margin-bottom: 0.75rem;
  padding-block: 0.9rem;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.75rem;
}

/* ---------- Chart grid ---------- */
.grid {
  display: grid;
  gap: 0.75rem;
}
.grid.per-1 {
  grid-template-columns: minmax(0, 1fr);
}
.grid.per-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.grid.per-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
/* Not enough width for three readable charts: two per row instead */
@media (max-width: 960px) {
  .grid.per-3 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
/* …or for two: one per row */
@media (max-width: 720px) {
  .grid.per-2,
  .grid.per-3 {
    grid-template-columns: minmax(0, 1fr);
  }
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

/* ---------- Charts dropdown ---------- */
.rolls {
  position: relative;
}
.rolls-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.4rem;
  padding: 0.35rem 0.7rem 0.35rem 0.75rem;
  font: inherit;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--color-heading);
  background: var(--color-background-soft);
  border: 1px solid var(--color-border-hover);
  border-radius: 10px;
  cursor: pointer;
  white-space: nowrap;
}
.rolls-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.rolls-chev {
  color: var(--color-text-muted);
}
.rolls-menu {
  position: absolute;
  top: calc(100% + 0.35rem);
  left: 0;
  z-index: 20;
  width: min(18rem, calc(100vw - 2rem));
  padding: 0.4rem;
  border: 1px solid var(--color-border-hover);
  border-radius: 10px;
  background: var(--color-surface-raised);
  box-shadow: var(--shadow-card);
}
.rolls-actions {
  display: flex;
  gap: 0.25rem;
  padding: 0 0 0.4rem;
  margin-bottom: 0.3rem;
  border-bottom: 1px solid var(--color-border);
}
.rolls-actions button {
  flex: 1;
  min-height: 2rem;
  font: inherit;
  font-size: 0.85rem;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--color-accent);
  cursor: pointer;
}
.rolls-actions button:hover {
  background: var(--color-background-mute);
}
.rolls-list {
  max-height: 18rem;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;
}
.roll-option {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 2.4rem;
  padding: 0.25rem 0.5rem;
  border-radius: 7px;
  cursor: pointer;
  font-size: 0.9rem;
}
.roll-option:hover:not(.fixed) {
  background: var(--color-background-mute);
}
.roll-option.fixed {
  cursor: default;
}
.roll-option input {
  width: 1rem;
  height: 1rem;
  accent-color: var(--color-accent-solid);
}
.roll-name {
  font-weight: 500;
  color: var(--color-heading);
  font-variant-numeric: tabular-nums;
}
.roll-code {
  margin-left: auto;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
.rolls-actions button:focus-visible,
.roll-option:focus-within {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.more {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.more-btn {
  min-height: 2.4rem;
  padding: 0.35rem 1rem;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--color-heading);
  background: var(--color-background-soft);
  border: 1px solid var(--color-border-hover);
  border-radius: 10px;
  cursor: pointer;
}
.more-btn:hover {
  border-color: var(--color-accent);
}
.more-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.more-btn.quiet {
  background: transparent;
  color: var(--color-text-muted);
}
.more-count {
  font-weight: 400;
  color: var(--color-text-muted);
}

/* Segmented groups: the day chips and the charts-per-row switch */
.ranges,
.seg {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-background-soft);
}
.ranges button,
.seg button {
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
.seg button {
  min-width: 2.25rem;
}
.ranges button:hover:not(.active):not(.in):not(:disabled),
.seg button:hover:not(.active) {
  background: var(--color-background-mute);
}
.ranges button.active,
.seg button.active {
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
.ranges button:focus-visible,
.seg button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* Compact mode (narrow page): the Days dropdown takes its own full-width row */
.days-picker {
  flex: 1 1 100%;
}
.days-picker select {
  width: 100%;
  min-height: 2.75rem; /* comfortable tap target */
}

/*
 * Phones: the day group would wrap, stranding "All" on one line and the day strip on the next.
 * Instead it takes its own full-width row, never wraps, and the day chips share the width equally.
 */
@media (max-width: 640px) {
  .ranges {
    flex: 1 1 100%;
    flex-wrap: nowrap;
  }
  .ranges button {
    min-height: 2.5rem; /* easier to tap */
  }
  .day-strip {
    flex: 1;
    min-width: 0;
  }
  .day-strip button {
    flex: 1 1 0;
    min-width: 0;
    padding-inline: 0;
  }
}
</style>
