import type { OrderType, PaymentMethod } from '../../lib/types'

export interface ReceiptModifierView {
  name: string
  priceSen: number
}

export interface ReceiptLineView {
  name: string
  qty: number
  unitPriceSen: number
  modifiers: ReceiptModifierView[]
  lineTotalSen: number
  note: string | null
}

// Matches CLAUDE.md section 7's required receipt fields: "shop name, SSM
// no., SST no. (if SST enabled), address, receipt no., date/time, cashier,
// items with modifiers, subtotal, service charge, SST, rounding, total,
// payment method, change." Discount isn't in that list, but section 7 also
// requires discounts to exist, so it's shown here too when one was applied.
export interface ReceiptData {
  shopName: string
  ssmNo: string | null
  sstNo: string | null
  address: string | null
  receiptFooter: string | null
  receiptNo: string
  dateTimeIso: string
  cashierName: string
  lines: ReceiptLineView[]
  subtotalSen: number
  discountSen: number
  discountReason: string | null
  serviceChargeSen: number
  sstSen: number
  roundingSen: number
  totalSen: number
  paymentMethod: PaymentMethod
  cashReceivedSen: number | null
  changeSen: number | null
}

export interface KitchenTicketLineView {
  name: string
  qty: number
  modifiers: string[]
  note: string | null
}

export interface KitchenTicketData {
  receiptNo: string
  orderType: OrderType
  tableName: string | null
  dateTimeIso: string
  lines: KitchenTicketLineView[]
}

/**
 * Behind this interface: a Capacitor plugin (Android, not built — this
 * project targets web only for now) or the network-bridge implementation
 * (web — see networkBridgeProvider.ts). CLAUDE.md section 11.
 */
export interface PrintingProvider {
  printReceipt(data: ReceiptData, options?: { kickDrawer?: boolean }): Promise<void>
  printKitchenTicket(data: KitchenTicketData): Promise<void>
}
