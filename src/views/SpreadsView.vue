<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { SPREAD_SECTIONS, type SpreadInfo } from '@/data/spreads'
import { supportsFlagEmoji } from '@/composables/flagEmoji'

/** Windows etc. can't draw flag emoji — show the text badge (SGP, FKLI…) there instead */
const showEmoji = supportsFlagEmoji()

const query = ref('')
const searchInput = ref<HTMLInputElement | null>(null)

/* ---------- Filter: asset classes (sections) OR'd, tags OR'd, the two groups AND'd ---------- */
const ASSET_CLASSES = SPREAD_SECTIONS.map((s) => s.title)
const TAGS = [
  ...new Set(
    SPREAD_SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.spreads.flatMap((x) => x.tags ?? []))),
  ),
].sort()

const selectedClasses = reactive(new Set<string>())
const selectedTags = reactive(new Set<string>())
const filterOpen = ref(false)
const filterRoot = ref<HTMLElement | null>(null)
const activeFilterCount = computed(() => selectedClasses.size + selectedTags.size)

function toggleIn(set: Set<string>, value: string) {
  if (set.has(value)) set.delete(value)
  else set.add(value)
}
function clearFilters() {
  selectedClasses.clear()
  selectedTags.clear()
}
/** "N available →": show only this section (or clear if it's already the only one) */
function focusSection(title: string) {
  const only = selectedClasses.size === 1 && selectedClasses.has(title)
  selectedClasses.clear()
  if (!only) selectedClasses.add(title)
}

function spreadTo(s: SpreadInfo) {
  return s.routeName
    ? { name: s.routeName, params: s.routeParams }
    : { name: 'spread-detail', params: { spreadName: s.name } }
}

const sections = computed(() => {
  const q = query.value.trim().toLowerCase()
  const filtering = !!q || activeFilterCount.value > 0
  return SPREAD_SECTIONS.filter(
    (section) => !selectedClasses.size || selectedClasses.has(section.title),
  )
    .map((section) => {
      const matches = (s: SpreadInfo, group: string) => {
        if (selectedTags.size && !(s.tags ?? []).some((t) => selectedTags.has(t))) return false
        if (!q) return true
        return [s.label, s.name, s.description, group, section.title, ...(s.tags ?? [])]
          .filter(Boolean)
          .some((t) => t!.toLowerCase().includes(q))
      }
      const groups = section.groups
        .map((g) => ({
          ...g,
          total: g.spreads.length,
          spreads: g.spreads.filter((s) => matches(s, g.title)),
        }))
        .filter((g) => g.spreads.length)
      const total = section.groups.reduce((n, g) => n + g.spreads.length, 0)
      const spreads = groups.flatMap((g) => g.spreads)
      return { ...section, total, spreads, groups }
    })
    .filter((s) => !filtering || s.spreads.length || selectedClasses.has(s.title))
})

/* ---------- Collapsible sections & categories (remembered per browser) ---------- */
const COLLAPSE_KEY = 'msl-spreads-collapsed'
const sectionKey = (section: string) => `section:${section}`
const groupKey = (section: string, group: string) => `group:${section}/${group}`

function readCollapsed(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}
const collapsed = reactive(new Set<string>(readCollapsed()))
function saveCollapsed() {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed]))
  } catch {
    // storage unavailable — state just won't persist
  }
}

/** While searching/filtering, everything is expanded so matches are never hidden */
const isFiltering = computed(() => !!query.value.trim() || activeFilterCount.value > 0)
const isOpen = (key: string) => isFiltering.value || !collapsed.has(key)

function toggleCollapsed(key: string) {
  if (isFiltering.value) return
  toggleIn(collapsed, key)
  saveCollapsed()
}

const ALL_KEYS = SPREAD_SECTIONS.flatMap((s) => [
  sectionKey(s.title),
  ...s.groups.filter((g) => g.title && g.spreads.length).map((g) => groupKey(s.title, g.title)),
])
const allCollapsed = computed(() => ALL_KEYS.every((k) => collapsed.has(k)))
function toggleAll() {
  const collapse = !allCollapsed.value
  collapsed.clear()
  if (collapse) ALL_KEYS.forEach((k) => collapsed.add(k))
  saveCollapsed()
}

/* ---------- Keyboard & outside click ---------- */
function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    searchInput.value?.focus()
    searchInput.value?.select()
  } else if (e.key === 'Escape' && filterOpen.value) {
    filterOpen.value = false
  }
}
function onPointerDown(e: PointerEvent) {
  if (filterOpen.value && !filterRoot.value?.contains(e.target as Node)) filterOpen.value = false
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('pointerdown', onPointerDown)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('pointerdown', onPointerDown)
})

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    query.value = ''
    searchInput.value?.blur()
  }
}
</script>

<template>
  <main class="spreads">
    <svg
      class="waves"
      viewBox="0 0 1000 360"
      preserveAspectRatio="xMaxYMin slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="wave-fade-a" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stop-color="var(--wave-1)" stop-opacity="0" />
          <stop offset="100%" stop-color="var(--wave-1)" />
        </linearGradient>
        <linearGradient id="wave-fade-b" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stop-color="var(--wave-2)" stop-opacity="0" />
          <stop offset="100%" stop-color="var(--wave-2)" />
        </linearGradient>
        <linearGradient id="wave-ribbon" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stop-color="var(--wave-2)" stop-opacity="0" />
          <stop offset="55%" stop-color="var(--wave-2)" />
          <stop offset="100%" stop-color="var(--wave-3)" />
        </linearGradient>
      </defs>
      <path d="M280 0 C 470 40, 560 260, 1000 290 L1000 0 Z" fill="url(#wave-fade-a)" />
      <path
        d="M560 0 C 640 90, 720 210, 1000 190 L1000 0 Z"
        fill="url(#wave-fade-b)"
        opacity="0.8"
      />
      <path
        d="M520 330 C 690 260, 790 140, 1000 70 L1000 150 C 840 180, 720 270, 590 340 Z"
        fill="url(#wave-ribbon)"
      />
      <path d="M760 0 C 820 40, 880 70, 1000 40 L1000 0 Z" fill="var(--wave-2)" opacity="0.35" />
    </svg>

    <header class="hero">
      <h1>Spreads</h1>
      <p class="subtitle">Explore and analyse historical spread behaviour.</p>
    </header>

    <div class="toolbar">
      <label class="search">
        <AppIcon name="search" :size="18" class="search-icon" />
        <span class="sr-only">Search spreads</span>
        <input
          ref="searchInput"
          v-model="query"
          type="search"
          placeholder="Search spreads..."
          autocomplete="off"
          spellcheck="false"
          @keydown="onSearchKeydown"
        />
        <button
          v-if="query"
          type="button"
          class="search-clear"
          aria-label="Clear search"
          @click="query = ''"
        >
          <AppIcon name="x" :size="16" />
        </button>
      </label>

      <div ref="filterRoot" class="filter">
        <button
          type="button"
          class="filter-btn"
          :class="{ active: activeFilterCount }"
          aria-haspopup="true"
          :aria-expanded="filterOpen"
          @click="filterOpen = !filterOpen"
        >
          <AppIcon name="filter" :size="17" />
          <span>Filter</span>
          <span v-if="activeFilterCount" class="filter-count">{{ activeFilterCount }}</span>
          <AppIcon name="chevron-down" :size="16" class="chev" :class="{ open: filterOpen }" />
        </button>

        <div v-if="filterOpen" class="filter-panel" role="group" aria-label="Filter spreads">
          <p class="filter-heading">Asset class</p>
          <label v-for="c in ASSET_CLASSES" :key="c" class="filter-option">
            <input
              type="checkbox"
              :checked="selectedClasses.has(c)"
              @change="toggleIn(selectedClasses, c)"
            />
            <span class="box"><AppIcon name="check" :size="14" :stroke-width="3" /></span>
            {{ c }}
          </label>
          <template v-if="TAGS.length">
            <p class="filter-heading">Tags</p>
            <label v-for="t in TAGS" :key="t" class="filter-option">
              <input
                type="checkbox"
                :checked="selectedTags.has(t)"
                @change="toggleIn(selectedTags, t)"
              />
              <span class="box"><AppIcon name="check" :size="14" :stroke-width="3" /></span>
              {{ t }}
            </label>
          </template>
          <button
            type="button"
            class="filter-clear"
            :disabled="!activeFilterCount"
            @click="clearFilters"
          >
            Clear filters
          </button>
        </div>
      </div>

      <button
        type="button"
        class="tool-btn"
        :disabled="isFiltering"
        :title="isFiltering ? 'Clear search and filters to collapse' : undefined"
        @click="toggleAll"
      >
        <AppIcon :name="allCollapsed ? 'expand-all' : 'collapse-all'" :size="17" />
        <span>{{ allCollapsed ? 'Expand all' : 'Collapse all' }}</span>
      </button>
    </div>

    <section v-for="section in sections" :key="section.title" class="section">
      <div class="section-head">
        <h2>
          <button
            type="button"
            class="section-toggle"
            :aria-expanded="isOpen(sectionKey(section.title))"
            :disabled="isFiltering"
            :title="
              isOpen(sectionKey(section.title)) ? `Hide ${section.title}` : `Show ${section.title}`
            "
            @click="toggleCollapsed(sectionKey(section.title))"
          >
            <AppIcon
              :name="section.icon === 'database' ? 'database-solid' : 'trend'"
              :size="34"
              :stroke-width="section.icon === 'trend' ? 2.5 : 1.75"
              class="section-icon"
            />
            {{ section.title }}
            <AppIcon
              name="chevron-down"
              :size="22"
              :stroke-width="2.25"
              class="toggle-chev"
              :class="{ closed: !isOpen(sectionKey(section.title)) }"
            />
          </button>
        </h2>
        <button
          type="button"
          class="section-link"
          :class="{ active: selectedClasses.size === 1 && selectedClasses.has(section.title) }"
          :title="`Show only ${section.title}`"
          @click="focusSection(section.title)"
        >
          {{
            query || selectedTags.size
              ? `${section.spreads.length} of ${section.total}`
              : `${section.total} available`
          }}
          <AppIcon name="arrow" :size="20" :stroke-width="2.25" class="section-arrow" />
        </button>
      </div>

      <div
        class="collapse"
        :class="{ closed: !isOpen(sectionKey(section.title)) }"
        :inert="!isOpen(sectionKey(section.title))"
      >
        <div class="collapse-inner">
          <div v-if="section.spreads.length" class="categories">
            <div v-for="group in section.groups" :key="group.title" class="category">
              <div v-if="group.title" class="category-head">
                <h3>
                  <button
                    type="button"
                    class="category-toggle"
                    :aria-expanded="isOpen(groupKey(section.title, group.title))"
                    :disabled="isFiltering"
                    :title="
                      isOpen(groupKey(section.title, group.title))
                        ? `Hide ${group.title}`
                        : `Show ${group.title}`
                    "
                    @click="toggleCollapsed(groupKey(section.title, group.title))"
                  >
                    <AppIcon
                      name="chevron-down"
                      :size="16"
                      :stroke-width="2.5"
                      class="toggle-chev"
                      :class="{ closed: !isOpen(groupKey(section.title, group.title)) }"
                    />
                    {{ group.title }}
                  </button>
                </h3>
                <span class="category-count">
                  {{
                    query || selectedTags.size
                      ? `${group.spreads.length} of ${group.total}`
                      : group.total
                  }}
                </span>
                <span class="category-rule" aria-hidden="true" />
              </div>
              <div
                class="collapse"
                :class="{ closed: group.title && !isOpen(groupKey(section.title, group.title)) }"
                :inert="!!group.title && !isOpen(groupKey(section.title, group.title))"
              >
                <div class="collapse-inner">
                  <div class="grid">
                    <!--
                      Square tiles: the flag (or badge / icon) on top, name and description at
                      the bottom. Tags aren't shown (the section, flag and name already say them);
                      search and the filter still use them.
                    -->
                    <RouterLink
                      v-for="s in group.spreads"
                      :key="s.name"
                      :to="spreadTo(s)"
                      class="card"
                    >
                      <div class="card-top">
                        <div
                          class="tile"
                          :class="{
                            text: s.badge && !(s.emoji && showEmoji),
                            emoji: s.emoji && showEmoji,
                          }"
                          aria-hidden="true"
                        >
                          <template v-if="s.emoji && showEmoji">{{ s.emoji }}</template>
                          <template v-else-if="s.badge">{{ s.badge }}</template>
                          <AppIcon v-else name="trend" :size="26" :stroke-width="2.5" />
                        </div>
                        <AppIcon name="arrow" :size="18" :stroke-width="2" class="go" />
                      </div>
                      <div class="card-text">
                        <span class="card-title">{{ s.label ?? s.name }}</span>
                        <span v-if="s.description" class="card-desc">{{ s.description }}</span>
                      </div>
                    </RouterLink>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="empty">
            <AppIcon name="database" :size="46" :stroke-width="1.6" class="empty-icon" />
            <strong>More coming soon</strong>
            <span>{{ section.emptyText ?? 'More spreads are on the way.' }}</span>
          </div>
        </div>
      </div>
    </section>

    <p v-if="!sections.length" class="no-results">
      No spreads match your search.
      <button type="button" class="link-btn" @click="((query = ''), clearFilters())">Reset</button>
    </p>
  </main>
</template>

<style scoped>
.spreads {
  position: relative;
  isolation: isolate;
}

/* ---------- Background waves ---------- */
.waves {
  position: absolute;
  z-index: -1;
  top: -2.25rem;
  right: -2.5rem;
  width: calc(100% + 5.5rem);
  height: 420px;
  pointer-events: none;
  -webkit-mask-image: linear-gradient(to bottom, #000 45%, transparent);
  mask-image: linear-gradient(to bottom, #000 45%, transparent);
}

/* ---------- Header ---------- */
.hero {
  padding: 1.5rem 0 2.25rem;
}
/*
 * Beside the sidebar (wide screens), the title's middle lines up with the logo's: the page's
 * top padding (2.25rem) less 0.75rem puts the 2.75rem-tall title at the logo row's centre.
 */
@media (min-width: 901px) {
  .hero {
    margin-top: -0.75rem;
    padding-top: 0;
  }
}
h1 {
  font-size: clamp(2rem, 3.4vw, 2.75rem);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.03em;
  color: var(--color-heading);
}
.subtitle {
  margin-top: 0.6rem;
  font-size: 1rem;
  color: var(--color-text);
}

/* ---------- Toolbar: search, Filter, Collapse — one 44px row, like the chart page's controls ---------- */
.toolbar {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 2.75rem;
}

.search {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.7rem;
  height: 44px;
  padding: 0 0.5rem 0 1rem;
  border: 1px solid var(--color-border-hover);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-background-soft) 70%, transparent);
  backdrop-filter: blur(8px);
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
  cursor: text;
}
.search:focus-within {
  border-color: var(--color-accent-border);
  box-shadow: 0 0 0 3px var(--color-accent-soft);
}
.search-icon {
  flex: none;
  color: var(--color-text);
}
.search input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-heading);
  font: inherit;
  font-size: 0.9rem;
}
.search input::placeholder {
  color: var(--color-text-muted);
}
.search input::-webkit-search-cancel-button {
  display: none;
}
.search-clear {
  flex: none;
  display: grid;
  place-items: center;
  padding: 0.3rem;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-background-mute);
  color: var(--color-heading);
  cursor: pointer;
}

.filter {
  position: relative;
  flex: none;
}
.filter-btn,
.tool-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 44px;
  padding: 0 0.95rem;
  border: 1px solid var(--color-border-hover);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-background-soft) 70%, transparent);
  backdrop-filter: blur(8px);
  color: var(--color-heading);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.2s;
}
.filter-btn:hover,
.filter-btn.active,
.tool-btn:hover:not(:disabled) {
  border-color: var(--color-accent-border);
}
.tool-btn {
  flex: none;
}
.tool-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.filter-btn:focus-visible,
.tool-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.filter-count {
  display: grid;
  place-items: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--color-accent-solid);
  color: var(--color-on-accent);
  font-size: 0.8rem;
  font-weight: 600;
}
.chev {
  transition: transform 0.2s;
}
.chev.open {
  transform: rotate(180deg);
}

.filter-panel {
  position: absolute;
  z-index: 10;
  top: calc(100% + 0.5rem);
  right: 0;
  width: 240px;
  padding: 0.75rem;
  border: 1px solid var(--color-border-hover);
  border-radius: var(--radius-md);
  background: var(--color-background-soft);
  box-shadow: 0 20px 40px -16px rgba(0, 0, 0, 0.6);
}
.filter-heading {
  padding: 0.5rem 0.5rem 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.filter-option {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.5rem;
  border-radius: 8px;
  color: var(--color-heading);
  cursor: pointer;
}
.filter-option:hover {
  background: var(--color-background-mute);
}
.filter-option input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.box {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 1.5px solid var(--color-border-hover);
  border-radius: 5px;
  color: transparent;
}
.filter-option input:checked + .box {
  border-color: var(--color-accent-solid);
  background: var(--color-accent-solid);
  color: var(--color-on-accent);
}
.filter-option input:focus-visible + .box {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.filter-clear {
  width: 100%;
  margin-top: 0.5rem;
  padding: 0.55rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}
.filter-clear:disabled {
  opacity: 0.45;
  cursor: default;
}

/* ---------- Sections ---------- */
.section + .section {
  margin-top: 3rem;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.1rem;
}
h2 {
  display: flex;
  align-items: center;
  gap: 1.1rem;
  font-size: 1.4rem;
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--color-heading);
}
.section-icon {
  color: var(--color-accent);
}
.section-link {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.35rem 0.5rem 0.35rem 0.75rem;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 0.85rem;
  white-space: nowrap;
  cursor: pointer;
}
.section-link:hover {
  color: var(--color-heading);
}
.section-link.active {
  border-color: var(--color-accent-border);
  background: var(--color-accent-soft);
}
.section-arrow {
  color: var(--color-accent);
  transition: transform 0.2s;
}
.section-link:hover .section-arrow {
  transform: translateX(3px);
}

/* ---------- Collapse toggles ---------- */
.section-toggle,
.category-toggle {
  display: inline-flex;
  align-items: center;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
}
.section-toggle {
  gap: 1.1rem;
}
.category-toggle {
  gap: 0.5rem;
}
.section-toggle:disabled,
.category-toggle:disabled {
  cursor: default;
}
.section-toggle:focus-visible,
.category-toggle:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 4px;
}
.toggle-chev {
  color: var(--color-text-muted);
  transition:
    transform 0.25s,
    color 0.2s;
}
.section-toggle:hover:not(:disabled) .toggle-chev,
.category-toggle:hover:not(:disabled) .toggle-chev {
  color: var(--color-accent);
}
.category-toggle .toggle-chev {
  color: var(--color-accent);
}
.toggle-chev.closed {
  transform: rotate(-90deg);
}
.section-toggle:disabled .toggle-chev,
.category-toggle:disabled .toggle-chev {
  opacity: 0.4;
}

/* Smooth open/close: animate the grid row from 1fr to 0fr */
.collapse {
  display: grid;
  grid-template-rows: 1fr;
  transition:
    grid-template-rows 0.3s ease,
    opacity 0.25s ease;
}
.collapse.closed {
  grid-template-rows: 0fr;
  opacity: 0;
}
.collapse-inner {
  min-height: 0;
  overflow: hidden;
  /* room for card hover lift, shadows and focus rings */
  padding: 8px;
  margin: -8px;
}
@media (prefers-reduced-motion: reduce) {
  .collapse,
  .toggle-chev {
    transition: none;
  }
}

/* ---------- Categories (sub-groups within a section) ---------- */
.categories {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}
.category-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
h3 {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-heading);
  white-space: nowrap;
}
.category-count {
  display: grid;
  place-items: center;
  min-width: 24px;
  height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--color-accent-soft);
  border: 1px solid var(--color-accent-border);
  color: var(--color-accent-strong);
  font-size: 0.7rem;
  font-weight: 600;
  white-space: nowrap;
}
.category-rule {
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, var(--color-border-hover), transparent);
}

/* ---------- Cards: flat square tiles ---------- */
/* auto-fill (not auto-fit) so tiles keep the same size in every category, even a category
   with a single spread; four across beside the sidebar on a laptop */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 190px), 1fr));
  gap: 1rem;
}

.card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 1rem;
  aspect-ratio: 1;
  min-width: 0;
  padding: 1.15rem;
  border: 1px solid var(--color-border-hover);
  border-radius: var(--radius-lg);
  /* one flat surface: no gradient, no shadow */
  background: var(--color-background-soft);
  color: var(--color-text);
  transition:
    border-color 0.2s,
    transform 0.2s;
}
.card:hover {
  background: var(--color-background-soft);
  border-color: var(--color-accent-border);
  transform: translateY(-2px);
}
.card:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}

.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
/* Neutral tile: the flag brings the colour; the icon (no flag) is the only green on the card */
.tile {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-background-mute);
  color: var(--color-accent);
}
.tile.text {
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--color-heading);
}
.tile.emoji {
  font-size: 1.9rem;
  line-height: 1;
  /* flag emoji are full-colour; keep the font stack emoji-capable */
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}
/* Quiet until hovered: the whole tile is the link */
.go {
  color: var(--color-text-muted);
  transition:
    color 0.2s,
    transform 0.2s;
}
.card:hover .go {
  color: var(--color-accent);
  transform: translateX(2px);
}

.card-text {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}
.card-title {
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1.25;
  color: var(--color-heading);
}
.card-desc {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  font-size: 0.85rem;
  line-height: 1.35;
  /* always two lines tall, so titles line up across a row whether the text wraps or not */
  min-height: 2.7em;
  color: var(--color-text-muted);
}

/* ---------- Empty states ---------- */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 1.75rem 1rem;
  border: 1.5px dashed var(--color-accent-border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-background-soft) 60%, transparent);
  text-align: center;
}
.empty-icon {
  margin-bottom: 0.6rem;
  color: var(--color-accent);
}
.empty strong {
  color: var(--color-heading);
  font-weight: 600;
  font-size: 1rem;
}
.empty span {
  color: var(--color-text);
  font-size: 0.875rem;
}

.no-results {
  padding: 2rem 0;
  color: var(--color-text);
}
.link-btn {
  border: 0;
  background: none;
  color: var(--color-accent);
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* ---------- Narrow ---------- */
@media (max-width: 640px) {
  /* run the waves up behind the translucent top bar (~62px tall) */
  .waves {
    top: calc(-1.5rem - 62px);
    right: -1rem;
    width: calc(100% + 2rem);
    height: 380px;
  }
  .hero {
    padding-top: 1rem;
  }
  .subtitle {
    font-size: 0.875rem;
  }
  .toolbar {
    gap: 0.5rem;
    margin-bottom: 2rem;
  }
  .search {
    padding-left: 0.85rem;
  }
  .filter-btn {
    padding: 0 0.8rem;
  }
  .filter-btn > span:not(.filter-count),
  .tool-btn > span {
    display: none;
  }
  .tool-btn {
    padding: 0 0.8rem;
  }
  h2 {
    gap: 0.75rem;
    font-size: 1.2rem;
  }
  .section-icon {
    width: 28px;
    height: 28px;
  }
  .section-link {
    font-size: 0.8rem;
  }
  /* two tiles across on a phone */
  .grid {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 140px), 1fr));
    gap: 0.75rem;
  }
  .card {
    padding: 0.95rem;
  }
  .tile {
    width: 44px;
    height: 44px;
  }
  .tile.emoji {
    font-size: 1.6rem;
  }
  .card-title {
    font-size: 1rem;
  }
}
</style>
