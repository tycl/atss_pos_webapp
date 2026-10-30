// Money is always an integer count of sen. Never use floats for money (CLAUDE.md section 3).

/** Parses a user-typed ringgit string (e.g. "12.50", "12") into integer sen. Throws on invalid input. */
export function parseRMToSen(input: string): number {
  const trimmed = input.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`Invalid RM amount: "${input}"`)
  }
  const [ringgit, cents = ''] = trimmed.split('.')
  const paddedCents = cents.padEnd(2, '0')
  return Number(ringgit) * 100 + Number(paddedCents)
}

/** Formats integer sen as a ringgit string, e.g. 1250 -> "RM 12.50". */
export function formatSenAsRM(sen: number): string {
  if (!Number.isInteger(sen)) {
    throw new Error(`Amount must be an integer number of sen, got: ${sen}`)
  }
  const negative = sen < 0
  const abs = Math.abs(sen)
  const ringgit = Math.floor(abs / 100)
  const cents = (abs % 100).toString().padStart(2, '0')
  return `${negative ? '-' : ''}RM ${ringgit}.${cents}`
}

/** Sums an array of integer sen amounts. */
export function sumSen(amounts: number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0)
}

/** Parses a user-typed percentage string (e.g. "6", "6.5") into basis points (600, 650). Throws on invalid input. */
export function percentStringToBp(value: string): number {
  const percent = Number.parseFloat(value)
  if (Number.isNaN(percent) || percent < 0) {
    throw new Error(`Invalid percentage: "${value}"`)
  }
  return Math.round(percent * 100)
}
