/** A bounded, retryable warmup for the two bundled surfaces on Discover's first frame. */
export function createDiscoveryFirstFrameAssetWarmup<T>(
  sources: readonly T[],
  resolveUri: (source: T) => string | undefined,
  prefetch: (uris: string[]) => Promise<boolean>
): () => Promise<boolean> {
  let inFlight: Promise<boolean> | null = null
  let completed = false

  return () => {
    if (completed) return Promise.resolve(true)
    if (inFlight) return inFlight
    let request: Promise<boolean>
    try {
      const uris = sources.map(resolveUri)
      if (uris.some((uri) => !uri)) return Promise.resolve(false)
      request = Promise.resolve(prefetch(uris as string[]))
    } catch {
      return Promise.resolve(false)
    }
    const current = request.catch(() => false).then((success) => {
      if (success) completed = true
      if (inFlight === current) inFlight = null
      return success
    })
    inFlight = current
    return current
  }
}
