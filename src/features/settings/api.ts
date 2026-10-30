import { db } from '../../lib/db'
import type { Settings } from '../../lib/types'
import { enqueue } from '../sync/queue'

export async function getSettings(outletId: string): Promise<Settings | undefined> {
  return db.settings.get(outletId)
}

export async function updateSettings(
  outletId: string,
  changes: Partial<Omit<Settings, 'outlet_id' | 'merchant_id'>>,
): Promise<Settings> {
  await db.settings.update(outletId, changes)
  const updated = await db.settings.get(outletId)
  if (!updated) throw new Error(`Settings not found for outlet: ${outletId}`)
  await enqueue('settings', 'upsert', { ...updated })
  return updated
}
