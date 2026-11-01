import type { PaymentMethod, Settings } from './types'

// CLAUDE.md section 7: "Order of calculation: subtotal → service charge (if
// enabled) → SST (if enabled) → cash rounding (cash payments only) → total."
// SST is computed on the service-charge-inclusive running total, matching
// how Malaysian F&B typically stacks these two (SST on top of service
// charge), consistent with reading the bullet as a sequential pipeline.
// A manager/owner discount (section 7's "voids and discounts") slots in
// right after subtotal, before service charge/SST, since both are normally
// charged on the net-of-discount price.

export interface CalculateTotalsInput {
  subtotalSen: number
  paymentMethod: PaymentMethod
  /** Sen off the subtotal, applied before service charge/SST. Defaults to 0. */
  discountSen?: number
  settings: Pick<
    Settings,
    | 'sst_enabled'
    | 'sst_rate_bp'
    | 'service_charge_enabled'
    | 'service_charge_rate_bp'
    | 'cash_rounding_enabled'
  >
}

export interface CalculateTotalsResult {
  subtotal_sen: number
  discount_sen: number
  service_charge_sen: number
  sst_sen: number
  rounding_sen: number
  total_sen: number
}

/** `baseSen * rateBp / 10000`, rounded to the nearest sen. rateBp is basis points (6% = 600). */
function applyRateBp(baseSen: number, rateBp: number): number {
  return Math.round((baseSen * rateBp) / 10_000)
}

/** Rounds a cash total to the nearest 5 sen (x.01–x.02 down, x.03–x.04 up). */
function roundToNearestFiveSen(sen: number): number {
  return Math.round(sen / 5) * 5
}

export function calculateTotals({
  subtotalSen,
  paymentMethod,
  discountSen = 0,
  settings,
}: CalculateTotalsInput): CalculateTotalsResult {
  if (!Number.isInteger(subtotalSen) || subtotalSen < 0) {
    throw new Error(`subtotalSen must be a non-negative integer, got: ${subtotalSen}`)
  }
  if (!Number.isInteger(discountSen) || discountSen < 0) {
    throw new Error(`discountSen must be a non-negative integer, got: ${discountSen}`)
  }
  if (discountSen > subtotalSen) {
    throw new Error(`discountSen (${discountSen}) cannot exceed subtotalSen (${subtotalSen})`)
  }

  const afterDiscount = subtotalSen - discountSen

  const serviceChargeSen = settings.service_charge_enabled
    ? applyRateBp(afterDiscount, settings.service_charge_rate_bp)
    : 0

  const afterServiceCharge = afterDiscount + serviceChargeSen

  const sstSen = settings.sst_enabled ? applyRateBp(afterServiceCharge, settings.sst_rate_bp) : 0

  const afterSst = afterServiceCharge + sstSen

  const shouldRound = paymentMethod === 'cash' && settings.cash_rounding_enabled
  const roundingSen = shouldRound ? roundToNearestFiveSen(afterSst) - afterSst : 0

  return {
    subtotal_sen: subtotalSen,
    discount_sen: discountSen,
    service_charge_sen: serviceChargeSen,
    sst_sen: sstSen,
    rounding_sen: roundingSen,
    total_sen: afterSst + roundingSen,
  }
}
