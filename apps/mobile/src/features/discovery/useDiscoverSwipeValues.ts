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
import { animateTo, type ResolvedMotion } from "../../ui/motion"
import {
  DISCOVER_PROMOTION_SPRING,
  DISCOVER_SWIPE_RESET_SPRING,
  getDiscoverDeckCardProgress,
  getDiscoverDeckReanchorRank,
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

/** A card taking its next slot moves on the shared `snappy` spring. */
export const DISCOVER_PROMOTION_MOTION: ResolvedMotion = Object.freeze({
  kind: "spring",
  duration: DISCOVER_PROMOTION_SPRING.duration,
  dampingRatio: DISCOVER_PROMOTION_SPRING.dampingRatio
})

/**
 * The deck's advance, owned by the UI thread. `target` counts committed
 * decisions and grows by one at the release; `step` springs after it and
 * places every card (see getDiscoverDeckCardProgress); `settled` is the count
 * the deck last came to rest at, when the deck may mount its standby card.
 */
export interface DiscoverDeckAdvance {
  step: SharedValue<number>
  target: SharedValue<number>
  settled: SharedValue<number>
}

export function useDiscoverDeckAdvance(): DiscoverDeckAdvance {
  const step = useSharedValue(0)
  const target = useSharedValue(0)
  const settled = useSharedValue(0)
  return useMemo(() => ({ step, target, settled }), [settled, step, target])
}

/**
 * One committed decision: every card starts toward its next slot now, on the
 * UI thread (a gesture release, or scheduled from a Like/Pass press). Reduce
 * Motion takes the slots at once.
 */
export function advanceDiscoverDeck(deck: DiscoverDeckAdvance, reduceMotion: boolean): void {
  "worklet"
  const target = deck.target.value + 1
  deck.target.value = target
  if (reduceMotion) {
    deck.step.value = target
    deck.settled.value = target
    return
  }
  deck.step.value = animateTo(target, DISCOVER_PROMOTION_MOTION, (finished) => {
    "worklet"
    if (finished) deck.settled.value = target
  })
}

export interface DiscoverDeckCardAnchor {
  rank: SharedValue<number>
  step: SharedValue<number>
}

/**
 * A card whose role changed without a decision (a refused decision coming
 * back): it keeps its pose this frame, then springs to its new slot by
 * itself (at once under Reduce Motion).
 */
export function reanchorDiscoverDeckCard(
  anchor: DiscoverDeckCardAnchor,
  deckStep: SharedValue<number>,
  rank: number,
  commits: number,
  reduceMotion: boolean
): void {
  "worklet"
  const current = getDiscoverDeckCardProgress(anchor.rank.value, anchor.step.value, deckStep.value)
  anchor.step.value = commits
  if (reduceMotion) {
    anchor.rank.value = rank
    return
  }
  anchor.rank.value = getDiscoverDeckReanchorRank(current, deckStep.value, commits)
  anchor.rank.value = animateTo(rank, DISCOVER_PROMOTION_MOTION)
}
