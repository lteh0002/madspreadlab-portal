<script setup lang="ts">
import SpreadTable from '@/components/SpreadTable.vue'
import { makePlaceholderSpreads } from '@/data/placeholderSpreads'

// Placeholder data — swap for an API call / Pinia store later.
const rows = makePlaceholderSpreads()
</script>

<template>
  <main>
    <h1>Spreads</h1>
    <p class="note">Placeholder data</p>
    <SpreadTable :rows="rows" />
  </main>
</template>

<style scoped>
h1 {
  font-size: 1.6rem;
  font-weight: 600;
  color: var(--color-heading);
}

.note {
  margin-bottom: 1rem;
  opacity: 0.6;
  font-size: 0.9rem;
}
</style>
