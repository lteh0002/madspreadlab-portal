<script setup lang="ts">
import BackLink from '@/components/BackLink.vue'
import { computed, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import LineChart, { type ChartView, type LinePoint } from '@/components/LineChart.vue'
import { fetchSpreadCloses } from '@/api/spreadChart'
import { findSpread } from '@/data/spreads'
import { usePageTitle } from '@/composables/usePageTitle'

const props = defineProps<{ spreadName: string }>()

/** Trading days shown per range button; the chart can still be panned/zoomed past these */
const RANGES = [
  { label: '1M', days: 22 },
  { label: '3M', days: 65 },
  { label: '6M', days: 130 },
  { label: '1Y', days: 250 },
  { label: 'All', days: Infinity },
] as const
const DEFAULT_DAYS = 65

const chartRef = useTemplateRef<InstanceType<typeof LineChart>>('chart')
const points = ref<LinePoint[]>([])
const view = ref<ChartView | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
let controller: AbortController | undefined

const spread = computed(() => findSpread(`${props.spreadName}-chart`))
const title = computed(() => spread.value?.pageTitle ?? `${props.spreadName} Chart`)
usePageTitle(title)
const shortName = computed(() => spread.value?.label?.replace(/ Chart$/, '') ?? props.spreadName)

/** A range button is lit only while the window exactly matches it (any pan or zoom clears it) */
const activeRange = computed(() => {
  const v = view.value
  if (!v?.atLatest) return null
  return RANGES.find((r) => Math.min(r.days, v.total) === v.count)?.label ?? null
})

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const period = computed(() => {
  const v = view.value
  if (!v || !points.value.length) return ''
  const fmt = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`))
  return `${fmt(v.from)} – ${fmt(v.to)} · ${v.count} trading days`
})

async function load() {
  controller?.abort() // drop a request still in flight for another spread
  controller = new AbortController()
  loading.value = true
  error.value = null
  try {
    // Whole history up front so the chart can pan without refetching
    const data = await fetchSpreadCloses({ spreadName: props.spreadName }, controller.signal)
    points.value = data.map((d) => ({ date: d.date, value: d.close }))
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

watch(() => props.spreadName, load, { immediate: true })
onUnmounted(() => controller?.abort())
</script>

<template>
  <main>
    <BackLink to="/spreads">All spreads</BackLink>
    <h1>{{ title }}</h1>
    <p class="crumb">Indices · JPX <span class="badge">Placeholder data</span></p>

    <section class="card" aria-label="Closing price chart">
      <header class="card-head">
        <div>
          <h2>Closing price</h2>
          <p class="period">{{ period }}</p>
        </div>
        <div class="ranges" role="group" aria-label="Date range">
          <button
            v-for="r in RANGES"
            :key="r.label"
            type="button"
            :class="{ active: activeRange === r.label }"
            :aria-pressed="activeRange === r.label"
            @click="chartRef?.showLatest(r.days)"
          >
            {{ r.label }}
          </button>
        </div>
      </header>

      <LineChart
        ref="chart"
        :points="points"
        :initial-count="DEFAULT_DAYS"
        value-label="Close"
        :aria-label="`${shortName} closing price, ${period}`"
        :loading="loading"
        :error="error"
        @view-change="view = $event"
        @retry="load"
      />
      <p class="hint">Drag to pan · Ctrl/⌘ + scroll or pinch to zoom</p>
    </section>
  </main>
</template>

<style scoped>
h1 {
  font-size: 1.6rem;
  font-weight: 600;
  color: var(--color-heading);
}

.crumb {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 1.25rem;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.badge {
  padding: 0.05rem 0.5rem;
  border: 1px dashed var(--color-border-hover);
  border-radius: 999px;
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
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
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

h2 {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--color-heading);
}

.period {
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
.ranges button:hover:not(.active) {
  background: var(--color-background-mute);
}
.ranges button.active {
  background: var(--color-accent-solid);
  color: var(--color-on-accent);
}
.ranges button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
