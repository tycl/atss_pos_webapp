import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import {
  addCartLine,
  removeCartLine,
  updateCartLineNote,
  updateCartLineQty,
  type CartLine,
} from '../../lib/cart'
import { catchAsync } from '../../lib/catchAsync'
import { db } from '../../lib/db'
import { getActiveMerchantId, getActiveOutletId } from '../../lib/localSession'
import type { Device, Item, ModifierGroup, OrderType } from '../../lib/types'
import { useLiveQuery } from '../../lib/useLiveQuery'
import { useStaffSession } from '../../features/auth/useStaffSession'
import { ensureActiveDevice } from '../../features/device/api'
import {
  listAllModifiersForMerchant,
  listCategories,
  listItems,
  listModifierGroupIdsForItem,
  listModifierGroups,
} from '../../features/menu/api'
import { CartPanel } from '../../features/ordering/components/CartPanel'
import { CategoryTabs } from '../../features/ordering/components/CategoryTabs'
import { ItemGrid } from '../../features/ordering/components/ItemGrid'
import {
  ModifierPopup,
  type ModifierGroupWithModifiers,
} from '../../features/ordering/components/ModifierPopup'
import { PlaceOrderModal } from '../../features/ordering/components/PlaceOrderModal'
import { loadOrderAsCartLines, placeOrder, updateOpenOrder } from '../../features/ordering/orderApi'
import { buildKitchenTicketData } from '../../features/printing/buildPrintData'
import { createNetworkBridgeProvider } from '../../features/printing/networkBridgeProvider'
import { ShiftControl } from '../../features/shift/components/ShiftControl'

interface PosLocationState {
  resumeOrderId?: string
  newOrderTableId?: string
}

export function PosHome() {
  const { staff, logout } = useStaffSession()
  const navigate = useNavigate()
  const location = useLocation()
  const locationState = (location.state ?? {}) as PosLocationState

  const merchantId = getActiveMerchantId()
  const outletId = getActiveOutletId()

  const categories = useLiveQuery(
    () => (merchantId ? listCategories(merchantId) : Promise.resolve([])),
    [merchantId],
    [],
  )
  const items = useLiveQuery(
    () => (merchantId ? listItems(merchantId) : Promise.resolve([])),
    [merchantId],
    [],
  )
  const modifierGroups = useLiveQuery(
    () => (merchantId ? listModifierGroups(merchantId) : Promise.resolve([])),
    [merchantId],
    [],
  )
  const allModifiers = useLiveQuery(
    () => (merchantId ? listAllModifiersForMerchant(merchantId) : Promise.resolve([])),
    [merchantId],
    [],
  )
  const settings = useLiveQuery(
    () => (outletId ? db.settings.get(outletId).then((s) => s ?? null) : Promise.resolve(null)),
    [outletId],
    null,
  )

  const [device, setDevice] = useState<Device | null>(null)
  const [deviceError, setDeviceError] = useState<string | null>(null)
  useEffect(() => {
    if (merchantId && outletId) {
      catchAsync(ensureActiveDevice(merchantId, outletId).then(setDevice), setDeviceError)
    }
  }, [merchantId, outletId])

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [popupItem, setPopupItem] = useState<Item | null>(null)
  const [popupGroups, setPopupGroups] = useState<ModifierGroupWithModifiers[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [showPlaceOrderModal, setShowPlaceOrderModal] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [placeError, setPlaceError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [printWarning, setPrintWarning] = useState<string | null>(null)

  const resumeOrderId = locationState.resumeOrderId ?? null
  useEffect(() => {
    if (resumeOrderId) {
      catchAsync(loadOrderAsCartLines(resumeOrderId).then(setCart), setPlaceError)
    }
  }, [resumeOrderId])

  if (!staff) return <Navigate to="/login" replace />
  if (!merchantId || !outletId) return <Navigate to="/onboarding" replace />

  const effectiveCategoryId = selectedCategoryId ?? categories[0]?.id ?? null
  const visibleItems = items.filter(
    (item) => item.active && item.category_id === effectiveCategoryId,
  )

  async function handleItemClick(item: Item) {
    let groupIds: string[]
    try {
      groupIds = await listModifierGroupIdsForItem(item.id)
    } catch (err) {
      setPlaceError(err instanceof Error ? err.message : 'Could not load this item')
      return
    }

    const groups: ModifierGroupWithModifiers[] = groupIds
      .map((groupId) => modifierGroups.find((g) => g.id === groupId))
      .filter((group): group is ModifierGroup => Boolean(group))
      .map((group) => ({
        group,
        modifiers: allModifiers.filter((modifier) => modifier.group_id === group.id),
      }))

    if (groups.length === 0) {
      setCart((lines) =>
        addCartLine(lines, {
          itemId: item.id,
          name: item.name,
          unitPriceSen: item.price_sen,
          qty: 1,
          modifiers: [],
          note: null,
        }),
      )
      return
    }

    setPopupItem(item)
    setPopupGroups(groups)
  }

  function resetOrderContext() {
    setCart([])
    navigate('/pos', { replace: true, state: {} })
  }

  async function handlePlaceOrderClick() {
    if (!device || !settings) return
    setPlaceError(null)

    if (resumeOrderId) {
      setPlacing(true)
      try {
        await updateOpenOrder(resumeOrderId, cart, settings)
        navigate('/pos/open-orders')
      } catch (err) {
        setPlaceError(err instanceof Error ? err.message : 'Could not update order')
      } finally {
        setPlacing(false)
      }
      return
    }

    if (locationState.newOrderTableId) {
      await submitNewOrder('dine_in', locationState.newOrderTableId)
      return
    }

    setShowPlaceOrderModal(true)
  }

  async function submitNewOrder(type: OrderType, tableId: string | null) {
    if (!device || !settings || !merchantId || !outletId || !staff) return
    setPlacing(true)
    setPlaceError(null)
    try {
      const order = await placeOrder({
        merchantId,
        outletId,
        deviceId: device.id,
        devicePrefix: device.receipt_prefix,
        staffId: staff.id,
        type,
        tableId,
        lines: cart,
        settings,
      })
      setSuccessMessage(`Order ${order.order_no} placed`)
      setTimeout(() => setSuccessMessage(null), 3000)
      resetOrderContext()

      if (settings.print_bridge_url) {
        try {
          const ticketData = await buildKitchenTicketData(order.id)
          await createNetworkBridgeProvider(settings.print_bridge_url).printKitchenTicket(
            ticketData,
          )
        } catch (err) {
          setPrintWarning(
            `Order placed, but the kitchen ticket didn't print: ${
              err instanceof Error ? err.message : 'unknown error'
            }`,
          )
        }
      }
    } catch (err) {
      setPlaceError(err instanceof Error ? err.message : 'Could not place order')
    } finally {
      setPlacing(false)
      setShowPlaceOrderModal(false)
    }
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <span className="font-semibold text-primary-700">ATSS POS</span>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          {resumeOrderId && (
            <span className="rounded bg-amber-100 px-2 py-1 text-amber-800">
              Editing open order
              <button
                type="button"
                onClick={resetOrderContext}
                className="ml-2 rounded px-1.5 py-0.5 underline hover:bg-amber-200"
              >
                cancel
              </button>
            </span>
          )}
          <Link
            to="/pos/open-orders"
            className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-3 font-medium text-slate-700 hover:bg-slate-50"
          >
            Open tables
          </Link>
          <Link
            to="/pos/orders"
            className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-3 font-medium text-slate-700 hover:bg-slate-50"
          >
            Recent orders
          </Link>
          {(staff.role === 'owner' || staff.role === 'manager') && (
            <Link
              to="/reports/daily-sales"
              className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-3 font-medium text-slate-700 hover:bg-slate-50"
            >
              Reports
            </Link>
          )}
          {staff.role === 'owner' && (
            <Link
              to="/backoffice"
              className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-3 font-medium text-slate-700 hover:bg-slate-50"
            >
              Back office
            </Link>
          )}
          {device && (
            <ShiftControl
              merchantId={merchantId}
              outletId={outletId}
              deviceId={device.id}
              staffId={staff.id}
            />
          )}
          <span className="px-2">
            {staff.name} ({staff.role})
          </span>
          <Button variant="outline" size="md" onClick={logout}>
            Log out
          </Button>
        </div>
      </div>

      {successMessage && (
        <div className="bg-green-100 px-4 py-2 text-sm text-green-800">{successMessage}</div>
      )}
      {placeError && <div className="bg-red-100 px-4 py-2 text-sm text-red-800">{placeError}</div>}
      {deviceError && (
        <div className="bg-red-100 px-4 py-2 text-sm text-red-800">
          Could not set up this device: {deviceError}
        </div>
      )}
      {printWarning && (
        <div className="flex items-center justify-between bg-amber-100 px-4 py-2 text-sm text-amber-800">
          <span>{printWarning}</span>
          <button type="button" onClick={() => setPrintWarning(null)} className="underline">
            dismiss
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <CategoryTabs
            categories={categories}
            selectedCategoryId={effectiveCategoryId}
            onSelect={setSelectedCategoryId}
          />
          <div className="flex-1 overflow-y-auto">
            {categories.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">
                No menu set up yet. Add categories and items from the back office.
              </p>
            ) : (
              <ItemGrid items={visibleItems} onSelect={handleItemClick} />
            )}
          </div>
        </div>

        <div className="w-80 shrink-0">
          <CartPanel
            lines={cart}
            settings={settings}
            onUpdateQty={(lineId, qty) => setCart((lines) => updateCartLineQty(lines, lineId, qty))}
            onUpdateNote={(lineId, note) =>
              setCart((lines) => updateCartLineNote(lines, lineId, note))
            }
            onRemove={(lineId) => setCart((lines) => removeCartLine(lines, lineId))}
            onPlaceOrder={() => void handlePlaceOrderClick()}
            placeOrderLabel={resumeOrderId ? 'Update order' : 'Place order'}
            placing={placing}
          />
        </div>
      </div>

      {popupItem && (
        <ModifierPopup
          item={popupItem}
          groups={popupGroups}
          onCancel={() => setPopupItem(null)}
          onConfirm={(line) => {
            setCart((lines) => addCartLine(lines, line))
            setPopupItem(null)
          }}
        />
      )}

      {showPlaceOrderModal && outletId && (
        <PlaceOrderModal
          outletId={outletId}
          onCancel={() => setShowPlaceOrderModal(false)}
          onConfirm={(type, tableId) => void submitNewOrder(type, tableId)}
        />
      )}
    </div>
  )
}
