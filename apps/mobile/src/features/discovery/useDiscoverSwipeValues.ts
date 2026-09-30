import { useMemo } from "react"
import { Dimensions } from "react-native"
import {
  ReduceMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue
} from "react-native-reanimated"
import {
  DISCOVER_SWIPE_RESET_SPRING,
  getDiscoverSwipeOutX,
  type DiscoverSwipeDirection
} from "./discoverySwipeModel"

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

/**
 * Brings a card whose decision the server refused back into the deck from the
 * side it left through, with the same spring as a cancelled drag. The card
 * takes the drag so only it moves; under Reduce Motion it is back at once.
 */
export function returnDiscoverSwipeCard(
  values: DiscoverSwipeValues,
  input: { cardId: string; direction: DiscoverSwipeDirection; reduceMotion: boolean }
): void {
  values.ownerId.value = input.cardId
  if (input.reduceMotion) {
    values.x.value = 0
    return
  }
  const outX = getDiscoverSwipeOutX(input.direction, Dimensions.get("window").width)
  // One UI-thread sequence: jump to the exit point, then spring home.
  values.x.value = withSequence(
    withTiming(outX, { duration: 0, reduceMotion: ReduceMotion.Never }),
    withSpring(0, { ...DISCOVER_SWIPE_RESET_SPRING, reduceMotion: ReduceMotion.Never })
  )
}
