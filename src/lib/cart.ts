import { sumSen } from './money'

// An in-memory cart line, before it becomes a real `order_line` row. Shaped
// close to OrderLine/ModifierSnapshot (lib/types.ts) so turning a cart into
// an order is a near-direct mapping once order persistence is built.

export interface CartLineModifier {
  modifier_id: string
  name: string
  price_sen: number
}

export interface CartLine {
  lineId: string
  itemId: string
  name: string
  unitPriceSen: number
  qty: number
  modifiers: CartLineModifier[]
  note: string | null
}

export function cartLineTotalSen(line: CartLine): number {
  const modifiersSen = sumSen(line.modifiers.map((m) => m.price_sen))
  return (line.unitPriceSen + modifiersSen) * line.qty
}

export function cartSubtotalSen(lines: CartLine[]): number {
  return sumSen(lines.map(cartLineTotalSen))
}

export function addCartLine(lines: CartLine[], newLine: Omit<CartLine, 'lineId'>): CartLine[] {
  return [...lines, { ...newLine, lineId: crypto.randomUUID() }]
}

export function removeCartLine(lines: CartLine[], lineId: string): CartLine[] {
  return lines.filter((line) => line.lineId !== lineId)
}

/** Setting qty to 0 or below removes the line. */
export function updateCartLineQty(lines: CartLine[], lineId: string, qty: number): CartLine[] {
  if (qty <= 0) return removeCartLine(lines, lineId)
  return lines.map((line) => (line.lineId === lineId ? { ...line, qty } : line))
}

export function updateCartLineNote(lines: CartLine[], lineId: string, note: string): CartLine[] {
  const trimmed = note.trim()
  return lines.map((line) =>
    line.lineId === lineId ? { ...line, note: trimmed === '' ? null : trimmed } : line,
  )
}
