<script setup lang="ts">
import { computed } from 'vue'
import type { Tone } from '@/data/research'
import { toneColor } from '@/utils/reportFormat'

const props = defineProps<{ status: string }>()

/** Common statuses get a colour; anything else is shown neutral */
const tone = computed<Tone>(() => {
  const s = props.status.toLowerCase()
  if (/\b(live|active|trading)\b/.test(s)) return 'positive'
  if (/\b(paper|testing|in progress|draft|research|backtest)/.test(s)) return 'info'
  if (/\b(paused|watch|review)/.test(s)) return 'warning'
  return 'neutral'
})
</script>

<template>
  <span class="pill" :style="{ '--tone': toneColor(tone) }">
    <span class="dot" aria-hidden="true" />{{ status }}
  </span>
</template>

<style scoped>
.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tone) 15%, transparent);
  color: var(--tone);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
</style>
