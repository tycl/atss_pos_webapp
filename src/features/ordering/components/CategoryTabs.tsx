import type { Category } from '../../../lib/types'

export function CategoryTabs({
  categories,
  selectedCategoryId,
  onSelect,
}: {
  categories: Category[]
  selectedCategoryId: string | null
  onSelect: (categoryId: string) => void
}) {
  return (
    <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2">
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          onClick={() => onSelect(category.id)}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
            category.id === selectedCategoryId
              ? 'bg-primary-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          {category.name}
        </button>
      ))}
    </div>
  )
}
