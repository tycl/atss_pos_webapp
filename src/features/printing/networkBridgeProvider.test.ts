import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNetworkBridgeProvider } from './networkBridgeProvider'
import type { KitchenTicketData, ReceiptData } from './types'

const receipt: ReceiptData = {
  shopName: 'Kopitiam ABC',
  ssmNo: null,
  sstNo: null,
  address: null,
  receiptFooter: null,
  receiptNo: 'D1-20260101-1',
  dateTimeIso: '2026-01-01T06:00:00.000Z',
  cashierName: 'Alice',
  lines: [],
  subtotalSen: 0,
  discountSen: 0,
  discountReason: null,
  serviceChargeSen: 0,
  sstSen: 0,
  roundingSen: 0,
  totalSen: 0,
  paymentMethod: 'cash',
  cashReceivedSen: 0,
  changeSen: 0,
}

const kitchenTicket: KitchenTicketData = {
  receiptNo: 'D1-20260101-1',
  orderType: 'takeaway',
  tableName: null,
  dateTimeIso: '2026-01-01T06:00:00.000Z',
  lines: [],
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createNetworkBridgeProvider', () => {
  it('POSTs receipt bytes to <bridgeUrl>/print', async () => {
    const provider = createNetworkBridgeProvider('http://localhost:7777')
    await provider.printReceipt(receipt)

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:7777/print',
      expect.objectContaining({ method: 'POST' }),
    )
    const body = fetchMock.mock.calls[0][1].body as Uint8Array
    expect(body).toBeInstanceOf(Uint8Array)
    expect(body.length).toBeGreaterThan(0)
  })

  it('strips a trailing slash from the configured bridge URL', async () => {
    const provider = createNetworkBridgeProvider('http://localhost:7777/')
    await provider.printKitchenTicket(kitchenTicket)
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:7777/print', expect.anything())
  })

  it('throws when the bridge responds with a non-ok status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    const provider = createNetworkBridgeProvider('http://localhost:7777')
    await expect(provider.printReceipt(receipt)).rejects.toThrow('500')
  })
})
