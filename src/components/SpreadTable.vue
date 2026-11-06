<script setup lang="ts">
import type { SpreadRow } from '@/data/placeholderSpreads'

defineProps<{ rows: SpreadRow[] }>()

const fmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})
</script>

<template>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">Day</th>
          <th scope="col" class="num">1x6 Cash</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.date">
          <td>{{ row.date }}</td>
          <td>{{ row.day }}</td>
          <td class="num" :class="{ pos: row.cash1x6 > 0, neg: row.cash1x6 < 0 }">
            {{ fmt.format(row.cash1x6) }}
          </td>
        </tr>
        <tr v-if="rows.length === 0">
          <td colspan="3" class="empty">No data</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
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

tbody tr:hover {
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
</style>
