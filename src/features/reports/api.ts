import { toLocalYYYYMMDD, isOnLocalDate } from '../../lib/date'
import { db } from '../../lib/db'
import { sumSen } from '../../lib/money'
import type { PaymentMethod } from '../../lib/types'

export interface SalesByMethod {
  method: PaymentMethod
  totalSen: number
  count: number
}

export interface SalesByItem {
  itemId: string
  name: string
  qty: number
  totalSen: number
}

export interface SalesByCategory {
  categoryId: string | null
  name: string
  totalSen: number
}

// CLAUDE.md section 10 Phase 4: "Daily sales (Z) report: totals by payment
// method, by item, by category, voids, SST and service charge collected."
export interface DailySalesReport {
  dateLabel: string
  totalSalesSen: number
  paidOrderCount: number
  salesByMethod: SalesByMethod[]
  salesByItem: SalesByItem[]
  salesByCategory: SalesByCategory[]
  sstCollectedSen: number
  serviceChargeCollectedSen: number
  voidCount: number
  voidTotalSen: number
}

/**
 * Bucketed by each order's created_at (a small same-day shop's orders are
 * virtually always paid or voided the same day they're created, so this is
 * simpler than tracking payment/void timestamps separately and good enough
 * for this report).
 */
export async function buildDailySalesReport(
  outletId: string,
  date: Date,
): Promise<DailySalesReport> {
  const dateLabel = toLocalYYYYMMDD(date)
  const allOrders = await db.orders.where({ outlet_id: outletId }).toArray()
  const ordersToday = allOrders.filter((order) => isOnLocalDate(order.created_at, dateLabel))

  const paidOrders = ordersToday.filter((order) => order.status === 'paid')
  const voidOrders = ordersToday.filter((order) => order.status === 'void')
  const paidOrderIds = new Set(paidOrders.map((order) => order.id))

  const allPayments = await db.payments.toArray()
  const paymentsToday = allPayments.filter((payment) => paidOrderIds.has(payment.order_id))

  const methodTotals = new Map<PaymentMethod, { totalSen: number; count: number }>()
  for (const payment of paymentsToday) {
    const bucket = methodTotals.get(payment.method) ?? { totalSen: 0, count: 0 }
    bucket.totalSen += payment.amount_sen
    bucket.count += 1
    methodTotals.set(payment.method, bucket)
  }
  const salesByMethod: SalesByMethod[] = Array.from(methodTotals.entries()).map(
    ([method, bucket]) => ({ method, ...bucket }),
  )

  const allLines = await db.order_lines.toArray()
  const linesToday = allLines.filter(
    (line) => paidOrderIds.has(line.order_id) && line.status === 'active',
  )

  const itemTotals = new Map<string, { name: string; qty: number; totalSen: number }>()
  for (const line of linesToday) {
    const bucket = itemTotals.get(line.item_id) ?? {
      name: line.name_snapshot,
      qty: 0,
      totalSen: 0,
    }
    bucket.qty += line.qty
    bucket.totalSen += line.line_total_sen
    itemTotals.set(line.item_id, bucket)
  }
  const salesByItem: SalesByItem[] = Array.from(itemTotals.entries())
    .map(([itemId, bucket]) => ({ itemId, ...bucket }))
    .sort((a, b) => b.totalSen - a.totalSen)

  const items = await db.items.toArray()
  const categoryIdByItemId = new Map(items.map((item) => [item.id, item.category_id]))
  const categories = await db.categories.toArray()
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]))

  const categoryTotals = new Map<
    string,
    { categoryId: string | null; name: string; totalSen: number }
  >()
  for (const line of linesToday) {
    const categoryId = categoryIdByItemId.get(line.item_id) ?? null
    const key = categoryId ?? '__uncategorized__'
    const name = categoryId
      ? (categoryNameById.get(categoryId) ?? 'Unknown category')
      : 'Uncategorized'
    const bucket = categoryTotals.get(key) ?? { categoryId, name, totalSen: 0 }
    bucket.totalSen += line.line_total_sen
    categoryTotals.set(key, bucket)
  }
  const salesByCategory: SalesByCategory[] = Array.from(categoryTotals.values()).sort(
    (a, b) => b.totalSen - a.totalSen,
  )

  return {
    dateLabel,
    totalSalesSen: sumSen(paidOrders.map((order) => order.total_sen)),
    paidOrderCount: paidOrders.length,
    salesByMethod,
    salesByItem,
    salesByCategory,
    sstCollectedSen: sumSen(paidOrders.map((order) => order.sst_sen)),
    serviceChargeCollectedSen: sumSen(paidOrders.map((order) => order.service_charge_sen)),
    voidCount: voidOrders.length,
    voidTotalSen: sumSen(voidOrders.map((order) => order.total_sen)),
  }
}

function eachLocalDateInRange(start: Date, end: Date): Date[] {
  const dates: Date[] = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  while (cursor <= last) {
    dates.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

export interface DailySalesSummary {
  dateLabel: string
  orderCount: number
  totalSen: number
  cashSen: number
  qrSen: number
}

/** CLAUDE.md section 10 Phase 4: owner dashboard's "sales by day." Inclusive of both endpoints. */
export async function buildSalesByDayReport(
  outletId: string,
  start: Date,
  end: Date,
): Promise<DailySalesSummary[]> {
  const dates = eachLocalDateInRange(start, end)
  const dailyReports = await Promise.all(dates.map((date) => buildDailySalesReport(outletId, date)))

  return dailyReports.map((report) => ({
    dateLabel: report.dateLabel,
    orderCount: report.paidOrderCount,
    totalSen: report.totalSalesSen,
    cashSen: report.salesByMethod.find((m) => m.method === 'cash')?.totalSen ?? 0,
    qrSen: report.salesByMethod.find((m) => m.method === 'duitnow_qr')?.totalSen ?? 0,
  }))
}

/** CLAUDE.md section 10 Phase 4: owner dashboard's "top items," ranked by revenue across the range. */
export async function buildTopItemsReport(
  outletId: string,
  start: Date,
  end: Date,
  limit = 10,
): Promise<SalesByItem[]> {
  const dates = eachLocalDateInRange(start, end)
  const dailyReports = await Promise.all(dates.map((date) => buildDailySalesReport(outletId, date)))

  const totals = new Map<string, SalesByItem>()
  for (const report of dailyReports) {
    for (const item of report.salesByItem) {
      const bucket = totals.get(item.itemId) ?? {
        itemId: item.itemId,
        name: item.name,
        qty: 0,
        totalSen: 0,
      }
      bucket.qty += item.qty
      bucket.totalSen += item.totalSen
      totals.set(item.itemId, bucket)
    }
  }

  return Array.from(totals.values())
    .sort((a, b) => b.totalSen - a.totalSen)
    .slice(0, limit)
}
