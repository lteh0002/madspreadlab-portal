<script setup lang="ts">
import { computed } from 'vue'
import BackLink from '@/components/BackLink.vue'
import ReportChart from '@/components/research/ReportChart.vue'
import ReportMetrics from '@/components/research/ReportMetrics.vue'
import ReportTable from '@/components/research/ReportTable.vue'
import RichText from '@/components/research/RichText.vue'
import StatusPill from '@/components/research/StatusPill.vue'
import { usePageTitle } from '@/composables/usePageTitle'
import { findReport } from '@/data/research'
import { formatReportDate, formatValue, humanizeKey, toneColor } from '@/utils/reportFormat'

const props = defineProps<{ id: string }>()

const report = computed(() => findReport(props.id))
usePageTitle(() => report.value?.meta.title ?? 'Research')

const units = computed(() => report.value?.meta.units)
const chips = computed(() => {
  const m = report.value?.meta
  if (!m) return []
  return [m.market, m.instrument_type, ...(m.tags ?? [])].filter((x): x is string => !!x)
})

const isDev = import.meta.env.DEV

function paramText(v: unknown): string {
  if (typeof v === 'number') return formatValue(v)
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
</script>

<template>
  <main>
    <BackLink :to="{ name: 'research' }">Research</BackLink>

    <template v-if="report">
      <header class="hero">
        <div class="meta">
          <StatusPill v-if="report.meta.status" :status="report.meta.status" />
          <span v-if="report.meta.as_of"
            >As of {{ formatReportDate(report.meta.as_of, 'long') }}</span
          >
          <span v-if="report.meta.author">· {{ report.meta.author }}</span>
        </div>
        <h1>{{ report.meta.title }}</h1>
        <p v-if="report.meta.subtitle" class="subtitle">{{ report.meta.subtitle }}</p>
        <ul v-if="chips.length" class="chips">
          <li
            v-for="(c, i) in chips"
            :key="c"
            class="chip"
            :class="{ lead: i === 0 && report.meta.market }"
          >
            {{ c }}
          </li>
        </ul>
      </header>

      <div v-if="isDev && report.problems.length" class="dev-warning" role="alert">
        <strong>Some sections couldn't be shown (only visible in dev):</strong>
        <ul>
          <li v-for="p in report.problems" :key="p">{{ p }}</li>
        </ul>
      </div>

      <div class="sections">
        <section
          v-for="s in report.sections"
          :id="s.id"
          :key="s.id"
          class="section"
          :aria-labelledby="s.title ? `${s.id}-title` : undefined"
        >
          <h2 v-if="s.title" :id="`${s.id}-title`">{{ s.title }}</h2>

          <template v-if="s.type === 'rules'">
            <ol class="rules">
              <li v-for="(r, i) in s.items" :key="i">
                <span class="rule-num" aria-hidden="true">{{ i + 1 }}</span>
                <p>
                  <strong v-if="r.label">{{ r.label }}: </strong><RichText :text="r.text" />
                </p>
              </li>
            </ol>
            <dl v-if="s.params && Object.keys(s.params).length" class="params">
              <div v-for="(v, k) in s.params" :key="k" class="param">
                <dt>{{ humanizeKey(String(k)) }}</dt>
                <dd>{{ paramText(v) }}</dd>
              </div>
            </dl>
          </template>

          <ReportMetrics v-else-if="s.type === 'metrics'" :items="s.items" :units="units" />

          <div v-else-if="s.type === 'chart'" class="panel">
            <ReportChart :chart="s.chart" :units="units" :label="s.title" />
          </div>

          <ReportTable v-else-if="s.type === 'table'" :section="s" :units="units" />

          <aside
            v-else-if="s.type === 'callout'"
            class="callout"
            :style="{ '--tone': toneColor(s.tone ?? 'info') }"
          >
            <p v-for="(p, i) in paragraphs(s.text)" :key="i"><RichText :text="p" /></p>
          </aside>

          <ul v-else-if="s.type === 'notes'" class="notes">
            <li v-for="(t, i) in s.items" :key="i"><RichText :text="t" /></li>
          </ul>

          <div v-else-if="s.type === 'text'" class="prose">
            <p v-for="(p, i) in paragraphs(s.text)" :key="i"><RichText :text="p" /></p>
          </div>
        </section>
      </div>
    </template>

    <div v-else class="missing">
      <p class="missing-title">Report not found</p>
      <p class="missing-text">
        There's no research report called “{{ id }}”. It may have been renamed or removed.
      </p>
    </div>
  </main>
</template>

<style scoped>
main {
  max-width: 960px;
}

.hero {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.5rem 0 2rem;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
h1 {
  font-size: clamp(1.75rem, 3vw, 2.4rem);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.025em;
  color: var(--color-heading);
}
.subtitle {
  max-width: 68ch;
  font-size: 1rem;
  line-height: 1.55;
  color: var(--color-text);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.2rem;
  padding: 0;
  list-style: none;
}
.chip {
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  border: 1px solid var(--color-border-hover);
  font-size: 0.75rem;
  color: var(--color-text);
}
.chip.lead {
  border-color: var(--color-accent-border);
  background: var(--color-accent-soft);
  color: var(--color-accent-strong);
  font-weight: 600;
}

.sections {
  display: flex;
  flex-direction: column;
  gap: 2.25rem;
}
.section {
  scroll-margin-top: 1.5rem;
}
h2 {
  margin-bottom: 0.75rem;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-heading);
}

.panel {
  padding: 1rem 1.1rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-background-mute) 35%, transparent);
}

.rules {
  padding: 0.35rem 1.1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-background-mute) 35%, transparent);
  list-style: none;
}
.rules li {
  display: flex;
  align-items: baseline;
  gap: 0.85rem;
  padding: 0.7rem 0;
  line-height: 1.55;
}
.rules li + li {
  border-top: 1px solid var(--color-border);
}
.rule-num {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background: color-mix(in srgb, var(--color-series-2) 18%, transparent);
  color: var(--color-series-2);
  font-size: 0.75rem;
  font-weight: 600;
  transform: translateY(-0.05rem);
}
.rules strong {
  font-weight: 600;
  color: var(--color-heading);
}

.params {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.param {
  display: inline-flex;
  gap: 0.45rem;
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 0.8rem;
}
.param dt {
  color: var(--color-text-muted);
}
.param dd {
  margin: 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-heading);
}

.callout {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.9rem 1.1rem;
  border: 1px solid color-mix(in srgb, var(--tone) 35%, transparent);
  border-left: 3px solid var(--tone);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--tone) 9%, transparent);
  line-height: 1.55;
  color: var(--color-heading);
}

.notes {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  max-width: 75ch;
  padding-left: 1.2rem;
  line-height: 1.55;
}
.notes li::marker {
  color: var(--color-accent);
}

.prose {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  max-width: 72ch;
  line-height: 1.65;
}

.dev-warning {
  margin-bottom: 1.5rem;
  padding: 0.8rem 1rem;
  border: 1px dashed var(--color-reference);
  border-radius: var(--radius-md);
  color: var(--color-reference);
  font-size: 0.85rem;
}
.dev-warning ul {
  margin-top: 0.3rem;
  padding-left: 1.2rem;
}

.missing {
  padding: 3rem 1.5rem;
  border: 1px dashed var(--color-border-hover);
  border-radius: var(--radius-lg);
  text-align: center;
}
.missing-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-heading);
}
.missing-text {
  margin-top: 0.35rem;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

@media (max-width: 520px) {
  .panel {
    padding: 0.8rem 0.75rem 0.5rem;
  }
  .rules {
    padding: 0.2rem 0.85rem;
  }
}
</style>
