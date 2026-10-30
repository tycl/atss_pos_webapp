import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import type { Settings } from '../../lib/types'
import { getSettings, updateSettings } from './api'

const OUTLET_ID = 'outlet-1'

const initial: Settings = {
  outlet_id: OUTLET_ID,
  merchant_id: 'merchant-1',
  sst_enabled: false,
  sst_rate_bp: 0,
  service_charge_enabled: false,
  service_charge_rate_bp: 0,
  cash_rounding_enabled: false,
  duitnow_qr_url: null,
  print_bridge_url: null,
}

beforeEach(async () => {
  await db.settings.clear()
  await db.sync_queue.clear()
  await db.settings.put(initial)
})

describe('settings', () => {
  it('reads the current settings for an outlet', async () => {
    expect(await getSettings(OUTLET_ID)).toEqual(initial)
  })

  it('updates settings and queues the full updated row for sync', async () => {
    const updated = await updateSettings(OUTLET_ID, {
      sst_enabled: true,
      sst_rate_bp: 600,
      duitnow_qr_url: 'https://example.com/qr.png',
    })

    expect(updated.sst_enabled).toBe(true)
    expect(updated.sst_rate_bp).toBe(600)
    expect(updated.duitnow_qr_url).toBe('https://example.com/qr.png')
    // Untouched fields are preserved.
    expect(updated.service_charge_enabled).toBe(false)

    const queued = await db.sync_queue.toArray()
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({ table: 'settings', op: 'upsert' })
  })

  it('throws when the outlet has no settings row', async () => {
    await expect(updateSettings('missing-outlet', { sst_enabled: true })).rejects.toThrow()
  })
})
