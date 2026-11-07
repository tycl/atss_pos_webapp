import { useState, type FormEvent } from 'react'
import { Button } from '../../../components/Button'
import { Modal } from '../../../components/Modal'
import type { Device } from '../../../lib/types'
import { submitPairingCode } from '../pairingCodes'

export function ClaimDeviceModal({
  merchantId,
  outletId,
  devices,
  onChooseExisting,
  onChooseNew,
}: {
  merchantId: string
  outletId: string
  devices: Device[]
  onChooseExisting: (device: Device) => void
  onChooseNew: () => void
}) {
  const [showPairingForm, setShowPairingForm] = useState(false)
  const [code, setCode] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const [pairingError, setPairingError] = useState<string | null>(null)

  function handleRedeemSubmit(event: FormEvent) {
    event.preventDefault()
    setPairingError(null)
    setRedeeming(true)
    void submitPairingCode(merchantId, outletId, code, {
      onSuccess: (device) => {
        setRedeeming(false)
        onChooseExisting(device)
      },
      onError: (message) => {
        setRedeeming(false)
        setPairingError(message)
      },
    })
  }

  return (
    <Modal title="Which till is this?">
      <p className="mb-3 text-sm text-slate-600">
        This browser isn&rsquo;t set up as a till yet. If it&rsquo;s replacing one of the tills
        below (e.g. this one was reset, or you&rsquo;re opening the POS in a different browser on
        it), pick it so its receipt numbers keep going. Only do this if that till isn&rsquo;t being
        used anywhere else right now — using the same till from two browsers at once can create
        duplicate receipt numbers.
      </p>
      <div className="mb-4 space-y-2">
        {devices.map((device) => (
          <button
            key={device.id}
            type="button"
            onClick={() => onChooseExisting(device)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            {device.label}
            <span className="ml-2 text-slate-400">({device.receipt_prefix})</span>
          </button>
        ))}
      </div>

      {showPairingForm ? (
        <form onSubmit={handleRedeemSubmit} className="mb-4 space-y-2">
          <label className="block text-sm text-slate-700">
            Pairing code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoFocus
              maxLength={6}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 tracking-widest"
            />
          </label>
          {pairingError && <p className="text-sm text-red-600">{pairingError}</p>}
          <Button type="submit" variant="outline" size="md" fullWidth disabled={redeeming}>
            {redeeming ? 'Checking…' : 'Use this code'}
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowPairingForm(true)}
          className="mb-4 block text-sm text-slate-600 underline"
        >
          Have a pairing code instead?
        </button>
      )}

      <Button variant="outline" size="md" fullWidth onClick={onChooseNew}>
        This is a new till
      </Button>
    </Modal>
  )
}
