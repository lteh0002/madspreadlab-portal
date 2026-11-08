/** Market a product is shown under; sets its badge text and colour on the calendar */
export type Market = 'MY' | 'SG' | 'IN' | 'HK'

export interface Expiry {
  product: string
  market: Market
  /** Last trading day, YYYY-MM-DD */
  ltd: string
}

export interface Closure {
  /** YYYY-MM-DD */
  date: string
  /** Text on the calendar, e.g. "BMD closed" */
  label: string
  /** Products that don't trade that day, so it isn't counted as one of their T-n days */
  products?: string[]
}

export type CalendarEvent =
  | { kind: 'closure'; label: string }
  | { kind: 'expiry'; product: string; market: Market; label: string; isLtd: boolean }

/** T-n days shown before each last trading day */
const T_DAYS_SHOWN = 4

/** Within a day, products appear in this order. To add a month, add its expiries and closures. */
export const EXPIRIES: Expiry[] = []

export const CLOSURES: Closure[] = []

function shiftDay(day: string, by: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + by)
  return d.toISOString().slice(0, 10)
}

export function isWeekend(day: string): boolean {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
  return weekday === 0 || weekday === 6
}

/** The `count` trading days before `ltd`, nearest first, skipping weekends and the product's closures */
function tradingDaysBefore(ltd: string, count: number, product: string): string[] {
  const days: string[] = []
  for (let day = shiftDay(ltd, -1); days.length < count; day = shiftDay(day, -1)) {
    const closed = CLOSURES.some((c) => c.date === day && c.products?.includes(product))
    if (!isWeekend(day) && !closed) days.push(day)
  }
  return days
}

/** Everything on the calendar, keyed by YYYY-MM-DD. Closures come first within a day. */
export function calendarEvents(): Map<string, CalendarEvent[]> {
  const byDay = new Map<string, CalendarEvent[]>()
  const add = (day: string, event: CalendarEvent) =>
    byDay.set(day, [...(byDay.get(day) ?? []), event])

  for (const c of CLOSURES) add(c.date, { kind: 'closure', label: c.label })
  for (const { product, market, ltd } of EXPIRIES) {
    add(ltd, { kind: 'expiry', product, market, label: 'LTD', isLtd: true })
    tradingDaysBefore(ltd, T_DAYS_SHOWN, product).forEach((day, i) =>
      add(day, { kind: 'expiry', product, market, label: `T-${i + 1}`, isLtd: false }),
    )
  }
  return byDay
}
