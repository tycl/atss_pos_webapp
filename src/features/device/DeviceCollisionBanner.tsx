/**
 * Non-blocking warning shown when heartbeat.ts detects another browser
 * session heartbeating the same till recently. Informational only — never
 * blocks placing orders (product decision: warn, don't block), since a
 * false positive (a stale session that hasn't timed out yet) shouldn't lock
 * out a legitimate till during business hours.
 */
export function DeviceCollisionBanner() {
  return (
    <div className="bg-amber-100 px-4 py-2 text-sm text-amber-800">
      This till looks like it&rsquo;s also open in another browser right now. Using the same till
      from two places at once can create duplicate receipt numbers.
    </div>
  )
}
