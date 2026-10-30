import { describe, expect, it } from 'vitest'
import { formatSenAsRM, parseRMToSen, percentStringToBp, sumSen } from './money'

describe('parseRMToSen', () => {
  it('parses whole ringgit', () => {
    expect(parseRMToSen('12')).toBe(1200)
  })

  it('parses two decimal places', () => {
    expect(parseRMToSen('12.50')).toBe(1250)
  })

  it('parses a single decimal place', () => {
    expect(parseRMToSen('12.5')).toBe(1250)
  })

  it('throws on invalid input', () => {
    expect(() => parseRMToSen('abc')).toThrow()
    expect(() => parseRMToSen('12.555')).toThrow()
    expect(() => parseRMToSen('-5')).toThrow()
  })
})

describe('formatSenAsRM', () => {
  it('formats sen as RM with two decimals', () => {
    expect(formatSenAsRM(1250)).toBe('RM 12.50')
  })

  it('formats zero', () => {
    expect(formatSenAsRM(0)).toBe('RM 0.00')
  })

  it('formats negative amounts', () => {
    expect(formatSenAsRM(-150)).toBe('-RM 1.50')
  })

  it('throws on non-integer sen', () => {
    expect(() => formatSenAsRM(12.5)).toThrow()
  })
})

describe('sumSen', () => {
  it('sums an array of sen amounts', () => {
    expect(sumSen([100, 250, 50])).toBe(400)
  })

  it('returns 0 for an empty array', () => {
    expect(sumSen([])).toBe(0)
  })
})

describe('percentStringToBp', () => {
  it('converts a whole percentage to basis points', () => {
    expect(percentStringToBp('6')).toBe(600)
  })

  it('converts a fractional percentage to basis points', () => {
    expect(percentStringToBp('6.5')).toBe(650)
  })

  it('converts zero', () => {
    expect(percentStringToBp('0')).toBe(0)
  })

  it('throws on invalid input', () => {
    expect(() => percentStringToBp('abc')).toThrow()
    expect(() => percentStringToBp('-5')).toThrow()
  })
})
