import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'

describe('toCsv', () => {
  it('writes a header row from the column labels', () => {
    const csv = toCsv(
      [{ a: 1, b: 2 }],
      [
        { key: 'a', label: 'Column A' },
        { key: 'b', label: 'Column B' },
      ],
    )
    expect(csv.split('\r\n')[0]).toBe('Column A,Column B')
  })

  it('writes one row per item, in column order', () => {
    const csv = toCsv(
      [
        { name: 'Teh Ais', qty: 2 },
        { name: 'Kopi O', qty: 1 },
      ],
      [
        { key: 'name', label: 'Name' },
        { key: 'qty', label: 'Qty' },
      ],
    )
    expect(csv).toBe('Name,Qty\r\nTeh Ais,2\r\nKopi O,1')
  })

  it('quotes and escapes a cell containing a comma', () => {
    const csv = toCsv([{ name: 'Teh, Ais' }], [{ key: 'name', label: 'Name' }])
    expect(csv).toBe('Name\r\n"Teh, Ais"')
  })

  it('escapes embedded double quotes by doubling them', () => {
    const csv = toCsv([{ name: 'The "Best" Teh' }], [{ key: 'name', label: 'Name' }])
    expect(csv).toBe('Name\r\n"The ""Best"" Teh"')
  })

  it('quotes a cell containing a newline', () => {
    const csv = toCsv([{ note: 'line1\nline2' }], [{ key: 'note', label: 'Note' }])
    expect(csv).toBe('Note\r\n"line1\nline2"')
  })

  it('renders null/undefined as an empty cell', () => {
    const csv = toCsv([{ value: null }], [{ key: 'value', label: 'Value' }])
    expect(csv).toBe('Value\r\n')
  })

  it('produces just the header for an empty row set', () => {
    const csv = toCsv([], [{ key: 'a', label: 'A' }])
    expect(csv).toBe('A')
  })
})
