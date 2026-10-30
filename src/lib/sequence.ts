// A monotonically increasing number, safe to sort by even when called
// repeatedly within the same millisecond (Date.now() alone isn't precise
// enough for that — `new Date().toISOString()` ties happen constantly under
// fast/local writes). Survives reloads because it's always >= Date.now()*1000.

let lastMs = 0
let counter = 0

export function nextSeq(): number {
  const now = Date.now()
  if (now === lastMs) {
    counter++
  } else {
    lastMs = now
    counter = 0
  }
  return now * 1000 + counter
}
