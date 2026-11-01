import { formatSenAsRM } from '../../../lib/money'
import type { Item } from '../../../lib/types'

// A stable color accent per category — purely cosmetic, derived from the
// existing category_id (no schema change, no per-category color field).
const ACCENT_PALETTE = [
  'border-l-primary-500',
  'border-l-amber-500',
  'border-l-sky-500',
  'border-l-rose-500',
  'border-l-violet-500',
  'border-l-lime-600',
]

function accentForCategory(categoryId: string): string {
  let hash = 0
  for (let i = 0; i < categoryId.length; i++) hash += categoryId.charCodeAt(i)
  return ACCENT_PALETTE[hash % ACCENT_PALETTE.length]
}

export function ItemGrid({ items, onSelect }: { items: Item[]; onSelect: (item: Item) => void }) {
  if (items.length === 0) {
    return <p className="p-6 text-sm text-slate-500">No items in this category.</p>
  }

  return (
    <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item)}
          className={`flex h-24 flex-col items-start justify-between rounded-xl border border-l-4 border-slate-200 bg-white p-3 text-left shadow-card transition hover:shadow-md active:bg-primary-50 ${accentForCategory(
            item.category_id,
          )}`}
        >
          <span className="text-[15px] font-medium leading-snug text-slate-800">{item.name}</span>
          <span className="text-sm font-semibold text-slate-700">
            {formatSenAsRM(item.price_sen)}
          </span>
        </button>
      ))}
    </div>
  )
}
