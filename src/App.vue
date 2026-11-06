<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <header>
    <span class="brand">MadSpreadLab</span>
    <nav>
      <RouterLink to="/">Spreads</RouterLink>
      <RouterLink to="/about">About</RouterLink>
    </nav>
  </header>

  <RouterView />
</template>

<style scoped>
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 0;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--color-border);
}

.brand {
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--color-heading);
}

nav {
  display: flex;
  gap: 1rem;
}

nav a.router-link-exact-active {
  color: var(--color-heading);
}
</style>
