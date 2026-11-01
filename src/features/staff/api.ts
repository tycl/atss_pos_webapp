import { db } from '../../lib/db'
import { hashPin, verifyPin } from '../../lib/pin'
import type { AuditLog, Staff, StaffRole } from '../../lib/types'
import { enqueue } from '../sync/queue'

// Every write here follows the same pattern as features/menu/api.ts: Dexie
// first (CLAUDE.md section 8), then queued to Supabase.

const PIN_PATTERN = /^\d{4,6}$/

function validatePinFormat(pin: string): void {
  if (!PIN_PATTERN.test(pin)) {
    throw new Error('PIN must be 4–6 digits')
  }
}

/**
 * Logins match a PIN against every active staff member of the merchant
 * (see features/auth/pinLogin.ts) rather than a specific staff id, so two
 * active staff sharing one PIN would be ambiguous — reject that up front.
 */
async function assertPinNotInUse(
  merchantId: string,
  pin: string,
  excludeStaffId?: string,
): Promise<void> {
  const candidates = await db.staff.where({ merchant_id: merchantId }).toArray()
  for (const candidate of candidates) {
    if (!candidate.active || candidate.id === excludeStaffId) continue
    if (await verifyPin(pin, candidate.pin_hash)) {
      throw new Error('That PIN is already used by another staff member')
    }
  }
}

/** Blocks an edit that would leave the merchant with no active owner. */
async function assertKeepsAnActiveOwner(merchantId: string, excludeStaffId: string): Promise<void> {
  const staff = await db.staff.where({ merchant_id: merchantId }).toArray()
  const remainingOwners = staff.filter(
    (s) => s.active && s.role === 'owner' && s.id !== excludeStaffId,
  )
  if (remainingOwners.length === 0) {
    throw new Error('Cannot remove the last active owner')
  }
}

export async function listStaff(merchantId: string): Promise<Staff[]> {
  return db.staff.where({ merchant_id: merchantId }).sortBy('name')
}

export interface CreateStaffInput {
  merchantId: string
  name: string
  role: StaffRole
  pin: string
}

export async function createStaff(input: CreateStaffInput): Promise<Staff> {
  const name = input.name.trim()
  if (!name) throw new Error('Name is required')
  validatePinFormat(input.pin)
  await assertPinNotInUse(input.merchantId, input.pin)

  const staff: Staff = {
    id: crypto.randomUUID(),
    merchant_id: input.merchantId,
    name,
    role: input.role,
    pin_hash: await hashPin(input.pin),
    active: true,
  }
  await db.staff.put(staff)
  await enqueue('staff', 'upsert', { ...staff })
  return staff
}

export async function renameStaff(id: string, name: string): Promise<Staff> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Name is required')
  await db.staff.update(id, { name: trimmed })
  const updated = await db.staff.get(id)
  if (!updated) throw new Error(`Staff not found after update: ${id}`)
  await enqueue('staff', 'upsert', { ...updated })
  return updated
}

export async function updateStaffRole(id: string, role: StaffRole): Promise<Staff> {
  const staff = await db.staff.get(id)
  if (!staff) throw new Error(`Staff not found: ${id}`)
  if (staff.role === 'owner' && role !== 'owner') {
    await assertKeepsAnActiveOwner(staff.merchant_id, id)
  }

  await db.staff.update(id, { role })
  const updated = await db.staff.get(id)
  if (!updated) throw new Error(`Staff not found after update: ${id}`)
  await enqueue('staff', 'upsert', { ...updated })
  return updated
}

export async function setStaffActive(id: string, active: boolean): Promise<Staff> {
  const staff = await db.staff.get(id)
  if (!staff) throw new Error(`Staff not found: ${id}`)
  if (!active && staff.role === 'owner') {
    await assertKeepsAnActiveOwner(staff.merchant_id, id)
  }

  await db.staff.update(id, { active })
  const updated = await db.staff.get(id)
  if (!updated) throw new Error(`Staff not found after update: ${id}`)
  await enqueue('staff', 'upsert', { ...updated })
  return updated
}

/** Resetting a PIN is sensitive (it's the only thing gating till access and approvals), so it's logged to audit_log like voids/discounts. */
export async function resetStaffPin(
  id: string,
  pin: string,
  changedByStaffId: string,
): Promise<Staff> {
  validatePinFormat(pin)
  const staff = await db.staff.get(id)
  if (!staff) throw new Error(`Staff not found: ${id}`)
  await assertPinNotInUse(staff.merchant_id, pin, id)

  const updated: Staff = { ...staff, pin_hash: await hashPin(pin) }
  await db.staff.put(updated)
  await enqueue('staff', 'upsert', { ...updated })

  const audit: AuditLog = {
    id: crypto.randomUUID(),
    merchant_id: staff.merchant_id,
    staff_id: changedByStaffId,
    action: 'reset_staff_pin',
    details: { staff_id: staff.id, staff_name: staff.name },
    created_at: new Date().toISOString(),
  }
  await db.audit_log.put(audit)
  await enqueue('audit_log', 'upsert', { ...audit })

  return updated
}
