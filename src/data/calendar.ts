import type { ExpiryRule, ProductExpiryRule } from '@/api/products'

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
  | { kind: 'expiry'; product: string; market: string; label: string; isLtd: boolean }

/** T-n days shown before expiry when a product doesn't set its own `tDays` */
const DEFAULT_T_DAYS = 5

/** Badge text on the calendar; an exchange not listed here shows its own code */
const MARKET_BY_EXCHANGE: Record<string, string> = {
  BMD: 'MY',
  SGX: 'SG',
  HKEX: 'HK',
  TAIFEX: 'TW',
  JPX: 'JP',
}

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

function isTradingDay(day: string, product: string): boolean {
  return !isWeekend(day) && !CLOSURES.some((c) => c.date === day && c.products?.includes(product))
}

/** The `count` trading days strictly before `day`, nearest first */
function tradingDaysBefore(day: string, count: number, product: string): string[] {
  const days: string[] = []
  for (let d = shiftDay(day, -1); days.length < count; d = shiftDay(d, -1))
    if (isTradingDay(d, product)) days.push(d)
  return days
}

/**
 * Expiry rules set here win over the ones from the API, until the backend returns them.
 * MCA: 3rd Friday of the month.
 */
const EXPIRY_RULE_OVERRIDES: Record<string, ExpiryRule> = {
  MCA: { type: 'nthWeekday', n: 3, weekday: 5 },
}

/** The product's expiry day in `month` (YYYY-MM) under `rule` */
function expiryDay(month: string, rule: ExpiryRule, product: string): string {
  const year = Number(month.slice(0, 4))
  const monthIndex = Number(month.slice(5)) - 1
  if (rule.type === 'nthWeekday') {
    const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay()
    const date = 1 + ((rule.weekday - firstWeekday + 7) % 7) + (rule.n - 1) * 7
    const day = new Date(Date.UTC(year, monthIndex, date)).toISOString().slice(0, 10)
    // A holiday on the expiry day moves it to the trading day before
    return isTradingDay(day, product) ? day : tradingDaysBefore(day, 1, product)[0]!
  }
  const nextMonth = new Date(Date.UTC(year, monthIndex + 1, 1)).toISOString()
  return tradingDaysBefore(nextMonth.slice(0, 10), rule.n, product)[rule.n - 1]!
}

/**
 * Everything on the calendar for `months` (YYYY-MM), keyed by YYYY-MM-DD. Closures come first
 * within a day, then products in the order given. Pass the following month too: the run-up to
 * an expiry early in a month starts in the month before it.
 */
export function calendarEvents(
  rules: ProductExpiryRule[],
  months: string[],
): Map<string, CalendarEvent[]> {
  const byDay = new Map<string, CalendarEvent[]>()
  const add = (day: string, event: CalendarEvent) =>
    byDay.set(day, [...(byDay.get(day) ?? []), event])

  for (const c of CLOSURES) add(c.date, { kind: 'closure', label: c.label })
  for (const { name: product, exchange, expiryRule, tDays } of rules) {
    const market = MARKET_BY_EXCHANGE[exchange] ?? exchange
    for (const month of months) {
      const expiry = expiryDay(month, EXPIRY_RULE_OVERRIDES[product] ?? expiryRule, product)
      add(expiry, { kind: 'expiry', product, market, label: 'T-0', isLtd: true })
      tradingDaysBefore(expiry, tDays ?? DEFAULT_T_DAYS, product).forEach((day, i) =>
        add(day, { kind: 'expiry', product, market, label: `T-${i + 1}`, isLtd: false }),
      )
    }
  }
  return byDay
}
