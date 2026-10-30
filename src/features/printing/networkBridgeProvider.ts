import { buildKitchenTicketBytes, buildReceiptBytes } from './escpos'
import type { KitchenTicketData, PrintingProvider, ReceiptData } from './types'

/**
 * Web implementation of PrintingProvider (CLAUDE.md section 2): POSTs raw
 * ESC/POS bytes to the local print-bridge agent over LAN HTTP. The agent
 * (print-bridge/, a separate Node process the merchant runs on their
 * counter PC) owns the actual printer connection — this code never talks to
 * hardware directly.
 */
export function createNetworkBridgeProvider(bridgeUrl: string): PrintingProvider {
  async function send(bytes: Uint8Array<ArrayBuffer>): Promise<void> {
    const response = await fetch(`${bridgeUrl.replace(/\/$/, '')}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bytes,
    })
    if (!response.ok) {
      throw new Error(`Print bridge at ${bridgeUrl} returned ${response.status}`)
    }
  }

  return {
    async printReceipt(data: ReceiptData, options) {
      await send(buildReceiptBytes(data, options))
    },
    async printKitchenTicket(data: KitchenTicketData) {
      await send(buildKitchenTicketBytes(data))
    },
  }
}
