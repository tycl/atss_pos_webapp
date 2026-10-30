import { describe, expect, it } from 'vitest'
import { buildKitchenTicketBytes, buildReceiptBytes } from './escpos'
import type { KitchenTicketData, ReceiptData } from './types'

const DRAWER_KICK_SEQUENCE = String.fromCharCode(0x1b, 0x70, 0x00, 0x19, 0xfa)
const CUT_SEQUENCE = String.fromCharCode(0x1d, 0x56, 0x42, 0x00)

function decode(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join('')
}

function receipt(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return {
    shopName: 'Kopitiam ABC',
    ssmNo: 'SSM123',
    sstNo: null,
    address: '1 Jalan Test',
    receiptFooter: 'Thank you!',
    receiptNo: 'D1-20260101-1',
    dateTimeIso: '2026-01-01T06:30:00.000Z',
    cashierName: 'Alice',
    lines: [
      {
        name: 'Teh Ais',
        qty: 2,
        unitPriceSen: 250,
        modifiers: [{ name: 'Extra shot', priceSen: 150 }],
        lineTotalSen: 800,
        note: 'less ice',
      },
    ],
    subtotalSen: 800,
    serviceChargeSen: 80,
    sstSen: 53,
    roundingSen: 2,
    totalSen: 935,
    paymentMethod: 'cash',
    cashReceivedSen: 1000,
    changeSen: 65,
    ...overrides,
  }
}

describe('buildReceiptBytes', () => {
  it('includes every required field from CLAUDE.md section 7', () => {
    const text = decode(buildReceiptBytes(receipt()))

    expect(text).toContain('Kopitiam ABC') // shop name
    expect(text).toContain('SSM123') // SSM no.
    expect(text).toContain('1 Jalan Test') // address
    expect(text).toContain('D1-20260101-1') // receipt no.
    expect(text).toContain('2026-01-01') // date/time
    expect(text).toContain('Alice') // cashier
    expect(text).toContain('Teh Ais') // item
    expect(text).toContain('Extra shot') // modifier
    expect(text).toContain('RM 8.00') // subtotal
    expect(text).toContain('RM 0.80') // service charge
    expect(text).toContain('RM 0.53') // SST
    expect(text).toContain('RM 0.02') // rounding
    expect(text).toContain('RM 9.35') // total
    expect(text).toContain('Cash') // payment method
    expect(text).toContain('RM 0.65') // change
  })

  it('omits SST no. when not provided, and includes it when provided', () => {
    expect(decode(buildReceiptBytes(receipt({ sstNo: null })))).not.toContain('SST:')
    expect(decode(buildReceiptBytes(receipt({ sstNo: 'SST999' })))).toContain('SST999')
  })

  it('omits service charge / SST / rounding lines when they are zero', () => {
    const text = decode(
      buildReceiptBytes(receipt({ serviceChargeSen: 0, sstSen: 0, roundingSen: 0, totalSen: 800 })),
    )
    expect(text).not.toContain('Service charge')
    expect(text).not.toContain('SST')
    expect(text).not.toContain('Rounding')
  })

  it('shows DuitNow QR payment without cash received/change lines', () => {
    const text = decode(
      buildReceiptBytes(
        receipt({ paymentMethod: 'duitnow_qr', cashReceivedSen: null, changeSen: null }),
      ),
    )
    expect(text).toContain('DuitNow QR')
    expect(text).not.toContain('Cash received')
    expect(text).not.toContain('Change')
  })

  it('kicks the drawer only when requested', () => {
    expect(decode(buildReceiptBytes(receipt(), { kickDrawer: true }))).toContain(
      DRAWER_KICK_SEQUENCE,
    )
    expect(decode(buildReceiptBytes(receipt(), { kickDrawer: false }))).not.toContain(
      DRAWER_KICK_SEQUENCE,
    )
    expect(decode(buildReceiptBytes(receipt()))).not.toContain(DRAWER_KICK_SEQUENCE)
  })

  it('always ends with a cut command', () => {
    const bytes = buildReceiptBytes(receipt())
    const text = decode(bytes)
    expect(text.endsWith(CUT_SEQUENCE)).toBe(true)
  })
})

function kitchenTicket(overrides: Partial<KitchenTicketData> = {}): KitchenTicketData {
  return {
    receiptNo: 'D1-20260101-1',
    orderType: 'dine_in',
    tableName: 'Table 3',
    dateTimeIso: '2026-01-01T06:30:00.000Z',
    lines: [{ name: 'Teh Ais', qty: 2, modifiers: ['Extra shot'], note: 'less ice' }],
    ...overrides,
  }
}

describe('buildKitchenTicketBytes', () => {
  it('includes order identity, table, items, modifiers, and notes — no prices', () => {
    const text = decode(buildKitchenTicketBytes(kitchenTicket()))

    expect(text).toContain('D1-20260101-1')
    expect(text).toContain('Table 3')
    expect(text).toContain('Teh Ais')
    expect(text).toContain('Extra shot')
    expect(text).toContain('less ice')
    expect(text).not.toContain('RM')
  })

  it('shows Takeaway instead of a table for takeaway orders', () => {
    const text = decode(
      buildKitchenTicketBytes(kitchenTicket({ orderType: 'takeaway', tableName: null })),
    )
    expect(text).toContain('Takeaway')
    expect(text).not.toContain('Table:')
  })

  it('always ends with a cut command', () => {
    const text = decode(buildKitchenTicketBytes(kitchenTicket()))
    expect(text.endsWith(CUT_SEQUENCE)).toBe(true)
  })
})
