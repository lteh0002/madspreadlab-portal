<script setup lang="ts">
import type { MetricItem, UnitDef } from '@/data/research'
import { formatValue, toneColor } from '@/utils/reportFormat'

defineProps<{
  items: MetricItem[]
  units?: Record<string, UnitDef>
  /** Smaller tiles, for the cards on the Research list */
  compact?: boolean
}>()
</script>

<template>
  <dl class="metrics" :class="{ compact }">
    <div v-for="m in items" :key="m.key" class="metric">
      <dt>{{ m.label }}</dt>
      <dd
        class="value"
        :style="m.tone && m.tone !== 'neutral' ? { color: toneColor(m.tone) } : undefined"
      >
        {{ formatValue(m.value, { format: m.format, decimals: m.decimals, unit: m.unit, units }) }}
      </dd>
      <dd v-if="m.note && !compact" class="note">{{ m.note }}</dd>
    </div>
  </dl>
</template>

<style scoped>
.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 0.75rem;
}
.metric {
  padding: 0.9rem 1.1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-background-mute) 60%, transparent);
}
dt {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--color-text);
}
dd {
  margin: 0;
}
.value {
  margin-top: 0.15rem;
  font-size: 1.65rem;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  color: var(--color-heading);
  overflow-wrap: anywhere;
}
.note {
  margin-top: 0.2rem;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.compact {
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 0.5rem;
}
.compact .metric {
  padding: 0.6rem 0.8rem;
}
.compact dt {
  font-size: 0.72rem;
  color: var(--color-text-muted);
}
.compact .value {
  font-size: 1.15rem;
  font-weight: 600;
}

@media (max-width: 520px) {
  .metrics:not(.compact) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .metrics:not(.compact) .value {
    font-size: 1.35rem;
  }
}
</style>
