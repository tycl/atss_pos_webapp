/** Relative "last seen" label for the Tills page — `now` is injectable for tests. */
export function formatLastSeen(lastSeenAt: string | null, now: Date = new Date()): string {
  if (!lastSeenAt) return 'Never'

  const diffMs = now.getTime() - new Date(lastSeenAt).getTime()
  if (diffMs < 0) return 'Just now'

  const diffMinutes = Math.floor(diffMs / 60_000)
  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes} min ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hr ago`

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}
