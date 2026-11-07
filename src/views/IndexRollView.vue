<script setup lang="ts">
import BackLink from '@/components/BackLink.vue'
import { computed } from 'vue'
import { findSpread } from '@/data/spreads'

const props = defineProps<{ market: string }>()

const title = computed(
  () => findSpread(`roll-${props.market}`)?.pageTitle ?? `${props.market.toUpperCase()} Index Roll`,
)
</script>

<template>
  <main>
    <BackLink to="/spreads">All spreads</BackLink>
    <h1>{{ title }}</h1>
    <p class="crumb">Indices · Index Roll</p>
    <div class="placeholder">Coming soon</div>
  </main>
</template>

<style scoped>
h1 {
  font-size: 1.6rem;
  font-weight: 600;
  color: var(--color-heading);
}

.crumb {
  margin-bottom: 1rem;
  font-size: 0.85rem;
  opacity: 0.6;
}

.placeholder {
  padding: 2rem 1.25rem;
  text-align: center;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  opacity: 0.6;
}
</style>
