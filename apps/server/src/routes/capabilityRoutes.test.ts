import assert from "node:assert/strict"
import test from "node:test"
import { CAPABILITY_KEYS } from "@blumi/contracts"
import { createAuthService } from "../auth/authService"
import {
  createCapabilityService,
  parseCapabilityManifest
} from "../capabilities/capabilityService"
import { createServer } from "../server"

test("capability route authenticates and resolves only declared server-enabled support", async () => {
  const authService = createAuthService({ codeFactory: () => "123456" })
  const capabilityService = createCapabilityService({
    manifest: parseCapabilityManifest(JSON.stringify({
      rollouts: { chat_typing: 100, chat_presence: 100 }
    })).manifest
  })
  const app = createServer({ authService, capabilityService })
  try {
    assert.equal((await app.inject({
      method: "POST",
      url: "/v1/capabilities/resolve",
      payload: { declaredCapabilities: ["chat_typing"] }
    })).statusCode, 401)

    const sessionToken = await createProductSession(authService)
    const response = await app.inject({
      method: "POST",
      url: "/v1/capabilities/resolve",
      headers: { authorization: `Bearer ${sessionToken}` },
      payload: { declaredCapabilities: ["chat_typing"] }
    })
    assert.equal(response.statusCode, 200)
    assert.equal(response.json().legacy, false)
    assert.equal(response.json().capabilities.chat_typing, true)
    assert.equal(response.json().capabilities.chat_presence, false)
    assert.deepEqual(Object.keys(response.json().capabilities), [...CAPABILITY_KEYS])
  } finally {
    await app.close()
  }
})

test("capability route treats absent declarations as legacy and rejects explicit unknown values", async () => {
  const authService = createAuthService({ codeFactory: () => "123456" })
  const capabilityService = createCapabilityService({
    manifest: parseCapabilityManifest(JSON.stringify({
      rollouts: { chat_typing: 100 }
    })).manifest
  })
  const app = createServer({ authService, capabilityService })
  try {
    const sessionToken = await createProductSession(authService)
    const legacy = await app.inject({
      method: "POST",
      url: "/v1/capabilities/resolve",
      headers: { authorization: `Bearer ${sessionToken}` }
    })
    assert.equal(legacy.statusCode, 200)
    assert.equal(legacy.json().legacy, true)
    assert.equal(Object.values(legacy.json().capabilities).every((value) => !value), true)

    for (const payload of [
      { declaredCapabilities: ["unknown_capability"] },
      { declaredCapabilities: "chat_typing" },
      { declaredCapabilities: ["chat_typing", "chat_typing"] }
    ]) {
      const invalid = await app.inject({
        method: "POST",
        url: "/v1/capabilities/resolve",
        headers: { authorization: `Bearer ${sessionToken}` },
        payload
      })
      assert.equal(invalid.statusCode, 400)
      assert.equal(invalid.json().error, "Declare valid client capabilities.")
    }
  } finally {
    await app.close()
  }
})

async function createProductSession(
  authService: ReturnType<typeof createAuthService>
): Promise<string> {
  await authService.sendCode("+905551119977")
  const sessionToken = (
    await authService.verifyCode("+905551119977", "123456")
  ).sessionToken
  await authService.updateProfile(sessionToken, {
    displayName: "Capability User",
    age: 24,
    gender: "woman",
    avatarPresetId: "avatar_v2_body_default"
  })
  for (const step of ["profile", "avatar", "room"] as const) {
    await authService.completeOnboardingStep(sessionToken, step)
  }
  return sessionToken
}
