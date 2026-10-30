import { describe, expect, it, vi } from 'vitest'
import { catchAsync } from './catchAsync'

describe('catchAsync', () => {
  it('does not call onError when the promise resolves', async () => {
    const onError = vi.fn()
    catchAsync(Promise.resolve('ok'), onError)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onError).not.toHaveBeenCalled()
  })

  it('calls onError with the Error message when the promise rejects', async () => {
    const onError = vi.fn()
    catchAsync(Promise.reject(new Error('boom')), onError)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onError).toHaveBeenCalledWith('boom')
  })

  it('falls back to a generic message for a non-Error rejection', async () => {
    const onError = vi.fn()
    catchAsync(Promise.reject('just a string'), onError)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onError).toHaveBeenCalledWith('Something went wrong')
  })
})
