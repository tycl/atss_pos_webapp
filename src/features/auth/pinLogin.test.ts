import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { clearActiveMerchant, setActiveMerchantId } from '../../lib/localSession'
import { hashPin } from '../../lib/pin'
import type { Staff } from '../../lib/types'
import { findMatchingStaff, verifyApproverPin } from './pinLogin'

async function makeStaff(overrides: Partial<Staff> & { pin: string }): Promise<Staff> {
  const { pin, ...rest } = overrides
  return {
    id: crypto.randomUUID(),
    merchant_id: 'merchant-1',
    name: 'Test Staff',
    role: 'cashier',
    active: true,
    pin_hash: await hashPin(pin),
    ...rest,
  }
}

describe('findMatchingStaff', () => {
  it('returns the staff member whose PIN matches', async () => {
    const alice = await makeStaff({ pin: '1111', name: 'Alice' })
    const bob = await makeStaff({ pin: '2222', name: 'Bob' })

    const match = await findMatchingStaff('2222', [alice, bob])
    expect(match?.name).toBe('Bob')
  })

  it('returns null when no PIN matches', async () => {
    const alice = await makeStaff({ pin: '1111' })
    expect(await findMatchingStaff('9999', [alice])).toBeNull()
  })

  it('ignores inactive staff even if the PIN matches', async () => {
    const alice = await makeStaff({ pin: '1111', active: false })
    expect(await findMatchingStaff('1111', [alice])).toBeNull()
  })

  it('returns null for an empty candidate list', async () => {
    expect(await findMatchingStaff('1111', [])).toBeNull()
  })
})

describe('verifyApproverPin', () => {
  const MERCHANT_ID = 'merchant-1'

  beforeEach(async () => {
    await db.staff.clear()
    setActiveMerchantId(MERCHANT_ID)
  })

  it('matches a manager or owner PIN', async () => {
    const manager = await makeStaff({ pin: '1111', role: 'manager', merchant_id: MERCHANT_ID })
    await db.staff.put(manager)

    const match = await verifyApproverPin('1111')
    expect(match?.id).toBe(manager.id)
  })

  it('does not match a cashier PIN, even if correct', async () => {
    const cashier = await makeStaff({ pin: '1111', role: 'cashier', merchant_id: MERCHANT_ID })
    await db.staff.put(cashier)

    expect(await verifyApproverPin('1111')).toBeNull()
  })

  it('returns null when no active merchant is set', async () => {
    clearActiveMerchant()
    expect(await verifyApproverPin('1111')).toBeNull()
  })
})
