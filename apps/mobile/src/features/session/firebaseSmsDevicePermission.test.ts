import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import Module, { createRequire } from "node:module"
import { resolve } from "node:path"
import test from "node:test"
import { describePhoneCodeFailure } from "./phoneCodeFailure"

type Permission = typeof import("./firebaseSmsDevicePermission")
async function fixture(platform: "ios" | "android", run: (context: {
  permission: Permission; requests: Record<string, unknown>[]; signed: string[]; stored: Map<string, string>;
  setPermitAccepted: (accepted: boolean) => void
}) => Promise<void>) {
  const loader = Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown }
  const originalLoad = loader._load, originalFetch = globalThis.fetch
  const stored = new Map<string, string>(), requests: Record<string, unknown>[] = [], signed: string[] = []
  const id = platform === "ios" ? "a".repeat(43) + "=" : "b".repeat(43)
  let registered = false, accepted = true, tokenCount = 0
  const integrity = {
    isSupported: true, generateKeyAsync: async () => id,
    attestKeyAsync: async (_key: string, payload: string) => { signed.push(payload); return "fixture-attestation" },
    generateAssertionAsync: async (_key: string, payload: string) => { signed.push(payload); return "fixture-assertion" },
    prepareIntegrityTokenProviderAsync: async () => {},
    requestIntegrityCheckAsync: async (hash: string) => { signed.push(hash); return "fixture-integrity-token" }
  }
  loader._load = function (request, parent, isMain) {
    if (request === "@expo/app-integrity") return integrity
    if (request === "expo-secure-store") return {
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "this-device", getItemAsync: async (key: string) => stored.get(key) ?? null,
      setItemAsync: async (key: string, value: string) => { stored.set(key, value) }, deleteItemAsync: async (key: string) => { stored.delete(key) }
    }
    if (request === "react-native") return { Platform: { OS: platform } }
    if (request === "expo-crypto") return {
      CryptoDigestAlgorithm: { SHA256: "sha256" }, CryptoEncoding: { BASE64: "base64" },
      digestStringAsync: async (_algorithm: string, value: string) => createHash("sha256").update(value).digest("base64")
    }
    if (request === "./firebasePhoneAppCheck") return { getFirebaseSmsGateContext: async () => ({
      token: `fixture-token-${++tokenCount}`, projectId: "fixture-project", projectNumber: "1"
    }) }
    return originalLoad.call(this, request, parent, isMain)
  }
  globalThis.fetch = (async (url: string, options: RequestInit) => {
    assert.equal(url, "https://europe-west1-fixture-project.cloudfunctions.net/blumiSmsDeviceGate")
    assert.equal(typeof (options.headers as Record<string, string>)["X-Firebase-AppCheck"], "string")
    const data = JSON.parse(String(options.body)).data as Record<string, unknown>
    requests.push(data)
    if (data.action === "challenge") return { ok: true, json: async () => ({ result: {
      challenge: "c".repeat(43), installationId: id, registrationRequired: !registered,
      expiresAt: new Date(Date.now() + 120_000).toISOString()
    } }) }
    registered = accepted
    return { ok: accepted, status: accepted ? 200 : 403, json: async () => accepted
      ? { result: { expiresAt: new Date(Date.now() + 60_000).toISOString() } }
      : { error: { message: "unavailable" } } }
  }) as typeof fetch
  try {
    const requireHere = createRequire(resolve(import.meta.dirname, "index.ts"))
    const path = requireHere.resolve("./firebaseSmsDevicePermission")
    delete requireHere.cache[path]
    await run({ permission: requireHere(path) as Permission, requests, signed, stored,
      setPermitAccepted: value => { accepted = value } })
  } finally { loader._load = originalLoad; globalThis.fetch = originalFetch }
}

for (const platform of ["ios", "android"] as const) {
  test(`${platform}: phone changes reuse one installation and bind the exact challenge/phone`, async () => {
    await fixture(platform, async ({ permission, requests, signed }) => {
      await permission.requireFirebaseSmsDevicePermission("+12025550101")
      await permission.requireFirebaseSmsDevicePermission("+12025550102")
      assert.equal(requests.length, 4)
      assert.equal(requests[1]!.installationId, requests[3]!.installationId)
      assert.equal(requests[2]!.installationId, requests[3]!.installationId)
      const canonical = JSON.stringify(["blumi-sms-permit-v1", "fixture-project", platform,
        requests[1]!.installationId, requests[1]!.challenge, "+12025550101"])
      assert.equal(signed[0], platform === "ios" ? canonical : createHash("sha256").update(canonical).digest("base64url"))
      assert.notEqual(signed[0], signed[1])
    })
  })
}

test("a refused permit never resets a stored installation", async () => {
  await fixture("android", async ({ permission, requests, stored, setPermitAccepted }) => {
    setPermitAccepted(false)
    await assert.rejects(permission.requireFirebaseSmsDevicePermission("+12025550101"), /unavailable/)
    assert.equal(stored.size, 1)
    await assert.rejects(permission.requireFirebaseSmsDevicePermission("+12025550102"), /unavailable/)
    assert.equal(requests[1]!.installationId, requests[3]!.installationId)
  })
})

test("a refused permit names the gate's HTTP status, so a screenshot shows the failed step", async () => {
  await fixture("ios", async ({ permission, setPermitAccepted }) => {
    setPermitAccepted(false)
    await assert.rejects(permission.requireFirebaseSmsDevicePermission("+12025550101"), (error: unknown) => {
      assert.equal(describePhoneCodeFailure("PERMIT", error), "E-PERMIT-GATE403")
      return true
    })
  })
})
