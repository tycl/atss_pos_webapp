import { db } from '../../lib/db'
import type { Category, Item, Modifier, ModifierGroup } from '../../lib/types'
import { enqueue } from '../sync/queue'

// Every write here follows the same pattern as features/auth/api.ts: Dexie
// first (CLAUDE.md section 8), then queued to Supabase. Reads come from
// Dexie only — there's no pull-sync yet (only this push queue), so a second
// device's menu edits won't appear here until that's built.

// ============================================================================
// categories
// ============================================================================

export async function listCategories(merchantId: string): Promise<Category[]> {
  return db.categories.where({ merchant_id: merchantId }).sortBy('sort_order')
}

export async function createCategory(input: {
  merchantId: string
  name: string
  sortOrder: number
}): Promise<Category> {
  const category: Category = {
    id: crypto.randomUUID(),
    merchant_id: input.merchantId,
    name: input.name,
    sort_order: input.sortOrder,
  }
  await db.categories.put(category)
  await enqueue('categories', 'upsert', { ...category })
  return category
}

export async function updateCategory(
  id: string,
  changes: Partial<Pick<Category, 'name' | 'sort_order'>>,
): Promise<Category> {
  await db.categories.update(id, changes)
  const updated = await db.categories.get(id)
  if (!updated) throw new Error(`Category not found after update: ${id}`)
  await enqueue('categories', 'upsert', { ...updated })
  return updated
}

/** Throws if the category still has items — deleting it would cascade-delete them. */
export async function deleteCategory(id: string): Promise<void> {
  const itemCount = await db.items.where({ category_id: id }).count()
  if (itemCount > 0) {
    throw new Error('Move or delete this category’s items first.')
  }
  await db.categories.delete(id)
  await enqueue('categories', 'delete', { id })
}

// ============================================================================
// items
// ============================================================================

export async function listItems(merchantId: string): Promise<Item[]> {
  return db.items.where({ merchant_id: merchantId }).sortBy('sort_order')
}

export async function createItem(input: {
  merchantId: string
  categoryId: string
  name: string
  priceSen: number
  sortOrder: number
}): Promise<Item> {
  const item: Item = {
    id: crypto.randomUUID(),
    merchant_id: input.merchantId,
    category_id: input.categoryId,
    name: input.name,
    price_sen: input.priceSen,
    active: true,
    sort_order: input.sortOrder,
  }
  await db.items.put(item)
  await enqueue('items', 'upsert', { ...item })
  return item
}

export async function updateItem(
  id: string,
  changes: Partial<Pick<Item, 'name' | 'price_sen' | 'category_id' | 'active' | 'sort_order'>>,
): Promise<Item> {
  await db.items.update(id, changes)
  const updated = await db.items.get(id)
  if (!updated) throw new Error(`Item not found after update: ${id}`)
  await enqueue('items', 'upsert', { ...updated })
  return updated
}

export async function deleteItem(id: string): Promise<void> {
  await db.items.delete(id)
  await db.item_modifier_groups.where({ item_id: id }).delete()
  await enqueue('items', 'delete', { id })
}

// ============================================================================
// modifier groups + modifiers
// ============================================================================

export async function listModifierGroups(merchantId: string): Promise<ModifierGroup[]> {
  return db.modifier_groups.where({ merchant_id: merchantId }).toArray()
}

export async function createModifierGroup(input: {
  merchantId: string
  name: string
  required: boolean
  maxSelect: number
}): Promise<ModifierGroup> {
  const group: ModifierGroup = {
    id: crypto.randomUUID(),
    merchant_id: input.merchantId,
    name: input.name,
    required: input.required,
    max_select: input.maxSelect,
  }
  await db.modifier_groups.put(group)
  await enqueue('modifier_groups', 'upsert', { ...group })
  return group
}

export async function updateModifierGroup(
  id: string,
  changes: Partial<Pick<ModifierGroup, 'name' | 'required' | 'max_select'>>,
): Promise<ModifierGroup> {
  await db.modifier_groups.update(id, changes)
  const updated = await db.modifier_groups.get(id)
  if (!updated) throw new Error(`Modifier group not found after update: ${id}`)
  await enqueue('modifier_groups', 'upsert', { ...updated })
  return updated
}

export async function deleteModifierGroup(id: string): Promise<void> {
  await db.modifiers.where({ group_id: id }).delete()
  await db.item_modifier_groups.where({ group_id: id }).delete()
  await db.modifier_groups.delete(id)
  await enqueue('modifier_groups', 'delete', { id })
}

export async function listModifiers(groupId: string): Promise<Modifier[]> {
  return db.modifiers.where({ group_id: groupId }).toArray()
}

export async function listAllModifiersForMerchant(merchantId: string): Promise<Modifier[]> {
  return db.modifiers.where({ merchant_id: merchantId }).toArray()
}

export async function createModifier(input: {
  merchantId: string
  groupId: string
  name: string
  priceSen: number
}): Promise<Modifier> {
  const modifier: Modifier = {
    id: crypto.randomUUID(),
    merchant_id: input.merchantId,
    group_id: input.groupId,
    name: input.name,
    price_sen: input.priceSen,
  }
  await db.modifiers.put(modifier)
  await enqueue('modifiers', 'upsert', { ...modifier })
  return modifier
}

export async function updateModifier(
  id: string,
  changes: Partial<Pick<Modifier, 'name' | 'price_sen'>>,
): Promise<Modifier> {
  await db.modifiers.update(id, changes)
  const updated = await db.modifiers.get(id)
  if (!updated) throw new Error(`Modifier not found after update: ${id}`)
  await enqueue('modifiers', 'upsert', { ...updated })
  return updated
}

export async function deleteModifier(id: string): Promise<void> {
  await db.modifiers.delete(id)
  await enqueue('modifiers', 'delete', { id })
}

// ============================================================================
// item <-> modifier group assignments
// ============================================================================

export async function listModifierGroupIdsForItem(itemId: string): Promise<string[]> {
  const rows = await db.item_modifier_groups.where({ item_id: itemId }).toArray()
  return rows.map((row) => row.group_id)
}

/** Replaces every modifier-group assignment for an item with exactly `groupIds`. */
export async function setItemModifierGroups(
  merchantId: string,
  itemId: string,
  groupIds: string[],
): Promise<void> {
  const existing = await db.item_modifier_groups.where({ item_id: itemId }).toArray()
  const existingGroupIds = new Set(existing.map((row) => row.group_id))
  const nextGroupIds = new Set(groupIds)

  for (const row of existing) {
    if (!nextGroupIds.has(row.group_id)) {
      await db.item_modifier_groups.delete([row.item_id, row.group_id])
      await enqueue('item_modifier_groups', 'delete', {
        item_id: row.item_id,
        group_id: row.group_id,
      })
    }
  }

  for (const groupId of groupIds) {
    if (!existingGroupIds.has(groupId)) {
      const link = { merchant_id: merchantId, item_id: itemId, group_id: groupId }
      await db.item_modifier_groups.put(link)
      await enqueue('item_modifier_groups', 'upsert', link)
    }
  }
}
