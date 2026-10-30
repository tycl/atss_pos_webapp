import { db } from '../../lib/db'
import type { KitchenTicketData, ReceiptData } from './types'

async function requireRow<T>(row: T | undefined, what: string): Promise<T> {
  if (!row) throw new Error(`${what} not found`)
  return row
}

export async function buildReceiptData(orderId: string): Promise<ReceiptData> {
  const order = await requireRow(await db.orders.get(orderId), `Order ${orderId}`)
  const outlet = await requireRow(
    await db.outlets.get(order.outlet_id),
    `Outlet ${order.outlet_id}`,
  )
  const merchant = await requireRow(
    await db.merchants.get(order.merchant_id),
    `Merchant ${order.merchant_id}`,
  )
  const staff = await db.staff.get(order.created_by)
  const lines = await db.order_lines.where({ order_id: orderId, status: 'active' }).toArray()
  const payments = await db.payments.where({ order_id: orderId }).toArray()
  const payment = payments[payments.length - 1]

  return {
    shopName: merchant.name,
    ssmNo: merchant.ssm_no,
    sstNo: merchant.sst_no,
    address: outlet.address,
    receiptFooter: outlet.receipt_footer,
    receiptNo: order.order_no,
    dateTimeIso: order.paid_at ?? order.created_at,
    cashierName: staff?.name ?? 'Unknown',
    lines: lines.map((line) => ({
      name: line.name_snapshot,
      qty: line.qty,
      unitPriceSen: line.unit_price_sen,
      modifiers: line.modifiers_snapshot.map((m) => ({ name: m.name, priceSen: m.price_sen })),
      lineTotalSen: line.line_total_sen,
      note: line.note,
    })),
    subtotalSen: order.subtotal_sen,
    serviceChargeSen: order.service_charge_sen,
    sstSen: order.sst_sen,
    roundingSen: order.rounding_sen,
    totalSen: order.total_sen,
    paymentMethod: payment?.method ?? 'cash',
    cashReceivedSen: payment?.cash_received_sen ?? null,
    changeSen: payment?.change_sen ?? null,
  }
}

export async function buildKitchenTicketData(orderId: string): Promise<KitchenTicketData> {
  const order = await requireRow(await db.orders.get(orderId), `Order ${orderId}`)
  const lines = await db.order_lines.where({ order_id: orderId, status: 'active' }).toArray()
  const table = order.table_id ? await db.dine_tables.get(order.table_id) : undefined

  return {
    receiptNo: order.order_no,
    orderType: order.type,
    tableName: table?.name ?? null,
    dateTimeIso: order.created_at,
    lines: lines.map((line) => ({
      name: line.name_snapshot,
      qty: line.qty,
      modifiers: line.modifiers_snapshot.map((m) => m.name),
      note: line.note,
    })),
  }
}
