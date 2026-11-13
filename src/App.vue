<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import AppIcon, { type IconName } from '@/components/AppIcon.vue'
import { logout, refreshUser } from '@/api/auth'
import { getSession, isAdmin } from '@/api/session'
import { useTheme } from '@/composables/useTheme'
import logoUrl from '@/assets/logo.png'

interface NavItem {
  label: string
  icon: IconName
  /** Path prefix this item owns */
  to: string
  adminOnly?: boolean
}

const NAV: NavItem[] = [
  { label: 'Spreads', icon: 'grid', to: '/spreads' },
  { label: 'Calendar', icon: 'calendar-solid', to: '/calendar' },
  { label: 'Research', icon: 'flask-solid', to: '/research' },
  { label: 'Admin', icon: 'shield-solid', to: '/admin', adminOnly: true },
]

/** Admin only shows for users with userType "admin" */
const nav = computed(() => NAV.filter((item) => !item.adminOnly || isAdmin.value))

const route = useRoute()
const router = useRouter()
const { theme, toggle } = useTheme()

function signOut() {
  logout()
  void router.replace({ name: 'login' })
}

// Pick up changes to the user (e.g. userType) made in the database since they signed in
onMounted(() => void refreshUser())
// Admin access removed while on an admin page: leave it
watch(isAdmin, (admin) => {
  if (!admin && route.meta.admin && getSession()) void router.replace('/spreads')
})

const isActive = (item: NavItem) => route.path.startsWith(item.to)
const themeLabel = computed(() => `Switch to ${theme.value === 'dark' ? 'light' : 'dark'} mode`)
</script>

<template>
  <RouterView v-if="route.meta.bare" />
  <div v-else class="shell">
    <aside class="sidebar">
      <div class="brand">
        <img class="logo" :src="logoUrl" alt="" width="40" height="40" />
        <span class="brand-text">MadSpread<span class="brand-accent">Lab</span></span>
      </div>

      <nav class="nav" aria-label="Main">
        <RouterLink
          v-for="item in nav"
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
    </aside>

    <div class="content">
      <div class="topbar">
        <button type="button" class="icon-btn" :aria-label="themeLabel" :title="themeLabel" @click="toggle">
          <AppIcon :name="theme === 'dark' ? 'moon' : 'sun'" :size="20" />
        </button>
        <button type="button" class="icon-btn" aria-label="Sign out" title="Sign out" @click="signOut">
          <AppIcon name="log-out" :size="20" />
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
  flex: none;
  width: 40px;
  height: 40px;
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
    /* right: clear the fixed top-bar buttons (1rem offset + two 42px buttons + their gap) plus a gap */
    padding: 0.6rem calc(1rem + 2 * 42px + 0.25rem + 0.5rem) 0.6rem 1rem;
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
  .nav-label {
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
    gap: 0.25rem;
  }
}
</style>
