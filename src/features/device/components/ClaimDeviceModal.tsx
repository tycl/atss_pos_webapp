import { Button } from '../../../components/Button'
import { Modal } from '../../../components/Modal'
import type { Device } from '../../../lib/types'

export function ClaimDeviceModal({
  devices,
  onChooseExisting,
  onChooseNew,
}: {
  devices: Device[]
  onChooseExisting: (device: Device) => void
  onChooseNew: () => void
}) {
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
      <Button variant="outline" size="md" fullWidth onClick={onChooseNew}>
        This is a new till
      </Button>
    </Modal>
  )
}
