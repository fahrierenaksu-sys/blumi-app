import { getFirebaseSmsGateContext } from "./firebasePhoneAppCheck"
import { requestJson } from "../network/apiClient"
import { phoneCodeError } from "./phoneCodeFailure"

const storageKey = "blumi.sms.installation.v1"
let androidPrepared = false

/** Installation credentials survive sign-out and phone changes. */
export async function requireFirebaseSmsDevicePermission(phoneNumber: string): Promise<void> {
  // Load native modules on demand, so old binaries can still render screens.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const integrity = require("@expo/app-integrity") as typeof import("@expo/app-integrity")
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const secure = require("expo-secure-store") as typeof import("expo-secure-store")
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("expo-crypto") as typeof import("expo-crypto")
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Platform } = require("react-native") as typeof import("react-native")
  const platform = Platform.OS
  if (platform !== "ios" && platform !== "android") throw phoneCodeError("Device verification is unavailable.", "UNSUPPORTED")
  if (platform === "ios" && !integrity.isSupported) throw phoneCodeError("Device verification is unavailable.", "UNSUPPORTED")
  let installationId: string | null
  try {
    installationId = await secure.getItemAsync(storageKey)
    if (platform === "ios" && !installationId) {
      installationId = await integrity.generateKeyAsync()
      await secure.setItemAsync(storageKey, installationId, { keychainAccessible: secure.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY })
    }
  } catch {
    throw phoneCodeError("Device verification is unavailable. Try again later.", "KEY")
  }
  async function gate(data: Record<string, unknown>) {
    const context = await getFirebaseSmsGateContext()
    const unavailable = "SMS device verification is unavailable. Try again later."
    let reply: Awaited<ReturnType<typeof requestJson>>
    try {
      reply = await requestJson(
        `https://europe-west1-${context.projectId}.cloudfunctions.net`, "/blumiSmsDeviceGate", {
          method: "POST", headers: { "Content-Type": "application/json", "X-Firebase-AppCheck": context.token },
          body: JSON.stringify({ data })
        })
    } catch { throw phoneCodeError(unavailable, "NET") }
    const { response, payload: body } = reply
    if (!response.ok) throw phoneCodeError(unavailable, `GATE${response.status}`)
    if (!body || typeof body !== "object" || !("result" in body) ||
      !body.result || typeof body.result !== "object" || Array.isArray(body.result)) {
      throw phoneCodeError(unavailable, "GATEBODY")
    }
    return { result: body.result as Record<string, unknown>, context }
  }
  const { result, context } = await gate({ action: "challenge", platform, phoneNumber,
    ...(installationId ? { installationId } : {}) })
  if (typeof result.challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(result.challenge) ||
    typeof result.installationId !== "string" || typeof result.registrationRequired !== "boolean" ||
    (installationId && result.installationId !== installationId)) throw phoneCodeError("SMS device verification is unavailable.", "CHALLENGE")
  installationId = result.installationId
  const idPattern = platform === "ios" ? /^[A-Za-z0-9+/]{43}=$/ : /^[A-Za-z0-9_-]{43}$/
  if (!idPattern.test(installationId)) throw phoneCodeError("SMS device verification is unavailable.", "CHALLENGE")
  if (platform === "android") await secure.setItemAsync(storageKey, installationId, { keychainAccessible: secure.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY })
  const payload = JSON.stringify(["blumi-sms-permit-v1", context.projectId, platform, installationId, result.challenge, phoneNumber])
  let proof: string
  if (platform === "ios") {
    try {
      proof = result.registrationRequired
        ? await integrity.attestKeyAsync(installationId, payload)
        : await integrity.generateAssertionAsync(installationId, payload)
    } catch (error) {
      // Only a native invalid-key result may clear a lost key after reinstall.
      // Network/server/cooldown/budget failures never rotate identity.
      if (error && typeof error === "object" && "code" in error && error.code === "ERR_APP_INTEGRITY_INVALID_KEY") {
        await secure.deleteItemAsync(storageKey)
      }
      throw phoneCodeError("Device verification is unavailable. Try again later.", "ATTEST")
    }
  } else {
    if (!androidPrepared) {
      await integrity.prepareIntegrityTokenProviderAsync(context.projectNumber)
      androidPrepared = true
    }
    const hash = (await crypto.digestStringAsync(crypto.CryptoDigestAlgorithm.SHA256, payload,
      { encoding: crypto.CryptoEncoding.BASE64 })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    try { proof = await integrity.requestIntegrityCheckAsync(hash) } catch {
      androidPrepared = false
      throw phoneCodeError("Device verification is unavailable. Try again later.", "INTEGRITY")
    }
  }
  const admitted = await gate({ action: "permit", platform, installationId,
    challenge: result.challenge, phoneNumber, proof })
  if (typeof admitted.result.expiresAt !== "string" || !Number.isFinite(Date.parse(admitted.result.expiresAt)) ||
    Date.parse(admitted.result.expiresAt) <= Date.now()) throw phoneCodeError("SMS device permission has expired. Try again later.", "EXPIRED")
}
