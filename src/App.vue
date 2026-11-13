<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import AppIcon, { type IconName } from '@/components/AppIcon.vue'
import { useTheme } from '@/composables/useTheme'

interface NavItem {
  label: string
  icon: IconName
  /** Path prefix this item owns */
  to: string
}

const NAV: NavItem[] = [
  { label: 'Spreads', icon: 'grid', to: '/spreads' },
  { label: 'Calendar', icon: 'calendar-solid', to: '/calendar' },
  { label: 'Research', icon: 'flask-solid', to: '/research' },
  { label: 'Admin', icon: 'shield-solid', to: '/admin' },
]

const route = useRoute()
const { theme, toggle } = useTheme()

const isActive = (item: NavItem) => route.path.startsWith(item.to)
const themeLabel = computed(() => `Switch to ${theme.value === 'dark' ? 'light' : 'dark'} mode`)
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <svg class="logo" viewBox="0 0 40 32" aria-hidden="true">
          <rect x="2" y="22" width="5" height="8" rx="1" />
          <rect x="10" y="17" width="5" height="13" rx="1" />
          <rect x="18" y="12" width="5" height="18" rx="1" />
          <rect x="26" y="7" width="5" height="23" rx="1" />
          <path d="M3 15 L14 8 L21 11 L35 2" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M29 2 H35 V8" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="brand-text">MadSpread<span class="brand-accent">Lab</span></span>
      </div>

      <nav class="nav" aria-label="Main">
        <RouterLink
          v-for="item in NAV"
          :key="item.label"
          :to="item.to"
          class="nav-item"
          :class="{ active: isActive(item) }"
          :aria-current="isActive(item) ? 'page' : undefined"
        >
          <AppIcon :name="item.icon" :size="22" />
          <span class="nav-label">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <RouterLink to="/spreads" class="promo" aria-label="Browse spreads">
        <svg class="promo-curve" viewBox="0 0 200 120" preserveAspectRatio="none" aria-hidden="true">
          <path class="area" d="M0 120 L0 112 C 50 108, 80 100, 110 85 S 170 30, 200 10 L200 120 Z" />
          <path class="line" d="M0 112 C 50 108, 80 100, 110 85 S 170 30, 200 10" />
          <path class="line faint" d="M30 120 C 80 104, 120 90, 150 60 S 190 20, 200 25" />
        </svg>
        <p>Trade Smarter.<br />Analyse Deeper.</p>
        <span class="promo-go" aria-hidden="true"><AppIcon name="arrow" :size="18" :stroke-width="2.25" /></span>
      </RouterLink>
    </aside>

    <div class="content">
      <div class="topbar">
        <button type="button" class="icon-btn" :aria-label="themeLabel" :title="themeLabel" @click="toggle">
          <AppIcon :name="theme === 'dark' ? 'moon' : 'sun'" :size="20" />
        </button>
      </div>
      <RouterView />
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: 270px minmax(0, 1fr);
  min-height: 100vh;
}

/* ---------- Sidebar ---------- */
.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding: 1.75rem 1.25rem 1.25rem;
  --icon-cutout: var(--color-sidebar);
  background:
    radial-gradient(140% 50% at 0% 100%, var(--color-sidebar-glow), transparent 70%),
    radial-gradient(120% 40% at 100% 0%, var(--color-sidebar-glow), transparent 70%),
    var(--color-sidebar);
  border-right: 1px solid var(--color-border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.25rem 0.75rem 1.75rem;
  margin-bottom: -0.25rem;
  border-radius: 0;
  border-bottom: 1px solid var(--color-border);
}

.logo {
  width: 38px;
  height: 30px;
  fill: var(--color-accent);
  stroke: var(--color-accent);
}

.brand-text {
  font-size: 1.2rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--color-heading);
}
.brand-accent {
  font-weight: 700;
  color: var(--color-accent);
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.85rem 1.1rem;
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: 1rem;
  border: 1px solid transparent;
  transition:
    background 0.2s,
    color 0.2s;
}
.nav-item:hover {
  background: var(--color-background-mute);
  color: var(--color-heading);
}
.nav-item.active {
  background: linear-gradient(135deg, var(--color-accent-solid), color-mix(in srgb, var(--color-accent-solid) 70%, #000));
  border-color: color-mix(in srgb, var(--color-accent) 30%, transparent);
  color: var(--color-on-accent);
  font-weight: 500;
  box-shadow: 0 8px 20px -12px var(--color-accent);
}
.nav-item.active:hover {
  color: var(--color-on-accent);
}
.nav-item :deep(svg) {
  color: var(--color-text);
}
.nav-item.active :deep(svg) {
  color: var(--color-on-accent);
}

.promo {
  position: relative;
  display: block;
  margin-top: auto;
  overflow: hidden;
  min-height: 150px;
  padding: 1.5rem 1.4rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-accent-border);
  background: var(--card-background);
  color: inherit;
}
.promo:hover {
  background: var(--card-background);
  border-color: var(--color-accent);
}
.promo p {
  position: relative;
  z-index: 1;
  color: var(--color-heading);
  font-size: 1rem;
  line-height: 1.7;
}
.promo-curve {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.promo-curve .area {
  fill: var(--color-accent-soft);
}
.promo-curve .line {
  fill: none;
  stroke: var(--color-accent);
  stroke-width: 1.5;
  opacity: 0.6;
  vector-effect: non-scaling-stroke;
}
.promo-curve .faint {
  opacity: 0.25;
}
.promo-go {
  position: absolute;
  right: 1rem;
  bottom: 1rem;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--color-accent-solid);
  color: var(--color-on-accent);
  transition: transform 0.2s;
}
.promo:hover .promo-go {
  transform: translateX(2px);
}

/* ---------- Content ---------- */
.content {
  position: relative;
  min-width: 0;
  overflow-x: clip;
  padding: 2.25rem 2.5rem 3rem 3rem;
}

.topbar {
  position: absolute;
  top: 1.5rem;
  right: 2.5rem;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.icon-btn {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid transparent;
  border-radius: 50%;
  background: transparent;
  color: var(--color-heading);
  cursor: pointer;
  transition: background 0.2s;
}
.icon-btn:hover {
  background: var(--color-background-mute);
}
.icon-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* ---------- Narrow screens: sidebar becomes a top bar ---------- */
@media (max-width: 900px) {
  .shell {
    grid-template-columns: minmax(0, 1fr);
    /* keep the bar its natural height; spare height goes to the page */
    grid-template-rows: auto 1fr;
  }
  .sidebar {
    position: sticky;
    z-index: 5;
    height: auto;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    /* right: clear the fixed theme toggle (its 1rem offset + 42px width) plus a gap */
    padding: 0.6rem calc(1rem + 42px + 0.5rem) 0.6rem 1rem;
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
    /* translucent so page artwork shows through as it scrolls under */
    background: color-mix(in srgb, var(--color-sidebar) 45%, transparent);
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
  }
  .brand {
    padding: 0.25rem;
    margin: 0;
    border: 0;
  }
  .brand-text,
  .nav-label,
  .promo {
    display: none;
  }
  .nav {
    flex-direction: row;
    overflow-x: auto;
    gap: 0.15rem;
    scrollbar-width: none;
  }
  .nav-item {
    padding: 0.55rem;
  }
  .content {
    padding: 1.5rem 1rem 2.5rem;
  }
  .topbar {
    position: fixed;
    top: 0.65rem;
    right: 1rem;
    z-index: 6;
  }
}
</style>
