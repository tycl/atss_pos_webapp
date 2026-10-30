import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { getActiveMerchantId } from '../../../lib/localSession'
import { useStaffSession } from '../../auth/useStaffSession'
import { CategoriesTab } from '../components/CategoriesTab'
import { ItemsTab } from '../components/ItemsTab'
import { ModifierGroupsTab } from '../components/ModifierGroupsTab'

type Tab = 'categories' | 'items' | 'modifiers'

const TABS: { id: Tab; label: string }[] = [
  { id: 'categories', label: 'Categories' },
  { id: 'items', label: 'Items' },
  { id: 'modifiers', label: 'Modifier groups' },
]

export function MenuManagementPage() {
  const { staff } = useStaffSession()
  const [tab, setTab] = useState<Tab>('categories')
  const merchantId = getActiveMerchantId()

  if (!staff) return <Navigate to="/login" replace />
  if (staff.role !== 'owner') return <Navigate to="/pos" replace />
  if (!merchantId) return <Navigate to="/onboarding" replace />

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-800">Menu</h1>
          <Link to="/backoffice" className="text-sm text-slate-600 underline">
            Back
          </Link>
        </div>

        <div className="flex gap-2 border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                tab === t.id
                  ? 'border-slate-800 text-slate-900'
                  : 'border-transparent text-slate-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'categories' && <CategoriesTab merchantId={merchantId} />}
        {tab === 'items' && <ItemsTab merchantId={merchantId} />}
        {tab === 'modifiers' && <ModifierGroupsTab merchantId={merchantId} />}
      </div>
    </div>
  )
}
