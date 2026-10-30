import { describe, expect, it } from 'vitest'
import {
  addCartLine,
  cartLineTotalSen,
  cartSubtotalSen,
  removeCartLine,
  updateCartLineNote,
  updateCartLineQty,
  type CartLine,
} from './cart'

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    lineId: 'l1',
    itemId: 'item-1',
    name: 'Teh Ais',
    unitPriceSen: 250,
    qty: 1,
    modifiers: [],
    note: null,
    ...overrides,
  }
}

describe('cartLineTotalSen', () => {
  it('is just unit price times qty with no modifiers', () => {
    expect(cartLineTotalSen(line({ unitPriceSen: 250, qty: 2 }))).toBe(500)
  })

  it('adds modifier prices before multiplying by qty', () => {
    const result = cartLineTotalSen(
      line({
        unitPriceSen: 250,
        qty: 2,
        modifiers: [
          { modifier_id: 'm1', name: 'Extra shot', price_sen: 150 },
          { modifier_id: 'm2', name: 'Less sugar', price_sen: 0 },
        ],
      }),
    )
    // (250 + 150 + 0) * 2
    expect(result).toBe(800)
  })
})

describe('cartSubtotalSen', () => {
  it('sums every line total', () => {
    const lines = [
      line({ lineId: 'l1', unitPriceSen: 250, qty: 1 }),
      line({ lineId: 'l2', unitPriceSen: 400, qty: 2 }),
    ]
    expect(cartSubtotalSen(lines)).toBe(250 + 800)
  })

  it('returns 0 for an empty cart', () => {
    expect(cartSubtotalSen([])).toBe(0)
  })
})

describe('addCartLine', () => {
  it('appends a new line with a generated lineId', () => {
    const result = addCartLine([], {
      itemId: 'item-1',
      name: 'Teh Ais',
      unitPriceSen: 250,
      qty: 1,
      modifiers: [],
      note: null,
    })
    expect(result).toHaveLength(1)
    expect(result[0].lineId).toBeTruthy()
  })
})

describe('removeCartLine', () => {
  it('removes only the matching line', () => {
    const lines = [line({ lineId: 'l1' }), line({ lineId: 'l2' })]
    expect(removeCartLine(lines, 'l1').map((l) => l.lineId)).toEqual(['l2'])
  })
})

describe('updateCartLineQty', () => {
  it('updates the qty of the matching line', () => {
    const lines = [line({ lineId: 'l1', qty: 1 })]
    expect(updateCartLineQty(lines, 'l1', 3)[0].qty).toBe(3)
  })

  it('removes the line when qty drops to 0 or below', () => {
    const lines = [line({ lineId: 'l1', qty: 1 })]
    expect(updateCartLineQty(lines, 'l1', 0)).toEqual([])
    expect(updateCartLineQty(lines, 'l1', -1)).toEqual([])
  })
})

describe('updateCartLineNote', () => {
  it('sets a trimmed note on the matching line', () => {
    const lines = [line({ lineId: 'l1' })]
    expect(updateCartLineNote(lines, 'l1', '  less ice  ')[0].note).toBe('less ice')
  })

  it('clears the note to null when given blank text', () => {
    const lines = [line({ lineId: 'l1', note: 'less ice' })]
    expect(updateCartLineNote(lines, 'l1', '   ')[0].note).toBeNull()
  })
})
