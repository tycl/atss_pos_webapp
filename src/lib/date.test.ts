import { describe, expect, it } from 'vitest'
import {
  isOnLocalDate,
  parseLocalDateInputValue,
  toLocalDateInputValue,
  toLocalYYYYMMDD,
} from './date'

describe('toLocalYYYYMMDD', () => {
  it('pads month and day to two digits', () => {
    expect(toLocalYYYYMMDD(new Date(2026, 0, 5))).toBe('20260105')
  })
})

describe('toLocalDateInputValue', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(toLocalDateInputValue(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('parseLocalDateInputValue', () => {
  it('round-trips with toLocalDateInputValue regardless of timezone', () => {
    const date = parseLocalDateInputValue('2026-01-05')
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(0)
    expect(date.getDate()).toBe(5)
  })
})

describe('isOnLocalDate', () => {
  it('matches an ISO timestamp against a local YYYYMMDD', () => {
    const date = new Date(2026, 0, 5, 14, 30)
    expect(isOnLocalDate(date.toISOString(), toLocalYYYYMMDD(date))).toBe(true)
  })

  it('does not match a different day', () => {
    const date = new Date(2026, 0, 5)
    expect(isOnLocalDate(date.toISOString(), '20260106')).toBe(false)
  })
})
