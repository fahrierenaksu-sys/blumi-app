import assert from "node:assert/strict"
import Module, { createRequire } from "node:module"
import { resolve } from "node:path"
import test from "node:test"
import { describePhoneCodeFailure } from "./phoneCodeFailure"

type PhoneAppCheck = typeof import("./firebasePhoneAppCheck")
async function withAppCheck(
  sdk: unknown,
  run: (phone: PhoneAppCheck) => Promise<void>
): Promise<void> {
  const loader = Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown }
  const original = loader._load
  loader._load = function (request, parent, isMain) {
    if (request === "@react-native-firebase/app-check") {
      if (sdk instanceof Error) throw sdk
      return sdk
    }
    if (request === "@react-native-firebase/app") return { getApp: () => ({}) }
    return original.call(this, request, parent, isMain)
  }
  try {
    const requireHere = createRequire(resolve(import.meta.dirname, "index.ts"))
    const path = requireHere.resolve("./firebasePhoneAppCheck")
    delete requireHere.cache[path]
    await run(requireHere(path) as PhoneAppCheck)
  } finally { loader._load = original }
}

test("phone App Check selects genuine native providers and shares initialization", async () => {
  let configurations = 0
  let initializations = 0
  let tokenReads = 0
  const sdk = {
    ReactNativeFirebaseAppCheckProvider: class {
      configure(options: unknown) {
        configurations += 1
        assert.deepEqual(options, { android: { provider: "playIntegrity" }, apple: { provider: "appAttest" } })
      }
    },
    initializeAppCheck: async (_app: unknown, options: { isTokenAutoRefreshEnabled: boolean }) => {
      initializations += 1
      assert.equal(options.isTokenAutoRefreshEnabled, false)
      return {}
    },
    getToken: async (_check: unknown, force: boolean) => {
      tokenReads += 1
      assert.equal(force, false)
      return { token: "test-proof" }
    }
  }
  await withAppCheck(sdk, async phone => {
    await Promise.all(Array.from({ length: 5 }, () => phone.requireFirebasePhoneAppCheck()))
    assert.equal(configurations, 1)
    assert.equal(initializations, 1)
    assert.equal(tokenReads, 5)
  })
})

test("missing native App Check and invalid tokens fail closed without exposing errors", async () => {
  await withAppCheck(new Error("native credential material"), async phone => {
    await assert.rejects(phone.requireFirebasePhoneAppCheck(), /^Error: We could not securely verify this device/)
  })
  for (const result of [{ token: "" }, {}, null]) {
    await withAppCheck({
      ReactNativeFirebaseAppCheckProvider: class { configure() {} },
      initializeAppCheck: async () => ({}), getToken: async () => result
    }, async phone => {
      await assert.rejects(phone.requireFirebasePhoneAppCheck(), /securely verify/)
    })
  }
})

test("an attestation outage can recover but never selects a weaker provider", async () => {
  let calls = 0
  let initializations = 0
  await withAppCheck({
    ReactNativeFirebaseAppCheckProvider: class { configure() {} },
    initializeAppCheck: async () => { initializations += 1; return {} },
    getToken: async () => {
      calls += 1
      if (calls === 1) throw new Error("private provider error")
      return { token: "test-proof" }
    }
  }, async phone => {
    await assert.rejects(phone.requireFirebasePhoneAppCheck(), /securely verify/)
    await phone.requireFirebasePhoneAppCheck()
    assert.equal(calls, 2)
    assert.equal(initializations, 1)
  })
})

test("App Check failures say whether setup or the token step failed, without native text", async () => {
  const codeOf = (error: unknown) => {
    assert.doesNotMatch(String(error), /native credential material|private provider error/)
    return describePhoneCodeFailure("APPCHECK", error)
  }
  await withAppCheck(new Error("native credential material"), async phone => {
    await assert.rejects(phone.requireFirebasePhoneAppCheck(), error => codeOf(error) === "E-APPCHECK-INIT")
  })
  await withAppCheck({
    ReactNativeFirebaseAppCheckProvider: class { configure() {} },
    initializeAppCheck: async () => ({}),
    getToken: async () => { throw new Error("private provider error") }
  }, async phone => {
    await assert.rejects(phone.requireFirebasePhoneAppCheck(), error => codeOf(error) === "E-APPCHECK-TOKEN")
  })
})
