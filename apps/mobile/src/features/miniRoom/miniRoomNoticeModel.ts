import type { MiniRoomCopy } from "./miniRoomCopy"

export type MiniRoomNoticeKind = "partner_here" | "partner_back" | "partner_away" | "seat_taken"

/** How long a short in-room notice stays under the header. */
export const MINI_ROOM_NOTICE_MS = 2_600

export interface MiniRoomNoticeCursor {
  /** This phone's scene is joined (it has the authoritative snapshot). */
  joined: boolean
  /** The partner's presence last seen while joined; kept across this phone's own gaps. */
  partnerPresent: boolean
  seenPartner: boolean
  refusalRevision?: number
  localSeatTakenCount: number
}

export const INITIAL_MINI_ROOM_NOTICE_CURSOR: MiniRoomNoticeCursor = {
  joined: false, partnerPresent: false, seenPartner: false, localSeatTakenCount: 0
}

/**
 * Decides the one short notice an update deserves. The partner's presence is
 * judged only while this phone is in the scene: this phone's own reconnect or
 * background gap is never reported as the partner leaving or returning.
 */
export function resolveMiniRoomNotice(
  cursor: MiniRoomNoticeCursor,
  input: { joined: boolean; partnerPresent: boolean; refusalRevision?: number; localSeatTakenCount: number }
): { notice: MiniRoomNoticeKind | null; cursor: MiniRoomNoticeCursor } {
  const seatTaken = (input.refusalRevision !== undefined && input.refusalRevision !== cursor.refusalRevision) ||
    input.localSeatTakenCount > cursor.localSeatTakenCount
  const next: MiniRoomNoticeCursor = { ...cursor, joined: input.joined,
    refusalRevision: input.refusalRevision ?? cursor.refusalRevision,
    localSeatTakenCount: Math.max(cursor.localSeatTakenCount, input.localSeatTakenCount) }
  let presence: MiniRoomNoticeKind | null = null
  if (input.joined) {
    next.partnerPresent = input.partnerPresent
    if (input.partnerPresent) next.seenPartner = true
    if (input.partnerPresent && !cursor.partnerPresent) presence = cursor.seenPartner ? "partner_back" : "partner_here"
    else if (!input.partnerPresent && cursor.partnerPresent && cursor.joined) presence = "partner_away"
  }
  return { notice: seatTaken ? "seat_taken" : presence, cursor: next }
}

export function getMiniRoomNoticeText(kind: MiniRoomNoticeKind, copy: MiniRoomCopy, partnerFirstName: string): string {
  switch (kind) {
    case "partner_here": return copy.partnerHere(partnerFirstName)
    case "partner_back": return copy.partnerBack(partnerFirstName)
    case "partner_away": return copy.partnerAway(partnerFirstName)
    case "seat_taken": return copy.seatTaken
  }
}
