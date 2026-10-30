import { buildReceiptData } from './buildPrintData'
import { createNetworkBridgeProvider } from './networkBridgeProvider'

/** Reprints a paid order's receipt. Never kicks the drawer — that only happens on the original sale. */
export async function reprintReceipt(orderId: string, bridgeUrl: string): Promise<void> {
  const data = await buildReceiptData(orderId)
  await createNetworkBridgeProvider(bridgeUrl).printReceipt(data, { kickDrawer: false })
}
