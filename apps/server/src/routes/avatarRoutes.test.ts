import assert from "node:assert/strict"
import test from "node:test"
import {
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  toAvatarLoadoutV2
} from "@blumi/domain"
import { createAuthService } from "../auth/authService"
import { createBlumiBackendStore } from "../auth/authStore"
import { createServer } from "../server"
import {
  createCapabilityService,
  parseCapabilityManifest
} from "../capabilities/capabilityService"

test("authenticated avatar PUT persists complete loadout and rejects stale writes", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const app = createServer({ authService })
  await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112233" }
  })
  const verified = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" },
      phoneNumber: "+905551112233",
      verificationCode: "482931"
    }
  })
  const token = verified.json().session.sessionToken as string

  const saved = await app.inject({
    method: "PUT",
    url: "/v1/users/me/avatar",
    headers: { authorization: `Bearer ${token}` },
    payload: { loadout: DEFAULT_MALE_AVATAR_LOADOUT, revision: 0 }
  })
  assert.equal(saved.statusCode, 200)
  assert.equal(saved.json().avatar.revision, 1)
  assert.deepEqual(saved.json().avatar.loadout, DEFAULT_MALE_AVATAR_LOADOUT)

  const me = await app.inject({
    method: "GET",
    url: "/v1/users/me",
    headers: { authorization: `Bearer ${token}` }
  })
  assert.deepEqual(me.json().profile.avatar, saved.json().avatar)

  const bypass = await app.inject({
    method: "PATCH",
    url: "/v1/users/me",
    headers: { authorization: `Bearer ${token}` },
    payload: { avatarPresetId: DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId }
  })
  assert.equal(bypass.statusCode, 400)
  assert.match(bypass.json().error, /avatar editor/i)

  const stale = await app.inject({
    method: "PUT",
    url: "/v1/users/me/avatar",
    headers: { authorization: `Bearer ${token}` },
    payload: { loadout: DEFAULT_FEMALE_AVATAR_LOADOUT, revision: 0 }
  })
  assert.equal(stale.statusCode, 409)
  assert.equal(stale.json().code, "AVATAR_REVISION_CONFLICT")
  assert.deepEqual(stale.json().current, saved.json().avatar)

  await app.close()
})

test("avatar PUT requires auth and a non-negative safe revision", async () => {
  const app = createServer()
  const unauthorized = await app.inject({
    method: "PUT",
    url: "/v1/users/me/avatar",
    payload: { loadout: DEFAULT_FEMALE_AVATAR_LOADOUT, revision: 0 }
  })
  assert.equal(unauthorized.statusCode, 401)

  const authService = createAuthService({ codeFactory: () => "482931" })
  const authenticatedApp = createServer({ authService })
  await authenticatedApp.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112244" }
  })
  const verified = await authenticatedApp.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" },
      phoneNumber: "+905551112244",
      verificationCode: "482931"
    }
  })
  const invalid = await authenticatedApp.inject({
    method: "PUT",
    url: "/v1/users/me/avatar",
    headers: {
      authorization: `Bearer ${verified.json().session.sessionToken}`
    },
    payload: { loadout: DEFAULT_FEMALE_AVATAR_LOADOUT, revision: -1 }
  })
  assert.equal(invalid.statusCode, 400)
  assert.equal(invalid.json().code, "invalid_revision")

  await app.close()
  await authenticatedApp.close()
})

test("avatar PUT gates V2 writes and projects reads from server-resolved client support", async () => {
  const authService = createAuthService({ codeFactory: () => "482931" })
  const capabilityService = createCapabilityService({
    manifest: parseCapabilityManifest(JSON.stringify({
      rollouts: {
        db_avatar_loadout_v2_ready: 100,
        avatar_loadout_v2_read: 100,
        avatar_loadout_v2_write: 100
      }
    })).manifest
  })
  const app = createServer({ authService, capabilityService })
  await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112255" }
  })
  const verified = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" },
      phoneNumber: "+905551112255",
      verificationCode: "482931"
    }
  })
  const authorization = `Bearer ${verified.json().session.sessionToken}`
  const v2 = toAvatarLoadoutV2(DEFAULT_FEMALE_AVATAR_LOADOUT)

  const blockedV2Write = await app.inject({
    method: "PUT",
    url: "/v1/users/me/avatar",
    headers: { authorization },
    payload: { loadout: v2, revision: 0 }
  })
  assert.equal(blockedV2Write.statusCode, 400)
  assert.equal(blockedV2Write.json().code, "CAPABILITY_UNAVAILABLE")

  const v2Response = await app.inject({
    method: "PUT",
    url: "/v1/users/me/avatar",
    headers: {
      authorization,
      "x-blumi-client-capabilities":
        "avatar_loadout_v2_read,avatar_loadout_v2_write"
    },
    payload: { loadout: v2, revision: 0 }
  })
  assert.equal(v2Response.statusCode, 200)
  assert.equal(v2Response.json().avatar.loadout.schemaVersion, 2)

  const legacyMe = await app.inject({
    method: "GET",
    url: "/v1/users/me",
    headers: { authorization }
  })
  assert.equal(legacyMe.statusCode, 200)
  assert.equal(legacyMe.json().profile.avatar.loadout.schemaVersion, 1)

  const v2Me = await app.inject({
    method: "GET",
    url: "/v1/users/me",
    headers: {
      authorization,
      "x-blumi-client-capabilities": "avatar_loadout_v2_read"
    }
  })
  assert.equal(v2Me.statusCode, 200)
  assert.equal(v2Me.json().profile.avatar.loadout.schemaVersion, 2)

  const staleLegacyConflict = await app.inject({
    method: "PUT",
    url: "/v1/users/me/avatar",
    headers: { authorization },
    payload: { loadout: DEFAULT_MALE_AVATAR_LOADOUT, revision: 0 }
  })
  assert.equal(staleLegacyConflict.statusCode, 409)
  assert.equal(staleLegacyConflict.json().current.loadout.schemaVersion, 1)

  const resolvedReaderConflict = await app.inject({
    method: "PUT",
    url: "/v1/users/me/avatar",
    headers: {
      authorization,
      "x-blumi-client-capabilities": "avatar_loadout_v2_read"
    },
    payload: { loadout: DEFAULT_MALE_AVATAR_LOADOUT, revision: 0 }
  })
  assert.equal(resolvedReaderConflict.statusCode, 409)
  assert.equal(resolvedReaderConflict.json().current.loadout.schemaVersion, 2)

  const forgedResolvedHeader = await app.inject({
    method: "PUT",
    url: "/v1/users/me/avatar",
    headers: {
      authorization,
      "x-blumi-resolved-capabilities": "avatar_loadout_v2_read"
    },
    payload: { loadout: DEFAULT_MALE_AVATAR_LOADOUT, revision: 0 }
  })
  assert.equal(forgedResolvedHeader.statusCode, 409)
  assert.equal(forgedResolvedHeader.json().current.loadout.schemaVersion, 1)

  await app.close()
})
