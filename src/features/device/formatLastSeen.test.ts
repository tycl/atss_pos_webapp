import { describe, expect, it } from 'vitest'
import { formatLastSeen } from './formatLastSeen'

const NOW = new Date('2026-01-01T12:00:00.000Z')

describe('formatLastSeen', () => {
  it('returns "Never" when there is no last_seen_at yet', () => {
    expect(formatLastSeen(null, NOW)).toBe('Never')
  })

  it('returns "Just now" for a timestamp less than a minute ago', () => {
    expect(formatLastSeen(new Date(NOW.getTime() - 30_000).toISOString(), NOW)).toBe('Just now')
  })

  it('returns minutes for under an hour', () => {
    expect(formatLastSeen(new Date(NOW.getTime() - 5 * 60_000).toISOString(), NOW)).toBe(
      '5 min ago',
    )
  })

  it('returns hours for under a day', () => {
    expect(formatLastSeen(new Date(NOW.getTime() - 3 * 60 * 60_000).toISOString(), NOW)).toBe(
      '3 hr ago',
    )
  })

  it('returns days, pluralized correctly, for a day or more', () => {
    expect(formatLastSeen(new Date(NOW.getTime() - 24 * 60 * 60_000).toISOString(), NOW)).toBe(
      '1 day ago',
    )
    expect(formatLastSeen(new Date(NOW.getTime() - 3 * 24 * 60 * 60_000).toISOString(), NOW)).toBe(
      '3 days ago',
    )
  })

  it('returns "Just now" for a timestamp slightly in the future (clock skew)', () => {
    expect(formatLastSeen(new Date(NOW.getTime() + 5_000).toISOString(), NOW)).toBe('Just now')
  })
})
