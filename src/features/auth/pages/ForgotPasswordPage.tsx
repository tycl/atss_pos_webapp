import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { requestPasswordReset } from '../api'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await requestPasswordReset(email)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the reset email')
      return
    } finally {
      setSubmitting(false)
    }
    // Shown whether or not an account exists for this email, so the page
    // never reveals which emails have accounts.
    setSent(true)
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow">
          <h1 className="text-xl font-semibold text-slate-800">Check your email</h1>
          <p className="text-sm text-slate-500">
            If an account exists for {email}, we've sent a link to reset your password.
          </p>
          <p className="text-center text-sm text-slate-500">
            <Link to="/signin" className="underline">
              Back to log in
            </Link>
          </p>
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
        <h1 className="text-xl font-semibold text-slate-800">Reset your password</h1>
        <p className="text-sm text-slate-500">
          Enter your account email and we'll send you a link to reset your password.
        </p>

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

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-slate-800 py-2 text-white disabled:opacity-50"
        >
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>

        <p className="text-center text-sm text-slate-500">
          <Link to="/signin" className="underline">
            Back to log in
          </Link>
        </p>
      </form>
    </div>
  )
}
