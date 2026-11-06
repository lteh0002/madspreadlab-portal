<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { findSpread } from '@/data/spreads'

const props = defineProps<{ spreadName: string }>()

const title = computed(
  () => findSpread(`${props.spreadName}-chart`)?.pageTitle ?? `${props.spreadName} Chart`,
)
</script>

<template>
  <main>
    <RouterLink to="/spreads" class="back">← All spreads</RouterLink>
    <h1>{{ title }}</h1>
    <p class="crumb">Indices · JPX</p>
    <div class="placeholder">Chart coming soon</div>
  </main>
</template>

<style scoped>
.back {
  display: inline-block;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

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
