<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { usePageTitle } from '@/composables/usePageTitle'
import { RESEARCH_NOTES } from '@/data/research'

usePageTitle('Research')

/** Newest first */
const notes = computed(() => [...RESEARCH_NOTES].sort((a, b) => b.date.localeCompare(a.date)))

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const formatDate = (day: string) => dateFormat.format(new Date(`${day}T00:00:00Z`))
</script>

<template>
  <main>
    <header class="hero">
      <h1>Research</h1>
      <p class="subtitle">Backtests and what they found.</p>
    </header>

    <ul v-if="notes.length" class="notes">
      <li v-for="n in notes" :id="n.id" :key="n.id">
        <article class="card" :aria-labelledby="`${n.id}-title`">
          <header class="card-head">
            <div class="meta">
              <time :datetime="n.date">{{ formatDate(n.date) }}</time>
              <span v-if="n.inProgress" class="pill">In progress</span>
            </div>
            <h2 :id="`${n.id}-title`" class="title">{{ n.title }}</h2>
            <ul v-if="n.products?.length || n.tags?.length" class="tags">
              <li v-for="p in n.products" :key="`p-${p}`" class="tag product">{{ p }}</li>
              <li v-for="t in n.tags" :key="`t-${t}`" class="tag">{{ t }}</li>
            </ul>
          </header>

          <p class="summary">{{ n.summary }}</p>

          <dl v-if="n.metrics?.length" class="metrics">
            <div v-for="m in n.metrics" :key="m.label" class="metric">
              <dt>{{ m.label }}</dt>
              <dd>{{ m.value }}</dd>
            </div>
          </dl>

          <section v-if="n.findings?.length" class="findings" :aria-label="`${n.title}: findings`">
            <h3 class="findings-title">Findings</h3>
            <ul>
              <li v-for="(f, i) in n.findings" :key="i">{{ f }}</li>
            </ul>
          </section>
        </article>
      </li>
    </ul>

    <div v-else class="empty">
      <span class="empty-icon"><AppIcon name="flask" :size="28" :stroke-width="2" /></span>
      <p class="empty-title">No research yet</p>
      <p class="empty-text">Backtest write-ups will appear here as they're added.</p>
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
.pill {
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-reference) 16%, transparent);
  color: var(--color-reference);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
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

.summary {
  font-size: 0.95rem;
  line-height: 1.55;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 0.75rem;
}
.metric {
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-background-mute) 60%, transparent);
}
.metric dt {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.metric dd {
  margin: 0.25rem 0 0;
  font-size: 1.25rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-heading);
}

.findings-title {
  margin-bottom: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.findings ul {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-left: 1.2rem;
  line-height: 1.5;
}
.findings li::marker {
  color: var(--color-accent);
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
