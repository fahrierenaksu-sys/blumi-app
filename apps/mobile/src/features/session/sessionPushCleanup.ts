import { removeDevice } from "../notifications/notificationApi"
import { removeRegisteredPushDevice } from "../notifications/pushDeviceRegistry"
import { revokeProductionSession } from "./sessionApi"

/**
 * Sign-out: remove this phone's push registration while the session can still
 * authorize it, then revoke the session. Revoking first made the removal fail
 * with 401 and left the signed-out account's pushes arriving on this phone.
 * The removal is best effort; an offline phone still signs out.
 */
export async function revokeProductionSessionAfterPushCleanup(
  baseHttpUrl: string,
  session: { userId: string; sessionToken: string },
  dependencies: {
    removeDevice: typeof removeDevice
    revokeSession: typeof revokeProductionSession
  } = { removeDevice, revokeSession: revokeProductionSession }
): Promise<void> {
  await removeRegisteredPushDevice(session.userId, (pushToken) =>
    dependencies.removeDevice(baseHttpUrl, session.sessionToken, pushToken)
  ).catch(() => undefined)
  await dependencies.revokeSession(baseHttpUrl, session.sessionToken)
}
