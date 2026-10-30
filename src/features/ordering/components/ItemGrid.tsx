import { formatSenAsRM } from '../../../lib/money'
import type { Item } from '../../../lib/types'

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
          className="flex h-24 flex-col items-start justify-between rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm active:bg-slate-50"
        >
          <span className="font-medium text-slate-800">{item.name}</span>
          <span className="text-sm text-slate-500">{formatSenAsRM(item.price_sen)}</span>
        </button>
      ))}
    </div>
  )
}
