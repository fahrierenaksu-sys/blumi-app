/**
 * A push tapped while nobody is signed in belongs to a session that ended:
 * sign-out already removed the device registration and its notifications.
 * Without this, expo-notifications keeps that tap as the "last response" for
 * the whole process and the next sign-in (possibly much later) would open it.
 * While signed out the stored tap is cleared, now and on every new tap.
 * (A different account could not open it anyway: `recipientUserId` is
 * checked; this also covers pushes queued before that field existed.)
 *
 * No runtime imports: runs under plain Node tests.
 */
export interface SignedOutTapNotifications {
  clearLastNotificationResponseAsync(): Promise<void>
  addNotificationResponseReceivedListener(listener: (response: unknown) => void): { remove(): void }
}

export function startSignedOutTapDiscard(
  notifications: SignedOutTapNotifications,
  reportError: (error: unknown) => void
): () => void {
  let active = true
  const clear = (): void => {
    if (!active) return
    void notifications.clearLastNotificationResponseAsync().catch((error: unknown) => {
      if (active) reportError(error)
    })
  }
  clear()
  const subscription = notifications.addNotificationResponseReceivedListener(clear)
  return () => {
    active = false
    subscription.remove()
  }
}
