export interface CsvColumn<T> {
  key: keyof T
  label: string
}

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '')
  if (/["\r\n,]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** CRLF-delimited per RFC 4180 (and what Excel expects). */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: CsvColumn<T>[],
): string {
  const header = columns.map((c) => escapeCsvCell(c.label)).join(',')
  const lines = rows.map((row) => columns.map((c) => escapeCsvCell(row[c.key])).join(','))
  return [header, ...lines].join('\r\n')
}

/** Triggers a browser download of the given CSV text. DOM-only — not meaningfully unit-testable. */
export function downloadCsv(filename: string, csvText: string): void {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
