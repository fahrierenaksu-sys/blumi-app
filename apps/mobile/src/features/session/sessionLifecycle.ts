export interface SessionClearPersistence {
  cancelPending?: () => Promise<void>
  revoke?: () => Promise<void>
  clear: () => Promise<void>
}

export async function logoutCurrentSession(
  persistence: SessionClearPersistence
): Promise<null> {
  await persistence.cancelPending?.()
  await persistence.clear()
  if (persistence.revoke) {
    void persistence.revoke().catch(() => {
      // Signing out must remain possible while the device is offline. The
      // server session expires normally; local credentials are already gone.
    })
  }
  return null
}
