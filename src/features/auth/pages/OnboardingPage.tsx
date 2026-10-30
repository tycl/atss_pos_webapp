import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatSenAsRM, percentStringToBp } from '../../../lib/money'
import { createMerchantWithOutlet, createStaffMember } from '../api'
import { updateSettings } from '../../settings/api'
import { useStaffSession } from '../useStaffSession'

type Step = 1 | 2 | 3 | 4

const STEP_LABELS: Record<Step, string> = {
  1: 'Shop',
  2: 'Outlet & tax',
  3: 'Your PIN',
  4: 'Review',
}

/** Multi-step merchant setup wizard: shop details -> outlet & tax settings -> owner PIN -> review (CLAUDE.md Phase 5). */
export function OnboardingPage() {
  const navigate = useNavigate()
  const { login } = useStaffSession()

  const [step, setStep] = useState<Step>(1)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Step 1 — shop details
  const [merchantName, setMerchantName] = useState('')
  const [ssmNo, setSsmNo] = useState('')
  const [sstNo, setSstNo] = useState('')
  const [merchantAddress, setMerchantAddress] = useState('')
  const [merchantPhone, setMerchantPhone] = useState('')

  // Step 2 — outlet & tax settings
  const [outletName, setOutletName] = useState('')
  const [outletAddress, setOutletAddress] = useState('')
  const [sstEnabled, setSstEnabled] = useState(false)
  const [sstRatePercent, setSstRatePercent] = useState('6')
  const [serviceChargeEnabled, setServiceChargeEnabled] = useState(false)
  const [serviceChargeRatePercent, setServiceChargeRatePercent] = useState('10')
  const [cashRoundingEnabled, setCashRoundingEnabled] = useState(false)

  // Step 3 — owner PIN
  const [ownerName, setOwnerName] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')

  function goNext(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (step === 1) {
      if (!merchantName.trim()) {
        setError('Shop name is required')
        return
      }
      setStep(2)
      return
    }

    if (step === 2) {
      if (!outletName.trim()) {
        setError('Outlet name is required')
        return
      }
      try {
        if (sstEnabled) percentStringToBp(sstRatePercent)
        if (serviceChargeEnabled) percentStringToBp(serviceChargeRatePercent)
      } catch {
        setError('Enter a valid tax/service charge rate, e.g. 6')
        return
      }
      setStep(3)
      return
    }

    if (step === 3) {
      if (!ownerName.trim()) {
        setError('Your name is required')
        return
      }
      if (!/^\d{4,6}$/.test(pin)) {
        setError('PIN must be 4–6 digits')
        return
      }
      if (pin !== confirmPin) {
        setError('PINs do not match')
        return
      }
      setStep(4)
      return
    }
  }

  function goBack() {
    setError(null)
    if (step > 1) setStep((s) => (s - 1) as Step)
  }

  async function handleFinish() {
    setError(null)
    setSubmitting(true)
    try {
      const { merchant, outlet } = await createMerchantWithOutlet({
        merchantName: merchantName.trim(),
        outletName: outletName.trim(),
        ssmNo: ssmNo.trim() || undefined,
        sstNo: sstNo.trim() || undefined,
        merchantAddress: merchantAddress.trim() || undefined,
        merchantPhone: merchantPhone.trim() || undefined,
        outletAddress: outletAddress.trim() || undefined,
      })

      if (sstEnabled || serviceChargeEnabled || cashRoundingEnabled) {
        await updateSettings(outlet.id, {
          sst_enabled: sstEnabled,
          sst_rate_bp: sstEnabled ? percentStringToBp(sstRatePercent) : 0,
          service_charge_enabled: serviceChargeEnabled,
          service_charge_rate_bp: serviceChargeEnabled
            ? percentStringToBp(serviceChargeRatePercent)
            : 0,
          cash_rounding_enabled: cashRoundingEnabled,
        })
      }

      const owner = await createStaffMember({
        merchantId: merchant.id,
        name: ownerName.trim(),
        role: 'owner',
        pin,
      })
      login(owner)
      navigate('/pos')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-sm space-y-4">
        <ol className="flex items-center justify-between text-xs font-medium text-slate-400">
          {([1, 2, 3, 4] as Step[]).map((s) => (
            <li key={s} className="flex flex-1 items-center gap-2 last:flex-none">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  s === step
                    ? 'bg-slate-800 text-white'
                    : s < step
                      ? 'bg-slate-300 text-white'
                      : 'bg-slate-200 text-slate-500'
                }`}
              >
                {s}
              </span>
              <span className={s === step ? 'text-slate-700' : ''}>{STEP_LABELS[s]}</span>
              {s !== 4 && <span className="h-px flex-1 bg-slate-200" />}
            </li>
          ))}
        </ol>

        <form
          onSubmit={step === 4 ? (e) => e.preventDefault() : goNext}
          className="space-y-4 rounded-lg bg-white p-6 shadow"
        >
          {step === 1 && (
            <ShopDetailsStep
              merchantName={merchantName}
              setMerchantName={setMerchantName}
              ssmNo={ssmNo}
              setSsmNo={setSsmNo}
              sstNo={sstNo}
              setSstNo={setSstNo}
              merchantAddress={merchantAddress}
              setMerchantAddress={setMerchantAddress}
              merchantPhone={merchantPhone}
              setMerchantPhone={setMerchantPhone}
            />
          )}

          {step === 2 && (
            <OutletAndTaxStep
              outletName={outletName}
              setOutletName={setOutletName}
              outletAddress={outletAddress}
              setOutletAddress={setOutletAddress}
              sstEnabled={sstEnabled}
              setSstEnabled={setSstEnabled}
              sstRatePercent={sstRatePercent}
              setSstRatePercent={setSstRatePercent}
              serviceChargeEnabled={serviceChargeEnabled}
              setServiceChargeEnabled={setServiceChargeEnabled}
              serviceChargeRatePercent={serviceChargeRatePercent}
              setServiceChargeRatePercent={setServiceChargeRatePercent}
              cashRoundingEnabled={cashRoundingEnabled}
              setCashRoundingEnabled={setCashRoundingEnabled}
            />
          )}

          {step === 3 && (
            <OwnerPinStep
              ownerName={ownerName}
              setOwnerName={setOwnerName}
              pin={pin}
              setPin={setPin}
              confirmPin={confirmPin}
              setConfirmPin={setConfirmPin}
            />
          )}

          {step === 4 && (
            <ReviewStep
              merchantName={merchantName}
              outletName={outletName}
              sstEnabled={sstEnabled}
              sstRatePercent={sstRatePercent}
              serviceChargeEnabled={serviceChargeEnabled}
              serviceChargeRatePercent={serviceChargeRatePercent}
              cashRoundingEnabled={cashRoundingEnabled}
              ownerName={ownerName}
            />
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            {step > 1 && (
              <button
                type="button"
                onClick={goBack}
                disabled={submitting}
                className="flex-1 rounded border border-slate-300 py-2 text-slate-700 disabled:opacity-50"
              >
                Back
              </button>
            )}
            {step < 4 ? (
              <button type="submit" className="flex-1 rounded bg-slate-800 py-2 text-white">
                Next
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleFinish()}
                className="flex-1 rounded bg-slate-800 py-2 text-white disabled:opacity-50"
              >
                {submitting ? 'Setting up…' : 'Finish setup'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  required,
  inputMode,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  inputMode?: 'text' | 'numeric' | 'tel'
  placeholder?: string
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        required={required}
        inputMode={inputMode}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
      />
    </label>
  )
}

function ShopDetailsStep({
  merchantName,
  setMerchantName,
  ssmNo,
  setSsmNo,
  sstNo,
  setSstNo,
  merchantAddress,
  setMerchantAddress,
  merchantPhone,
  setMerchantPhone,
}: {
  merchantName: string
  setMerchantName: (v: string) => void
  ssmNo: string
  setSsmNo: (v: string) => void
  sstNo: string
  setSstNo: (v: string) => void
  merchantAddress: string
  setMerchantAddress: (v: string) => void
  merchantPhone: string
  setMerchantPhone: (v: string) => void
}) {
  return (
    <>
      <h1 className="text-xl font-semibold text-slate-800">Tell us about your shop</h1>
      <TextField label="Shop name" value={merchantName} onChange={setMerchantName} required />
      <TextField label="SSM registration no. (optional)" value={ssmNo} onChange={setSsmNo} />
      <TextField label="SST registration no. (optional)" value={sstNo} onChange={setSstNo} />
      <TextField
        label="Shop address (optional)"
        value={merchantAddress}
        onChange={setMerchantAddress}
      />
      <TextField
        label="Shop phone (optional)"
        value={merchantPhone}
        onChange={setMerchantPhone}
        inputMode="tel"
      />
    </>
  )
}

function OutletAndTaxStep({
  outletName,
  setOutletName,
  outletAddress,
  setOutletAddress,
  sstEnabled,
  setSstEnabled,
  sstRatePercent,
  setSstRatePercent,
  serviceChargeEnabled,
  setServiceChargeEnabled,
  serviceChargeRatePercent,
  setServiceChargeRatePercent,
  cashRoundingEnabled,
  setCashRoundingEnabled,
}: {
  outletName: string
  setOutletName: (v: string) => void
  outletAddress: string
  setOutletAddress: (v: string) => void
  sstEnabled: boolean
  setSstEnabled: (v: boolean) => void
  sstRatePercent: string
  setSstRatePercent: (v: string) => void
  serviceChargeEnabled: boolean
  setServiceChargeEnabled: (v: boolean) => void
  serviceChargeRatePercent: string
  setServiceChargeRatePercent: (v: string) => void
  cashRoundingEnabled: boolean
  setCashRoundingEnabled: (v: boolean) => void
}) {
  return (
    <>
      <h1 className="text-xl font-semibold text-slate-800">Your first outlet</h1>
      <TextField label="Outlet name" value={outletName} onChange={setOutletName} required />
      <TextField
        label="Outlet address (optional)"
        value={outletAddress}
        onChange={setOutletAddress}
      />

      <fieldset className="space-y-2 border-t border-slate-100 pt-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={sstEnabled}
            onChange={(e) => setSstEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="font-medium text-slate-800">Charge SST</span>
        </label>
        {sstEnabled && (
          <TextField
            label="SST rate (%)"
            value={sstRatePercent}
            onChange={setSstRatePercent}
            inputMode="numeric"
          />
        )}
      </fieldset>

      <fieldset className="space-y-2 border-t border-slate-100 pt-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={serviceChargeEnabled}
            onChange={(e) => setServiceChargeEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="font-medium text-slate-800">Charge service charge</span>
        </label>
        {serviceChargeEnabled && (
          <TextField
            label="Service charge rate (%)"
            value={serviceChargeRatePercent}
            onChange={setServiceChargeRatePercent}
            inputMode="numeric"
          />
        )}
      </fieldset>

      <label className="flex items-center gap-2 border-t border-slate-100 pt-3">
        <input
          type="checkbox"
          checked={cashRoundingEnabled}
          onChange={(e) => setCashRoundingEnabled(e.target.checked)}
          className="h-4 w-4"
        />
        <span className="font-medium text-slate-800">Round cash totals to nearest 5 sen</span>
      </label>
      <p className="text-xs text-slate-400">
        You can change any of these later in Outlet settings.
      </p>
    </>
  )
}

function OwnerPinStep({
  ownerName,
  setOwnerName,
  pin,
  setPin,
  confirmPin,
  setConfirmPin,
}: {
  ownerName: string
  setOwnerName: (v: string) => void
  pin: string
  setPin: (v: string) => void
  confirmPin: string
  setConfirmPin: (v: string) => void
}) {
  return (
    <>
      <h1 className="text-xl font-semibold text-slate-800">Create your staff PIN</h1>
      <p className="text-sm text-slate-500">
        You'll use this PIN to log in on the tablet or counter PC — separate from your account
        password.
      </p>
      <TextField label="Your name" value={ownerName} onChange={setOwnerName} required />
      <TextField
        label="PIN (4–6 digits)"
        value={pin}
        onChange={setPin}
        required
        inputMode="numeric"
      />
      <TextField
        label="Confirm PIN"
        value={confirmPin}
        onChange={setConfirmPin}
        required
        inputMode="numeric"
      />
    </>
  )
}

function ReviewRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  )
}

function ReviewStep({
  merchantName,
  outletName,
  sstEnabled,
  sstRatePercent,
  serviceChargeEnabled,
  serviceChargeRatePercent,
  cashRoundingEnabled,
  ownerName,
}: {
  merchantName: string
  outletName: string
  sstEnabled: boolean
  sstRatePercent: string
  serviceChargeEnabled: boolean
  serviceChargeRatePercent: string
  cashRoundingEnabled: boolean
  ownerName: string
}) {
  return (
    <>
      <h1 className="text-xl font-semibold text-slate-800">Review &amp; finish</h1>
      <div className="space-y-2 rounded bg-slate-50 p-3">
        <ReviewRow label="Shop" value={merchantName} />
        <ReviewRow label="Outlet" value={outletName} />
        <ReviewRow label="SST" value={sstEnabled ? `${sstRatePercent}%` : 'Off'} />
        <ReviewRow
          label="Service charge"
          value={serviceChargeEnabled ? `${serviceChargeRatePercent}%` : 'Off'}
        />
        <ReviewRow
          label="Cash rounding"
          value={cashRoundingEnabled ? 'On (nearest 5 sen)' : 'Off'}
        />
        <ReviewRow label="Owner" value={ownerName} />
      </div>
      <p className="text-xs text-slate-400">
        Example: a {formatSenAsRM(1250)} order
        {sstEnabled || serviceChargeEnabled ? ' will include the tax/charges above.' : '.'}
      </p>
    </>
  )
}
