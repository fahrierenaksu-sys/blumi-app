import assert from "node:assert/strict"
import Module, { createRequire } from "node:module"
import { resolve } from "node:path"
import test from "node:test"
import { phoneCodeError } from "./phoneCodeFailure"

type FirebasePhoneAuth = typeof import("./firebasePhoneAuth")

;(globalThis as { __DEV__?: boolean }).__DEV__ = false

// Loads a fresh copy of the module with `@react-native-firebase/auth` replaced.
function loadFirebasePhoneAuth(
  firebaseAuth: () => unknown,
  verifyAppCheck: () => Promise<void> = async () => {},
  devicePermission: () => Promise<void> = async () => {}
): FirebasePhoneAuth {
  const loader = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown
  }
  const originalLoad = loader._load
  loader._load = function load(request, parent, isMain) {
    if (request === "@react-native-firebase/auth") return firebaseAuth()
    if (request === "./firebasePhoneAppCheck") return { requireFirebasePhoneAppCheck: verifyAppCheck }
    if (request === "./firebaseSmsDevicePermission") return { requireFirebaseSmsDevicePermission: devicePermission }
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
  await phoneAuth.signOutFirebasePhoneAuth()
  await assert.rejects(
    phoneAuth.requestFirebasePhoneCode("+905321234567"),
    /Phone verification is not available/
  )
})

test("failed device attestation prevents the Firebase SMS call", async () => {
  let sends = 0
  const phoneAuth = loadFirebasePhoneAuth(() => ({
    getAuth: () => ({ currentUser: null }),
    signInWithPhoneNumber: async () => { sends += 1 }
  }), async () => { throw new Error("rejected attestation") })
  await assert.rejects(phoneAuth.requestFirebasePhoneCode("+12025550101"), /could not send/)
  assert.equal(sends, 0)
})

test("invalid, formatted or non-mobile destinations cannot spend attestation or SMS calls", async () => {
  let calls = 0
  const phoneAuth = loadFirebasePhoneAuth(() => ({
    getAuth: () => ({ currentUser: null }), signInWithPhoneNumber: async () => { calls += 1 }
  }), async () => { calls += 1 }, async () => { calls += 1 })
  const reservedExample = "+1" + "202" + "5550101"
  for (const input of [reservedExample + "x", reservedExample + "\n", reservedExample + "\u200b",
    reservedExample.replace("+1", "+1 "), "+1" + "200" + "5550101", "+44" + "20" + "79460000"]) {
    await assert.rejects(phoneAuth.requestFirebasePhoneCode(input), /valid phone number/)
  }
  assert.equal(calls, 0)
})

test("device attestation completes before any Firebase SMS request", async () => {
  const events: string[] = []
  const phoneAuth = loadFirebasePhoneAuth(() => ({
    getAuth: () => ({ currentUser: null }),
    signInWithPhoneNumber: async () => { events.push("sms"); return {} }
  }), async () => { events.push("attested") })
  await phoneAuth.requestFirebasePhoneCode("+12025550101")
  assert.deepEqual(events, ["attested", "sms"])
})

test("a refused server device permit prevents SMS even after successful App Check", async () => {
  let sends = 0
  const phoneAuth = loadFirebasePhoneAuth(() => ({
    getAuth: () => ({ currentUser: null }), signInWithPhoneNumber: async () => { sends += 1 }
  }), async () => {}, async () => { throw new Error("device limit") })
  await assert.rejects(phoneAuth.requestFirebasePhoneCode("+12025550101"), /could not send/)
  assert.equal(sends, 0)
})

test("parallel UI requests cannot create multiple installation permits or sends", async () => {
  let release: (() => void) | undefined
  let permits = 0, sends = 0
  const phoneAuth = loadFirebasePhoneAuth(() => ({
    getAuth: () => ({ currentUser: null }), signInWithPhoneNumber: async () => { sends += 1; return {} }
  }), async () => {}, async () => {
    permits += 1
    await new Promise<void>(resolve => { release = resolve })
  })
  const first = phoneAuth.requestFirebasePhoneCode("+12025550101")
  await Promise.resolve()
  await Promise.resolve()
  await assert.rejects(phoneAuth.requestFirebasePhoneCode("+12025550102"), /already in progress/)
  release?.()
  await first
  assert.equal(permits, 1)
  assert.equal(sends, 1)
})

test("empty or malformed OTPs never reach Firebase confirmation", async () => {
  const phoneAuth = loadFirebasePhoneAuth(() => ({ getAuth: () => ({ currentUser: null }) }))
  let attempts = 0
  const confirmation = {
    confirm: async () => { attempts += 1; throw new Error("unused") }
  } as unknown as Parameters<FirebasePhoneAuth["confirmFirebasePhoneCode"]>[0]
  for (const code of ["", "123", "1234567", "abcdef"]) {
    await assert.rejects(phoneAuth.confirmFirebasePhoneCode(confirmation, code), /invalid or expired/)
  }
  assert.equal(attempts, 0)
})

test("one confirmation refuses parallel submissions and stops after five native attempts", async () => {
  const phoneAuth = loadFirebasePhoneAuth(() => ({ getAuth: () => ({ currentUser: null }) }))
  let attempts = 0, release: (() => void) | undefined
  const confirmation = { confirm: async () => {
    attempts++
    if (attempts === 1) await new Promise<void>(resolve => { release = resolve })
    throw new Error("invalid code")
  } } as unknown as Parameters<FirebasePhoneAuth["confirmFirebasePhoneCode"]>[0]
  const first = assert.rejects(phoneAuth.confirmFirebasePhoneCode(confirmation, "000000"))
  await assert.rejects(phoneAuth.confirmFirebasePhoneCode(confirmation, "000000"))
  assert.equal(attempts, 1)
  release?.()
  await first
  for (let i = 0; i < 8; i++) await assert.rejects(phoneAuth.confirmFirebasePhoneCode(confirmation, "000000"))
  assert.equal(attempts, 5)
})

test("a successful confirmation cannot be reused", async () => {
  const phoneAuth = loadFirebasePhoneAuth(() => ({ getAuth: () => ({ currentUser: null }) }))
  let attempts = 0
  const confirmation = { confirm: async () => { attempts++; return { user: { getIdToken: async () => "fixture" } } } } as unknown as Parameters<FirebasePhoneAuth["confirmFirebasePhoneCode"]>[0]
  assert.equal(await phoneAuth.confirmFirebasePhoneCode(confirmation, "000000"), "fixture")
  await assert.rejects(phoneAuth.confirmFirebasePhoneCode(confirmation, "000000"))
  assert.equal(attempts, 1)
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

test("release builds show which step failed as a short code, never native details", async () => {
  const succeed = async () => {}
  const cases: { appCheck: () => Promise<void>; permit: () => Promise<void>; send: () => Promise<never>; code: string }[] = [
    { appCheck: async () => { throw phoneCodeError("App Attest refused", "TOKEN") }, permit: succeed,
      send: async () => assert.fail("no SMS after App Check failure"), code: "(E-APPCHECK-TOKEN)" },
    { appCheck: succeed, permit: async () => { throw phoneCodeError("refused", "GATE403") },
      send: async () => assert.fail("no SMS without a permit"), code: "(E-PERMIT-GATE403)" },
    { appCheck: succeed, permit: async () => { throw new Error("socket closed for +12025550101") },
      send: async () => assert.fail("no SMS without a permit"), code: "(E-PERMIT)" },
    { appCheck: succeed, permit: succeed,
      send: async () => { throw Object.assign(new Error("secret detail"), { code: "auth/invalid-app-credential" }) },
      code: "(E-FIREBASE-invalid-app-credential)" },
    { appCheck: succeed, permit: succeed,
      send: async () => { throw Object.assign(new Error("x"), { code: "auth/+12025550101 token" }) },
      code: "(E-FIREBASE)" }
  ]
  for (const { appCheck, permit, send, code } of cases) {
    const phoneAuth = loadFirebasePhoneAuth(() => ({
      getAuth: () => ({ currentUser: null }), signInWithPhoneNumber: send
    }), appCheck, permit)
    await assert.rejects(phoneAuth.requestFirebasePhoneCode("+12025550101"), (error: unknown) => {
      const message = String((error as Error).message)
      assert.match(message, /^We could not send a verification code right now\./)
      assert.ok(message.endsWith(` ${code}`), message)
      assert.doesNotMatch(message, /5550101|secret|socket|refused|Attest/)
      return true
    })
  }
})
