<script setup lang="ts">
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import AppIcon from './AppIcon.vue'

defineProps<{ to: RouteLocationRaw }>()
</script>

<template>
  <RouterLink :to="to" class="back-link">
    <AppIcon name="arrow-left" :size="16" :stroke-width="2.25" class="back-icon" />
    <span><slot /></span>
  </RouterLink>
</template>

<style scoped>
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0 0 0.75rem -0.6rem;
  padding: 0.35rem 0.75rem 0.35rem 0.6rem;
  border-radius: 999px;
  color: var(--color-text-muted);
  font-size: 0.85rem;
  font-weight: 500;
  transition:
    background-color 0.15s,
    color 0.15s;
}
.back-link:hover {
  background: var(--color-background-mute);
  color: var(--color-heading);
}
.back-link:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.back-icon {
  transition: transform 0.15s;
}
.back-link:hover .back-icon {
  transform: translateX(-3px);
}
</style>
