import type { ConfirmationResult } from "@react-native-firebase/auth"
import { requireFirebasePhoneAppCheck } from "./firebasePhoneAppCheck"
import { requireFirebaseSmsDevicePermission } from "./firebaseSmsDevicePermission"
import { normalizeInternationalSmsPhone } from "./phoneNumberInput"
import { describePhoneCodeFailure, type PhoneCodeStage } from "./phoneCodeFailure"

export type FirebasePhoneConfirmation = ConfirmationResult

type FirebaseAuthModule = typeof import("@react-native-firebase/auth")
type FirebaseAuth = ReturnType<FirebaseAuthModule["getAuth"]>

const disableAppVerificationForTesting =
  __DEV__ && process.env.EXPO_PUBLIC_FIREBASE_DISABLE_APP_VERIFICATION === "1"

const PHONE_AUTH_UNAVAILABLE_MESSAGE =
  "Phone verification is not available in this version of the app. Update Blumi and try again."

type FirebaseAuthHandle = { module: FirebaseAuthModule; auth: FirebaseAuth }

// RNFirebase touches its native module when it loads. A binary built without
// it (Expo Go, a stale dev client) would otherwise throw while this file is
// evaluated, which takes down every screen that imports it. Load it on first
// use instead and report "no Firebase" so the auth screens still render.
let firebaseAuthHandle: FirebaseAuthHandle | null | undefined

function loadFirebaseAuth(): FirebaseAuthHandle | null {
  if (firebaseAuthHandle !== undefined) return firebaseAuthHandle
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy on purpose, see above
    const module = require("@react-native-firebase/auth") as FirebaseAuthModule
    firebaseAuthHandle = { module, auth: module.getAuth() }
  } catch (error) {
    firebaseAuthHandle = null
    if (__DEV__) {
      console.warn(
        "[Blumi] Firebase phone auth is unavailable in this native build.",
        error instanceof Error ? error.message : error
      )
    }
  }
  return firebaseAuthHandle
}

function requireFirebaseAuth(): FirebaseAuthHandle {
  const handle = loadFirebaseAuth()
  if (!handle) throw new Error(PHONE_AUTH_UNAVAILABLE_MESSAGE)
  return handle
}

type FirebaseAuthNativeTestingBridge = {
  native: {
    setAppVerificationDisabledForTesting(disabled: boolean): Promise<void>
  }
}

let appVerificationConfiguration: Promise<void> | null = null
let smsRequestInFlight = false
// UX protection against repeat taps/guess loops. Firebase still owns the
// authoritative verification limits; client state cannot enforce security.
const confirmationAttempts = new WeakMap<FirebasePhoneConfirmation, { count: number; inFlight: boolean; used: boolean }>()

function configureFictionalNumberTesting(auth: FirebaseAuth): Promise<void> {
  if (!disableAppVerificationForTesting) return Promise.resolve()
  // RNFirebase's public setter does not expose its native promise. Await the
  // native call before requesting a code, and only create it when requested.
  appVerificationConfiguration ??=
    (auth as unknown as FirebaseAuthNativeTestingBridge).native
      .setAppVerificationDisabledForTesting(true)
  return appVerificationConfiguration
}

export function getFirebaseCurrentPhoneNumber(): string | null {
  return loadFirebaseAuth()?.auth.currentUser?.phoneNumber ?? null
}

export function subscribeToFirebasePhoneNumber(
  listener: (phoneNumber: string | null) => void
): () => void {
  const handle = loadFirebaseAuth()
  if (!handle) return () => {}
  return handle.module.onAuthStateChanged(handle.auth, (user) => {
    listener(user?.phoneNumber ?? null)
  })
}

export async function requestFirebasePhoneCode(
  phoneNumber: string
): Promise<FirebasePhoneConfirmation> {
  if (normalizeInternationalSmsPhone(phoneNumber) !== phoneNumber) throw new Error("Enter a valid phone number with country code.")
  const { module, auth } = requireFirebaseAuth()
  if (smsRequestInFlight) throw new Error("A verification request is already in progress. Try again later.")
  smsRequestInFlight = true
  let stage: PhoneCodeStage = "APPCHECK"
  try {
    // Fictional-number testing is explicitly development-only; production
    // requests cannot skip attestation or select Firebase's debug provider.
    if (!disableAppVerificationForTesting) {
      await requireFirebasePhoneAppCheck()
      stage = "PERMIT"
      await requireFirebaseSmsDevicePermission(phoneNumber)
    }
    stage = "FIREBASE"
    await configureFictionalNumberTesting(auth)
    return await module.signInWithPhoneNumber(auth, phoneNumber)
  } catch (error) {
    // The short code names the failed step in release builds too, so a phone
    // screenshot is enough to tell App Check, the device permit and Firebase
    // apart. It never includes tokens, numbers or native error text.
    throw new Error(
      "We could not send a verification code right now. Check the number and try again. " +
        `(${describePhoneCodeFailure(stage, error)})`
    )
  } finally { smsRequestInFlight = false }
}

export async function confirmFirebasePhoneCode(
  confirmation: FirebasePhoneConfirmation,
  verificationCode: string
): Promise<string> {
  if (!/^\d{6}$/.test(verificationCode)) {
    throw new Error("That verification code is invalid or expired. Request a new code and try again.")
  }
  const state = confirmationAttempts.get(confirmation) ?? { count: 0, inFlight: false, used: false }
  if (state.inFlight || state.used || state.count >= 5) {
    throw new Error("That verification code is invalid or expired. Request a new code and try again.")
  }
  state.count += 1
  state.inFlight = true
  confirmationAttempts.set(confirmation, state)
  try {
    const credential = await confirmation.confirm(verificationCode)
    state.used = true
    return await credential.user.getIdToken(true)
  } catch {
    throw new Error("That verification code is invalid or expired. Request a new code and try again.")
  } finally { state.inFlight = false }
}

export async function signOutFirebasePhoneAuth(): Promise<void> {
  try {
    const handle = loadFirebaseAuth()
    if (handle?.auth.currentUser) await handle.module.signOut(handle.auth)
  } catch {
    // The Blumi server session is authoritative for the app. A stale Firebase
    // session must not prevent a user from signing out locally.
  }
}
