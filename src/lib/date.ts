// Local-calendar-day helpers, shared by order numbering (section 7) and the
// daily sales report. All "local" — this is about the till's own timezone,
// not UTC, so a café's business day lines up with its actual opening hours.

export function toLocalYYYYMMDD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

/** For `<input type="date">`, which wants "YYYY-MM-DD". */
export function toLocalDateInputValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Parses an `<input type="date">` value back into a local Date. Deliberately
 * not `new Date(value)` — that parses "YYYY-MM-DD" as UTC midnight, which
 * lands on the wrong calendar day in any timezone behind UTC.
 */
export function parseLocalDateInputValue(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function isOnLocalDate(isoDateTime: string, yyyymmdd: string): boolean {
  return toLocalYYYYMMDD(new Date(isoDateTime)) === yyyymmdd
}
