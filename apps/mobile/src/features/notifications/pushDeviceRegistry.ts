/**
 * The push token this device registered for the signed-in account.
 *
 * Sign-out must remove the device registration with the session that created
 * it, before that session is revoked; afterwards the server answers 401 and
 * the signed-out account kept receiving pushes on this phone. Both the
 * registration cleanup and the sign-out path call `removeRegisteredPushDevice`;
 * the first call performs the removal and later calls wait for the same one.
 */
interface RegisteredPushDevice {
  userId: string
  pushToken: string
  removal?: Promise<void>
}

let registered: RegisteredPushDevice | null = null

export function rememberRegisteredPushDevice(userId: string, pushToken: string): void {
  if (registered?.userId === userId && registered.pushToken === pushToken && !registered.removal) return
  registered = { userId, pushToken }
}

export function removeRegisteredPushDevice(
  userId: string,
  remove: (pushToken: string) => Promise<void>
): Promise<void> {
  const entry = registered
  if (!entry || entry.userId !== userId) return Promise.resolve()
  entry.removal ??= remove(entry.pushToken).then(
    () => { if (registered === entry) registered = null },
    (error: unknown) => {
      if (registered === entry) entry.removal = undefined
      throw error
    }
  )
  return entry.removal
}

export function forgetRegisteredPushDevice(): void {
  registered = null
}
