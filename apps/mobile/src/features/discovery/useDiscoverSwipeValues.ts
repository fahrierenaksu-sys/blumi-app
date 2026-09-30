import { useMemo } from "react"
import { useSharedValue, type SharedValue } from "react-native-reanimated"

/**
 * The deck's shared card drag, read and written on the UI thread. `x` is the
 * horizontal drag of the card named by `ownerId`; every other card ignores
 * it (see `getDiscoverSwipeTranslateX`).
 */
export interface DiscoverSwipeValues {
  x: SharedValue<number>
  ownerId: SharedValue<string>
}

export function useDiscoverSwipeValues(): DiscoverSwipeValues {
  const x = useSharedValue(0)
  const ownerId = useSharedValue("")
  return useMemo(() => ({ x, ownerId }), [ownerId, x])
}
