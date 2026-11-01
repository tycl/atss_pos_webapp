import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NumberPad } from '../../../components/NumberPad'
import { db } from '../../../lib/db'
import { clearActiveMerchant, getActiveOutletId } from '../../../lib/localSession'
import { useLiveQuery } from '../../../lib/useLiveQuery'
import { ConfirmButton } from '../../menu/components/ConfirmButton'
import { verifyStaffPin } from '../pinLogin'
import { useStaffSession } from '../useStaffSession'

export function StaffLoginPage() {
  const navigate = useNavigate()
  const { login, logout } = useStaffSession()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const outletId = getActiveOutletId()
  const outlet = useLiveQuery(
    () => (outletId ? db.outlets.get(outletId).then((o) => o ?? null) : Promise.resolve(null)),
    [outletId],
    null,
  )

  function handleResetDevice() {
    logout()
    clearActiveMerchant()
    navigate('/signup')
  }

  async function submitPin(candidatePin: string) {
    setChecking(true)
    try {
      const staff = await verifyStaffPin(candidatePin)
      if (!staff) {
        setError('Incorrect PIN')
        setPin('')
        return
      }
      login(staff)
      navigate('/pos')
    } finally {
      setChecking(false)
    }
  }

  function appendDigit(digit: string) {
    if (checking) return
    setError(null)
    if (pin.length >= 6) return
    setPin((p) => p + digit)
  }

  function backspace() {
    if (checking) return
    setError(null)
    setPin((p) => p.slice(0, -1))
  }

  function submit() {
    if (checking) return
    setError(null)
    if (pin.length >= 4) void submitPin(pin)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 px-4">
      {outlet && <p className="text-sm font-medium text-primary-700">{outlet.name}</p>}
      <h1 className="text-xl font-semibold text-slate-800">Enter your PIN</h1>

      <div className="flex gap-2" aria-label="PIN entry progress">
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className={`h-3 w-3 rounded-full border border-slate-400 ${
              i < pin.length ? 'bg-primary-600' : 'bg-transparent'
            }`}
          />
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="w-full max-w-xs">
        <NumberPad
          onDigit={appendDigit}
          onBackspace={backspace}
          onEnter={submit}
          disabled={checking}
        />
      </div>

      {outletId && (
        <ConfirmButton onConfirm={handleResetDevice} className="text-xs text-slate-400 underline">
          Reset this device
        </ConfirmButton>
      )}
    </div>
  )
}
