<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { TableColumn, TableRow, TableSection, Tone, UnitDef } from '@/data/research'
import AppIcon from '@/components/AppIcon.vue'
import {
  formatReportDate,
  formatValue,
  humanizeKey,
  signTone,
  toneColor,
} from '@/utils/reportFormat'

const props = defineProps<{
  section: TableSection
  units?: Record<string, UnitDef>
}>()

// Phones get a stacked list instead of a wide table
const narrow = ref(false)
let mq: MediaQueryList | undefined
const onMq = () => (narrow.value = !!mq?.matches)
onMounted(() => {
  mq = window.matchMedia('(max-width: 640px)')
  onMq()
  mq.addEventListener('change', onMq)
})
onBeforeUnmount(() => mq?.removeEventListener('change', onMq))

const columns = computed(() => props.section.columns.filter((c) => !c.hidden))
const colByKey = computed(() => new Map(props.section.columns.map((c) => [c.key, c])))

function cellText(c: TableColumn, v: unknown): string {
  if (c.type === 'badge') return v === null || v === undefined || v === '' ? '—' : String(v)
  const format = c.format ?? (c.type === 'date' ? 'date' : c.type === 'number' ? 'number' : 'text')
  return formatValue(v, { format, unit: c.unit, units: props.units })
}
function cellTone(c: TableColumn, v: unknown): Tone | undefined {
  if (c.type === 'badge') return c.options?.[String(v)]
  return c.tone_by_sign ? signTone(v) : undefined
}

// ---- sorting ----

const sort = ref<{ key: string; dir: 'asc' | 'desc' } | null>(
  props.section.default_sort?.key
    ? { key: props.section.default_sort.key, dir: props.section.default_sort.dir ?? 'asc' }
    : null,
)

function compare(a: unknown, b: unknown): number {
  const emptyA = a === null || a === undefined || a === ''
  const emptyB = b === null || b === undefined || b === ''
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

const sortedRows = computed(() => {
  const rows = props.section.rows.map((row, index) => ({ row, index }))
  const s = sort.value
  if (!s) return rows
  const sign = s.dir === 'asc' ? 1 : -1
  return rows.sort((a, b) => sign * compare(a.row[s.key], b.row[s.key]) || a.index - b.index)
})

function toggleSort(c: TableColumn) {
  const s = sort.value
  if (s?.key === c.key) sort.value = { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
  // Numbers and dates usually read best largest / newest first
  else sort.value = { key: c.key, dir: c.type === 'number' || c.type === 'date' ? 'desc' : 'asc' }
}
function ariaSort(c: TableColumn) {
  return sort.value?.key === c.key
    ? sort.value.dir === 'asc'
      ? 'ascending'
      : 'descending'
    : undefined
}

// ---- grouping ----

/** Column whose total each group header shows: the first number column coloured by sign */
const totalColumn = computed(
  () => columns.value.find((c) => c.type === 'number' && c.tone_by_sign) ?? undefined,
)
const badgeColumn = computed(() => columns.value.find((c) => c.type === 'badge'))

interface Group {
  key: string
  label: string
  rows: { row: TableRow; index: number }[]
  summary: string
  total?: number
}

const groups = computed<Group[]>(() => {
  const by = props.section.group_by
  if (!by) return [{ key: '', label: '', rows: sortedRows.value, summary: '' }]
  const map = new Map<string, Group>()
  for (const r of sortedRows.value) {
    const raw = r.row[by]
    const key = raw === null || raw === undefined ? '' : String(raw)
    let g = map.get(key)
    if (!g) {
      // Group values are categories (a year, a contract): shown as written, except dates
      const col = colByKey.value.get(by)
      const label = col?.type === 'date' ? cellText(col, raw) : key
      g = { key, label: label || 'Other', rows: [], summary: '' }
      map.set(key, g)
    }
    g.rows.push(r)
  }
  for (const g of map.values()) {
    const parts: string[] = []
    const badge = badgeColumn.value
    if (badge) {
      const counts = new Map<string, number>()
      for (const { row } of g.rows) {
        const v = row[badge.key]
        if (v !== null && v !== undefined && v !== '')
          counts.set(String(v), (counts.get(String(v)) ?? 0) + 1)
      }
      parts.push(`${g.rows.length} ${g.rows.length === 1 ? 'row' : 'rows'}`)
      for (const [label, count] of counts) parts.push(`${count} ${label.toLowerCase()}`)
    } else parts.push(`${g.rows.length} ${g.rows.length === 1 ? 'row' : 'rows'}`)
    g.summary = parts.join(' · ')
    const tc = totalColumn.value
    if (tc)
      g.total = g.rows.reduce(
        (sum, { row }) => sum + (typeof row[tc.key] === 'number' ? (row[tc.key] as number) : 0),
        0,
      )
  }
  return [...map.values()]
})

const collapsed = reactive(new Set<string>())
function toggleGroup(key: string) {
  if (collapsed.has(key)) collapsed.delete(key)
  else collapsed.add(key)
}
const allCollapsed = computed(() => groups.value.every((g) => collapsed.has(g.key)))
function toggleAll() {
  if (allCollapsed.value) collapsed.clear()
  else for (const g of groups.value) collapsed.add(g.key)
}

// ---- row details ----

const open = reactive(new Set<number>())
function toggleRow(index: number) {
  if (open.has(index)) open.delete(index)
  else open.add(index)
}
const hasDetails = (row: TableRow) => !!row.details && Object.keys(row.details).length > 0

function detailText(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'number') return formatValue(v)
  if (typeof v === 'string') return formatReportDate(v)
  if (Array.isArray(v))
    return v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ')
  return JSON.stringify(v)
}

// ---- stacked list (phones) ----

const listTitleCol = computed(() => columns.value[0])
const listSideCols = computed(() =>
  [
    totalColumn.value ?? columns.value.filter((c) => c.type === 'number').at(-1),
    badgeColumn.value,
  ].filter((c): c is TableColumn => !!c && c !== listTitleCol.value),
)
const listMetaCols = computed(() =>
  columns.value.filter((c) => c !== listTitleCol.value && !listSideCols.value.includes(c)),
)
const listCaption = computed(() => listMetaCols.value.map((c) => c.label).join(' · '))

const toneStyle = (tone: Tone | undefined) =>
  tone && tone !== 'neutral' ? { color: toneColor(tone) } : undefined
</script>

<template>
  <div class="report-table">
    <div v-if="section.group_by && groups.length > 1" class="toolbar">
      <button type="button" class="link-btn" @click="toggleAll">
        <AppIcon
          :name="allCollapsed ? 'expand-all' : 'collapse-all'"
          :size="14"
          :stroke-width="2.25"
        />
        {{ allCollapsed ? 'Expand all' : 'Collapse all' }}
      </button>
    </div>

    <!-- Stacked list -->
    <template v-if="narrow">
      <p v-if="listCaption" class="list-caption">{{ listCaption }}</p>
      <section v-for="g in groups" :key="g.key" class="group">
        <button
          v-if="section.group_by"
          type="button"
          class="group-head"
          :aria-expanded="!collapsed.has(g.key)"
          @click="toggleGroup(g.key)"
        >
          <AppIcon
            name="chevron-down"
            :size="14"
            :stroke-width="2.25"
            class="chev"
            :class="{ shut: collapsed.has(g.key) }"
          />
          <span class="group-label">{{ g.label }}</span>
          <span class="group-summary">· {{ g.summary }}</span>
          <span v-if="g.total !== undefined && totalColumn" class="group-total">
            {{
              formatValue(g.total, {
                format: totalColumn.format ?? 'signed',
                unit: totalColumn.unit,
                units,
              })
            }}
          </span>
        </button>
        <ul v-show="!collapsed.has(g.key)" class="list">
          <li v-for="{ row, index } in g.rows" :key="index">
            <component
              :is="hasDetails(row) ? 'button' : 'div'"
              :type="hasDetails(row) ? 'button' : undefined"
              class="list-row"
              :class="{ clickable: hasDetails(row) }"
              :aria-expanded="hasDetails(row) ? open.has(index) : undefined"
              @click="hasDetails(row) && toggleRow(index)"
            >
              <span class="list-main">
                <span v-if="listTitleCol" class="list-title">{{
                  cellText(listTitleCol, row[listTitleCol.key])
                }}</span>
                <span class="list-meta">
                  <template v-for="(c, ci) in listMetaCols" :key="c.key">
                    <template v-if="ci">&nbsp;·&nbsp;</template
                    ><span :style="toneStyle(cellTone(c, row[c.key]))">{{
                      cellText(c, row[c.key])
                    }}</span>
                  </template>
                </span>
              </span>
              <span class="list-side">
                <template v-for="c in listSideCols" :key="c.key">
                  <span
                    v-if="c.type === 'badge'"
                    class="badge"
                    :style="{ '--tone': toneColor(cellTone(c, row[c.key]) ?? 'neutral') }"
                    >{{ cellText(c, row[c.key]) }}</span
                  >
                  <span v-else class="list-num" :style="toneStyle(cellTone(c, row[c.key]))">{{
                    cellText(c, row[c.key])
                  }}</span>
                </template>
              </span>
            </component>
            <dl v-if="open.has(index) && row.details" class="details">
              <div v-for="(v, k) in row.details" :key="k">
                <dt>{{ humanizeKey(String(k)) }}</dt>
                <dd>{{ detailText(v) }}</dd>
              </div>
            </dl>
          </li>
        </ul>
      </section>
    </template>

    <!-- Table -->
    <div v-else class="scroll">
      <table>
        <thead>
          <tr>
            <th
              v-for="c in columns"
              :key="c.key"
              scope="col"
              :class="{ num: c.type === 'number' }"
              :aria-sort="ariaSort(c)"
            >
              <button type="button" class="sort-btn" @click="toggleSort(c)">
                {{ c.label }}
                <span class="sort-mark" :class="{ on: sort?.key === c.key }" aria-hidden="true">
                  {{ sort?.key === c.key && sort.dir === 'asc' ? '▲' : '▼' }}
                </span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody v-for="g in groups" :key="g.key">
          <tr v-if="section.group_by" class="group-row">
            <th :colspan="columns.length" scope="rowgroup">
              <button
                type="button"
                class="group-head"
                :aria-expanded="!collapsed.has(g.key)"
                @click="toggleGroup(g.key)"
              >
                <AppIcon
                  name="chevron-down"
                  :size="14"
                  :stroke-width="2.25"
                  class="chev"
                  :class="{ shut: collapsed.has(g.key) }"
                />
                <span class="group-label">{{ g.label }}</span>
                <span class="group-summary">· {{ g.summary }}</span>
                <span v-if="g.total !== undefined && totalColumn" class="group-total">
                  {{
                    formatValue(g.total, {
                      format: totalColumn.format ?? 'signed',
                      unit: totalColumn.unit,
                      units,
                    })
                  }}
                </span>
              </button>
            </th>
          </tr>
          <template v-if="!collapsed.has(g.key)">
            <template v-for="{ row, index } in g.rows" :key="index">
              <tr
                :class="{ clickable: hasDetails(row), open: open.has(index) }"
                :tabindex="hasDetails(row) ? 0 : undefined"
                :aria-expanded="hasDetails(row) ? open.has(index) : undefined"
                @click="hasDetails(row) && toggleRow(index)"
                @keydown.enter.prevent="hasDetails(row) && toggleRow(index)"
                @keydown.space.prevent="hasDetails(row) && toggleRow(index)"
              >
                <td v-for="c in columns" :key="c.key" :class="{ num: c.type === 'number' }">
                  <span
                    v-if="c.type === 'badge'"
                    class="badge"
                    :style="{ '--tone': toneColor(cellTone(c, row[c.key]) ?? 'neutral') }"
                    >{{ cellText(c, row[c.key]) }}</span
                  >
                  <span v-else :style="toneStyle(cellTone(c, row[c.key]))">{{
                    cellText(c, row[c.key])
                  }}</span>
                </td>
              </tr>
              <tr v-if="open.has(index) && row.details" class="details-row">
                <td :colspan="columns.length">
                  <dl class="details">
                    <div v-for="(v, k) in row.details" :key="k">
                      <dt>{{ humanizeKey(String(k)) }}</dt>
                      <dd>{{ detailText(v) }}</dd>
                    </div>
                  </dl>
                </td>
              </tr>
            </template>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.4rem;
}
.link-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.6rem;
  border: 0;
  border-radius: 999px;
  background: none;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}
.link-btn:hover {
  background: var(--color-background-mute);
  color: var(--color-heading);
}

.scroll {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
th,
td {
  padding: 0.55rem 0.85rem;
  text-align: left;
  white-space: nowrap;
}
.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
thead th {
  position: sticky;
  top: 0;
  padding: 0;
  border-bottom: 1px solid var(--color-border-hover);
  background: var(--color-background-soft);
}
.sort-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  width: 100%;
  padding: 0.6rem 0.85rem;
  border: 0;
  background: none;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
}
th.num .sort-btn {
  justify-content: flex-end;
}
.sort-btn:hover {
  color: var(--color-heading);
}
.sort-mark {
  font-size: 0.6rem;
  opacity: 0;
}
.sort-btn:hover .sort-mark {
  opacity: 0.5;
}
.sort-mark.on {
  opacity: 1;
  color: var(--color-accent);
}
tbody tr + tr td {
  border-top: 1px solid var(--color-border);
}
tbody td {
  color: var(--color-text);
}
tbody td:first-child {
  font-weight: 600;
  color: var(--color-heading);
}
tr.clickable {
  cursor: pointer;
}
tr.clickable:hover td,
tr.open td {
  background: color-mix(in srgb, var(--color-background-mute) 55%, transparent);
}
tr.clickable:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.group-row th {
  padding: 0;
  border-top: 1px solid var(--color-border-hover);
  background: color-mix(in srgb, var(--color-background-mute) 40%, transparent);
}
.group-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  padding: 0.55rem 0.85rem;
  border: 0;
  background: none;
  color: var(--color-text);
  font: inherit;
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
}
.group-head:hover .group-label {
  color: var(--color-accent-strong);
}
.chev {
  flex: none;
  color: var(--color-text-muted);
  transition: transform 0.15s;
}
.chev.shut {
  transform: rotate(-90deg);
}
.group-label {
  font-weight: 600;
  color: var(--color-heading);
}
.group-summary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-muted);
}
.group-total {
  margin-left: auto;
  padding-left: 0.75rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-heading);
}

.badge {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 6px;
  background: color-mix(in srgb, var(--tone) 16%, transparent);
  color: var(--tone);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: capitalize;
}

.details-row td {
  padding-top: 0;
  background: color-mix(in srgb, var(--color-background-mute) 55%, transparent);
}
.details {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.5rem 1rem;
  padding: 0.4rem 0 0.6rem;
  white-space: normal;
}
.details dt {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.details dd {
  margin: 0;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-heading);
  overflow-wrap: anywhere;
}

/* ---- stacked list ---- */
.list-caption {
  margin-bottom: 0.5rem;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
.group + .group {
  margin-top: 0.5rem;
}
.group > .group-head {
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border-hover);
}
.list {
  padding: 0;
  list-style: none;
}
.list > li + li {
  border-top: 1px solid var(--color-border);
}
.list-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.6rem 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
}
.list-row.clickable {
  cursor: pointer;
}
.list-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.list-title {
  font-weight: 600;
  color: var(--color-heading);
}
.list-meta {
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
}
.list-side {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.2rem;
}
.list-num {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-heading);
}
.list .details {
  padding: 0 0 0.75rem;
}
</style>
