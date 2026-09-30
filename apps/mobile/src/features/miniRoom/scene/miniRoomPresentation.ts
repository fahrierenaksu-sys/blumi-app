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
