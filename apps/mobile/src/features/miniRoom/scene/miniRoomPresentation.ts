/** How faint a participant who stepped away is drawn ("<name> stepped away" explains it). */
export const MINI_ROOM_AWAY_OPACITY = 0.35

/**
 * How visible an avatar is. Present, or presence not known: fully opaque.
 * Stepped away after being here: dimmed, with the HUD's away notice as its
 * reason. Not here yet this visit (including the moment before the room's
 * snapshot arrives): not drawn, so the partner never shows as an unexplained
 * ghost; the arrival then fades them in.
 */
export function resolveMiniRoomAvatarOpacity(avatar: { present?: boolean; seenPresent?: boolean }): number {
  if (avatar.present !== false) return 1
  return avatar.seenPresent ? MINI_ROOM_AWAY_OPACITY : 0
}

/** The avatar with a presence change applied, remembering that it has been here. */
export function withMiniRoomPresence<T extends { present?: boolean; seenPresent?: boolean }>(avatar: T, present: boolean): T {
  return { ...avatar, present, seenPresent: avatar.seenPresent || present || undefined }
}

/**
 * The partner's arrival is felt once per partner: when the room is connected
 * and that partner has not been announced yet. Reconnects and re-renders with
 * the same partner stay silent. Independent of Reduce Motion.
 */
export function shouldAnnouncePartnerJoin(input: {
  connected: boolean
  partnerUserId: string
  announcedPartnerUserId: string | null
}): boolean {
  return input.connected &&
    input.partnerUserId.length > 0 &&
    input.partnerUserId !== input.announcedPartnerUserId
}
