/** A time zone for displaying times: IANA name plus the short label shown next to times */
export interface DisplayZone {
  /** IANA zone, e.g. "Asia/Kuala_Lumpur" */
  zone: string
  /** Shown after times, e.g. "MYT" */
  label: string
}

export const UTC: DisplayZone = { zone: 'UTC', label: 'UTC' }
/** Malaysia time, UTC+8 (no daylight saving) */
export const MYT: DisplayZone = { zone: 'Asia/Kuala_Lumpur', label: 'MYT' }

/** A calendar day for display: "2026-11-06" → "06/11/2026" */
export function formatDate(day: string): string {
  const [year, month, date] = day.split('-')
  return `${date}/${month}/${year}`
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>()

/**
 * The calendar day ("YYYY-MM-DD") a point falls on in `zone`. A plain date ("2026-10-16")
 * is already a day and is returned as is; a timestamp is converted, so e.g. 2026-10-15T17:00Z
 * is "2026-10-16" in Malaysia.
 */
export function dayKey(date: string, zone: string): string {
  if (date.length === 10) return date
  let fmt = dayFormatters.get(zone)
  if (!fmt) {
    // en-CA formats as YYYY-MM-DD
    fmt = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: zone,
    })
    dayFormatters.set(zone, fmt)
  }
  // Database timestamps are UTC; read a timestamp without a zone suffix as UTC, not local time
  const utc = /(Z|[+-]\d{2}:?\d{2})$/.test(date) ? date : `${date}Z`
  return fmt.format(new Date(utc))
}

/**
 * The trading day ("YYYY-MM-DD") a point belongs to: like dayKey, but the day starts at
 * `startHour` in `zone` instead of midnight. With startHour 6, a night session running
 * 17:15 Fri → 02:00 Sat (MYT) counts entirely as Friday. Plain dates are returned as is.
 */
export function tradingDayKey(date: string, zone: string, startHour = 0): string {
  if (date.length === 10 || !startHour) return dayKey(date, zone)
  const utc = /(Z|[+-]\d{2}:?\d{2})$/.test(date) ? date : `${date}Z`
  const shifted = new Date(new Date(utc).getTime() - startHour * 3_600_000)
  return dayKey(shifted.toISOString(), zone)
}
