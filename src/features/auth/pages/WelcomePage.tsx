import { Link } from 'react-router-dom'

/**
 * Shown when this browser has no merchant bound yet (getActiveMerchantId()
 * is null) — i.e. before the PIN screen makes any sense. Replaces falling
 * straight through to StaffLoginPage, which used to show "Enter your PIN"
 * even with no account to check a PIN against.
 */
export function WelcomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow">
        <h1 className="text-xl font-semibold text-slate-800">Welcome</h1>
        <p className="text-sm text-slate-500">
          This device isn't set up yet. Are you setting up a new shop, or signing in to a shop
          that already has an account?
        </p>
        <Link to="/signup" className="block w-full rounded bg-slate-800 py-2 text-center text-white">
          Set up a new shop
        </Link>
        <Link
          to="/signin"
          className="block w-full rounded border border-slate-300 py-2 text-center text-slate-800"
        >
          Sign in to an existing shop
        </Link>
      </div>
    </div>
  )
}
