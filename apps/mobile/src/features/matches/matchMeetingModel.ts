/**
 * The match moment as one choreography (MOTION_PLAN §C, journey 1): the two
 * chibis meet. The partner arrives first-class (flown from the liked card
 * when its frame is known, otherwise sliding in from its side), the viewer's
 * own chibi slides in from the other side, and only when both have arrived
 * does the heart line draw between them. The line touching the heart is the
 * contact: the success haptic and the (light) confetti belong to that frame.
 *
 * Under Reduce Motion nothing travels: both chibis and the line crossfade in
 * place, and the contact (with its haptic) still happens once they are in.
 *
 * Plain values and worklets, no React Native imports, so node tests run them.
 */

export type MatchMeetingSide = "me" | "partner"
export type MatchPartnerArrival = "flight" | "slide" | "fade"

/** How far each chibi travels in from its side. */
export const MATCH_MEET_TRAVEL_PX = 56
/** The heart line draws in this long (scaleX from the centre). */
export const MATCH_HEART_LINE_MS = 280
/** Light celebration: fewer pieces than the old burst. */
export const MATCH_CONFETTI_PIECES = 8

export interface MatchMeetingPlan {
  readonly partnerArrival: MatchPartnerArrival
  readonly meArrival: "slide" | "fade"
  readonly line: "draw" | "fade"
  readonly confettiPieces: number
}

export function planMatchMeeting(input: {
  reduceMotion: boolean
  /** A fresh, usable frame of the liked card's chibi. */
  hasFlightSource: boolean
}): MatchMeetingPlan {
  if (input.reduceMotion) {
    return { partnerArrival: "fade", meArrival: "fade", line: "fade", confettiPieces: 0 }
  }
  return {
    partnerArrival: input.hasFlightSource ? "flight" : "slide",
    meArrival: "slide",
    line: "draw",
    confettiPieces: MATCH_CONFETTI_PIECES
  }
}

/**
 * A chibi's arrival at `progress` (0 → 1). The viewer comes from the left,
 * the partner from the right; opacity leads the travel so nothing pops in.
 * Under Reduce Motion it only fades.
 */
export function matchMeetingArrival(
  progress: number,
  side: MatchMeetingSide,
  reduceMotion: boolean
): { opacity: number; translateX: number } {
  "worklet"
  const clamped = Math.min(1, Math.max(0, progress))
  if (reduceMotion) return { opacity: clamped, translateX: 0 }
  // Springs may overshoot past 1: the chibi leans in, then settles.
  const travel = (1 - progress) * MATCH_MEET_TRAVEL_PX
  return {
    opacity: Math.min(1, clamped * 1.6),
    translateX: side === "me" ? 0 - travel : travel
  }
}

/** The heart line between them: drawn outwards from the heart, or faded in. */
export function matchHeartLine(progress: number, drawn: boolean): { opacity: number; scaleX: number } {
  "worklet"
  const clamped = Math.min(1, Math.max(0, progress))
  return drawn ? { opacity: clamped > 0 ? 1 : 0, scaleX: clamped } : { opacity: clamped, scaleX: 1 }
}

/** The heart pops in on contact (a bouncy spring may overshoot). */
export function matchHeartPop(progress: number): { opacity: number; scale: number } {
  "worklet"
  return { opacity: Math.min(1, Math.max(0, progress * 2)), scale: 0.6 + 0.4 * progress }
}

/**
 * Collects the two arrivals of one meeting and fires `onBothArrived` exactly
 * once, whatever the order. A flight that never lands still arrives (its
 * target is revealed in place), so the moment can never stall.
 */
export function createMatchArrivalGate(onBothArrived: () => void): (side: MatchMeetingSide) => void {
  const arrived = new Set<MatchMeetingSide>()
  let fired = false
  return (side) => {
    arrived.add(side)
    if (fired || arrived.size < 2) return
    fired = true
    onBothArrived()
  }
}
