<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { RouterLink, onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import {
  fetchManagedProducts,
  setSpreadFairValue,
  type ManagedProduct,
  type ManagedSpread,
} from '@/api/products'
import { useAutoRetry } from '@/composables/useAutoRetry'
import { MYT, dayKey } from '@/utils/time'

const route = useRoute()
const router = useRouter()

const products = ref<ManagedProduct[]>([])
let controller: AbortController | undefined
const { loading, error, errorHint, begin, succeed, fail } = useAutoRetry(load)

async function load() {
  controller?.abort()
  controller = new AbortController()
  begin()
  try {
    // This page manages index spreads only
    products.value = await fetchManagedProducts('indices', controller.signal)
    for (const p of products.value) for (const s of p.spreads) resetRow(s)
    succeed()
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    fail(e)
  }
}

onMounted(load)
onUnmounted(() => {
  controller?.abort()
  for (const r of Object.values(rows)) {
    r.ctl?.abort()
    clearTimeout(r.savedTimer)
  }
})

/* ---------- Fair value editing: one numbers-only input per spread, saved with its Update button ---------- */

interface RowState {
  /** What's in the input */
  draft: string
  /** The value as last saved on the server */
  saved: number | null
  status: 'idle' | 'saving' | 'saved' | 'error'
  message: string
  ctl?: AbortController
  savedTimer?: ReturnType<typeof setTimeout>
}

const rows = reactive<Record<string, RowState>>({})

const show = (v: number | null) => (v === null ? '' : String(v))

function resetRow(s: ManagedSpread) {
  rows[s.id] = { draft: show(s.fairValue), saved: s.fairValue, status: 'idle', message: '' }
}

/**
 * Keep only what a number can hold: digits, one leading minus, one decimal point.
 * Typed or pasted letters, spaces and commas are dropped; "−" (Unicode minus) becomes "-".
 */
function sanitize(text: string): string {
  let out = ''
  let dot = false
  for (const ch of text.replace(/[\u2212\u2013]/g, '-')) {
    if (ch >= '0' && ch <= '9') out += ch
    else if (ch === '-' && out === '') out += ch
    else if (ch === '.' && !dot) {
      dot = true
      out += ch
    }
  }
  return out
}

/** Filter what was typed or pasted, keeping the caret where it was */
function onInput(s: ManagedSpread, e: Event) {
  const r = rows[s.id]
  const el = e.target as HTMLInputElement
  if (!r) return
  const clean = sanitize(el.value)
  if (clean !== el.value) {
    const caret = sanitize(el.value.slice(0, el.selectionStart ?? el.value.length)).length
    el.value = clean
    el.setSelectionRange(caret, caret)
  }
  r.draft = clean
  if (r.status === 'error' || r.status === 'saved') r.status = 'idle'
}

/** "" → null (clear); "-3.5" → number; an unfinished "-" or "." → undefined */
function parse(text: string): number | null | undefined {
  const t = text.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

/** The input holds a complete number (or is empty) that differs from what's saved */
function isDirty(r: RowState | undefined) {
  if (!r) return false
  const v = parse(r.draft)
  return v !== undefined && v !== r.saved
}

const hasUnsaved = computed(() => Object.values(rows).some(isDirty))

async function save(s: ManagedSpread) {
  const r = rows[s.id]
  if (!r || r.status === 'saving' || !isDirty(r)) return
  const value = parse(r.draft)!

  r.ctl?.abort()
  r.ctl = new AbortController()
  clearTimeout(r.savedTimer)
  r.status = 'saving'
  r.message = ''
  try {
    const savedValue = await setSpreadFairValue(s.id, value, r.ctl.signal)
    r.saved = savedValue
    s.fairValue = savedValue
    // Only overwrite the input if it still holds what was sent
    if (parse(r.draft) === value) r.draft = show(savedValue)
    r.status = 'saved'
    r.message = savedValue === null ? 'Cleared' : 'Saved'
    r.savedTimer = setTimeout(() => {
      if (r.status === 'saved') r.status = 'idle'
    }, 2000)
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    r.status = 'error'
    r.message = (e as Error).message
  }
}

/** Escape: put back the saved value */
function revert(s: ManagedSpread) {
  const r = rows[s.id]
  if (!r || r.status === 'saving') return
  r.draft = show(r.saved)
  r.status = 'idle'
}

/* Leaving with edits not yet updated: ask first */
onBeforeRouteLeave(() =>
  hasUnsaved.value ? window.confirm("Some fair values haven't been updated. Leave anyway?") : true,
)
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!hasUnsaved.value) return
  e.preventDefault()
  e.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onUnmounted(() => window.removeEventListener('beforeunload', onBeforeUnload))

/* ---------- What's on screen: one product, one year, optionally only spreads missing a value ---------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Jul26" → months since 2000, for sorting */
const monthNumber = (c: string) => Number(c.slice(3)) * 12 + MONTHS.indexOf(c.slice(0, 3))
/** A spread is listed under its front contract's year: "Dec26"–"Jan27" is 2026 */
const yearOf = (s: ManagedSpread) => 2000 + Number(s.front.slice(3))
const isMissing = (s: ManagedSpread) => s.fairValue === null
const missingCount = (list: ManagedSpread[]) => list.filter(isMissing).length

const currentYear = Number(dayKey(new Date().toISOString(), MYT.zone).slice(0, 4))

const PREFS_KEY = 'manageProducts.prefs'
function readPrefs(): { product?: unknown; missingOnly?: unknown } {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') ?? {}
  } catch {
    return {}
  }
}

const selectedName = ref('')
const selectedYear = ref<number | null>(null)
const missingOnly = ref(readPrefs().missingOnly === true)

const product = computed(() => products.value.find((p) => p.name === selectedName.value))

/** Years the product has spreads in, oldest first */
const years = computed(() =>
  [...new Set((product.value?.spreads ?? []).map(yearOf))].sort((a, b) => a - b),
)

function defaultYear(list: number[]): number | null {
  if (!list.length) return null
  if (list.includes(currentYear)) return currentYear
  const past = list.filter((y) => y < currentYear)
  return past.length ? past[past.length - 1]! : list[list.length - 1]!
}

/** Product: the link's (?product=FKLI), else the last one picked here, else the first */
watch(products, (list) => {
  if (list.some((p) => p.name === selectedName.value)) return
  const wanted = [route.query.product, readPrefs().product]
  const found = wanted.find((n) => typeof n === 'string' && list.some((p) => p.name === n))
  selectedName.value = (found as string | undefined) ?? list[0]?.name ?? ''
})

/** Year: the link's (?year=2026) when the product has it, else this year, or the nearest */
watch(years, (list) => {
  if (selectedYear.value !== null && list.includes(selectedYear.value)) return
  const fromUrl = Number(route.query.year)
  selectedYear.value = list.includes(fromUrl) ? fromUrl : defaultYear(list)
})

function syncUrl() {
  const query: Record<string, string> = { ...(route.query as Record<string, string>) }
  if (selectedName.value) query.product = selectedName.value
  if (selectedYear.value !== null) query.year = String(selectedYear.value)
  else delete query.year
  router.replace({ query })
}

function selectProduct(name: string) {
  if (name === selectedName.value) return
  selectedName.value = name
  // The year watcher keeps the year if the new product has it, else picks a default
}
function onYearChange(e: Event) {
  selectedYear.value = Number((e.target as HTMLSelectElement).value)
}

watch([selectedName, selectedYear], syncUrl)
watch([selectedName, missingOnly], () => {
  try {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ product: selectedName.value, missingOnly: missingOnly.value }),
    )
  } catch {
    // storage blocked (private mode): the choice just isn't remembered
  }
})

/** The selected product's spreads in the selected year, by month */
const yearSpreads = computed(() =>
  (product.value?.spreads ?? [])
    .filter((s) => yearOf(s) === selectedYear.value)
    .sort((a, b) => monthNumber(a.front) - monthNumber(b.front) || a.months - b.months),
)

/*
 * With "Missing only", a spread you've just filled in stays on screen until you change product,
 * year or the switch, so rows don't vanish from under you while you type.
 */
const keepIds = ref(new Set<string>())
watch(
  [selectedName, selectedYear, missingOnly, () => products.value],
  () => {
    keepIds.value = new Set(yearSpreads.value.filter(isMissing).map((s) => s.id))
  },
  { immediate: true },
)

const shownSpreads = computed(() =>
  missingOnly.value
    ? yearSpreads.value.filter((s) => isMissing(s) || keepIds.value.has(s.id))
    : yearSpreads.value,
)

const missingInYear = (y: number) =>
  missingCount((product.value?.spreads ?? []).filter((s) => yearOf(s) === y))

const barsFmt = new Intl.NumberFormat('en-US')
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
</script>

<template>
  <main>
    <RouterLink to="/admin" class="back">← Admin</RouterLink>
    <h1>Manage indices spreads</h1>
    <p class="crumb">
      Type a spread's fair value and press Update to save it. Empty the field and press Clear to
      remove it. Numbers on the chips count spreads without a fair value.
    </p>

    <div v-if="loading || error" class="state" :aria-busy="loading">
      <div v-if="error" role="alert">
        <p class="state-title">{{ error }}</p>
        <p class="state-hint">{{ errorHint }}</p>
        <button type="button" class="retry" @click="load">Retry now</button>
      </div>
      <template v-else>
        <span v-for="i in 3" :key="i" class="bar" aria-hidden="true" />
        <span class="sr-only" role="status">Loading products…</span>
      </template>
    </div>

    <div v-else-if="products.length === 0" class="state">
      <p class="state-title">No index products yet</p>
      <p class="state-hint">Add one from the Admin page with Product type set to Indices.</p>
    </div>

    <template v-else>
      <div class="pickers">
        <div class="picker">
          <span id="product-label" class="picker-label">Product</span>
          <div class="seg" role="group" aria-labelledby="product-label">
            <button
              v-for="p in products"
              :key="p._id"
              type="button"
              :class="{ active: p.name === selectedName }"
              :aria-pressed="p.name === selectedName"
              @click="selectProduct(p.name)"
            >
              {{ p.name }}
              <span
                v-if="missingCount(p.spreads)"
                class="count"
                :title="`${plural(missingCount(p.spreads), 'spread')} without a fair value`"
              >
                {{ missingCount(p.spreads) }}
              </span>
            </button>
          </div>
        </div>

        <label v-if="years.length" class="picker">
          <span class="picker-label">Year</span>
          <span class="select-wrap">
            <select :value="selectedYear" @change="onYearChange">
              <option v-for="y in [...years].reverse()" :key="y" :value="y">
                {{ y }}{{ missingInYear(y) ? ` (${missingInYear(y)} missing)` : '' }}
              </option>
            </select>
            <AppIcon name="chevron-down" :size="16" class="select-chev" />
          </span>
        </label>

        <label v-if="years.length" class="switch">
          <input v-model="missingOnly" type="checkbox" role="switch" />
          <span class="track" aria-hidden="true"><span class="thumb" /></span>
          Missing only
        </label>
      </div>

      <section v-if="product" class="product">
        <header class="product-head">
          <h2>{{ product.name }}</h2>
          <span class="meta">
            {{ product.exchange }} · {{ product.currency }} ·
            {{ plural(product.spreads.length, 'spread') }}
            <template v-if="missingCount(product.spreads)">
              · {{ missingCount(product.spreads) }} missing a fair value
            </template>
          </span>
        </header>

        <p v-if="product.spreads.length === 0" class="empty">
          No spreads yet. They're created when you upload price data.
        </p>

        <p v-else-if="shownSpreads.length === 0" class="empty">
          Every {{ product.name }} spread in {{ selectedYear }} has a fair value.
        </p>

        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Spread</th>
                <th scope="col" class="num bars-col">Bars</th>
                <th scope="col" class="fv-col">Fair value</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in shownSpreads" :key="s.id">
                <th scope="row">
                  <span class="spread-label">{{ s.front }}–{{ s.back }}</span>
                  <span class="spread-sub">{{ s.spreadName }}</span>
                </th>
                <td class="num bars bars-col">{{ barsFmt.format(s.bars) }}</td>
                <td class="fv-col">
                  <div v-if="rows[s.id]" class="fv">
                    <input
                      :value="rows[s.id]!.draft"
                      type="text"
                      autocomplete="off"
                      spellcheck="false"
                      placeholder="—"
                      :aria-label="`Fair value for ${product.name} ${s.front}–${s.back}`"
                      :aria-invalid="rows[s.id]!.status === 'error'"
                      :aria-describedby="`fv-msg-${s.id}`"
                      :readonly="rows[s.id]!.status === 'saving'"
                      :class="{
                        invalid: rows[s.id]!.status === 'error',
                        dirty: isDirty(rows[s.id]),
                      }"
                      @input="onInput(s, $event)"
                      @keydown.esc="revert(s)"
                    />
                    <button
                      type="button"
                      class="update"
                      :disabled="!isDirty(rows[s.id]) || rows[s.id]!.status === 'saving'"
                      :aria-label="`Update fair value for ${product.name} ${s.front}–${s.back}`"
                      @click="save(s)"
                    >
                      {{
                        rows[s.id]!.draft === '' && rows[s.id]!.saved !== null ? 'Clear' : 'Update'
                      }}
                    </button>
                    <span
                      :id="`fv-msg-${s.id}`"
                      class="fv-status"
                      :class="rows[s.id]!.status"
                      role="status"
                    >
                      <template v-if="rows[s.id]!.status === 'saving'">
                        <span class="spinner" aria-hidden="true" />
                        <span class="sr-only">Saving…</span>
                      </template>
                      <template v-else-if="rows[s.id]!.status === 'saved'">
                        <AppIcon name="check" :size="16" :stroke-width="2.5" />
                        <span class="sr-only">{{ rows[s.id]!.message }}</span>
                      </template>
                    </span>
                  </div>
                  <p v-if="rows[s.id]?.status === 'error'" class="fv-error">
                    {{ rows[s.id]!.message }}
                  </p>
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
  max-width: 40rem;
  margin-bottom: 1.5rem;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.pickers {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem 1.25rem;
  margin-bottom: 1.5rem;
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
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 3.25rem;
  min-height: 2rem;
  padding: 0.25rem 0.7rem;
  justify-content: center;
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

.seg button.active {
  background: var(--color-accent-solid);
  color: var(--color-on-accent);
}

.seg button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
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

/* Spreads without a fair value */
.count {
  min-width: 1.2rem;
  padding: 0 0.3rem;
  font-size: 0.7rem;
  font-weight: 600;
  line-height: 1.2rem;
  text-align: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-reference) 22%, transparent);
  color: var(--color-reference);
}

.seg button.active .count {
  background: rgb(255 255 255 / 0.22);
  color: inherit;
}

/* "Missing only" switch */
.switch {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.5rem;
  font-size: 0.85rem;
  color: var(--color-text);
  cursor: pointer;
  user-select: none;
}

.switch input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}

.track {
  position: relative;
  width: 2.25rem;
  height: 1.3rem;
  border-radius: 999px;
  background: var(--color-background-mute);
  border: 1px solid var(--color-border-hover);
  transition: background 0.15s;
}

.thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: calc(1.3rem - 6px);
  height: calc(1.3rem - 6px);
  border-radius: 50%;
  background: var(--color-text-muted);
  transition:
    transform 0.15s,
    background 0.15s;
}

.switch input:checked + .track {
  background: var(--color-accent-solid);
  border-color: var(--color-accent-solid);
}

.switch input:checked + .track .thumb {
  transform: translateX(0.95rem);
  background: #fff;
}

.switch input:focus-visible + .track {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .track,
  .thumb {
    transition: none;
  }
}

.product-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.75rem;
  margin-bottom: 0.5rem;
}

h2 {
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--color-heading);
}

.meta {
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.empty {
  padding: 1rem;
  font-size: 0.9rem;
  color: var(--color-text-muted);
  border: 1px dashed var(--color-border);
  border-radius: 8px;
}

.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
}

th,
td {
  padding: 0.55rem 1rem;
  text-align: left;
  vertical-align: middle;
  border-bottom: 1px solid var(--color-border);
}

tbody tr:last-child > * {
  border-bottom: none;
}

thead th {
  background: var(--color-background-mute);
  color: var(--color-heading);
  font-weight: 600;
  white-space: nowrap;
}

tbody th {
  font-weight: normal;
  white-space: nowrap;
}

.spread-label {
  display: block;
  font-weight: 600;
  color: var(--color-heading);
}

.spread-sub {
  display: block;
  font-size: 0.72rem;
  color: var(--color-text-muted);
}

.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.bars {
  color: var(--color-text-muted);
}

.fv-col {
  width: 1%;
  white-space: nowrap;
}

.fv {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

input {
  width: 7.5rem;
  min-height: 2.25rem;
  padding: 0.3rem 0.6rem;
  font: inherit;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--color-heading);
  background: var(--color-background-soft);
  border: 1px solid var(--color-border-hover);
  border-radius: 8px;
}

input::placeholder {
  color: var(--color-text-muted);
}

input:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
  border-color: transparent;
}

input.dirty {
  border-color: var(--color-accent-border);
  background: var(--color-accent-soft);
}

input[readonly] {
  opacity: 0.7;
}

.update {
  min-width: 4.5rem;
  min-height: 2.25rem;
  padding: 0.3rem 0.75rem;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  border: 1px solid var(--color-accent-solid);
  border-radius: 8px;
  background: var(--color-accent-solid);
  color: var(--color-on-accent);
  cursor: pointer;
}

.update:hover:not(:disabled) {
  filter: brightness(1.1);
}

.update:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.update:disabled {
  border-color: var(--color-border-hover);
  background: transparent;
  color: var(--color-text-muted);
  cursor: default;
}

input.invalid {
  border-color: #dc2626;
}

.fv-status {
  display: grid;
  place-items: center;
  width: 1.1rem;
  height: 1.1rem;
  color: var(--color-accent);
}

.spinner {
  width: 0.9rem;
  height: 0.9rem;
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

.fv-error {
  max-width: 12rem;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  white-space: normal;
  color: #ef4444;
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

.retry {
  margin-top: 0.75rem;
  padding: 0.4rem 0.9rem;
  font: inherit;
  font-size: 0.9rem;
  border: 1px solid var(--color-accent-border);
  border-radius: 6px;
  background: transparent;
  color: var(--color-accent);
  cursor: pointer;
}

.retry:hover {
  background: var(--color-accent-soft);
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
  .bar,
  .spinner {
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
    padding: 0.5rem 0.7rem;
  }

  input {
    width: 6.5rem;
  }
}

/* Narrow phones: the fair value field matters more than the bar count */
@media (max-width: 420px) {
  .bars-col {
    display: none;
  }
}
</style>
