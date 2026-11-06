<script setup lang="ts">
import { computed } from 'vue'

export interface DailyCashRow {
  /** YYYY-MM-DD */
  date: string
  /** Short weekday name, e.g. "Mon" */
  day: string
  /** Value per session time, e.g. { '10:30': 714, '14:30': 702 } */
  sessions: Record<string, number | undefined>
}

const props = withDefaults(
  defineProps<{
    rows: DailyCashRow[]
    sessions: readonly string[]
    loading?: boolean
    /** When set, shows skeleton rows with this message and a Retry button on top */
    error?: string | null
    /** Shown under the error message, e.g. "Retrying in 8s…" */
    errorHint?: string
  }>(),
  { loading: false, error: null, errorHint: '' },
)

defineEmits<{ retry: [] }>()

const SKELETON_ROWS = 8

const fmt = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})

function cellClass(v: number | undefined) {
  return { pos: v !== undefined && v > 0, neg: v !== undefined && v < 0 }
}

const showSkeleton = computed(() => props.loading || !!props.error)
</script>

<template>
  <div class="table-wrap" :aria-busy="loading">
    <table>
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">Day</th>
          <th v-for="s in sessions" :key="s" scope="col" class="num">{{ s }}</th>
        </tr>
      </thead>
      <tbody v-if="showSkeleton" class="skeleton" aria-hidden="true">
        <tr v-for="i in SKELETON_ROWS" :key="i">
          <td><span class="bar w-date" /></td>
          <td><span class="bar w-day" /></td>
          <td v-for="s in sessions" :key="s" class="num"><span class="bar w-num" /></td>
        </tr>
      </tbody>
      <tbody v-else>
        <tr v-for="row in rows" :key="row.date">
          <td>{{ row.date }}</td>
          <td>{{ row.day }}</td>
          <td v-for="s in sessions" :key="s" class="num" :class="cellClass(row.sessions[s])">
            {{ row.sessions[s] === undefined ? '—' : fmt.format(row.sessions[s]!) }}
          </td>
        </tr>
        <tr v-if="rows.length === 0">
          <td :colspan="2 + sessions.length" class="empty">No data</td>
        </tr>
      </tbody>
    </table>

    <div v-if="error" class="overlay" role="alert">
      <div class="overlay-box">
        <p class="overlay-title">{{ error }}</p>
        <p v-if="errorHint" class="overlay-hint">{{ errorHint }}</p>
        <button type="button" class="retry" @click="$emit('retry')">Retry now</button>
      </div>
    </div>
    <span v-if="loading" class="sr-only" role="status">Loading data…</span>
  </div>
</template>

<style scoped>
.table-wrap {
  position: relative;
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
  padding: 0.6rem 1rem;
  text-align: left;
  white-space: nowrap;
}

thead th {
  position: sticky;
  top: 0;
  background: var(--color-background-mute);
  color: var(--color-heading);
  font-weight: 600;
  border-bottom: 1px solid var(--color-border);
}

tbody tr:nth-child(even) {
  background: var(--color-background-soft);
}

tbody:not(.skeleton) tr:hover {
  background: var(--color-background-mute);
}

.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.pos {
  color: #16a34a;
}

.neg {
  color: #dc2626;
}

.empty {
  text-align: center;
  color: var(--color-text);
  opacity: 0.6;
}

/* Skeleton */
.bar {
  display: inline-block;
  height: 0.8em;
  border-radius: 4px;
  vertical-align: middle;
  background: linear-gradient(
    90deg,
    var(--color-background-mute) 0%,
    var(--color-border) 50%,
    var(--color-background-mute) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

.w-date {
  width: 6.5em;
}
.w-day {
  width: 2.5em;
}
.w-num {
  width: 3.5em;
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

/* Error overlay on top of the skeleton */
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: color-mix(in srgb, var(--color-background) 55%, transparent);
}

.overlay-box {
  max-width: 22rem;
  padding: 1rem 1.25rem;
  text-align: center;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background);
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.08);
}

.overlay-title {
  font-weight: 600;
  color: var(--color-heading);
}

.overlay-hint {
  margin-top: 0.25rem;
  font-size: 0.85rem;
  opacity: 0.7;
}

.retry {
  margin-top: 0.75rem;
  padding: 0.4rem 0.9rem;
  font: inherit;
  font-size: 0.9rem;
  border: 1px solid hsla(160, 100%, 37%, 1);
  border-radius: 6px;
  background: transparent;
  color: hsla(160, 100%, 37%, 1);
  cursor: pointer;
}

.retry:hover {
  background: hsla(160, 100%, 37%, 0.12);
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
