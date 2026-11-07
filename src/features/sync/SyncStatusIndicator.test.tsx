import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { SyncStatusIndicator } from './SyncStatusIndicator'

beforeEach(async () => {
  await db.sync_queue.clear()
  await db.merchants.clear()
  localStorage.clear()
})

describe('SyncStatusIndicator', () => {
  it('shows the online state with nothing queued', () => {
    render(<SyncStatusIndicator />)
    expect(screen.getByText(/Online|Offline/)).toBeInTheDocument()
  })

  // Regression: App.tsx renders this badge OUTSIDE <RouterProvider>, so
  // anything needing router context (e.g. react-router's <Link>) throws
  // "Cannot destructure property 'basename'" as soon as the queue is
  // non-empty — which is immediately after the first order is placed.
  // Rendering with no router in context is the whole point of this test.
  it('renders the pending-count link with no router in context', async () => {
    await db.sync_queue.add({
      id: 'queue-item-1',
      table: 'orders',
      op: 'upsert',
      payload: { id: 'order-1' },
      created_at: new Date().toISOString(),
      seq: 1,
      attempts: 0,
      last_error: null,
    })

    render(<SyncStatusIndicator />)

    expect(await screen.findByText(/1 record waiting to sync/)).toBeInTheDocument()
  })
})
