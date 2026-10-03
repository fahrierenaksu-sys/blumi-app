import assert from "node:assert/strict"
import Module, { createRequire } from "node:module"
import { resolve } from "node:path"
import test from "node:test"

type FirebasePhoneAuth = typeof import("./firebasePhoneAuth")

;(globalThis as { __DEV__?: boolean }).__DEV__ = false

// Loads a fresh copy of the module with `@react-native-firebase/auth` replaced.
function loadFirebasePhoneAuth(firebaseAuth: () => unknown): FirebasePhoneAuth {
  const loader = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown
  }
  const originalLoad = loader._load
  loader._load = function load(request, parent, isMain) {
    if (request === "@react-native-firebase/auth") return firebaseAuth()
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    const requireFromHere = createRequire(resolve(import.meta.dirname, "index.ts"))
    const modulePath = requireFromHere.resolve("./firebasePhoneAuth")
    delete requireFromHere.cache[modulePath]
    const loaded = requireFromHere(modulePath) as FirebasePhoneAuth
    // Touch the lazy loader while the stub is installed.
    loaded.getFirebaseCurrentPhoneNumber()
    return loaded
  } finally {
    loader._load = originalLoad
  }
}

test("a native build without Firebase still loads the auth screens", async () => {
  const phoneAuth = loadFirebasePhoneAuth(() => {
    throw new Error("Native module NativeRNFBTurboApp is not registered.")
  })

  assert.equal(phoneAuth.getFirebaseCurrentPhoneNumber(), null)
  const unsubscribe = phoneAuth.subscribeToFirebasePhoneNumber(() => {
    assert.fail("no auth state can arrive without Firebase")
  })
  unsubscribe()
  assert.equal(await phoneAuth.getVerifiedFirebasePhoneIdToken("+905321234567"), null)
  await phoneAuth.signOutFirebasePhoneAuth()
  await assert.rejects(
    phoneAuth.requestFirebasePhoneCode("+905321234567"),
    /Phone verification is not available/
  )
})

test("phone auth uses Firebase when the native module is present", async () => {
  const listeners: ((user: { phoneNumber: string } | null) => void)[] = []
  const auth = { currentUser: { phoneNumber: "+905321234567" } }
  const requested: string[] = []
  const phoneAuth = loadFirebasePhoneAuth(() => ({
    getAuth: () => auth,
    onAuthStateChanged: (_auth: unknown, listener: (typeof listeners)[number]) => {
      listeners.push(listener)
      return () => {}
    },
    signInWithPhoneNumber: async (_auth: unknown, phoneNumber: string) => {
      requested.push(phoneNumber)
      return { confirm: async () => null }
    },
    signOut: async () => {}
  }))

  assert.equal(phoneAuth.getFirebaseCurrentPhoneNumber(), "+905321234567")
  const seen: (string | null)[] = []
  phoneAuth.subscribeToFirebasePhoneNumber((phoneNumber) => seen.push(phoneNumber))
  listeners[0]?.(null)
  assert.deepEqual(seen, [null])
  await phoneAuth.requestFirebasePhoneCode("+905321234567")
  assert.deepEqual(requested, ["+905321234567"])
})
