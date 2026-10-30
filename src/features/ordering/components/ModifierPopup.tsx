import { useState } from 'react'
import type { CartLine } from '../../../lib/cart'
import { formatSenAsRM } from '../../../lib/money'
import type { Item, Modifier, ModifierGroup } from '../../../lib/types'

export interface ModifierGroupWithModifiers {
  group: ModifierGroup
  modifiers: Modifier[]
}

export function ModifierPopup({
  item,
  groups,
  onCancel,
  onConfirm,
}: {
  item: Item
  groups: ModifierGroupWithModifiers[]
  onCancel: () => void
  onConfirm: (line: Omit<CartLine, 'lineId'>) => void
}) {
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const [qty, setQty] = useState(1)
  const [error, setError] = useState<string | null>(null)

  function toggleModifier(group: ModifierGroup, modifierId: string) {
    setError(null)
    setSelections((current) => {
      const selected = current[group.id] ?? []
      const isSelected = selected.includes(modifierId)

      if (isSelected) {
        return { ...current, [group.id]: selected.filter((id) => id !== modifierId) }
      }
      if (group.max_select <= 1) {
        return { ...current, [group.id]: [modifierId] }
      }
      if (selected.length >= group.max_select) {
        return current
      }
      return { ...current, [group.id]: [...selected, modifierId] }
    })
  }

  function handleConfirm() {
    const missingRequired = groups.find(
      ({ group }) => group.required && (selections[group.id]?.length ?? 0) === 0,
    )
    if (missingRequired) {
      setError(`Please choose a ${missingRequired.group.name.toLowerCase()}`)
      return
    }

    const modifiers = groups.flatMap(({ group, modifiers }) =>
      (selections[group.id] ?? []).map((modifierId) => {
        const modifier = modifiers.find((m) => m.id === modifierId)!
        return { modifier_id: modifier.id, name: modifier.name, price_sen: modifier.price_sen }
      }),
    )

    onConfirm({
      itemId: item.id,
      name: item.name,
      unitPriceSen: item.price_sen,
      qty,
      modifiers,
      note: null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-xl bg-white p-4 sm:rounded-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">{item.name}</h2>
          <span className="text-slate-500">{formatSenAsRM(item.price_sen)}</span>
        </div>

        <div className="space-y-4">
          {groups.map(({ group, modifiers }) => (
            <div key={group.id}>
              <h3 className="mb-1 text-sm font-medium text-slate-700">
                {group.name}
                {group.required && <span className="text-red-600"> *</span>}
                {group.max_select > 1 && (
                  <span className="text-slate-400"> (up to {group.max_select})</span>
                )}
              </h3>
              <div className="flex flex-wrap gap-2">
                {modifiers.map((modifier) => {
                  const selected = (selections[group.id] ?? []).includes(modifier.id)
                  return (
                    <button
                      key={modifier.id}
                      type="button"
                      onClick={() => toggleModifier(group, modifier.id)}
                      className={`rounded-full border px-3 py-1.5 text-sm ${
                        selected
                          ? 'border-slate-800 bg-slate-800 text-white'
                          : 'border-slate-300 text-slate-700'
                      }`}
                    >
                      {modifier.name}
                      {modifier.price_sen > 0 && ` (+${formatSenAsRM(modifier.price_sen)})`}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Quantity</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="h-11 w-11 rounded-full border border-slate-300 text-lg"
            >
              −
            </button>
            <span className="w-6 text-center">{qty}</span>
            <button
              type="button"
              onClick={() => setQty((q) => q + 1)}
              className="h-11 w-11 rounded-full border border-slate-300 text-lg"
            >
              +
            </button>
          </div>
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded border border-slate-300 py-2 text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 rounded bg-slate-800 py-2 text-white"
          >
            Add to cart
          </button>
        </div>
      </div>
    </div>
  )
}
