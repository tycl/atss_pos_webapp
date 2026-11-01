import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../../components/Button'
import { Card } from '../../../components/Card'
import { LoadingState } from '../../../components/LoadingState'
import { NumberPad } from '../../../components/NumberPad'
import { calculateTotals } from '../../../lib/calculateTotals'
import { getActiveOutletId } from '../../../lib/localSession'
import { formatSenAsRM, parseRMToSen } from '../../../lib/money'
import { useLiveQuery } from '../../../lib/useLiveQuery'
import type { PaymentMethod } from '../../../lib/types'
import { useStaffSession } from '../../auth/useStaffSession'
import { DiscountModal } from '../../ordering/components/DiscountModal'
import { getOrder, loadOrderAsCartLines } from '../../ordering/orderApi'
import { buildReceiptData } from '../../printing/buildPrintData'
import { createNetworkBridgeProvider } from '../../printing/networkBridgeProvider'
import { getSettings } from '../../settings/api'
import { recordCashPayment, recordDuitNowPayment } from '../api'

export function PaymentPage() {
  const { staff } = useStaffSession()
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()
  const outletId = getActiveOutletId()

  const order = useLiveQuery(
    () => (orderId ? getOrder(orderId) : Promise.resolve(undefined)),
    [orderId],
    undefined,
  )
  const lines = useLiveQuery(
    () => (orderId ? loadOrderAsCartLines(orderId) : Promise.resolve([])),
    [orderId],
    [],
  )
  const settings = useLiveQuery(
    () => (outletId ? getSettings(outletId) : Promise.resolve(undefined)),
    [outletId],
    undefined,
  )

  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [cashInput, setCashInput] = useState('')
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [discounting, setDiscounting] = useState(false)

  if (!staff) return <Navigate to="/login" replace />
  if (!orderId) return <Navigate to="/pos/open-orders" replace />
  if (order === undefined || settings === undefined) return <LoadingState />
  if (order.status !== 'open') {
    return (
      <div className="p-6">
        <p className="text-slate-600">This order is already {order.status}.</p>
      </div>
    )
  }

  const totals = calculateTotals({
    subtotalSen: order.subtotal_sen,
    discountSen: order.discount_sen,
    paymentMethod: method,
    settings,
  })
  const cashReceivedSen = (() => {
    try {
      return parseRMToSen(cashInput || '0')
    } catch {
      return null
    }
  })()
  const changeSen = cashReceivedSen !== null ? cashReceivedSen - totals.total_sen : null

  async function handleConfirm() {
    setError(null)
    setSubmitting(true)
    try {
      if (method === 'cash') {
        if (cashReceivedSen === null) throw new Error('Enter a valid amount')
        await recordCashPayment(orderId, cashReceivedSen, settings)
      } else {
        await recordDuitNowPayment(orderId, reference, settings)
      }

      let printWarning: string | null = null
      if (settings.print_bridge_url) {
        try {
          const receiptData = await buildReceiptData(orderId)
          await createNetworkBridgeProvider(settings.print_bridge_url).printReceipt(receiptData, {
            kickDrawer: method === 'cash',
          })
        } catch (err) {
          printWarning = `Payment recorded, but the receipt didn't print: ${
            err instanceof Error ? err.message : 'unknown error'
          }`
        }
      }

      navigate('/pos/open-orders', { state: printWarning ? { printWarning } : undefined })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed')
    } finally {
      setSubmitting(false)
    }
  }

  const canConfirm =
    method === 'cash'
      ? cashReceivedSen !== null && cashReceivedSen >= totals.total_sen
      : reference.trim() !== ''

  function appendCashDigit(digit: string) {
    const decimalIndex = cashInput.indexOf('.')
    if (decimalIndex !== -1 && cashInput.length - decimalIndex > 2) return
    setCashInput((s) => s + digit)
  }

  function appendCashDecimal() {
    if (cashInput.includes('.')) return
    setCashInput((s) => (s === '' ? '0.' : s + '.'))
  }

  function backspaceCash() {
    setCashInput((s) => s.slice(0, -1))
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-xl font-semibold text-slate-800">Pay order {order.order_no}</h1>

        <Card>
          <ul className="space-y-1 text-sm text-slate-700">
            {lines.map((line) => (
              <li key={line.lineId} className="flex justify-between">
                <span>
                  {line.qty}&times; {line.name}
                </span>
                <span>
                  {formatSenAsRM(
                    (line.unitPriceSen + line.modifiers.reduce((s, m) => s + m.price_sen, 0)) *
                      line.qty,
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1 border-t border-slate-200 pt-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{formatSenAsRM(totals.subtotal_sen)}</span>
            </div>
            {totals.discount_sen > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Discount{order.discount_reason ? ` (${order.discount_reason})` : ''}</span>
                <span>-{formatSenAsRM(totals.discount_sen)}</span>
              </div>
            )}
            {totals.service_charge_sen > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Service charge</span>
                <span>{formatSenAsRM(totals.service_charge_sen)}</span>
              </div>
            )}
            {totals.sst_sen > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>SST</span>
                <span>{formatSenAsRM(totals.sst_sen)}</span>
              </div>
            )}
            {totals.rounding_sen !== 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Rounding</span>
                <span>{formatSenAsRM(totals.rounding_sen)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold text-slate-900">
              <span>Total</span>
              <span>{formatSenAsRM(totals.total_sen)}</span>
            </div>
          </div>
        </Card>

        <Button variant="outline" size="md" fullWidth onClick={() => setDiscounting(true)}>
          {order.discount_sen > 0 ? 'Edit discount' : 'Apply discount'}
        </Button>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMethod('cash')}
            className={`flex-1 rounded border py-2 text-sm font-medium ${
              method === 'cash'
                ? 'border-primary-600 bg-primary-600 text-white'
                : 'border-slate-300 text-slate-700'
            }`}
          >
            Cash
          </button>
          <button
            type="button"
            onClick={() => setMethod('duitnow_qr')}
            className={`flex-1 rounded border py-2 text-sm font-medium ${
              method === 'duitnow_qr'
                ? 'border-primary-600 bg-primary-600 text-white'
                : 'border-slate-300 text-slate-700'
            }`}
          >
            DuitNow QR
          </button>
        </div>

        {method === 'cash' ? (
          <Card className="space-y-3">
            <div>
              <p className="text-sm font-medium text-slate-700">Amount received</p>
              <p className="text-3xl font-semibold text-slate-800">
                RM {cashInput === '' ? '0.00' : cashInput}
              </p>
            </div>
            {changeSen !== null && changeSen >= 0 && (
              <p className="text-sm text-slate-600">Change: {formatSenAsRM(changeSen)}</p>
            )}
            <NumberPad
              onDigit={appendCashDigit}
              onBackspace={backspaceCash}
              onDecimal={appendCashDecimal}
              disabled={submitting}
            />
          </Card>
        ) : (
          <Card className="space-y-2">
            {settings.duitnow_qr_url ? (
              <img
                src={settings.duitnow_qr_url}
                alt="DuitNow QR"
                className="mx-auto h-48 w-48 object-contain"
              />
            ) : (
              <p className="text-sm text-slate-500">
                No DuitNow QR image set up yet — add one in Outlet settings.
              </p>
            )}
            <label className="block text-sm font-medium text-slate-700">
              Reference (from the customer's payment confirmation)
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
          </Card>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!canConfirm || submitting}
          onClick={() => void handleConfirm()}
        >
          {submitting ? 'Processing…' : 'Confirm payment'}
        </Button>
      </div>

      {discounting && (
        <DiscountModal
          order={order}
          onCancel={() => setDiscounting(false)}
          onApplied={() => setDiscounting(false)}
          settings={settings}
        />
      )}
    </div>
  )
}
