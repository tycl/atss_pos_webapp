import { useState, type FormEvent } from 'react'
import { catchAsync } from '../../../lib/catchAsync'
import { useLiveQuery } from '../../../lib/useLiveQuery'
import { createCategory, deleteCategory, listCategories, updateCategory } from '../api'
import { ConfirmButton } from './ConfirmButton'

export function CategoriesTab({ merchantId }: { merchantId: string }) {
  const categories = useLiveQuery(() => listCategories(merchantId), [merchantId], [])
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!newName.trim()) return
    const maxSortOrder = categories.reduce((max, c) => Math.max(max, c.sort_order), -1)
    try {
      await createCategory({ merchantId, name: newName.trim(), sortOrder: maxSortOrder + 1 })
      setNewName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add category')
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await deleteCategory(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete category')
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name"
          className="flex-1 rounded border border-slate-300 px-3 py-2"
        />
        <button type="submit" className="rounded bg-slate-800 px-4 py-2 text-white">
          Add
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
        {categories.map((category) => (
          <li key={category.id} className="flex items-center gap-3 px-3 py-2">
            <input
              value={category.name}
              onChange={(e) =>
                catchAsync(updateCategory(category.id, { name: e.target.value }), setError)
              }
              className="flex-1 rounded border border-transparent px-2 py-2 hover:border-slate-300 focus:border-slate-300"
            />
            <ConfirmButton
              onConfirm={() => void handleDelete(category.id)}
              className="rounded border border-red-300 px-3 py-2 text-sm text-red-600"
            >
              Delete
            </ConfirmButton>
          </li>
        ))}
        {categories.length === 0 && (
          <li className="px-3 py-4 text-sm text-slate-500">No categories yet.</li>
        )}
      </ul>
    </div>
  )
}
