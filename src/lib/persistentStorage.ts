/**
 * Asks the browser to not silently evict this origin's localStorage/IndexedDB
 * under storage pressure (e.g. private browsing cleanup, "clear less-used
 * site data"). Without this, a till's device binding (see
 * features/device/api.ts) and offline order queue can be lost with no
 * warning. Best-effort: unsupported browsers and a declined/failed request
 * both just fall back to today's default (non-durable) behavior.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false

  try {
    const granted = await navigator.storage.persist()
    if (!granted) console.warn('persistent storage: browser declined the request')
    return granted
  } catch (err) {
    console.warn('persistent storage: request failed', err)
    return false
  }
}
