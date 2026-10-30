import { db } from '../../lib/db'
import { getActiveMerchantId } from '../../lib/localSession'
import { verifyPin } from '../../lib/pin'
import type { Staff } from '../../lib/types'

/** Pure matching logic, kept separate from the Dexie query so it's unit-testable. */
export async function findMatchingStaff(pin: string, candidates: Staff[]): Promise<Staff | null> {
  for (const staff of candidates) {
    if (staff.active && (await verifyPin(pin, staff.pin_hash))) {
      return staff
    }
  }
  return null
}

/**
 * Checks a PIN against every active staff member of the merchant this
 * device is signed in to. Reads from Dexie only, so this works fully
 * offline once staff have synced down at least once (CLAUDE.md section 8).
 */
export async function verifyStaffPin(pin: string): Promise<Staff | null> {
  const merchantId = getActiveMerchantId()
  if (!merchantId) return null

  const candidates = await db.staff.where({ merchant_id: merchantId }).toArray()
  return findMatchingStaff(pin, candidates)
}

/**
 * Like verifyStaffPin, but only matches manager/owner staff — CLAUDE.md
 * section 7: "Voids and discounts: require manager/owner PIN and a reason."
 */
export async function verifyApproverPin(pin: string): Promise<Staff | null> {
  const merchantId = getActiveMerchantId()
  if (!merchantId) return null

  const candidates = await db.staff
    .where({ merchant_id: merchantId })
    .toArray()
    .then((staff) => staff.filter((s) => s.role === 'manager' || s.role === 'owner'))
  return findMatchingStaff(pin, candidates)
}
