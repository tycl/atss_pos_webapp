import { formatSenAsRM } from '../../lib/money'
import type { KitchenTicketData, ReceiptData } from './types'

// Pure byte-building only — no I/O. Bytes get handed to a PrintingProvider
// (networkBridgeProvider.ts) which is responsible for actually getting them
// to a printer. Targets a 32-character line (the common width for cheap
// 58mm thermal printers, the usual choice for small F&B counters).

const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a
const LINE_WIDTH = 32

const INIT = Uint8Array.from([ESC, 0x40])
const ALIGN_LEFT = Uint8Array.from([ESC, 0x61, 0x00])
const ALIGN_CENTER = Uint8Array.from([ESC, 0x61, 0x01])
const BOLD_ON = Uint8Array.from([ESC, 0x45, 0x01])
const BOLD_OFF = Uint8Array.from([ESC, 0x45, 0x00])
// GS V 'B' 0 — "feed paper then partial cut", the standard Epson-compatible
// cut command most cheap ESC/POS-emulating printers support.
const CUT = Uint8Array.from([GS, 0x56, 0x42, 0x00])
// ESC p 0 25 250 — kicks drawer pin 2 with standard on/off timing. CLAUDE.md
// section 9: drawer kick happens "via the receipt printer."
const DRAWER_KICK = Uint8Array.from([ESC, 0x70, 0x00, 0x19, 0xfa])

function textBytes(s: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(s)
}

function concatBytes(...parts: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, p) => sum + p.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function line(text = ''): Uint8Array<ArrayBuffer> {
  return concatBytes(textBytes(text), Uint8Array.from([LF]))
}

function divider(): Uint8Array<ArrayBuffer> {
  return line('-'.repeat(LINE_WIDTH))
}

/** Pads label/amount to fill one line, amount right-aligned. Truncates the label if it doesn't fit. */
function labelAmountLine(label: string, amount: string): Uint8Array<ArrayBuffer> {
  const maxLabelLen = Math.max(0, LINE_WIDTH - amount.length - 1)
  const trimmedLabel = label.length > maxLabelLen ? label.slice(0, maxLabelLen) : label
  const padding = Math.max(1, LINE_WIDTH - trimmedLabel.length - amount.length)
  return line(trimmedLabel + ' '.repeat(padding) + amount)
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function buildReceiptBytes(
  data: ReceiptData,
  options: { kickDrawer?: boolean } = {},
): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array<ArrayBuffer>[] = [
    INIT,
    ALIGN_CENTER,
    BOLD_ON,
    line(data.shopName),
    BOLD_OFF,
  ]
  if (data.address) parts.push(line(data.address))
  if (data.ssmNo) parts.push(line(`SSM: ${data.ssmNo}`))
  if (data.sstNo) parts.push(line(`SST: ${data.sstNo}`))

  parts.push(ALIGN_LEFT, divider())
  parts.push(line(`Receipt: ${data.receiptNo}`))
  parts.push(line(formatDateTime(data.dateTimeIso)))
  parts.push(line(`Cashier: ${data.cashierName}`))
  parts.push(divider())

  for (const l of data.lines) {
    parts.push(line(`${l.qty}x ${l.name}`))
    for (const modifier of l.modifiers) {
      const suffix = modifier.priceSen > 0 ? ` (+${formatSenAsRM(modifier.priceSen)})` : ''
      parts.push(line(`  + ${modifier.name}${suffix}`))
    }
    if (l.note) parts.push(line(`  Note: ${l.note}`))
    parts.push(labelAmountLine('', formatSenAsRM(l.lineTotalSen)))
  }

  parts.push(divider())
  parts.push(labelAmountLine('Subtotal', formatSenAsRM(data.subtotalSen)))
  if (data.serviceChargeSen > 0) {
    parts.push(labelAmountLine('Service charge', formatSenAsRM(data.serviceChargeSen)))
  }
  if (data.sstSen > 0) {
    parts.push(labelAmountLine('SST', formatSenAsRM(data.sstSen)))
  }
  if (data.roundingSen !== 0) {
    parts.push(labelAmountLine('Rounding', formatSenAsRM(data.roundingSen)))
  }
  parts.push(BOLD_ON, labelAmountLine('TOTAL', formatSenAsRM(data.totalSen)), BOLD_OFF)
  parts.push(line(`Payment: ${data.paymentMethod === 'cash' ? 'Cash' : 'DuitNow QR'}`))
  if (data.paymentMethod === 'cash' && data.cashReceivedSen !== null) {
    parts.push(labelAmountLine('Cash received', formatSenAsRM(data.cashReceivedSen)))
  }
  if (data.paymentMethod === 'cash' && data.changeSen !== null) {
    parts.push(labelAmountLine('Change', formatSenAsRM(data.changeSen)))
  }

  if (data.receiptFooter) {
    parts.push(divider(), ALIGN_CENTER, line(data.receiptFooter))
  }

  parts.push(line(''), line(''))
  if (options.kickDrawer) parts.push(DRAWER_KICK)
  parts.push(CUT)

  return concatBytes(...parts)
}

export function buildKitchenTicketBytes(data: KitchenTicketData): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array<ArrayBuffer>[] = [
    INIT,
    ALIGN_CENTER,
    BOLD_ON,
    line('KITCHEN TICKET'),
    BOLD_OFF,
  ]
  parts.push(ALIGN_LEFT, divider())
  parts.push(line(`Order: ${data.receiptNo}`))
  parts.push(line(data.orderType === 'dine_in' ? `Table: ${data.tableName ?? '-'}` : 'Takeaway'))
  parts.push(line(formatDateTime(data.dateTimeIso)))
  parts.push(divider())

  for (const l of data.lines) {
    parts.push(BOLD_ON, line(`${l.qty}x ${l.name}`), BOLD_OFF)
    for (const modifier of l.modifiers) parts.push(line(`  + ${modifier}`))
    if (l.note) parts.push(line(`  Note: ${l.note}`))
  }

  parts.push(line(''), line(''), CUT)
  return concatBytes(...parts)
}
