import { getFirebaseSmsGateContext } from "./firebasePhoneAppCheck"
import { requestJson } from "../network/apiClient"

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
  if (platform !== "ios" && platform !== "android") throw new Error("Device verification is unavailable.")
  if (platform === "ios" && !integrity.isSupported) throw new Error("Device verification is unavailable.")
  let installationId = await secure.getItemAsync(storageKey)
  if (platform === "ios" && !installationId) {
    installationId = await integrity.generateKeyAsync()
    await secure.setItemAsync(storageKey, installationId, { keychainAccessible: secure.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY })
  }
  async function gate(data: Record<string, unknown>) {
    const context = await getFirebaseSmsGateContext()
    const { response, payload: body } = await requestJson(
      `https://europe-west1-${context.projectId}.cloudfunctions.net`, "/blumiSmsDeviceGate", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Firebase-AppCheck": context.token },
        body: JSON.stringify({ data })
      })
    if (!response.ok || !body || typeof body !== "object" || !("result" in body) ||
      !body.result || typeof body.result !== "object" || Array.isArray(body.result)) {
      throw new Error("SMS device verification is unavailable. Try again later.")
    }
    return { result: body.result as Record<string, unknown>, context }
  }
  const { result, context } = await gate({ action: "challenge", platform, phoneNumber,
    ...(installationId ? { installationId } : {}) })
  if (typeof result.challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(result.challenge) ||
    typeof result.installationId !== "string" || typeof result.registrationRequired !== "boolean" ||
    (installationId && result.installationId !== installationId)) throw new Error("SMS device verification is unavailable.")
  installationId = result.installationId
  const idPattern = platform === "ios" ? /^[A-Za-z0-9+/]{43}=$/ : /^[A-Za-z0-9_-]{43}$/
  if (!idPattern.test(installationId)) throw new Error("SMS device verification is unavailable.")
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
      throw new Error("Device verification is unavailable. Try again later.")
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
      throw new Error("Device verification is unavailable. Try again later.")
    }
  }
  const admitted = await gate({ action: "permit", platform, installationId,
    challenge: result.challenge, phoneNumber, proof })
  if (typeof admitted.result.expiresAt !== "string" || !Number.isFinite(Date.parse(admitted.result.expiresAt)) ||
    Date.parse(admitted.result.expiresAt) <= Date.now()) throw new Error("SMS device permission has expired. Try again later.")
}
