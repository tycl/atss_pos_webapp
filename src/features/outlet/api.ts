import { db } from '../../lib/db'
import type { Outlet, Settings } from '../../lib/types'
import { enqueue } from '../sync/queue'

export async function listOutlets(merchantId: string): Promise<Outlet[]> {
  return db.outlets.where({ merchant_id: merchantId }).sortBy('name')
}

export async function createOutlet(input: {
  merchantId: string
  name: string
  address?: string
  receiptFooter?: string
}): Promise<Outlet> {
  const outlet: Outlet = {
    id: crypto.randomUUID(),
    merchant_id: input.merchantId,
    name: input.name,
    address: input.address ?? null,
    receipt_footer: input.receiptFooter ?? null,
  }
  await db.outlets.put(outlet)
  await enqueue('outlets', 'upsert', { ...outlet })

  const settings: Settings = {
    outlet_id: outlet.id,
    merchant_id: input.merchantId,
    sst_enabled: false,
    sst_rate_bp: 0,
    service_charge_enabled: false,
    service_charge_rate_bp: 0,
    cash_rounding_enabled: false,
    duitnow_qr_url: null,
    print_bridge_url: null,
    show_item_photos: false,
  }
  await db.settings.put(settings)
  await enqueue('settings', 'upsert', { ...settings })

  return outlet
}

export async function updateOutlet(
  id: string,
  changes: Partial<Pick<Outlet, 'name' | 'address' | 'receipt_footer'>>,
): Promise<Outlet> {
  await db.outlets.update(id, changes)
  const updated = await db.outlets.get(id)
  if (!updated) throw new Error(`Outlet not found after update: ${id}`)
  await enqueue('outlets', 'upsert', { ...updated })
  return updated
}
