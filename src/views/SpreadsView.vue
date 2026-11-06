<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { SPREAD_SECTIONS } from '@/data/spreads'
</script>

<template>
  <main>
    <h1>Spreads</h1>
    <p class="note">Choose a spread to view its values.</p>

    <section v-for="section in SPREAD_SECTIONS" :key="section.title" class="section">
      <h2>{{ section.title }}</h2>

      <div v-for="group in section.groups" :key="group.title" class="group">
        <h3 v-if="group.title">{{ group.title }}</h3>
        <div v-if="group.spreads.length" class="grid">
          <RouterLink
            v-for="s in group.spreads"
            :key="s.name"
            :to="
              s.routeName
                ? { name: s.routeName }
                : { name: 'spread-detail', params: { spreadName: s.name } }
            "
            class="card"
          >
            <span class="card-title">{{ s.label ?? s.name }}</span>
            <span v-if="s.description" class="card-desc">{{ s.description }}</span>
          </RouterLink>
        </div>
        <p v-else class="empty">Coming soon</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
h1 {
  font-size: 1.6rem;
  font-weight: 600;
  color: var(--color-heading);
}

.note {
  margin-bottom: 1.5rem;
  opacity: 0.6;
  font-size: 0.9rem;
}

.section + .section {
  margin-top: 2.25rem;
}

h2 {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-heading);
  padding-bottom: 0.4rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--color-border);
}

.group + .group {
  margin-top: 1.5rem;
}

h3 {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text);
  opacity: 0.7;
  margin-bottom: 0.6rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 1rem 1.25rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background-soft);
  color: var(--color-text);
  transition:
    border-color 0.2s,
    background 0.2s;
}

.card:hover {
  border-color: hsla(160, 100%, 37%, 1);
  background: var(--color-background-mute);
}

.card-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-heading);
}

.card-desc {
  font-size: 0.85rem;
  opacity: 0.7;
}

.empty {
  padding: 1rem 1.25rem;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  font-size: 0.9rem;
  opacity: 0.6;
}
</style>
