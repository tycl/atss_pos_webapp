import type { PaymentMethod, Settings } from './types'

// CLAUDE.md section 7: "Order of calculation: subtotal → service charge (if
// enabled) → SST (if enabled) → cash rounding (cash payments only) → total."
// SST is computed on the service-charge-inclusive running total, matching
// how Malaysian F&B typically stacks these two (SST on top of service
// charge), consistent with reading the bullet as a sequential pipeline.

export interface CalculateTotalsInput {
  subtotalSen: number
  paymentMethod: PaymentMethod
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
  settings,
}: CalculateTotalsInput): CalculateTotalsResult {
  if (!Number.isInteger(subtotalSen) || subtotalSen < 0) {
    throw new Error(`subtotalSen must be a non-negative integer, got: ${subtotalSen}`)
  }

  const serviceChargeSen = settings.service_charge_enabled
    ? applyRateBp(subtotalSen, settings.service_charge_rate_bp)
    : 0

  const afterServiceCharge = subtotalSen + serviceChargeSen

  const sstSen = settings.sst_enabled ? applyRateBp(afterServiceCharge, settings.sst_rate_bp) : 0

  const afterSst = afterServiceCharge + sstSen

  const shouldRound = paymentMethod === 'cash' && settings.cash_rounding_enabled
  const roundingSen = shouldRound ? roundToNearestFiveSen(afterSst) - afterSst : 0

  return {
    subtotal_sen: subtotalSen,
    service_charge_sen: serviceChargeSen,
    sst_sen: sstSen,
    rounding_sen: roundingSen,
    total_sen: afterSst + roundingSen,
  }
}
