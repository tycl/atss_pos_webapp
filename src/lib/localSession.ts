// Which merchant/outlet/device THIS browser belongs to, cached locally so
// staff PIN login and order creation work fully offline (CLAUDE.md section
// 8). Merchant/outlet are set once when the owner finishes onboarding on
// this device. Not synced — every device decides this for itself.

const MERCHANT_ID_KEY = 'atss-pos:active-merchant-id'
const OUTLET_ID_KEY = 'atss-pos:active-outlet-id'
// Legacy single global key — superseded by the per-outlet keys below so a
// device binding can't be confused across outlets. Kept only as a one-time
// migration read source (features/device/api.ts's readDeviceBinding);
// nothing writes to it anymore.
const DEVICE_ID_KEY = 'atss-pos:active-device-id'
const DEVICE_ID_PREFIX = 'atss-pos:device-id:'

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

/** @deprecated Legacy global device-id key — see DEVICE_ID_KEY's own comment. */
export function getActiveDeviceId(): string | null {
  return localStorage.getItem(DEVICE_ID_KEY)
}

/** @deprecated Legacy global device-id key — see DEVICE_ID_KEY's own comment. */
export function setActiveDeviceId(deviceId: string): void {
  localStorage.setItem(DEVICE_ID_KEY, deviceId)
}

export function getDeviceIdForOutlet(outletId: string): string | null {
  return localStorage.getItem(DEVICE_ID_PREFIX + outletId)
}

export function setDeviceIdForOutlet(outletId: string, deviceId: string): void {
  localStorage.setItem(DEVICE_ID_PREFIX + outletId, deviceId)
}

export function clearDeviceIdForOutlet(outletId: string): void {
  localStorage.removeItem(DEVICE_ID_PREFIX + outletId)
}

export function clearActiveMerchant(): void {
  const outletId = getActiveOutletId()
  localStorage.removeItem(MERCHANT_ID_KEY)
  localStorage.removeItem(OUTLET_ID_KEY)
  localStorage.removeItem(DEVICE_ID_KEY)
  if (outletId) clearDeviceIdForOutlet(outletId)
}
