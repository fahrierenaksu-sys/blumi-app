import { useState } from "react"

/**
 * Keep only the last committed drawing inputs while another Shop mode is shown.
 * Active output always uses current inputs, including null (never stale pixels).
 * React state, rather than a render-time ref write, owns concurrent updates.
 * Callers must memoize the drawing input; actions and ownership never belong here.
 */
export function useRetainedShopPreviewDrawing<T>(active: boolean, drawing: T | null): T | null {
  const [retained, setRetained] = useState<T | null>(() => active ? drawing : null)
  if (active && drawing !== retained) setRetained(drawing)
  return active ? drawing : retained
}
