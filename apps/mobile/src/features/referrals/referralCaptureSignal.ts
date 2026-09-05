type PendingReferralCaptureListener = () => void

const listeners = new Set<PendingReferralCaptureListener>()

export function subscribeToPendingReferralCapture(
  listener: PendingReferralCaptureListener
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function notifyPendingReferralCaptured(): void {
  for (const listener of listeners) listener()
}
