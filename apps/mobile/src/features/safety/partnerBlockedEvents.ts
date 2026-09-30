/**
 * Announces that the signed-in user blocked someone, from any entry point
 * (report sheet, block-only action, demo report). Chat and navigation
 * subscribe to drop the partner's threads and leave an open conversation.
 */
export interface PartnerBlockedEvent {
  ownerUserId: string
  blockedUserId: string
}

type PartnerBlockedListener = (event: PartnerBlockedEvent) => void

const listeners = new Set<PartnerBlockedListener>()

export function subscribeToPartnerBlocked(listener: PartnerBlockedListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function publishPartnerBlocked(event: PartnerBlockedEvent): void {
  for (const listener of [...listeners]) {
    try {
      listener(event)
    } catch {
      // A failing subscriber must not undo or interrupt the block itself.
    }
  }
}
