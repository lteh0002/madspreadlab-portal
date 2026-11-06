<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <main class="home">
    <h1>MadSpreadLab</h1>
    <p class="tagline">Welcome to the MadSpreadLab portal.</p>
    <RouterLink to="/spreads" class="cta">View spreads →</RouterLink>
  </main>
</template>

<style scoped>
.home {
  padding: 2rem 0;
}

h1 {
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-heading);
}

.tagline {
  margin: 0.5rem 0 1.5rem;
  opacity: 0.75;
}

.cta {
  font-weight: 600;
}
</style>
