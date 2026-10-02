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
import type { AppLocale } from "../session/appLocale"
import { MOTION_DURATIONS, MOTION_SPRINGS, type MotionSpringToken } from "../../ui/motionTokens"
import { getMatchResultCopy } from "./matchResultCopy"

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
  readonly avatarLabel: string
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
  /** Resolved once at the surface (`getAppLocale()`); English when omitted. */
  locale?: AppLocale
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
  const copy = getMatchResultCopy(input.locale ?? "en")
  if (input.entry === "connection_modal") {
    const modal = copy.connectionModal
    return {
      entry: "connection_modal",
      headline: modal.headline,
      body: modal.body(name),
      badgeLabel: modal.badgeLabel,
      closeLabel: modal.closeLabel,
      avatarLabel: modal.avatarLabel,
      actions: [
        { id: "send_message", label: modal.sendMessage, enabled: true },
        { id: "keep_discovering", label: modal.keepDiscovering, enabled: true }
      ]
    }
  }
  const route = copy.discoveryRoute
  return {
    entry: "discovery_route",
    headline: route.headline,
    eyebrow: route.eyebrow,
    title: route.title,
    body: route.body,
    nextStepTitle: route.nextStepTitle,
    nextStepBody: route.nextStepBody,
    backLabel: route.backLabel,
    safetyLabel: route.safetyLabel(name),
    actions: [
      { id: "send_message", label: route.sendMessage, enabled: input.canStartConversation },
      { id: "keep_discovering", label: route.keepDiscovering, enabled: true }
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

// The card settles from just below size with the celebration spring
// (motion token `bouncy`: a visible, short overshoot).
const ENTRANCE_FROM_SCALE = 0.92
const ENTRANCE_OPACITY_MS = 220
const REDUCED_CROSSFADE_MS = MOTION_DURATIONS.crossfade
const CONTENT_STAGGER_MS = 70
const HEART_PULSE_ITERATIONS = 2
const HALO_PULSE_ITERATIONS = 2

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
  /** Finite pulse counts; 0 means no pulse. */
  heartPulseIterations: number
  haloPulseIterations: number
}

/** Under Reduce Motion there is no spring: no scale movement, only the crossfade. */
export type MatchCelebrationMotion =
  | (MatchCelebrationMotionBase & { entranceSpring: true; entranceSpringConfig: MotionSpringToken })
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
    entranceSpringConfig: MOTION_SPRINGS.bouncy,
    contentStaggerMs: CONTENT_STAGGER_MS,
    heartPulseIterations: HEART_PULSE_ITERATIONS,
    haloPulseIterations: HALO_PULSE_ITERATIONS
  }
}

/**
 * The Discover MatchResult route (DSC-2): the hero card settles from the same
 * 0.92 + fade as the modal (it used to scale from 0), the two chibis start
 * meeting as it appears (the success tap is their contact, see
 * matchMeetingModel), and the actions dock follows within 250 ms (was
 * 600 ms). Reduce Motion keeps the tap and a crossfade, without scale or
 * delays.
 */
export interface MatchResultRouteTimeline {
  heroFromScale: number
  heroFromOpacity: number
  heroOpacityDurationMs: number
  heroSpring: boolean
  heroDelayMs: number
  /** When the chibis start arriving; the success tap follows their contact. */
  meetingDelayMs: number
  dockDelayMs: number
}

const ROUTE_HERO_DELAY_MS = 60
const ROUTE_DOCK_DELAY_MS = 220

export function getMatchResultRouteTimeline(reduceMotion: boolean): MatchResultRouteTimeline {
  const motion = getMatchCelebrationMotion(reduceMotion)
  const heroDelayMs = reduceMotion ? 0 : ROUTE_HERO_DELAY_MS
  return {
    heroFromScale: motion.entranceFromScale,
    heroFromOpacity: motion.entranceFromOpacity,
    heroOpacityDurationMs: motion.entranceOpacityDurationMs,
    heroSpring: motion.entranceSpring,
    heroDelayMs,
    meetingDelayMs: heroDelayMs,
    dockDelayMs: reduceMotion ? 0 : ROUTE_DOCK_DELAY_MS
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
