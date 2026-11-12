import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { db } from '../../../lib/db'
import { getActiveMerchantId, getActiveOutletId, setActiveOutletId } from '../../../lib/localSession'
import { useLiveQuery } from '../../../lib/useLiveQuery'

export function OutletSwitcher() {
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const merchantId = getActiveMerchantId()
  const activeOutletId = getActiveOutletId()

  const outlets = useLiveQuery(
    () =>
      merchantId
        ? db.outlets.where({ merchant_id: merchantId }).sortBy('name')
        : Promise.resolve([]),
    [merchantId],
    [],
  )

  const activeOutlet = outlets.find((o) => o.id === activeOutletId) ?? outlets[0] ?? null

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSwitch(outletId: string) {
    setActiveOutletId(outletId)
    setOpen(false)
    navigate(location.pathname, { replace: true })
    // Force a full re-render so all useLiveQuery hooks re-fire with the new outlet
    window.dispatchEvent(new Event('outlet-switched'))
  }

  if (!activeOutlet) return null

  if (outlets.length <= 1) {
    return (
      <span className="font-semibold text-primary-700">
        {activeOutlet.name}
      </span>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 font-semibold text-primary-700 hover:text-primary-900"
      >
        {activeOutlet.name}
        <svg
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {outlets.map((outlet) => (
            <button
              key={outlet.id}
              type="button"
              onClick={() => handleSwitch(outlet.id)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                outlet.id === activeOutletId ? 'font-medium text-primary-700' : 'text-slate-700'
              }`}
            >
              {outlet.id === activeOutletId && (
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {outlet.id !== activeOutletId && <span className="w-4 shrink-0" />}
              <span>{outlet.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
