import { useRef } from "react"

/**
 * Returns the previous object while the new one has the same content. Chat rows and headers rebuild their
 * avatar objects on every list or realtime update; a stable reference keeps the memoised portrait (and its
 * resolved layer list) from recomputing for an unchanged look.
 */
export function useStableByContent<T>(value: T): T {
  const held = useRef<{ key: string; value: T } | null>(null)
  const key = JSON.stringify(value)
  if (held.current === null || held.current.key !== key) held.current = { key, value }
  return held.current.value
}
