<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import ReportMetrics from '@/components/research/ReportMetrics.vue'
import StatusPill from '@/components/research/StatusPill.vue'
import { usePageTitle } from '@/composables/usePageTitle'
import {
  REPORT_LOAD_ERRORS,
  RESEARCH_REPORTS,
  type MetricItem,
  type ResearchReport,
} from '@/data/research'
import { formatReportDate } from '@/utils/reportFormat'

usePageTitle('Research')

const isDev = import.meta.env.DEV

/** Headline numbers on a card: the first four of the report's first metrics section */
function headline(r: ResearchReport): MetricItem[] {
  const s = r.sections.find((x) => x.type === 'metrics')
  return s?.type === 'metrics' ? s.items.slice(0, 4) : []
}

const cards = computed(() =>
  RESEARCH_REPORTS.map((r) => ({
    report: r,
    chips: [r.meta.market, r.meta.instrument_type, ...(r.meta.tags ?? [])].filter(
      (x): x is string => !!x,
    ),
    metrics: headline(r),
  })),
)
</script>

<template>
  <main>
    <header class="hero">
      <h1>Research</h1>
      <p class="subtitle">Strategies, backtests and what they found.</p>
    </header>

    <div v-if="isDev && REPORT_LOAD_ERRORS.length" class="dev-warning" role="alert">
      <strong>Some report files couldn't be loaded (only visible in dev):</strong>
      <ul>
        <li v-for="e in REPORT_LOAD_ERRORS" :key="e">{{ e }}</li>
      </ul>
    </div>

    <ul v-if="cards.length" class="notes">
      <li v-for="{ report: r, chips, metrics } in cards" :key="r.meta.id">
        <RouterLink :to="{ name: 'research-report', params: { id: r.meta.id } }" class="card-link">
          <article class="card" :aria-labelledby="`${r.meta.id}-title`">
            <header class="card-head">
              <div class="meta">
                <StatusPill v-if="r.meta.status" :status="r.meta.status" />
                <time v-if="r.meta.as_of" :datetime="r.meta.as_of"
                  >As of {{ formatReportDate(r.meta.as_of, 'long') }}</time
                >
              </div>
              <h2 :id="`${r.meta.id}-title`" class="title">{{ r.meta.title }}</h2>
              <ul v-if="chips.length" class="tags">
                <li
                  v-for="(c, i) in chips"
                  :key="c"
                  class="tag"
                  :class="{ product: i === 0 && r.meta.market }"
                >
                  {{ c }}
                </li>
              </ul>
            </header>

            <p v-if="r.meta.subtitle" class="subtitle-line">{{ r.meta.subtitle }}</p>

            <ReportMetrics v-if="metrics.length" :items="metrics" :units="r.meta.units" compact />

            <span class="open-hint"
              >Read report <AppIcon name="arrow" :size="14" :stroke-width="2.25"
            /></span>
          </article>
        </RouterLink>
      </li>
    </ul>

    <div v-else class="empty">
      <span class="empty-icon"><AppIcon name="flask" :size="28" :stroke-width="2" /></span>
      <p class="empty-title">No research yet</p>
      <p class="empty-text">Strategy reports will appear here as they're added.</p>
    </div>
  </main>
</template>

<style scoped>
.hero {
  padding: 1.5rem 0 2.25rem;
}
/* Beside the sidebar, line the title up with the logo (as on the Admin page) */
@media (min-width: 901px) {
  .hero {
    margin-top: -0.75rem;
    padding-top: 0;
  }
}
h1 {
  font-size: clamp(2rem, 3.4vw, 2.75rem);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.03em;
  color: var(--color-heading);
}
.subtitle {
  margin-top: 0.6rem;
  font-size: 1rem;
  color: var(--color-text);
}

.notes {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 880px;
  padding: 0;
  list-style: none;
}
.notes > li {
  scroll-margin-top: 1.5rem;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  padding: 1.5rem;
  border: 1px solid var(--color-border-hover);
  border-radius: var(--radius-lg);
  background: var(--card-background);
  box-shadow: var(--shadow-card);
  color: var(--color-text);
}

.card-head {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.meta {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
.title {
  font-size: 1.3rem;
  font-weight: 600;
  line-height: 1.25;
  color: var(--color-heading);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0;
  list-style: none;
}
.tag {
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  border: 1px solid var(--color-border-hover);
  font-size: 0.75rem;
  color: var(--color-text);
}
.tag.product {
  border-color: var(--color-accent-border);
  background: var(--color-accent-soft);
  color: var(--color-accent-strong);
  font-weight: 600;
}

.subtitle-line {
  font-size: 0.95rem;
  line-height: 1.55;
}
.card-link {
  display: block;
  border-radius: var(--radius-lg);
  color: inherit;
  text-decoration: none;
}
.card-link:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}
.card {
  transition:
    border-color 0.15s,
    transform 0.15s;
}
.card-link:hover .card {
  border-color: var(--color-accent-border);
  transform: translateY(-1px);
}
.card-link:hover .title {
  color: var(--color-accent-strong);
}
.open-hint {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--color-accent-strong);
}
.dev-warning {
  max-width: 880px;
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

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  max-width: 880px;
  padding: 3.5rem 1.5rem;
  border: 1px dashed var(--color-border-hover);
  border-radius: var(--radius-lg);
  text-align: center;
}
.empty-icon {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  margin-bottom: 0.5rem;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--color-accent) 35%, transparent);
  background: var(--tile-background);
  color: #fff;
}
.empty-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-heading);
}
.empty-text {
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

@media (max-width: 520px) {
  .subtitle {
    font-size: 0.875rem;
  }
  .card {
    padding: 1.15rem;
  }
}
</style>
