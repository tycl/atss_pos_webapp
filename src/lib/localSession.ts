// Which merchant/outlet/device THIS browser belongs to, cached locally so
// staff PIN login and order creation work fully offline (CLAUDE.md section
// 8). Merchant/outlet are set once when the owner finishes onboarding on
// this device. Not synced — every device decides this for itself.

const MERCHANT_ID_KEY = 'atss-pos:active-merchant-id'
const OUTLET_ID_KEY = 'atss-pos:active-outlet-id'
const DEVICE_ID_KEY = 'atss-pos:active-device-id'

export function getActiveMerchantId(): string | null {
  return localStorage.getItem(MERCHANT_ID_KEY)
}

export function setActiveMerchantId(merchantId: string): void {
  localStorage.setItem(MERCHANT_ID_KEY, merchantId)
}

export function getActiveOutletId(): string | null {
  return localStorage.getItem(OUTLET_ID_KEY)
}

export function setActiveOutletId(outletId: string): void {
  localStorage.setItem(OUTLET_ID_KEY, outletId)
}

export function getActiveDeviceId(): string | null {
  return localStorage.getItem(DEVICE_ID_KEY)
}

export function setActiveDeviceId(deviceId: string): void {
  localStorage.setItem(DEVICE_ID_KEY, deviceId)
}

export function clearActiveMerchant(): void {
  localStorage.removeItem(MERCHANT_ID_KEY)
  localStorage.removeItem(OUTLET_ID_KEY)
  localStorage.removeItem(DEVICE_ID_KEY)
}
