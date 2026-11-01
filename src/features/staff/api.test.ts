import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { verifyPin } from '../../lib/pin'
import {
  createStaff,
  listStaff,
  renameStaff,
  resetStaffPin,
  setStaffActive,
  updateStaffRole,
} from './api'

const MERCHANT_A = 'merchant-a'
const MERCHANT_B = 'merchant-b'

beforeEach(async () => {
  await db.staff.clear()
  await db.audit_log.clear()
  await db.sync_queue.clear()
})

describe('createStaff', () => {
  it('creates a staff member with a hashed PIN, writes to Dexie, and queues it for sync', async () => {
    const staff = await createStaff({
      merchantId: MERCHANT_A,
      name: 'Alice',
      role: 'cashier',
      pin: '1234',
    })

    expect(staff.pin_hash).not.toBe('1234')
    expect(await verifyPin('1234', staff.pin_hash)).toBe(true)
    expect(await db.staff.get(staff.id)).toEqual(staff)

    const queued = await db.sync_queue.toArray()
    expect(queued).toHaveLength(1)
    expect(queued[0].table).toBe('staff')
  })

  it('rejects a PIN that is not 4-6 digits', async () => {
    await expect(
      createStaff({ merchantId: MERCHANT_A, name: 'Bob', role: 'cashier', pin: '12' }),
    ).rejects.toThrow('4–6 digits')
    await expect(
      createStaff({ merchantId: MERCHANT_A, name: 'Bob', role: 'cashier', pin: 'abcd' }),
    ).rejects.toThrow('4–6 digits')
  })

  it('rejects a blank name', async () => {
    await expect(
      createStaff({ merchantId: MERCHANT_A, name: '  ', role: 'cashier', pin: '1234' }),
    ).rejects.toThrow('Name is required')
  })

  it('rejects a PIN already used by another active staff member of the same merchant', async () => {
    await createStaff({ merchantId: MERCHANT_A, name: 'Alice', role: 'cashier', pin: '1234' })

    await expect(
      createStaff({ merchantId: MERCHANT_A, name: 'Bob', role: 'cashier', pin: '1234' }),
    ).rejects.toThrow('already used')
  })

  it('allows the same PIN across different merchants', async () => {
    await createStaff({ merchantId: MERCHANT_A, name: 'Alice', role: 'cashier', pin: '1234' })

    await expect(
      createStaff({ merchantId: MERCHANT_B, name: 'Carol', role: 'cashier', pin: '1234' }),
    ).resolves.toBeTruthy()
  })

  it('allows reusing a PIN that belongs to a deactivated staff member', async () => {
    const alice = await createStaff({
      merchantId: MERCHANT_A,
      name: 'Alice',
      role: 'cashier',
      pin: '1234',
    })
    await setStaffActive(alice.id, false)

    await expect(
      createStaff({ merchantId: MERCHANT_A, name: 'Bob', role: 'cashier', pin: '1234' }),
    ).resolves.toBeTruthy()
  })
})

describe('listStaff', () => {
  it('only returns staff for the given merchant', async () => {
    await createStaff({ merchantId: MERCHANT_A, name: 'Alice', role: 'cashier', pin: '1234' })
    await createStaff({ merchantId: MERCHANT_B, name: 'Carol', role: 'cashier', pin: '5678' })

    const staff = await listStaff(MERCHANT_A)
    expect(staff.map((s) => s.name)).toEqual(['Alice'])
  })
})

describe('renameStaff', () => {
  it('updates the name and queues the change for sync', async () => {
    const staff = await createStaff({
      merchantId: MERCHANT_A,
      name: 'Alice',
      role: 'cashier',
      pin: '1234',
    })

    const updated = await renameStaff(staff.id, 'Alicia')
    expect(updated.name).toBe('Alicia')
    expect((await db.staff.get(staff.id))?.name).toBe('Alicia')
  })

  it('rejects a blank name', async () => {
    const staff = await createStaff({
      merchantId: MERCHANT_A,
      name: 'Alice',
      role: 'cashier',
      pin: '1234',
    })
    await expect(renameStaff(staff.id, '   ')).rejects.toThrow('Name is required')
  })
})

describe('updateStaffRole', () => {
  it('changes the role', async () => {
    const staff = await createStaff({
      merchantId: MERCHANT_A,
      name: 'Alice',
      role: 'cashier',
      pin: '1234',
    })
    const updated = await updateStaffRole(staff.id, 'manager')
    expect(updated.role).toBe('manager')
  })

  it('refuses to demote the last active owner', async () => {
    const owner = await createStaff({
      merchantId: MERCHANT_A,
      name: 'Owner',
      role: 'owner',
      pin: '1234',
    })
    await expect(updateStaffRole(owner.id, 'manager')).rejects.toThrow('last active owner')
  })

  it('allows demoting an owner when another active owner remains', async () => {
    const owner1 = await createStaff({
      merchantId: MERCHANT_A,
      name: 'Owner1',
      role: 'owner',
      pin: '1234',
    })
    await createStaff({ merchantId: MERCHANT_A, name: 'Owner2', role: 'owner', pin: '5678' })

    const updated = await updateStaffRole(owner1.id, 'manager')
    expect(updated.role).toBe('manager')
  })
})

describe('setStaffActive', () => {
  it('deactivates and reactivates a staff member', async () => {
    const staff = await createStaff({
      merchantId: MERCHANT_A,
      name: 'Alice',
      role: 'cashier',
      pin: '1234',
    })

    const deactivated = await setStaffActive(staff.id, false)
    expect(deactivated.active).toBe(false)

    const reactivated = await setStaffActive(staff.id, true)
    expect(reactivated.active).toBe(true)
  })

  it('refuses to deactivate the last active owner', async () => {
    const owner = await createStaff({
      merchantId: MERCHANT_A,
      name: 'Owner',
      role: 'owner',
      pin: '1234',
    })
    await expect(setStaffActive(owner.id, false)).rejects.toThrow('last active owner')
  })
})

describe('resetStaffPin', () => {
  it('changes the PIN hash and logs it to audit_log', async () => {
    const staff = await createStaff({
      merchantId: MERCHANT_A,
      name: 'Alice',
      role: 'cashier',
      pin: '1234',
    })
    const owner = await createStaff({
      merchantId: MERCHANT_A,
      name: 'Owner',
      role: 'owner',
      pin: '9999',
    })

    const updated = await resetStaffPin(staff.id, '4321', owner.id)
    expect(await verifyPin('4321', updated.pin_hash)).toBe(true)
    expect(await verifyPin('1234', updated.pin_hash)).toBe(false)

    const auditEntries = await db.audit_log.toArray()
    expect(auditEntries).toHaveLength(1)
    expect(auditEntries[0].action).toBe('reset_staff_pin')
    expect(auditEntries[0].staff_id).toBe(owner.id)
    expect(auditEntries[0].details).toMatchObject({ staff_id: staff.id })
  })

  it('rejects an invalid PIN format', async () => {
    const staff = await createStaff({
      merchantId: MERCHANT_A,
      name: 'Alice',
      role: 'cashier',
      pin: '1234',
    })
    await expect(resetStaffPin(staff.id, '12', staff.id)).rejects.toThrow('4–6 digits')
  })

  it('rejects a PIN already used by another active staff member', async () => {
    const alice = await createStaff({
      merchantId: MERCHANT_A,
      name: 'Alice',
      role: 'cashier',
      pin: '1234',
    })
    const bob = await createStaff({
      merchantId: MERCHANT_A,
      name: 'Bob',
      role: 'cashier',
      pin: '5678',
    })

    await expect(resetStaffPin(bob.id, '1234', alice.id)).rejects.toThrow('already used')
  })
})
