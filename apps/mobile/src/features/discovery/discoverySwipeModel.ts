/**
 * Discover card swipe rules, shared by the Gesture Handler pan (UI thread)
 * and the deck. The values are the ones the PanResponder implementation used.
 */
/**
 * The PanResponder's fixed exit. The gesture exit now follows the release
 * speed (`getDiscoverSwipeOutDuration`) and falls back to this only for a
 * release it cannot measure.
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

/** Which commit threshold the drag is past: 1 like, -1 pass, 0 neither. */
export type DiscoverSwipeThresholdSide = -1 | 0 | 1

/**
 * px the drag must come back inside the threshold before the tick re-arms,
 * so a finger resting on the threshold does not tick repeatedly.
 */
export const SWIPE_THRESHOLD_TICK_HYSTERESIS = 6

/**
 * The threshold side for the current drag, given the side of the previous
 * frame. Entering uses the release rule's distance (`dx > threshold`); a side
 * already entered is kept until the drag returns inside the hysteresis band.
 * A disabled like never counts as past the like threshold.
 */
export function getDiscoverSwipeThresholdSide(
  previousSide: DiscoverSwipeThresholdSide,
  x: number,
  threshold: number,
  canSwipeRight: boolean
): DiscoverSwipeThresholdSide {
  "worklet"
  const keep = threshold - SWIPE_THRESHOLD_TICK_HYSTERESIS
  if (canSwipeRight && (x > threshold || (previousSide === 1 && x > keep))) return 1
  if (x < -threshold || (previousSide === -1 && x < -keep)) return -1
  return 0
}

/** One tick per entry into a side; leaving it is silent and re-arms the tick. */
export function shouldTickDiscoverSwipeThreshold(
  previousSide: DiscoverSwipeThresholdSide,
  nextSide: DiscoverSwipeThresholdSide
): boolean {
  "worklet"
  return nextSide !== 0 && nextSide !== previousSide
}

export function getDiscoverSwipeOutX(direction: DiscoverSwipeDirection, screenWidth: number): number {
  "worklet"
  return direction === "right"
    ? screenWidth * SWIPE_OUT_SCREEN_WIDTHS
    : -screenWidth * SWIPE_OUT_SCREEN_WIDTHS
}

export const SWIPE_OUT_MIN_DURATION = 120
export const SWIPE_OUT_MAX_DURATION = 260
/** px/s. Releases slower than this leave at the pace of a slow release. */
export const SWIPE_OUT_MIN_VELOCITY = 1500

/**
 * ms for the card to cover the distance left to its exit point at the speed
 * the finger released it toward that exit, within 120-260 ms. A release moving
 * away from the exit counts as a slow one.
 */
export function getDiscoverSwipeOutDuration(
  remainingDistancePx: number,
  velocityTowardExitPxPerSecond: number
): number {
  "worklet"
  if (!Number.isFinite(remainingDistancePx) || !Number.isFinite(velocityTowardExitPxPerSecond)) {
    return SWIPE_OUT_DURATION
  }
  const speed = Math.max(velocityTowardExitPxPerSecond, SWIPE_OUT_MIN_VELOCITY)
  const duration = Math.abs(remainingDistancePx) / speed * 1000
  return Math.min(SWIPE_OUT_MAX_DURATION, Math.max(SWIPE_OUT_MIN_DURATION, duration))
}

/** Degrees the dragged card leans after a full screen width of drag. */
export const DISCOVER_SWIPE_MAX_TILT_DEG = 8

/**
 * The lean of the dragged card: it follows the drag up to the max tilt at one
 * screen width. A card held by its lower half pivots the other way, like a
 * card on a table.
 */
export function getDiscoverSwipeRotation(x: number, screenWidth: number, grabbedLowerHalf: boolean): number {
  "worklet"
  if (!(screenWidth > 0)) return 0
  const tilt = Math.min(1, Math.max(-1, x / screenWidth)) * DISCOVER_SWIPE_MAX_TILT_DEG
  return grabbedLowerHalf ? 0 - tilt : tilt
}

/** A grab below the card's middle; an unmeasured card counts as upper half. */
export function isDiscoverSwipeLowerHalfGrab(touchY: number, cardHeight: number): boolean {
  "worklet"
  return cardHeight > 0 && touchY > cardHeight / 2
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

/** px of drag after which the next card has fully taken the top card's place. */
export const DISCOVER_MIDDLE_CARD_TRAVEL = 400

export interface DiscoverMiddleCardMotion {
  scale: number
  translateX: number
  translateY: number
}

export function getDiscoverMiddleCardMotion(x: number): DiscoverMiddleCardMotion {
  "worklet"
  const distance = Math.min(DISCOVER_MIDDLE_CARD_TRAVEL, Math.abs(x))
  return {
    scale: interpolateClamped(distance, 0, DISCOVER_MIDDLE_CARD_TRAVEL, 0.98, 1),
    translateX: interpolateClamped(distance, 0, DISCOVER_MIDDLE_CARD_TRAVEL, -8, 0),
    translateY: interpolateClamped(distance, 0, DISCOVER_MIDDLE_CARD_TRAVEL, -12, 0)
  }
}

/**
 * How far the next card has advanced toward the top slot (0..1). It also
 * clears the card's frosted layer, so the frost leaves with the drag instead
 * of after the release (DSC-11).
 */
export function getDiscoverMiddleCardAdvance(x: number): number {
  "worklet"
  return Math.min(DISCOVER_MIDDLE_CARD_TRAVEL, Math.abs(x)) / DISCOVER_MIDDLE_CARD_TRAVEL
}

export type DiscoverDeckRole = "top" | "middle" | "bottom"

/** The deepest visible card fans out behind the next one. */
export const DISCOVER_BOTTOM_CARD_MOTION = {
  translateX: -10,
  translateY: -30,
  rotateDeg: -3,
  scale: 0.98,
  opacity: 0.96
} as const

/**
 * Moves a card to its new deck slot when the card above it leaves or comes
 * back. Short and critically damped (damping = 2 * sqrt(stiffness * mass)),
 * so the card settles without overshooting its slot.
 */
export const DISCOVER_PROMOTION_SPRING = {
  stiffness: 400,
  damping: 40,
  mass: 1
} as const

/** A slot as one number the deck can spring between: bottom 0, middle 1, top 2. */
export function getDiscoverDeckRoleProgress(role: DiscoverDeckRole): number {
  "worklet"
  return role === "top" ? 2 : role === "middle" ? 1 : 0
}

/**
 * The middle-slot pose a card blends through. Only the middle card follows
 * the featured card's drag. The deck advances at release (DSC-10), so a card
 * that just became the top card starts from the drag it was promoted at
 * (`promotedDragX`; fully forward when unknown) and springs to rest.
 */
export function getDiscoverDeckDragMotion(
  role: DiscoverDeckRole,
  dragX: number,
  promotedDragX?: number
): DiscoverMiddleCardMotion {
  "worklet"
  if (role === "middle") return getDiscoverMiddleCardMotion(dragX)
  if (role !== "top") return getDiscoverMiddleCardMotion(0)
  // Resolved here: a worklet's default parameter does not reach the UI thread.
  return getDiscoverMiddleCardMotion(promotedDragX ?? DISCOVER_MIDDLE_CARD_TRAVEL)
}

export interface DiscoverDeckRoleMotion {
  translateX: number
  translateY: number
  rotateDeg: number
  scale: number
  opacity: number
  /** The frosted layer over cards behind the top card. */
  overlayOpacity: number
}

/** Linear blend that lands exactly on `from` at 0 and on `to` at 1. */
function mix(from: number, to: number, amount: number): number {
  "worklet"
  return from * (1 - amount) + to * amount
}

/**
 * The pose of a deck card at a role progress: 0 is the bottom fan-out, 1 the
 * middle card at `dragMotion` (upright), 2 the top card at rest. Between two
 * slots the pose blends linearly, so a promotion is a move, not a jump. The
 * frosted layer clears by `overlayAdvance` at the middle slot (the drag, or
 * the drag a promoted card left with) and fully at the top.
 */
export function getDiscoverDeckRoleMotion(
  progress: number,
  dragMotion: DiscoverMiddleCardMotion,
  overlayAdvance = 0
): DiscoverDeckRoleMotion {
  "worklet"
  const clamped = Math.min(2, Math.max(0, progress))
  const middleOverlay = 1 - Math.min(1, Math.max(0, overlayAdvance))
  if (clamped <= 1) {
    return {
      translateX: mix(DISCOVER_BOTTOM_CARD_MOTION.translateX, dragMotion.translateX, clamped),
      translateY: mix(DISCOVER_BOTTOM_CARD_MOTION.translateY, dragMotion.translateY, clamped),
      rotateDeg: mix(DISCOVER_BOTTOM_CARD_MOTION.rotateDeg, 0, clamped),
      scale: mix(DISCOVER_BOTTOM_CARD_MOTION.scale, dragMotion.scale, clamped),
      opacity: mix(DISCOVER_BOTTOM_CARD_MOTION.opacity, 1, clamped),
      overlayOpacity: mix(1, middleOverlay, clamped)
    }
  }
  const toTop = clamped - 1
  return {
    translateX: mix(dragMotion.translateX, 0, toTop),
    translateY: mix(dragMotion.translateY, 0, toTop),
    rotateDeg: 0,
    scale: mix(dragMotion.scale, 1, toTop),
    opacity: 1,
    overlayOpacity: middleOverlay * (1 - toTop)
  }
}

/** A card that arrives at the back of the deck fades in over this long (DSC-11). */
export const DISCOVER_DECK_ENTRANCE_MS = 220

/**
 * The arrival of a new back card at `progress` (0..1): a fade, plus a small
 * grow when motion is allowed. A fade is the Reduce Motion substitute itself.
 */
export function getDiscoverDeckEntrance(
  progress: number,
  reduceMotion: boolean
): { opacity: number; scale: number } {
  "worklet"
  const clamped = Math.min(1, Math.max(0, progress))
  return { opacity: clamped, scale: reduceMotion ? 1 : mix(0.94, 1, clamped) }
}

const DISCOVER_ACTION_EXIT_MS = 190

/** A Like or Pass button exit; instant under Reduce Motion (DSC-10). */
export function getDiscoverActionExitDuration(reduceMotion: boolean): number {
  return reduceMotion ? 0 : DISCOVER_ACTION_EXIT_MS
}
