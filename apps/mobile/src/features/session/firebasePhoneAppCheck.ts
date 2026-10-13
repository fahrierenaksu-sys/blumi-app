import { isPhoneCodeError, phoneCodeError } from "./phoneCodeFailure"

type AppCheckModule = typeof import("@react-native-firebase/app-check")
type AppCheckHandle = Awaited<ReturnType<AppCheckModule["initializeAppCheck"]>>

const DEVICE_VERIFICATION_MESSAGE = "We could not securely verify this device. Update Blumi and try again."

let initialization: Promise<{ module: AppCheckModule; handle: AppCheckHandle }> | null = null

/** All paid phone-auth requests use genuine native attestation, never debug. */
async function configuredAppCheck() {
  try {
    initialization ??= (async () => {
      // Lazy loading keeps screens usable on an older native binary. That
      // binary cannot send SMS through this wrapper until it is upgraded.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const module = require("@react-native-firebase/app-check") as AppCheckModule
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getApp } = require("@react-native-firebase/app") as typeof import("@react-native-firebase/app")
      const provider = new module.ReactNativeFirebaseAppCheckProvider()
      provider.configure({
        android: { provider: "playIntegrity" },
        apple: { provider: "appAttest" }
      })
      const handle = await module.initializeAppCheck(getApp(), {
        provider, isTokenAutoRefreshEnabled: false
      })
      return { module, handle }
    })()
    const pending = initialization
    let configured: Awaited<typeof pending>
    try { configured = await pending } catch (error) {
      if (initialization === pending) initialization = null
      throw error
    }
    return configured
  } catch {
    throw phoneCodeError(DEVICE_VERIFICATION_MESSAGE, "INIT")
  }
}

export async function requireFirebasePhoneAppCheck(): Promise<void> {
  const { module, handle } = await configuredAppCheck()
  try {
    // Cached valid tokens avoid needless assessments. The SDK refreshes an
    // expired/missing token; no token or a provider error means no SMS call.
    const result = await module.getToken(handle, false)
    if (!result || typeof result.token !== "string" || result.token.length === 0) throw new Error()
  } catch {
    // Token outages retry with the existing initialized SDK. Only a failed
    // initialization is reset above; duplicate initialization can itself fail.
    // Never log native errors or token material, or downgrade verification.
    throw phoneCodeError(DEVICE_VERIFICATION_MESSAGE, "TOKEN")
  }
}

export async function getFirebaseSmsGateContext() {
  try {
    const { module, handle } = await configuredAppCheck()
    const { token } = await module.getLimitedUseToken(handle)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getApp } = require("@react-native-firebase/app") as typeof import("@react-native-firebase/app")
    const { projectId, messagingSenderId: projectNumber } = getApp().options
    if (!token || !projectId || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId) ||
      !projectNumber || !/^\d+$/.test(projectNumber)) throw new Error()
    return { token, projectId, projectNumber }
  } catch (error) {
    throw isPhoneCodeError(error) ? error : phoneCodeError(DEVICE_VERIFICATION_MESSAGE, "LIMITED")
  }
}
