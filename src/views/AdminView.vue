<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon, { type IconName } from '@/components/AppIcon.vue'
import AddProductDialog from '@/components/AddProductDialog.vue'
import UploadDataDialog from '@/components/UploadDataDialog.vue'

interface AdminOption {
  title: string
  description: string
  icon: IconName
  /** Route path of the option's page */
  to?: string
  /** Opens a pop-up instead of a page */
  onSelect?: () => void
}

const addProductOpen = ref(false)
const uploadDataOpen = ref(false)

/**
 * Settings shown on the admin page. To enable one, set `to` (its own page) or
 * `onSelect` (a pop-up); options with neither show "Coming soon".
 */
const OPTIONS: AdminOption[] = [
  {
    title: 'Add new product',
    description: 'Add a product to the database, ready for its data.',
    icon: 'plus',
    onSelect: () => (addProductOpen.value = true),
  },
  {
    title: 'Upload data',
    description: 'Import prices from an Excel file into an existing product.',
    icon: 'upload',
    onSelect: () => (uploadDataOpen.value = true),
  },
  {
    title: 'Manage products',
    description: 'Edit, hide or remove the products already listed.',
    icon: 'list',
  },
  {
    title: 'Admin access',
    description: 'Choose who can sign in and change these settings.',
    icon: 'users',
  },
]
</script>

<template>
  <main>
    <header class="hero">
      <h1>Admin</h1>
      <p class="subtitle">Manage products and the data behind them.</p>
    </header>

    <ul class="grid">
      <li v-for="o in OPTIONS" :key="o.title">
        <RouterLink v-if="o.to" :to="o.to" class="card">
          <span class="tile"><AppIcon :name="o.icon" :size="28" :stroke-width="2" /></span>
          <span class="text">
            <span class="title">{{ o.title }}</span>
            <span class="desc">{{ o.description }}</span>
          </span>
          <span class="go" aria-hidden="true"
            ><AppIcon name="arrow" :size="20" :stroke-width="2.25"
          /></span>
        </RouterLink>
        <button
          v-else-if="o.onSelect"
          type="button"
          class="card"
          aria-haspopup="dialog"
          @click="o.onSelect"
        >
          <span class="tile"><AppIcon :name="o.icon" :size="28" :stroke-width="2" /></span>
          <span class="text">
            <span class="title">{{ o.title }}</span>
            <span class="desc">{{ o.description }}</span>
          </span>
          <span class="go" aria-hidden="true"
            ><AppIcon :name="o.icon" :size="20" :stroke-width="2.25"
          /></span>
        </button>
        <div v-else class="card disabled" aria-disabled="true">
          <span class="tile"><AppIcon :name="o.icon" :size="28" :stroke-width="2" /></span>
          <span class="text">
            <span class="title">{{ o.title }}</span>
            <span class="desc">{{ o.description }}</span>
          </span>
          <span class="soon">Coming soon</span>
        </div>
      </li>
    </ul>

    <AddProductDialog v-model:open="addProductOpen" />
    <UploadDataDialog v-model:open="uploadDataOpen" />
  </main>
</template>

<style scoped>
.hero {
  padding: 1.5rem 0 2.25rem;
}
h1 {
  font-size: clamp(2.6rem, 5vw, 4.25rem);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.03em;
  color: var(--color-heading);
}
.subtitle {
  margin-top: 0.75rem;
  font-size: 1.25rem;
  color: var(--color-text);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr));
  gap: 1.5rem;
  padding: 0;
  list-style: none;
}
.grid li {
  display: flex;
}

.card {
  flex: 1;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 1.25rem;
  padding: 1.4rem;
  border: 1px solid var(--color-border-hover);
  border-radius: var(--radius-lg);
  background: var(--card-background);
  box-shadow: var(--shadow-card);
  color: var(--color-text);
  transition:
    border-color 0.2s,
    transform 0.2s;
}
a.card:hover,
button.card:hover {
  background: var(--card-background);
  border-color: var(--color-accent-border);
  transform: translateY(-2px);
}
a.card:focus-visible,
button.card:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}
button.card {
  width: 100%;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.card.disabled {
  cursor: default;
}

.tile {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--color-accent) 35%, transparent);
  background: var(--tile-background);
  color: #fff;
}
.disabled .tile {
  opacity: 0.6;
}

.text {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.title {
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.25;
  color: var(--color-heading);
}
.desc {
  font-size: 0.95rem;
  color: var(--color-text);
}

.go {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 1px solid var(--color-border-hover);
  color: var(--color-heading);
  transition:
    background 0.2s,
    color 0.2s,
    border-color 0.2s;
}
a.card:hover .go,
button.card:hover .go {
  border-color: var(--color-accent-solid);
  background: var(--color-accent-solid);
  color: var(--color-on-accent);
}

.soon {
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-heading) 9%, transparent);
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}

@media (max-width: 520px) {
  .card {
    grid-template-columns: auto minmax(0, 1fr);
  }
  .soon,
  .go {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
