import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { verifyStaffPin } from '../pinLogin'
import { useStaffSession } from '../useStaffSession'

const KEYPAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '↵']

export function StaffLoginPage() {
  const navigate = useNavigate()
  const { login } = useStaffSession()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

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

  function handleDigitClick(digit: string) {
    if (checking) return
    setError(null)

    if (digit === '⌫') {
      setPin((p) => p.slice(0, -1))
      return
    }

    if (digit === '↵') {
      if (pin.length >= 4) void submitPin(pin)
      return
    }

    if (pin.length >= 6) return
    setPin((p) => p + digit)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 px-4">
      <h1 className="text-xl font-semibold text-slate-800">Enter your PIN</h1>

      <div className="flex gap-2" aria-label="PIN entry progress">
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className={`h-3 w-3 rounded-full border border-slate-400 ${
              i < pin.length ? 'bg-slate-800' : 'bg-transparent'
            }`}
          />
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-3 gap-3">
        {KEYPAD_DIGITS.map((digit, i) => (
          <button
            key={`${digit}-${i}`}
            type="button"
            disabled={checking}
            onClick={() => handleDigitClick(digit)}
            className="h-16 w-16 rounded-lg bg-white text-xl font-medium text-slate-800 shadow disabled:opacity-0"
          >
            {digit}
          </button>
        ))}
      </div>
    </div>
  )
}
