import {
  getAuth,
  onAuthStateChanged,
  signInWithPhoneNumber,
  signOut,
  type ConfirmationResult
} from "@react-native-firebase/auth"

export type FirebasePhoneConfirmation = ConfirmationResult

const disableAppVerificationForTesting =
  __DEV__ && process.env.EXPO_PUBLIC_FIREBASE_DISABLE_APP_VERIFICATION === "1"

const firebaseAuth = getAuth()

type FirebaseAuthNativeTestingBridge = {
  native: {
    setAppVerificationDisabledForTesting(disabled: boolean): Promise<void>
  }
}

let appVerificationConfiguration: Promise<void> | null = null

function configureFictionalNumberTesting(): Promise<void> {
  if (!disableAppVerificationForTesting) return Promise.resolve()
  // RNFirebase's public setter does not expose its native promise. Await the
  // native call before requesting a code, and only create it when requested.
  appVerificationConfiguration ??=
    (firebaseAuth as unknown as FirebaseAuthNativeTestingBridge).native
      .setAppVerificationDisabledForTesting(true)
  return appVerificationConfiguration
}

function getFirebaseAuth() {
  return firebaseAuth
}

function getFirebaseAuthErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null
  const code = (error as { code?: unknown }).code
  return typeof code === "string" && code.length > 0 ? code : null
}

export function getFirebaseCurrentPhoneNumber(): string | null {
  return getFirebaseAuth().currentUser?.phoneNumber ?? null
}

export function subscribeToFirebasePhoneNumber(
  listener: (phoneNumber: string | null) => void
): () => void {
  return onAuthStateChanged(getFirebaseAuth(), (user) => {
    listener(user?.phoneNumber ?? null)
  })
}

export async function getVerifiedFirebasePhoneIdToken(
  phoneNumber: string
): Promise<string | null> {
  const user = getFirebaseAuth().currentUser
  if (!user || user.phoneNumber !== phoneNumber) return null
  return user.getIdToken(true)
}

export async function requestFirebasePhoneCode(
  phoneNumber: string
): Promise<FirebasePhoneConfirmation> {
  try {
    await configureFictionalNumberTesting()
    return await signInWithPhoneNumber(getFirebaseAuth(), phoneNumber)
  } catch (error) {
    const code = getFirebaseAuthErrorCode(error)
    throw new Error(
      `We could not send a verification code right now. Check the number and try again.${
        __DEV__ && code ? ` (${code})` : ""
      }`
    )
  }
}

export async function confirmFirebasePhoneCode(
  confirmation: FirebasePhoneConfirmation,
  verificationCode: string
): Promise<string> {
  try {
    const credential = await confirmation.confirm(verificationCode)
    return await credential.user.getIdToken(true)
  } catch {
    throw new Error("That verification code is invalid or expired. Request a new code and try again.")
  }
}

export async function signOutFirebasePhoneAuth(): Promise<void> {
  try {
    const auth = getFirebaseAuth()
    if (auth.currentUser) await signOut(auth)
  } catch {
    // The Blumi server session is authoritative for the app. A stale Firebase
    // session must not prevent a user from signing out locally.
  }
}
