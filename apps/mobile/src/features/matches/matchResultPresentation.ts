/**
 * One presentation model for both match surfaces:
 * - `connection_modal`: the global MatchResultModal shown for a realtime
 *   `connection.matched` or a delivered mini-room connection decision.
 * - `discovery_route`: the MatchResult route opened from Discover, a linked
 *   profile, the demo lobby, or "View match" in a chat thread.
 *
 * The two surfaces intentionally keep their shipped copy and controls; this
 * model is the single place that states them so both renderers read the same
 * contract for actions, analytics attribution, and Reduce Motion.
 */

export const MATCH_RESULT_ENTRY_POINTS = ["connection_modal", "discovery_route"] as const
export type MatchResultEntryPoint = typeof MATCH_RESULT_ENTRY_POINTS[number]

export type MatchResultActionId = "send_message" | "keep_discovering"

export interface MatchResultAction {
  readonly id: MatchResultActionId
  readonly label: string
  readonly enabled: boolean
}

interface MatchResultPresentationBase {
  readonly headline: string
  readonly body: string
  readonly actions: readonly [MatchResultAction, MatchResultAction]
}

export interface ConnectionModalPresentation extends MatchResultPresentationBase {
  readonly entry: "connection_modal"
  readonly badgeLabel: string
  readonly closeLabel: string
  readonly safetyLabel?: undefined
}

export interface DiscoveryRoutePresentation extends MatchResultPresentationBase {
  readonly entry: "discovery_route"
  readonly eyebrow: string
  readonly title: string
  readonly nextStepTitle: string
  readonly nextStepBody: string
  readonly backLabel: string
  readonly safetyLabel: string
}

export type MatchResultPresentation = ConnectionModalPresentation | DiscoveryRoutePresentation

export interface MatchResultPresentationInput<Entry extends MatchResultEntryPoint = MatchResultEntryPoint> {
  entry: Entry
  matchedUserName: string
  /** Onboarding gate for opening chat; only the route surface can be reached before it passes. */
  canStartConversation: boolean
}

export function getMatchResultPresentation(
  input: MatchResultPresentationInput<"connection_modal">
): ConnectionModalPresentation
export function getMatchResultPresentation(
  input: MatchResultPresentationInput<"discovery_route">
): DiscoveryRoutePresentation
export function getMatchResultPresentation(
  input: MatchResultPresentationInput
): MatchResultPresentation
export function getMatchResultPresentation(
  input: MatchResultPresentationInput
): MatchResultPresentation {
  const name = input.matchedUserName
  if (input.entry === "connection_modal") {
    return {
      entry: "connection_modal",
      headline: "It's a vibe.",
      body: `You and ${name} both felt it. Start with a message when you are ready.`,
      badgeLabel: "Mutual match",
      closeLabel: "Close match result",
      actions: [
        { id: "send_message", label: "Start chatting", enabled: true },
        { id: "keep_discovering", label: "Keep exploring", enabled: true }
      ]
    }
  }
  return {
    entry: "discovery_route",
    headline: "It’s a vibe.",
    eyebrow: "New match",
    title: "You two just matched.",
    body: "Start with a message and get to know each other at your pace.",
    nextStepTitle: "Make the first move feel natural.",
    nextStepBody: "A thoughtful hello is enough to get the conversation going.",
    backLabel: "Return to Discover",
    safetyLabel: `Safety options for ${name}`,
    actions: [
      { id: "send_message", label: "Say Hi", enabled: input.canStartConversation },
      { id: "keep_discovering", label: "Keep Exploring", enabled: true }
    ]
  }
}

export type MatchCreatedProperties = {
  source: "mini_room_mutual_save" | "discovery"
  mode: "demo" | "production"
}

/**
 * Properties for `match_created`, or null when the entry point must not emit
 * it. The connection modal emits once per presented match (the caller
 * de-duplicates by mini-room id first). The discovery route is also a replay
 * surface ("View match" in chat), so it never emits the event.
 */
export function getMatchCreatedProperties(
  entry: MatchResultEntryPoint,
  mode: "demo" | "production"
): MatchCreatedProperties | null {
  if (entry !== "connection_modal") return null
  return { source: "mini_room_mutual_save", mode }
}

/**
 * Properties for `match_created` when a Discover decision response confirms a
 * server match. Emitted from the decision path only (see
 * discoveryMatchCreatedReporter), never from the MatchResult route.
 */
export function getDiscoveryMatchCreatedProperties(
  mode: "demo" | "production"
): MatchCreatedProperties {
  return { source: "discovery", mode }
}

/**
 * One spring in both vocabularies: `tension`/`friction` for the React Native
 * Animated (native driver) surfaces that play it today, and the equivalent
 * `damping`/`stiffness`/`mass` for a Reanimated `withSpring` port.
 */
export interface MatchEntranceSpring {
  readonly tension: number
  readonly friction: number
  readonly damping: number
  readonly stiffness: number
  readonly mass: number
}

/** React Native's own origami conversion (Libraries/Animated/SpringConfig). */
export function springFromOrigami(tension: number, friction: number): MatchEntranceSpring {
  const roundTo2 = (value: number): number => Math.round(value * 100) / 100
  return {
    tension,
    friction,
    damping: roundTo2((friction - 8) * 3 + 25),
    stiffness: roundTo2((tension - 30) * 3.62 + 194),
    mass: 1
  }
}

// Damping ratio ≈ 0.76: a hint of overshoot on a 0.92 → 1 settle.
const ENTRANCE_SPRING_TENSION = 70
const ENTRANCE_SPRING_FRICTION = 9
const ENTRANCE_FROM_SCALE = 0.92
const ENTRANCE_OPACITY_MS = 220
const REDUCED_CROSSFADE_MS = 160
const CONTENT_STAGGER_MS = 70
const HEART_PULSE_ITERATIONS = 2
const HALO_PULSE_ITERATIONS = 2

// Frozen and shared so the value keeps one identity across renders (it sits in
// hook dependency lists) and callers cannot mutate it.
const MATCH_ENTRANCE_SPRING: MatchEntranceSpring = Object.freeze(
  springFromOrigami(ENTRANCE_SPRING_TENSION, ENTRANCE_SPRING_FRICTION)
)

interface MatchCelebrationMotionBase {
  confetti: boolean
  heartPulse: boolean
  modalAnimationType: "fade" | "none"
  /** The card enters from this opacity and scale and settles at 1. */
  entranceFromOpacity: number
  entranceFromScale: number
  entranceOpacityDurationMs: number
  /** Delay between the headline group and the avatar row. */
  contentStaggerMs: number
  /** Finite pulse counts (RN Animated.loop `iterations`); 0 means no pulse. */
  heartPulseIterations: number
  haloPulseIterations: number
}

/** Under Reduce Motion there is no spring: no scale movement, only the crossfade. */
export type MatchCelebrationMotion =
  | (MatchCelebrationMotionBase & { entranceSpring: true; entranceSpringConfig: MatchEntranceSpring })
  | (MatchCelebrationMotionBase & { entranceSpring: false; entranceSpringConfig: null })

export function getMatchCelebrationMotion(reduceMotion: boolean): MatchCelebrationMotion {
  if (reduceMotion) {
    return {
      confetti: false,
      heartPulse: false,
      entranceSpring: false,
      modalAnimationType: "none",
      entranceFromOpacity: 0,
      entranceFromScale: 1,
      entranceOpacityDurationMs: REDUCED_CROSSFADE_MS,
      entranceSpringConfig: null,
      contentStaggerMs: 0,
      heartPulseIterations: 0,
      haloPulseIterations: 0
    }
  }
  return {
    confetti: true,
    heartPulse: true,
    entranceSpring: true,
    modalAnimationType: "fade",
    entranceFromOpacity: 0,
    entranceFromScale: ENTRANCE_FROM_SCALE,
    entranceOpacityDurationMs: ENTRANCE_OPACITY_MS,
    entranceSpringConfig: MATCH_ENTRANCE_SPRING,
    contentStaggerMs: CONTENT_STAGGER_MS,
    heartPulseIterations: HEART_PULSE_ITERATIONS,
    haloPulseIterations: HALO_PULSE_ITERATIONS
  }
}

/**
 * The match haptic (haptic map: match → success) fires on the hidden →
 * visible transition only, so re-renders and Strict Mode effect replays stay
 * silent. Haptics are not motion: Reduce Motion does not silence them.
 */
export function shouldPlayMatchHaptic(previousVisible: boolean, visible: boolean): boolean {
  return visible && !previousVisible
}

/**
 * A fresh match celebrates by default. Re-opening an existing match (for
 * example "View match" in a chat) passes `celebrate: false` so the success
 * haptic does not fire again for a moment the user already had.
 */
export function shouldCelebrateMatchResult(
  params: { celebrate?: boolean } | undefined
): boolean {
  return params?.celebrate !== false
}
