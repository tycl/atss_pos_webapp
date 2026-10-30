/**
 * Fires a promise without awaiting it, but surfaces any rejection via
 * onError instead of letting it vanish as an unhandled rejection. For
 * inline mutations fired straight from a DOM event (onBlur/onChange) where
 * wrapping the whole handler in try/catch isn't practical.
 */
export function catchAsync(promise: Promise<unknown>, onError: (message: string) => void): void {
  promise.catch((err: unknown) => {
    onError(err instanceof Error ? err.message : 'Something went wrong')
  })
}
