import { useState, type FormEvent } from 'react'
import { catchAsync } from '../../../lib/catchAsync'
import { formatSenAsRM, parseRMToSen } from '../../../lib/money'
import { useLiveQuery } from '../../../lib/useLiveQuery'
import type { ModifierGroup } from '../../../lib/types'
import {
  createModifier,
  createModifierGroup,
  deleteModifier,
  deleteModifierGroup,
  listModifierGroups,
  listModifiers,
  updateModifierGroup,
} from '../api'
import { ConfirmButton } from './ConfirmButton'

export function ModifierGroupsTab({ merchantId }: { merchantId: string }) {
  const groups = useLiveQuery(() => listModifierGroups(merchantId), [merchantId], [])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!name.trim()) return
    try {
      await createModifierGroup({ merchantId, name: name.trim(), required: false, maxSelect: 1 })
      setName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add modifier group')
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New modifier group, e.g. Sugar level"
          className="flex-1 rounded border border-slate-300 px-3 py-2"
        />
        <button type="submit" className="rounded bg-slate-800 px-4 py-2 text-white">
          Add
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
        {groups.map((group) => (
          <GroupRow
            key={group.id}
            group={group}
            merchantId={merchantId}
            expanded={expandedGroupId === group.id}
            onToggleExpanded={() =>
              setExpandedGroupId((current) => (current === group.id ? null : group.id))
            }
          />
        ))}
        {groups.length === 0 && (
          <li className="px-3 py-4 text-sm text-slate-500">No modifier groups yet.</li>
        )}
      </ul>
    </div>
  )
}

function GroupRow({
  group,
  merchantId,
  expanded,
  onToggleExpanded,
}: {
  group: ModifierGroup
  merchantId: string
  expanded: boolean
  onToggleExpanded: () => void
}) {
  const modifiers = useLiveQuery(() => listModifiers(group.id), [group.id], [])
  const [newModifierName, setNewModifierName] = useState('')
  const [newModifierPrice, setNewModifierPrice] = useState('0')
  const [rowError, setRowError] = useState<string | null>(null)

  async function handleAddModifier(event: FormEvent) {
    event.preventDefault()
    setRowError(null)
    if (!newModifierName.trim()) return
    let priceSen: number
    try {
      priceSen = parseRMToSen(newModifierPrice || '0')
    } catch {
      setRowError('Enter a valid price, e.g. 1.50')
      return
    }
    try {
      await createModifier({
        merchantId,
        groupId: group.id,
        name: newModifierName.trim(),
        priceSen,
      })
      setNewModifierName('')
      setNewModifierPrice('0')
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Could not add modifier')
    }
  }

  return (
    <li className="px-3 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          defaultValue={group.name}
          onBlur={(e) => {
            if (e.target.value.trim() && e.target.value !== group.name) {
              catchAsync(
                updateModifierGroup(group.id, { name: e.target.value.trim() }),
                setRowError,
              )
            }
          }}
          className="flex-1 rounded border border-transparent px-2 py-2 hover:border-slate-300 focus:border-slate-300"
        />
        <label className="flex items-center gap-1 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={group.required}
            onChange={(e) =>
              catchAsync(updateModifierGroup(group.id, { required: e.target.checked }), setRowError)
            }
          />
          Required
        </label>
        <label className="flex items-center gap-1 text-sm text-slate-600">
          Max select
          <input
            type="number"
            min={1}
            value={group.max_select}
            onChange={(e) =>
              catchAsync(
                updateModifierGroup(group.id, { max_select: Number(e.target.value) || 1 }),
                setRowError,
              )
            }
            className="w-14 rounded border border-slate-300 px-2 py-2"
          />
        </label>
        <button
          type="button"
          onClick={onToggleExpanded}
          className="rounded px-2 py-2 text-sm text-slate-600 underline"
        >
          {expanded ? 'Hide modifiers' : 'Show modifiers'}
        </button>
        <ConfirmButton
          onConfirm={() => catchAsync(deleteModifierGroup(group.id), setRowError)}
          className="rounded border border-red-300 px-3 py-2 text-sm text-red-600"
        >
          Delete group
        </ConfirmButton>
      </div>

      {rowError && <p className="mt-1 text-sm text-red-600">{rowError}</p>}

      {expanded && (
        <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
          <ul className="space-y-1">
            {modifiers.map((modifier) => (
              <li key={modifier.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{modifier.name}</span>
                <span className="text-slate-500">{formatSenAsRM(modifier.price_sen)}</span>
                <ConfirmButton
                  onConfirm={() => catchAsync(deleteModifier(modifier.id), setRowError)}
                  className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600"
                >
                  Delete
                </ConfirmButton>
              </li>
            ))}
            {modifiers.length === 0 && (
              <li className="text-sm text-slate-500">No modifiers yet.</li>
            )}
          </ul>

          <form onSubmit={handleAddModifier} className="flex gap-2">
            <input
              value={newModifierName}
              onChange={(e) => setNewModifierName(e.target.value)}
              placeholder="e.g. Extra shot"
              className="flex-1 rounded border border-slate-300 px-2 py-2 text-sm"
            />
            <input
              value={newModifierPrice}
              onChange={(e) => setNewModifierPrice(e.target.value)}
              placeholder="0.00"
              className="w-20 rounded border border-slate-300 px-2 py-2 text-sm"
            />
            <button type="submit" className="rounded bg-slate-700 px-3 py-2 text-sm text-white">
              Add
            </button>
          </form>
        </div>
      )}
    </li>
  )
}
