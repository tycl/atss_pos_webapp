import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Merchant } from '../../../lib/types'
import { listMyMerchants, pullMerchantData } from '../../sync/pullMerchantData'
import { signInOwner } from '../api'

/**
 * For an owner who already has a shop set up elsewhere and wants this
 * device attached to it — e.g. after "Reset this device" on the PIN
 * screen — rather than always creating a brand-new shop via /signup.
 */
export function SignInPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [merchants, setMerchants] = useState<Merchant[] | null>(null)

  async function finishWithMerchant(merchantId: string) {
    await pullMerchantData(merchantId)
    navigate('/login')
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signInOwner(email, password)
      const mine = await listMyMerchants()
      if (mine.length === 0) {
        navigate('/onboarding')
        return
      }
      if (mine.length === 1) {
        await finishWithMerchant(mine[0].id)
        return
      }
      setMerchants(mine)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePickMerchant(merchantId: string) {
    setError(null)
    setSubmitting(true)
    try {
      await finishWithMerchant(merchantId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that shop')
    } finally {
      setSubmitting(false)
    }
  }

  if (merchants) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow">
          <h1 className="text-xl font-semibold text-slate-800">Which shop?</h1>
          <p className="text-sm text-slate-500">Your account is linked to more than one shop.</p>
          <ul className="space-y-2">
            {merchants.map((merchant) => (
              <li key={merchant.id}>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handlePickMerchant(merchant.id)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50"
                >
                  {merchant.name}
                </button>
              </li>
            ))}
          </ul>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow"
      >
        <h1 className="text-xl font-semibold text-slate-800">Log in to your shop</h1>

        <label className="block text-sm font-medium text-slate-700">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-slate-800 py-2 text-white disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Log in'}
        </button>

        <p className="text-center text-sm text-slate-500">
          Setting up a new shop?{' '}
          <Link to="/signup" className="underline">
            Sign up
          </Link>
        </p>
      </form>
    </div>
  )
}
