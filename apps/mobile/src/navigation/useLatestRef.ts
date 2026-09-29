import { useLayoutEffect, useRef, type RefObject } from "react"

/**
 * A ref that holds the value from the latest committed render, for callbacks
 * owned by long-lived effects that must not restart when the value changes.
 * The write happens in a layout effect, so passive effects and later events
 * always observe the committed value, and discarded renders never leak.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value)
  useLayoutEffect(() => {
    ref.current = value
  }, [value])
  return ref
}
