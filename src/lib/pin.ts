// PINs are hashed client-side before they ever reach Dexie or Supabase — the
// `staff.pin_hash` column never holds a plaintext PIN. There's no separate
// salt column in the schema, so the salt is packed into the same string as
// `<saltHex>:<hashHex>`.

function toHex(bytes: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

async function sha256Hex(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(digest)
}

function concatBytes(...parts: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, p) => sum + p.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

/** Hashes a staff PIN into the `<saltHex>:<hashHex>` string stored as `staff.pin_hash`. */
export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await sha256Hex(concatBytes(salt, new TextEncoder().encode(pin)))
  return `${toHex(salt)}:${hash}`
}

/** Checks a PIN against a stored `<saltHex>:<hashHex>` value. */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [saltHex, expectedHash] = stored.split(':')
  if (!saltHex || !expectedHash) return false
  const salt = fromHex(saltHex)
  const actualHash = await sha256Hex(concatBytes(salt, new TextEncoder().encode(pin)))
  return actualHash === expectedHash
}
