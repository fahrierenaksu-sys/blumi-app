import { CandidateAvatarPreview, type CandidateAvatarSnapshot } from "../../components/DiscoverCard"
import { claimFlight, launchFlight } from "../../ui/flight/FlightLayer"
import type { FlightFrame } from "../../ui/flight/flightModel"
import type { FlightSurface } from "../../ui/flight/flightStore"

/**
 * Flies the liked card's chibi into the match moment (ui/flight, carry
 * mode): the chibi itself is the hero, drawn where the card showed it and
 * scaled, never stretched, onto the partner's slot. The surfaces are clear,
 * so only the chibi travels. Returns the claimed flight id for the slot's
 * FlightTargetView, or null when the source is unusable (the partner then
 * slides in instead).
 */
const MATCH_FLIGHT_CHANNEL = "match-meeting"
const CLEAR_SURFACE: FlightSurface = { backgroundColor: "transparent", radius: 0 }

export function launchMatchChibiFlight(input: {
  partnerUserId: string
  source: FlightFrame
  snapshot: CandidateAvatarSnapshot
  /** The FlightLayer that draws it ("root" unless inside a native modal). */
  layer?: string
  onSettled: (landed: boolean) => void
}): string | null {
  const { partnerUserId, source } = input
  const launched = launchFlight({
    channel: MATCH_FLIGHT_CHANNEL,
    match: partnerUserId,
    source,
    sourceSurface: CLEAR_SURFACE,
    targetSurface: CLEAR_SURFACE,
    contentMode: "carry",
    content: (
      <CandidateAvatarPreview
        snapshot={input.snapshot}
        size={Math.min(source.width, source.height)}
        stage="discover"
      />
    ),
    ...(input.layer ? { layer: input.layer } : {}),
    onSettled: input.onSettled
  })
  if (!launched) return null
  return claimFlight(MATCH_FLIGHT_CHANNEL, partnerUserId)
}
