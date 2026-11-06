<script setup lang="ts">
import { computed, useId } from 'vue'

/**
 * Decorative sparkline. The shape is generated from `seed` (stable per card),
 * it does NOT represent real spread data. Pass `values` to plot real data.
 */
const props = withDefaults(
  defineProps<{ seed?: string; values?: number[]; width?: number; height?: number }>(),
  { seed: 'spread', width: 240, height: 96 },
)

const gradId = `spark-${useId()}`

function rng(seed: string) {
  let h = 1779033703
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

const series = computed(() => {
  if (props.values?.length) return props.values
  const r = rng(props.seed)
  const out: number[] = []
  let v = 0
  for (let i = 0; i < 34; i++) {
    v += (r() - 0.3) * 1.6
    out.push(v)
  }
  return out
})

const geometry = computed(() => {
  const vs = series.value
  const pad = 6
  const min = Math.min(...vs)
  const max = Math.max(...vs)
  const span = max - min || 1
  const step = (props.width - pad * 2) / Math.max(vs.length - 1, 1)
  const pts = vs.map((v, i) => [pad + i * step, pad + (1 - (v - min) / span) * (props.height - pad * 2)] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const first = pts[0]!
  const last = pts[pts.length - 1]!
  const area = `${line} L${last[0].toFixed(1)},${props.height} L${first[0].toFixed(1)},${props.height} Z`
  return { line, area, last }
})
</script>

<template>
  <svg
    class="spark"
    :viewBox="`0 0 ${width} ${height}`"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <defs>
      <linearGradient :id="gradId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--color-accent)" stop-opacity="0.28" />
        <stop offset="100%" stop-color="var(--color-accent)" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path :d="geometry.area" :fill="`url(#${gradId})`" />
    <path
      :d="geometry.line"
      fill="none"
      stroke="var(--color-accent)"
      stroke-width="2"
      stroke-linejoin="round"
      stroke-linecap="round"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>

<style scoped>
.spark {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
</style>
