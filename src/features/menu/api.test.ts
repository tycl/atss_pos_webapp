import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import {
  createCategory,
  createItem,
  createModifier,
  createModifierGroup,
  deleteCategory,
  deleteItem,
  deleteModifierGroup,
  listAllModifiersForMerchant,
  listCategories,
  listItems,
  listModifierGroupIdsForItem,
  listModifierGroups,
  listModifiers,
  setItemModifierGroups,
  updateCategory,
  updateItem,
} from './api'

const MERCHANT_A = 'merchant-a'
const MERCHANT_B = 'merchant-b'

beforeEach(async () => {
  await db.categories.clear()
  await db.items.clear()
  await db.modifier_groups.clear()
  await db.modifiers.clear()
  await db.item_modifier_groups.clear()
  await db.sync_queue.clear()
})

describe('categories', () => {
  it('creates a category, writes it to Dexie, and queues it for sync', async () => {
    const category = await createCategory({ merchantId: MERCHANT_A, name: 'Drinks', sortOrder: 0 })

    expect(await db.categories.get(category.id)).toEqual(category)
    const queued = await db.sync_queue.toArray()
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({ table: 'categories', op: 'upsert', payload: category })
  })

  it('lists only the given merchant’s categories, sorted by sort_order', async () => {
    await createCategory({ merchantId: MERCHANT_A, name: 'Second', sortOrder: 1 })
    await createCategory({ merchantId: MERCHANT_A, name: 'First', sortOrder: 0 })
    await createCategory({ merchantId: MERCHANT_B, name: 'Other merchant', sortOrder: 0 })

    const result = await listCategories(MERCHANT_A)
    expect(result.map((c) => c.name)).toEqual(['First', 'Second'])
  })

  it('updates a category and re-queues the full updated row', async () => {
    const category = await createCategory({ merchantId: MERCHANT_A, name: 'Drinks', sortOrder: 0 })
    const updated = await updateCategory(category.id, { name: 'Beverages' })

    expect(updated.name).toBe('Beverages')
    const queued = await db.sync_queue.orderBy('seq').toArray()
    expect(queued).toHaveLength(2)
    expect(queued[1].payload).toMatchObject({ name: 'Beverages' })
  })

  it('refuses to delete a category that still has items', async () => {
    const category = await createCategory({ merchantId: MERCHANT_A, name: 'Drinks', sortOrder: 0 })
    await createItem({
      merchantId: MERCHANT_A,
      categoryId: category.id,
      name: 'Teh Ais',
      priceSen: 250,
      sortOrder: 0,
    })

    await expect(deleteCategory(category.id)).rejects.toThrow()
    expect(await db.categories.get(category.id)).toBeDefined()
  })

  it('deletes an empty category and queues the delete', async () => {
    const category = await createCategory({ merchantId: MERCHANT_A, name: 'Drinks', sortOrder: 0 })
    await deleteCategory(category.id)

    expect(await db.categories.get(category.id)).toBeUndefined()
    const queued = await db.sync_queue.orderBy('seq').toArray()
    expect(queued[queued.length - 1]).toMatchObject({
      table: 'categories',
      op: 'delete',
      payload: { id: category.id },
    })
  })
})

describe('items', () => {
  it('creates an item as active by default', async () => {
    const category = await createCategory({ merchantId: MERCHANT_A, name: 'Drinks', sortOrder: 0 })
    const item = await createItem({
      merchantId: MERCHANT_A,
      categoryId: category.id,
      name: 'Teh Ais',
      priceSen: 250,
      sortOrder: 0,
    })
    expect(item.active).toBe(true)
    expect(await db.items.get(item.id)).toEqual(item)
  })

  it('toggles active via updateItem', async () => {
    const category = await createCategory({ merchantId: MERCHANT_A, name: 'Drinks', sortOrder: 0 })
    const item = await createItem({
      merchantId: MERCHANT_A,
      categoryId: category.id,
      name: 'Teh Ais',
      priceSen: 250,
      sortOrder: 0,
    })
    const updated = await updateItem(item.id, { active: false })
    expect(updated.active).toBe(false)
  })

  it('lists only the given merchant’s items', async () => {
    const categoryA = await createCategory({ merchantId: MERCHANT_A, name: 'Drinks', sortOrder: 0 })
    const categoryB = await createCategory({ merchantId: MERCHANT_B, name: 'Drinks', sortOrder: 0 })
    await createItem({
      merchantId: MERCHANT_A,
      categoryId: categoryA.id,
      name: 'A Item',
      priceSen: 100,
      sortOrder: 0,
    })
    await createItem({
      merchantId: MERCHANT_B,
      categoryId: categoryB.id,
      name: 'B Item',
      priceSen: 100,
      sortOrder: 0,
    })

    const result = await listItems(MERCHANT_A)
    expect(result.map((i) => i.name)).toEqual(['A Item'])
  })

  it('deleting an item also removes its modifier-group assignments', async () => {
    const category = await createCategory({ merchantId: MERCHANT_A, name: 'Drinks', sortOrder: 0 })
    const item = await createItem({
      merchantId: MERCHANT_A,
      categoryId: category.id,
      name: 'Teh Ais',
      priceSen: 250,
      sortOrder: 0,
    })
    const group = await createModifierGroup({
      merchantId: MERCHANT_A,
      name: 'Sugar level',
      required: false,
      maxSelect: 1,
    })
    await setItemModifierGroups(MERCHANT_A, item.id, [group.id])

    await deleteItem(item.id)

    expect(await db.items.get(item.id)).toBeUndefined()
    expect(await listModifierGroupIdsForItem(item.id)).toEqual([])
  })
})

describe('modifier groups and modifiers', () => {
  it('creates a modifier group and its modifiers', async () => {
    const group = await createModifierGroup({
      merchantId: MERCHANT_A,
      name: 'Sugar level',
      required: false,
      maxSelect: 1,
    })
    await createModifier({
      merchantId: MERCHANT_A,
      groupId: group.id,
      name: 'Less sugar',
      priceSen: 0,
    })
    await createModifier({
      merchantId: MERCHANT_A,
      groupId: group.id,
      name: 'Extra shot',
      priceSen: 150,
    })

    const groups = await listModifierGroups(MERCHANT_A)
    expect(groups).toHaveLength(1)

    const modifiers = await listModifiers(group.id)
    expect(modifiers.map((m) => m.name).sort()).toEqual(['Extra shot', 'Less sugar'])

    const allModifiers = await listAllModifiersForMerchant(MERCHANT_A)
    expect(allModifiers).toHaveLength(2)
  })

  it('deleting a modifier group cascades to its modifiers and item assignments locally', async () => {
    const category = await createCategory({ merchantId: MERCHANT_A, name: 'Drinks', sortOrder: 0 })
    const item = await createItem({
      merchantId: MERCHANT_A,
      categoryId: category.id,
      name: 'Teh Ais',
      priceSen: 250,
      sortOrder: 0,
    })
    const group = await createModifierGroup({
      merchantId: MERCHANT_A,
      name: 'Sugar level',
      required: false,
      maxSelect: 1,
    })
    await createModifier({
      merchantId: MERCHANT_A,
      groupId: group.id,
      name: 'Less sugar',
      priceSen: 0,
    })
    await setItemModifierGroups(MERCHANT_A, item.id, [group.id])

    await deleteModifierGroup(group.id)

    expect(await listModifiers(group.id)).toEqual([])
    expect(await listModifierGroupIdsForItem(item.id)).toEqual([])
    expect(await db.modifier_groups.get(group.id)).toBeUndefined()
  })
})

describe('setItemModifierGroups', () => {
  it('adds and removes assignments to match the given list exactly', async () => {
    const category = await createCategory({ merchantId: MERCHANT_A, name: 'Drinks', sortOrder: 0 })
    const item = await createItem({
      merchantId: MERCHANT_A,
      categoryId: category.id,
      name: 'Teh Ais',
      priceSen: 250,
      sortOrder: 0,
    })
    const sugarGroup = await createModifierGroup({
      merchantId: MERCHANT_A,
      name: 'Sugar level',
      required: false,
      maxSelect: 1,
    })
    const iceGroup = await createModifierGroup({
      merchantId: MERCHANT_A,
      name: 'Ice level',
      required: false,
      maxSelect: 1,
    })

    await setItemModifierGroups(MERCHANT_A, item.id, [sugarGroup.id])
    expect(await listModifierGroupIdsForItem(item.id)).toEqual([sugarGroup.id])

    await setItemModifierGroups(MERCHANT_A, item.id, [iceGroup.id])
    expect(await listModifierGroupIdsForItem(item.id)).toEqual([iceGroup.id])

    await setItemModifierGroups(MERCHANT_A, item.id, [])
    expect(await listModifierGroupIdsForItem(item.id)).toEqual([])
  })
})
