<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppDialog from '@/components/AppDialog.vue'
import { fetchPriceData, type PriceBar, type ProductSpread } from '@/api/priceData'
import { MYT, formatDate, tradingDayKey } from '@/utils/time'

/**
 * Buy / sell volume per trading day for each roll, T-lastDay … T-0, one table per roll.
 * Buy = AVol (traded at the ask), Sell = BVol (traded at the bid). Days split exactly as the
 * charts split them: 06:00 MYT, T-0 = the roll's newest trading day.
 */
const props = defineProps<{
  /** Rolls to tabulate, in the order shown */
  spreads: ProductSpread[]
  /** Bar length in minutes (the page's interval) */
  interval: number
  /** Oldest row: T-lastDay */
  lastDay: number
}>()

const open = defineModel<boolean>('open', { required: true })

const DAY_START_HOUR = 6

interface DayRow {
  t: number
  /** "06/11/2026", or '' when the roll has no data that day */
  date: string
  buy: number | null
  sell: number | null
}
interface RollTable {
  spread: ProductSpread
  state: 'loading' | 'error' | 'ready'
  error?: string
  rows: DayRow[]
  /** No bar of this roll carries AVol / BVol (file uploaded without them) */
  noVolume: boolean
}

const tables = ref<Record<string, RollTable>>({})
let ctl: AbortController | undefined

function tabulate(spread: ProductSpread, bars: PriceBar[]): RollTable {
  // Sum AVol / BVol per trading day, newest day first
  const days: { key: string; buy: number; sell: number; hasVol: boolean }[] = []
  for (let i = bars.length - 1; i >= 0; i--) {
    const b = bars[i]!
    const key = tradingDayKey(b.timestamp, MYT.zone, DAY_START_HOUR)
    let d = days[days.length - 1]
    if (!d || d.key !== key) {
      if (days.length > props.lastDay) break
      d = { key, buy: 0, sell: 0, hasVol: false }
      days.push(d)
    }
    if (typeof b.aVol === 'number') ((d.buy += b.aVol), (d.hasVol = true))
    if (typeof b.bVol === 'number') ((d.sell += b.bVol), (d.hasVol = true))
  }
  const rows: DayRow[] = []
  for (let t = props.lastDay; t >= 0; t--) {
    const d = days[t]
    rows.push({
      t,
      date: d ? formatDate(d.key) : '',
      buy: d?.hasVol ? d.buy : null,
      sell: d?.hasVol ? d.sell : null,
    })
  }
  return { spread, state: 'ready', rows, noVolume: !days.some((d) => d.hasVol) }
}

async function load() {
  ctl?.abort()
  ctl = new AbortController()
  const signal = ctl.signal
  const interval = props.interval
  tables.value = Object.fromEntries(
    props.spreads.map((s) => [s.id, { spread: s, state: 'loading', rows: [], noVolume: false }]),
  )
  await Promise.all(
    props.spreads.map(async (s) => {
      try {
        const res = await fetchPriceData(s.id, interval, signal)
        tables.value[s.id] = tabulate(s, res.data)
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        tables.value[s.id] = {
          spread: s,
          state: 'error',
          error: (e as Error).message,
          rows: [],
          noVolume: false,
        }
      }
    }),
  )
}

// Fresh figures each time it opens (and if the rolls or interval change while open)
watch([open, () => props.spreads.map((s) => s.id).join(), () => props.interval], ([isOpen]) => {
  if (isOpen && props.interval) load()
  else ctl?.abort()
})

const list = computed(() => props.spreads.map((s) => tables.value[s.id]).filter(Boolean))

const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const show = (v: number | null) => (v === null ? '–' : num.format(v))
const total = (r: DayRow) =>
  r.buy === null && r.sell === null ? null : (r.buy ?? 0) + (r.sell ?? 0)
function sum(rows: DayRow[], pick: (r: DayRow) => number | null) {
  const vals = rows.map(pick).filter((v): v is number => v !== null)
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null
}
const title = (s: ProductSpread) => `${s.front.slice(0, 3)}/${s.back.slice(0, 3)}`
const fullName = (s: ProductSpread) => `${s.front}–${s.back}`
</script>

<template>
  <AppDialog
    v-model:open="open"
    wide
    title="Volume by day"
    :subtitle="`Buy = AVol (at the ask), Sell = BVol (at the bid) · T-${lastDay} to T-0, each roll's own days`"
  >
    <div class="body vol-body">
      <p v-if="!list.length" class="empty">No rolls to show.</p>
      <section
        v-for="tb in list"
        :key="tb!.spread.id"
        class="roll"
        :aria-label="`${fullName(tb!.spread)} volume`"
      >
        <h3 :title="`${fullName(tb!.spread)} · ${tb!.spread.spreadName}`">
          {{ title(tb!.spread) }}
          <span class="year">{{ fullName(tb!.spread) }}</span>
        </h3>
        <p v-if="tb!.state === 'loading'" class="note">Loading…</p>
        <p v-else-if="tb!.state === 'error'" class="note err">{{ tb!.error }}</p>
        <table v-else>
          <thead>
            <tr>
              <th scope="col" class="day"><span class="sr-only">Day</span></th>
              <th scope="col" class="buy">Buy Vol</th>
              <th scope="col">Sell Vol</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in tb!.rows" :key="r.t">
              <th scope="row" class="day" :title="r.date || 'No data this day'">
                T-{{ r.t }}<span v-if="r.date" class="date">{{ r.date.slice(0, 5) }}</span>
              </th>
              <td class="buy">{{ show(r.buy) }}</td>
              <td>{{ show(r.sell) }}</td>
              <td class="tot">{{ show(total(r)) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" class="day">Total</th>
              <td class="buy">{{ show(sum(tb!.rows, (r) => r.buy)) }}</td>
              <td>{{ show(sum(tb!.rows, (r) => r.sell)) }}</td>
              <td class="tot">{{ show(sum(tb!.rows, total)) }}</td>
            </tr>
          </tfoot>
        </table>
        <p v-if="tb!.state === 'ready' && tb!.noVolume" class="note">
          This roll's data has no AVol / BVol.
        </p>
      </section>
    </div>
  </AppDialog>
</template>

<style scoped>
.vol-body {
  display: grid !important;
  grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
  gap: 1rem;
  padding: 1rem 1.25rem 1.25rem;
  overflow-y: auto;
}
.empty {
  color: var(--color-text-muted);
}

.roll {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-background);
  overflow: hidden;
}
h3 {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-heading);
  background: var(--color-background-mute);
  border-bottom: 1px solid var(--color-border);
}
.year {
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--color-text-muted);
}
.note {
  padding: 0.75rem;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
.note.err {
  color: var(--color-danger, #e5484d);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}
th,
td {
  padding: 0.3rem 0.6rem;
  text-align: right;
  white-space: nowrap;
}
thead th {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-muted);
}
tbody tr + tr,
tfoot tr {
  border-top: 1px solid var(--color-border);
}
th.day {
  text-align: left;
  font-weight: 600;
  color: var(--color-heading);
}
.date {
  margin-left: 0.4rem;
  font-size: 0.7rem;
  font-weight: 400;
  color: var(--color-text-muted);
}
td.buy {
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
}
td.tot {
  color: var(--color-text-muted);
}
tfoot td,
tfoot th {
  font-weight: 600;
  color: var(--color-heading);
}
tfoot tr {
  border-top: 2px solid var(--color-border-hover);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

@media (max-width: 480px) {
  .vol-body {
    padding: 0.75rem;
    gap: 0.75rem;
  }
}
</style>
