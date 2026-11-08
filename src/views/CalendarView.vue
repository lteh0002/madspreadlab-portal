<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { calendarEvents, isWeekend } from '@/data/calendar'
import { usePageTitle } from '@/composables/usePageTitle'
import { MYT, dayKey } from '@/utils/time'

usePageTitle('Calendar')

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const events = calendarEvents()
const today = dayKey(new Date().toISOString(), MYT.zone)
const currentMonth = today.slice(0, 7)

/** Month on screen, YYYY-MM */
const month = ref(currentMonth)

const monthStart = (by: number) =>
  new Date(Date.UTC(Number(month.value.slice(0, 4)), Number(month.value.slice(5)) - 1 + by, 1))

function shiftMonth(by: number) {
  month.value = monthStart(by).toISOString().slice(0, 7)
}

const monthFmt = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const monthTitle = computed(() => monthFmt.format(monthStart(0)))

/** Empty cells before the 1st, so it lands under its weekday (weeks start on Monday) */
const leadingBlanks = computed(() => (monthStart(0).getUTCDay() + 6) % 7)

const days = computed(() => {
  const count = new Date(monthStart(1).getTime() - 1).getUTCDate()
  return Array.from({ length: count }, (_, i) => {
    const key = `${month.value}-${String(i + 1).padStart(2, '0')}`
    const weekday = WEEKDAYS[(leadingBlanks.value + i) % 7]!
    return { key, n: i + 1, weekday, weekend: isWeekend(key), events: events.get(key) ?? [] }
  })
})

const monthEmpty = computed(() => days.value.every((d) => !d.events.length))
</script>

<template>
  <main class="calendar" :class="{ 'has-events': !monthEmpty }">
    <header class="page-head">
      <h1>Calendar</h1>
    </header>

    <div class="toolbar">
      <h2 aria-live="polite">{{ monthTitle }}</h2>
      <div class="month-nav">
        <button
          v-if="month !== currentMonth"
          type="button"
          class="btn sm"
          @click="month = currentMonth"
        >
          This month
        </button>
        <button
          type="button"
          class="btn sm icon"
          aria-label="Previous month"
          @click="shiftMonth(-1)"
        >
          <AppIcon name="arrow-left" :size="18" />
        </button>
        <button type="button" class="btn sm icon" aria-label="Next month" @click="shiftMonth(1)">
          <AppIcon name="arrow" :size="18" />
        </button>
      </div>
    </div>

    <div class="weekdays" aria-hidden="true">
      <span v-for="w in WEEKDAYS" :key="w">{{ w }}</span>
    </div>

    <ol class="grid">
      <li v-for="i in leadingBlanks" :key="`blank-${i}`" class="blank" aria-hidden="true" />
      <li
        v-for="d in days"
        :key="d.key"
        class="day"
        :class="{ weekend: d.weekend, today: d.key === today, quiet: !d.events.length }"
        :aria-current="d.key === today ? 'date' : undefined"
      >
        <time class="date" :datetime="d.key"
          ><span class="weekday">{{ d.weekday }}</span
          ><span class="num">{{ d.n }}</span></time
        >
        <ul v-if="d.events.length" class="events">
          <template v-for="(e, i) in d.events" :key="i">
            <li v-if="e.kind === 'closure'" class="event closure">
              <AppIcon name="x" :size="13" :stroke-width="3" />
              <span class="label">{{ e.label }}</span>
            </li>
            <li v-else class="event" :class="[e.market.toLowerCase(), { ltd: e.isLtd }]">
              <span class="label">{{ e.product }} {{ e.label }}</span>
            </li>
          </template>
        </ul>
      </li>
    </ol>
  </main>
</template>

<style scoped>
.calendar {
  container-type: inline-size;
}

h1 {
  font-size: clamp(2rem, 3.4vw, 2.75rem);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.03em;
  color: var(--color-heading);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin: 1.75rem 0 1rem;
}
h2 {
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--color-heading);
}
.month-nav {
  display: flex;
  gap: 0.4rem;
}
.btn.icon {
  padding-inline: 0.55rem;
}

.weekdays,
.grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.4rem;
}
.weekdays {
  margin-bottom: 0.4rem;
  text-align: center;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-muted);
}
.weekdays span {
  font-weight: inherit;
}

.grid,
.events {
  padding: 0;
  list-style: none;
}

.day {
  min-height: 6.75rem;
  padding: 0.45rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background-soft);
}
.day.weekend {
  background: color-mix(in srgb, var(--color-background-soft) 35%, transparent);
}
.day.today {
  border-color: var(--color-accent);
  box-shadow: inset 0 0 0 1px var(--color-accent);
}

.date {
  display: block;
  padding-left: 0.15rem;
  font-size: 0.85rem;
}
.num {
  font-weight: 600;
  color: var(--color-heading);
}
.weekend .num {
  color: var(--color-text-muted);
}
.today .num {
  color: var(--color-accent-strong);
}
/* Only shown in the list layout, where there's no weekday header */
.weekday {
  display: none;
  color: var(--color-text-muted);
}

.events {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin-top: 0.25rem;
}

.event {
  --market: #1d5fa8;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
  padding: 0.1rem 0.3rem;
  border-radius: 6px;
  background: color-mix(in srgb, var(--market) 22%, transparent);
  color: var(--color-heading);
  font-size: 0.78rem;
  line-height: 1.35;
}
.event.my {
  --market: #9a6410;
}
.event.sg {
  --market: #1d5fa8;
}
.event.in {
  --market: #a8432f;
}
.event.hk {
  --market: #0f7a5a;
}
.event.ltd {
  background: color-mix(in srgb, var(--market) 55%, transparent);
}
.event.ltd .label {
  font-weight: 700;
}

.event.closure {
  background: #c93a3a;
  color: #fff;
}
.event.closure :deep(svg) {
  flex: none;
}
.label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Closure text is free-form and can be long: wrap it rather than cut it off */
.event.closure .label {
  font-weight: 600;
  white-space: normal;
}

@container (max-width: 820px) {
  .day {
    min-height: 3.25rem;
  }

  /* Chips don't fit in seven narrow columns: a month with events is a list of its busy days */
  .has-events .weekdays,
  .has-events .blank,
  .has-events .day.quiet {
    display: none;
  }
  .has-events .grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .has-events .day {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    min-height: 0;
    padding: 0.6rem 0.7rem;
  }
  .has-events .date {
    flex: none;
    width: 3.25rem;
    padding-left: 0;
    font-size: 0.95rem;
  }
  .has-events .weekday {
    display: inline;
    margin-right: 0.3rem;
  }
  .events {
    flex: 1;
    min-width: 0;
    margin-top: 0;
  }
  .event {
    font-size: 0.85rem;
    padding-block: 0.2rem;
  }
}
</style>
