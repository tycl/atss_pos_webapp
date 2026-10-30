import { describe, expect, it } from 'vitest'
import { calculateTotals } from './calculateTotals'

const allOff = {
  sst_enabled: false,
  sst_rate_bp: 0,
  service_charge_enabled: false,
  service_charge_rate_bp: 0,
  cash_rounding_enabled: false,
}

describe('calculateTotals', () => {
  it('passes the subtotal straight through when everything is off (defaults)', () => {
    const result = calculateTotals({
      subtotalSen: 1000,
      paymentMethod: 'cash',
      settings: allOff,
    })
    expect(result).toEqual({
      subtotal_sen: 1000,
      service_charge_sen: 0,
      sst_sen: 0,
      rounding_sen: 0,
      total_sen: 1000,
    })
  })

  it('applies service charge on the subtotal', () => {
    const result = calculateTotals({
      subtotalSen: 10_000,
      paymentMethod: 'duitnow_qr',
      settings: { ...allOff, service_charge_enabled: true, service_charge_rate_bp: 1000 },
    })
    expect(result.service_charge_sen).toBe(1000)
    expect(result.sst_sen).toBe(0)
    expect(result.total_sen).toBe(11_000)
  })

  it('applies SST on the subtotal when service charge is off', () => {
    const result = calculateTotals({
      subtotalSen: 10_000,
      paymentMethod: 'duitnow_qr',
      settings: { ...allOff, sst_enabled: true, sst_rate_bp: 600 },
    })
    expect(result.sst_sen).toBe(600)
    expect(result.total_sen).toBe(10_600)
  })

  it('stacks SST on top of the service-charge-inclusive total', () => {
    // subtotal 100.00, +10% service charge = 110.00, +6% SST on 110.00 = 6.60
    const result = calculateTotals({
      subtotalSen: 10_000,
      paymentMethod: 'duitnow_qr',
      settings: {
        ...allOff,
        service_charge_enabled: true,
        service_charge_rate_bp: 1000,
        sst_enabled: true,
        sst_rate_bp: 600,
      },
    })
    expect(result.service_charge_sen).toBe(1000)
    expect(result.sst_sen).toBe(660)
    expect(result.total_sen).toBe(11_660)
  })

  it('never applies cash rounding to a DuitNow QR payment, even if enabled', () => {
    const result = calculateTotals({
      subtotalSen: 1203,
      paymentMethod: 'duitnow_qr',
      settings: { ...allOff, cash_rounding_enabled: true },
    })
    expect(result.rounding_sen).toBe(0)
    expect(result.total_sen).toBe(1203)
  })

  it('never rounds a cash payment when cash_rounding_enabled is off', () => {
    const result = calculateTotals({
      subtotalSen: 1203,
      paymentMethod: 'cash',
      settings: allOff,
    })
    expect(result.rounding_sen).toBe(0)
    expect(result.total_sen).toBe(1203)
  })

  describe('cash rounding to the nearest 5 sen (section 7 examples)', () => {
    const settings = { ...allOff, cash_rounding_enabled: true }

    it('rounds .01 down', () => {
      const result = calculateTotals({ subtotalSen: 1201, paymentMethod: 'cash', settings })
      expect(result.rounding_sen).toBe(-1)
      expect(result.total_sen).toBe(1200)
    })

    it('rounds .02 down', () => {
      const result = calculateTotals({ subtotalSen: 1202, paymentMethod: 'cash', settings })
      expect(result.rounding_sen).toBe(-2)
      expect(result.total_sen).toBe(1200)
    })

    it('rounds .03 up', () => {
      const result = calculateTotals({ subtotalSen: 1203, paymentMethod: 'cash', settings })
      expect(result.rounding_sen).toBe(2)
      expect(result.total_sen).toBe(1205)
    })

    it('rounds .04 up', () => {
      const result = calculateTotals({ subtotalSen: 1204, paymentMethod: 'cash', settings })
      expect(result.rounding_sen).toBe(1)
      expect(result.total_sen).toBe(1205)
    })

    it('leaves an exact multiple of 5 unchanged', () => {
      const result = calculateTotals({ subtotalSen: 1205, paymentMethod: 'cash', settings })
      expect(result.rounding_sen).toBe(0)
      expect(result.total_sen).toBe(1205)
    })
  })

  it('combines service charge, SST, and cash rounding, and stays internally consistent', () => {
    const result = calculateTotals({
      subtotalSen: 333,
      paymentMethod: 'cash',
      settings: {
        sst_enabled: true,
        sst_rate_bp: 600,
        service_charge_enabled: true,
        service_charge_rate_bp: 1000,
        cash_rounding_enabled: true,
      },
    })
    // 333 -> +10% SC = 33 -> running 366 -> +6% SST = 22 -> running 388 -> round to 390
    expect(result.service_charge_sen).toBe(33)
    expect(result.sst_sen).toBe(22)
    expect(result.rounding_sen).toBe(2)
    expect(result.total_sen).toBe(390)
    expect(
      result.subtotal_sen + result.service_charge_sen + result.sst_sen + result.rounding_sen,
    ).toBe(result.total_sen)
  })

  it('handles a zero subtotal', () => {
    const result = calculateTotals({
      subtotalSen: 0,
      paymentMethod: 'cash',
      settings: {
        sst_enabled: true,
        sst_rate_bp: 600,
        service_charge_enabled: true,
        service_charge_rate_bp: 1000,
        cash_rounding_enabled: true,
      },
    })
    expect(result).toEqual({
      subtotal_sen: 0,
      service_charge_sen: 0,
      sst_sen: 0,
      rounding_sen: 0,
      total_sen: 0,
    })
  })

  it('rejects a negative subtotal', () => {
    expect(() =>
      calculateTotals({ subtotalSen: -1, paymentMethod: 'cash', settings: allOff }),
    ).toThrow()
  })

  it('rejects a non-integer subtotal', () => {
    expect(() =>
      calculateTotals({ subtotalSen: 10.5, paymentMethod: 'cash', settings: allOff }),
    ).toThrow()
  })
})
