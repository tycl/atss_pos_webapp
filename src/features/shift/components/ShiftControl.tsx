import { useState } from 'react'
import { Button } from '../../../components/Button'
import { useLiveQuery } from '../../../lib/useLiveQuery'
import { getActiveShift } from '../api'
import { CloseShiftModal } from './CloseShiftModal'
import { OpenShiftModal } from './OpenShiftModal'

export function ShiftControl({
  merchantId,
  outletId,
  deviceId,
  staffId,
}: {
  merchantId: string
  outletId: string
  deviceId: string
  staffId: string
}) {
  // No separate "loading" state: this is a fast local Dexie query, and its
  // resolved "no active shift" value is `undefined` too, so a loading guard
  // here would be indistinguishable from "no shift" and never clear.
  const shift = useLiveQuery(() => getActiveShift(deviceId), [deviceId], undefined)
  const [showOpenModal, setShowOpenModal] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)

  return (
    <>
      {shift ? (
        <Button variant="outline" size="md" onClick={() => setShowCloseModal(true)}>
          Close shift
        </Button>
      ) : (
        <Button variant="outline" size="md" onClick={() => setShowOpenModal(true)}>
          Open shift
        </Button>
      )}

      {showOpenModal && (
        <OpenShiftModal
          merchantId={merchantId}
          outletId={outletId}
          deviceId={deviceId}
          staffId={staffId}
          onCancel={() => setShowOpenModal(false)}
          onOpened={() => setShowOpenModal(false)}
        />
      )}

      {showCloseModal && shift && (
        <CloseShiftModal
          shift={shift}
          staffId={staffId}
          onCancel={() => setShowCloseModal(false)}
          onClosed={() => setShowCloseModal(false)}
        />
      )}
    </>
  )
}
