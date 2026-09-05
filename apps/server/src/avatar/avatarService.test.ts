import assert from "node:assert/strict"
import test from "node:test"
import {
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT
} from "@blumi/domain"
import { createAuthService } from "../auth/authService"
import { createBlumiBackendStore } from "../auth/authStore"
import { createEconomyService } from "../economy/economyService"
import { createInMemoryPresenceRepository } from "../presence/presenceRepository"
import { createAvatarService } from "./avatarService"

test("avatar save is authenticated, ownership-checked, and revision-safe", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const economyService = createEconomyService()
  const avatarService = createAvatarService({
    authService,
    economyService
  })
  await authService.sendCode("+905551112233")
  const verified = await authService.verifyCode("+905551112233", "482931")

  const updated = await avatarService.saveAvatar(verified.sessionToken, {
    loadout: DEFAULT_MALE_AVATAR_LOADOUT,
    revision: 0
  })
  assert.equal(updated.kind, "updated")
  if (updated.kind !== "updated") return
  assert.equal(updated.selection.revision, 1)
  assert.equal(updated.selection.presetId, DEFAULT_MALE_AVATAR_LOADOUT.bodyId)

  const stored = await authService.getSession(verified.sessionToken)
  assert.deepEqual(stored?.account.profile.avatar, updated.selection)

  const stale = await avatarService.saveAvatar(verified.sessionToken, {
    loadout: DEFAULT_FEMALE_AVATAR_LOADOUT,
    revision: 0
  })
  assert.equal(stale.kind, "conflict")
  if (stale.kind === "conflict") {
    assert.deepEqual(stale.current, updated.selection)
  }

  const unowned = await avatarService.saveAvatar(verified.sessionToken, {
    loadout: {
      ...DEFAULT_FEMALE_AVATAR_LOADOUT,
      hairId: "avatar_v2_hair_golden_waves"
    },
    revision: 1
  })
  assert.deepEqual(unowned, {
    kind: "invalid",
    code: "unowned_item",
    message: "Unlock this avatar item before equipping it."
  })
})

test("avatar save rejects invalid revisions before touching session state", async () => {
  const authService = createAuthService()
  const avatarService = createAvatarService({
    authService,
    economyService: createEconomyService()
  })

  for (const revision of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER]) {
    const result = await avatarService.saveAvatar("invalid", {
      loadout: DEFAULT_FEMALE_AVATAR_LOADOUT,
      revision
    })
    assert.equal(result.kind, "invalid")
    if (result.kind === "invalid") assert.equal(result.code, "invalid_revision")
  }
})

test("a successful account avatar CAS is not failed by legacy presence projection", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const presenceRepository = {
    ...createInMemoryPresenceRepository(),
    async updateUserAvatarSelection() {
      throw new Error("presence projection unavailable")
    }
  }
  const avatarService = createAvatarService({
    authService,
    economyService: createEconomyService(),
    presenceRepository
  })
  await authService.sendCode("+905551112233")
  const verified = await authService.verifyCode("+905551112233", "482931")

  const result = await avatarService.saveAvatar(verified.sessionToken, {
    loadout: DEFAULT_MALE_AVATAR_LOADOUT,
    revision: 0
  })

  assert.equal(result.kind, "updated")
  const stored = await authService.getSession(verified.sessionToken)
  assert.equal(stored?.account.profile.avatar.revision, 1)
})
