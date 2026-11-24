import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { updateOwnPassword } from '../api'

/**
 * Reached from the link in the password-reset email. The Supabase client
 * auto-detects the recovery token in the URL on load (detectSessionInUrl,
 * src/lib/supabase.ts) and establishes a session, so updateOwnPassword()
 * just needs the new password.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setSubmitting(true)
    try {
      await updateOwnPassword(password)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset your password')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow">
          <h1 className="text-xl font-semibold text-slate-800">Password updated</h1>
          <p className="text-sm text-slate-500">You can now log in with your new password.</p>
          <button
            type="button"
            onClick={() => navigate('/signin')}
            className="w-full rounded bg-slate-800 py-2 text-white"
          >
            Back to log in
          </button>
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
        <h1 className="text-xl font-semibold text-slate-800">Set a new password</h1>

        <label className="block text-sm font-medium text-slate-700">
          New password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Confirm password
          <input
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>

        {error && (
          <p className="text-sm text-red-600">
            {error}
            {error !== 'Passwords do not match' && (
              <>
                {' '}
                <Link to="/forgot-password" className="underline">
                  Request a new link
                </Link>
              </>
            )}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-slate-800 py-2 text-white disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </div>
  )
}
