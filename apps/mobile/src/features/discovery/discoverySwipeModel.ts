/**
 * Discover card swipe rules, shared by the Gesture Handler pan (UI thread)
 * and the deck. The values are the ones the PanResponder implementation used.
 */
export const SWIPE_OUT_DURATION = 190
export const SWIPE_CAPTURE_THRESHOLD = 4
export const SWIPE_DIRECTION_DOMINANCE = 1.1
export const SWIPE_DISTANCE_RATIO = 0.22
/** px/ms, the unit PanResponder reported. Gesture Handler reports px/s. */
export const SWIPE_FLICK_VELOCITY = 0.55
const SWIPE_MAX_DISTANCE = 96
const SWIPE_OUT_SCREEN_WIDTHS = 1.2

/** `Animated.spring({ tension: 120, friction: 7 })` as stiffness/damping. */
export const DISCOVER_SWIPE_RESET_SPRING = {
  stiffness: (120 - 30) * 3.62 + 194,
  damping: (7 - 8) * 3 + 25,
  mass: 1
} as const

export type DiscoverSwipeDirection = "left" | "right"

export function getDiscoverSwipeThreshold(screenWidth: number): number {
  return Math.min(screenWidth * SWIPE_DISTANCE_RATIO, SWIPE_MAX_DISTANCE)
}

/** Claim the touch once it moved past 4 px and is clearly horizontal. */
export function shouldClaimDiscoverSwipe(dx: number, dy: number): boolean {
  "worklet"
  return Math.abs(dx) > SWIPE_CAPTURE_THRESHOLD &&
    Math.abs(dx) > Math.abs(dy) * SWIPE_DIRECTION_DOMINANCE
}

export function resolveDiscoverSwipeRelease(input: {
  dx: number
  velocityXPerSecond: number
  threshold: number
  canSwipeRight: boolean
}): DiscoverSwipeDirection | "reset" {
  "worklet"
  const velocityXPerMs = input.velocityXPerSecond / 1000
  const isFlickRight = velocityXPerMs > SWIPE_FLICK_VELOCITY && input.dx > 0
  const isFlickLeft = velocityXPerMs < -SWIPE_FLICK_VELOCITY && input.dx < 0
  if ((input.dx > input.threshold || isFlickRight) && input.canSwipeRight) return "right"
  if (input.dx < -input.threshold || isFlickLeft) return "left"
  return "reset"
}

export function getDiscoverSwipeOutX(direction: DiscoverSwipeDirection, screenWidth: number): number {
  "worklet"
  return direction === "right"
    ? screenWidth * SWIPE_OUT_SCREEN_WIDTHS
    : -screenWidth * SWIPE_OUT_SCREEN_WIDTHS
}

/**
 * The deck shares one drag value; only the card that owns it follows it. A
 * card that just became the top card is at rest even before the deck resets
 * the value its predecessor left off screen.
 */
export function getDiscoverSwipeTranslateX(ownerId: string, cardId: string, x: number): number {
  "worklet"
  return ownerId === cardId ? x : 0
}

/** `Animated.Value.interpolate` with `extrapolate: "clamp"` for one segment. */
function interpolateClamped(
  value: number,
  inputMin: number,
  inputMax: number,
  outputMin: number,
  outputMax: number
): number {
  "worklet"
  const clamped = Math.min(inputMax, Math.max(inputMin, value))
  return outputMin + (clamped - inputMin) / (inputMax - inputMin) * (outputMax - outputMin)
}

export function getDiscoverStampOpacity(x: number, threshold: number): { like: number; nope: number } {
  "worklet"
  const half = threshold * 0.5
  const like = x <= half
    ? interpolateClamped(x, 0, half, 0, 0.5)
    : interpolateClamped(x, half, threshold, 0.5, 1)
  const nope = x <= -half
    ? interpolateClamped(x, -threshold, -half, 1, 0.5)
    : interpolateClamped(x, -half, 0, 0.5, 0)
  return { like, nope }
}

export function getDiscoverMiddleCardMotion(x: number): {
  scale: number
  translateX: number
  translateY: number
} {
  "worklet"
  const distance = Math.min(400, Math.abs(x))
  return {
    scale: interpolateClamped(distance, 0, 400, 0.98, 1),
    translateX: interpolateClamped(distance, 0, 400, -8, 0),
    translateY: interpolateClamped(distance, 0, 400, -12, 0)
  }
}
