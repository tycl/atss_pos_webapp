import { useState, type FormEvent } from 'react'
import { catchAsync } from '../../../lib/catchAsync'
import { formatSenAsRM, parseRMToSen } from '../../../lib/money'
import { useLiveQuery } from '../../../lib/useLiveQuery'
import type { Item } from '../../../lib/types'
import {
  createItem,
  deleteItem,
  listCategories,
  listItems,
  listModifierGroupIdsForItem,
  listModifierGroups,
  setItemModifierGroups,
  updateItem,
} from '../api'
import { ConfirmButton } from './ConfirmButton'

export function ItemsTab({ merchantId }: { merchantId: string }) {
  const items = useLiveQuery(() => listItems(merchantId), [merchantId], [])
  const categories = useLiveQuery(() => listCategories(merchantId), [merchantId], [])
  const modifierGroups = useLiveQuery(() => listModifierGroups(merchantId), [merchantId], [])

  const [name, setName] = useState('')
  const [priceInput, setPriceInput] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!name.trim() || !categoryId) {
      setError('Name and category are required')
      return
    }
    let priceSen: number
    try {
      priceSen = parseRMToSen(priceInput)
    } catch {
      setError('Enter a valid price, e.g. 4.50')
      return
    }
    const maxSortOrder = items.reduce((max, i) => Math.max(max, i.sort_order), -1)
    try {
      await createItem({
        merchantId,
        categoryId,
        name: name.trim(),
        priceSen,
        sortOrder: maxSortOrder + 1,
      })
      setName('')
      setPriceInput('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add item')
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-sm text-slate-700">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col text-sm text-slate-700">
          Price (RM)
          <input
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            placeholder="4.50"
            className="w-28 rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col text-sm text-slate-700">
          Category
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2"
          >
            <option value="">Select…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded bg-slate-800 px-4 py-2 text-white">
          Add item
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            merchantId={merchantId}
            categories={categories}
            modifierGroups={modifierGroups}
            expanded={expandedItemId === item.id}
            onToggleExpanded={() =>
              setExpandedItemId((current) => (current === item.id ? null : item.id))
            }
          />
        ))}
        {items.length === 0 && <li className="px-3 py-4 text-sm text-slate-500">No items yet.</li>}
      </ul>
    </div>
  )
}

function ItemRow({
  item,
  merchantId,
  categories,
  modifierGroups,
  expanded,
  onToggleExpanded,
}: {
  item: Item
  merchantId: string
  categories: { id: string; name: string }[]
  modifierGroups: { id: string; name: string }[]
  expanded: boolean
  onToggleExpanded: () => void
}) {
  const assignedGroupIds = useLiveQuery(() => listModifierGroupIdsForItem(item.id), [item.id], [])
  const [rowError, setRowError] = useState<string | null>(null)

  function handlePriceBlur(value: string) {
    try {
      const priceSen = parseRMToSen(value)
      if (priceSen !== item.price_sen) {
        catchAsync(updateItem(item.id, { price_sen: priceSen }), setRowError)
      }
    } catch {
      setRowError('Enter a valid price, e.g. 4.50')
    }
  }

  return (
    <li className="px-3 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          defaultValue={item.name}
          onBlur={(e) => {
            if (e.target.value.trim() && e.target.value !== item.name) {
              catchAsync(updateItem(item.id, { name: e.target.value.trim() }), setRowError)
            }
          }}
          className="flex-1 rounded border border-transparent px-2 py-2 hover:border-slate-300 focus:border-slate-300"
        />
        <input
          defaultValue={formatSenAsRM(item.price_sen).replace('RM ', '')}
          onBlur={(e) => handlePriceBlur(e.target.value)}
          className="w-20 rounded border border-transparent px-2 py-2 text-right hover:border-slate-300 focus:border-slate-300"
        />
        <select
          value={item.category_id}
          onChange={(e) =>
            catchAsync(updateItem(item.id, { category_id: e.target.value }), setRowError)
          }
          className="rounded border border-slate-300 px-2 py-2 text-sm"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={item.active}
            onChange={(e) =>
              catchAsync(updateItem(item.id, { active: e.target.checked }), setRowError)
            }
          />
          Active
        </label>
        <button
          type="button"
          onClick={onToggleExpanded}
          className="rounded px-2 py-2 text-sm text-slate-600 underline"
        >
          Modifiers
        </button>
        <ConfirmButton
          onConfirm={() => catchAsync(deleteItem(item.id), setRowError)}
          className="rounded border border-red-300 px-3 py-2 text-sm text-red-600"
        >
          Delete
        </ConfirmButton>
      </div>

      {rowError && <p className="mt-1 text-sm text-red-600">{rowError}</p>}

      {expanded && (
        <div className="mt-2 flex flex-wrap gap-3 border-t border-slate-100 pt-2">
          {modifierGroups.length === 0 && (
            <p className="text-sm text-slate-500">
              No modifier groups yet — add some in the Modifiers tab.
            </p>
          )}
          {modifierGroups.map((group) => (
            <label key={group.id} className="flex items-center gap-1 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={assignedGroupIds.includes(group.id)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...assignedGroupIds, group.id]
                    : assignedGroupIds.filter((id) => id !== group.id)
                  catchAsync(setItemModifierGroups(merchantId, item.id, next), setRowError)
                }}
              />
              {group.name}
            </label>
          ))}
        </div>
      )}
    </li>
  )
}
