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

export interface MatchCelebrationMotion {
  confetti: boolean
  heartPulse: boolean
  entranceSpring: boolean
  modalAnimationType: "fade" | "none"
}

export function getMatchCelebrationMotion(reduceMotion: boolean): MatchCelebrationMotion {
  return {
    confetti: !reduceMotion,
    heartPulse: !reduceMotion,
    entranceSpring: !reduceMotion,
    modalAnimationType: reduceMotion ? "none" : "fade"
  }
}
