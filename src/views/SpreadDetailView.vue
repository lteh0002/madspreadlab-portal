<script setup lang="ts">
import BackLink from '@/components/BackLink.vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import SpreadTable, { type DailyCashRow } from '@/components/SpreadTable.vue'
import { fetchJpxCash, type JpxCashQuery, type JpxCashRecord } from '@/api/jpxCash'
import { findSpread } from '@/data/spreads'
import { formatDate } from '@/utils/time'

const props = defineProps<{ spreadName: string }>()

const SESSIONS = ['10:30', '14:30'] as const
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const LATEST_DAYS = 30
const RETRY_SECONDS = 10

const records = ref<JpxCashRecord[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const retryIn = ref(0)

/** null = default view (latest 30 days with data); otherwise a user-picked range */
const range = ref<{ from: string; to: string } | null>(null)
const fromInput = ref('')
const toInput = ref('')

let controller: AbortController | undefined
let retryTimer: ReturnType<typeof setInterval> | undefined

const title = computed(() => {
  const spread = findSpread(props.spreadName)
  return spread?.pageTitle ?? `${spread?.label ?? props.spreadName} Cash Values`
})

const errorHint = computed(() =>
  retryIn.value > 0 ? `Retrying in ${retryIn.value}s…` : 'Retrying…',
)

const rangeInvalid = computed(
  () => !fromInput.value || !toInput.value || fromInput.value > toInput.value,
)

// One row per date with a column per session, newest first.
// Filtering here too keeps the page correct even if the API ignores the query params.
const rows = computed<DailyCashRow[]>(() => {
  const byDate = new Map<string, DailyCashRow>()
  for (const r of records.value) {
    if (r.spread_name !== props.spreadName) continue
    const date = r.date.slice(0, 10)
    if (range.value && (date < range.value.from || date > range.value.to)) continue
    let row = byDate.get(date)
    if (!row) {
      row = { date, day: WEEKDAYS[new Date(r.date).getUTCDay()]!, sessions: {} }
      byDate.set(date, row)
    }
    row.sessions[r.session] = r.value
  }
  const sorted = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date))
  return range.value ? sorted : sorted.slice(0, LATEST_DAYS)
})

const summary = computed(() => {
  if (loading.value || error.value) return ''
  const n = rows.value.length
  const days = `${n} trading day${n === 1 ? '' : 's'}`
  return range.value
    ? `${days} from ${formatDate(range.value.from)} to ${formatDate(range.value.to)}`
    : `Latest ${days}`
})

function stopRetryTimer() {
  clearInterval(retryTimer)
  retryTimer = undefined
}

// Count down, then try again automatically
function scheduleRetry() {
  stopRetryTimer()
  retryIn.value = RETRY_SECONDS
  retryTimer = setInterval(() => {
    retryIn.value -= 1
    if (retryIn.value <= 0) {
      stopRetryTimer()
      load()
    }
  }, 1000)
}

async function load() {
  stopRetryTimer()
  controller?.abort() // cancel a request still in flight for an older range
  controller = new AbortController()
  // Keep the error overlay up while retrying, so the screen doesn't flicker
  if (!error.value) loading.value = true
  retryIn.value = 0

  const query: JpxCashQuery = range.value
    ? { spreadName: props.spreadName, ...range.value }
    : { spreadName: props.spreadName, latestDays: LATEST_DAYS }

  try {
    records.value = await fetchJpxCash(query, controller.signal)
    error.value = null
    // In the default view, prefill the pickers with the range actually shown
    if (!range.value && rows.value.length) {
      fromInput.value = rows.value[rows.value.length - 1]!.date
      toInput.value = rows.value[0]!.date
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    error.value = (e as Error).message
    scheduleRetry()
  } finally {
    loading.value = false
  }
}

function applyRange() {
  if (rangeInvalid.value) return
  range.value = { from: fromInput.value, to: toInput.value }
  load()
}

function resetRange() {
  range.value = null
  load()
}

onMounted(load)
onUnmounted(() => {
  controller?.abort()
  stopRetryTimer()
})
</script>

<template>
  <main>
    <BackLink to="/spreads">All spreads</BackLink>
    <h1>{{ title }}</h1>

    <form class="filters" @submit.prevent="applyRange">
      <label>
        From
        <input v-model="fromInput" type="date" :max="toInput || undefined" required />
      </label>
      <label>
        To
        <input v-model="toInput" type="date" :min="fromInput || undefined" required />
      </label>
      <button type="submit" class="btn primary" :disabled="rangeInvalid">Show</button>
      <button v-if="range" type="button" class="btn" @click="resetRange">
        Latest {{ LATEST_DAYS }} trading days
      </button>
      <span class="summary">{{ summary }}</span>
    </form>

    <SpreadTable
      :rows="rows"
      :sessions="SESSIONS"
      :loading="loading"
      :error="error"
      :error-hint="errorHint"
      @retry="load"
    />
  </main>
</template>

<style scoped>
h1 {
  font-size: 1.6rem;
  font-weight: 600;
  color: var(--color-heading);
  margin-bottom: 0.75rem;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8rem;
  opacity: 0.85;
}

input[type='date'] {
  padding: 0.35rem 0.5rem;
  font: inherit;
  font-size: 0.9rem;
  color: var(--color-text);
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color-scheme: light dark;
}

.summary {
  margin-left: auto;
  font-size: 0.85rem;
  opacity: 0.6;
  align-self: center;
}
</style>
