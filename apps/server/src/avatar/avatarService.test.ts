import assert from "node:assert/strict"
import test from "node:test"
import {
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  TEST_AVATAR_ITEM,
  TEST_AVATAR_ITEM_RULES
} from "@blumi/domain"
import { createAuthService } from "../auth/authService"
import { createBlumiBackendStore } from "../auth/authStore"
import { createEconomyService } from "../economy/economyService"
import { TEST_ECONOMY_CATALOG } from "../economy/testRoomCatalog"
import { createAvatarService } from "./avatarService"

const FIXTURE_FEMALE_LOADOUT = TEST_AVATAR_ITEM_RULES.starters.female
const FIXTURE_MALE_LOADOUT = TEST_AVATAR_ITEM_RULES.starters.male

test("avatar save is authenticated, ownership-checked, and revision-safe", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  // plan X15: the live catalog has no paid hair to leave unowned, so this runs on the test-only fixture catalog
  const economyService = createEconomyService({ catalog: TEST_ECONOMY_CATALOG, avatarRules: TEST_AVATAR_ITEM_RULES })
  const avatarService = createAvatarService({
    authService,
    economyService,
    avatarRules: TEST_AVATAR_ITEM_RULES
  })
  await authService.sendCode("+905551112233")
  const verified = await authService.verifyCode("+905551112233", "482931")

  const updated = await avatarService.saveAvatar(verified.sessionToken, {
    loadout: FIXTURE_MALE_LOADOUT,
    revision: 0
  })
  assert.equal(updated.kind, "updated")
  if (updated.kind !== "updated") return
  assert.equal(updated.selection.revision, 1)
  assert.equal(updated.selection.presetId, FIXTURE_MALE_LOADOUT.bodyId)

  const stored = await authService.getSession(verified.sessionToken)
  assert.deepEqual(stored?.account.profile.avatar, updated.selection)

  const stale = await avatarService.saveAvatar(verified.sessionToken, {
    loadout: FIXTURE_FEMALE_LOADOUT,
    revision: 0
  })
  assert.equal(stale.kind, "conflict")
  if (stale.kind === "conflict") {
    assert.deepEqual(stale.current, updated.selection)
  }

  const unowned = await avatarService.saveAvatar(verified.sessionToken, {
    loadout: {
      ...FIXTURE_FEMALE_LOADOUT,
      hairId: TEST_AVATAR_ITEM.girlHairPaid
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
