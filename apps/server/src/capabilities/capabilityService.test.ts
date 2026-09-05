import assert from "node:assert/strict"
import test from "node:test"
import { CAPABILITY_KEYS } from "@blumi/contracts"
import {
  CAPABILITY_PREREQUISITES,
  createCapabilityService,
  parseCapabilityManifest,
  stableCapabilityBucket
} from "./capabilityService"

test("manifest parsing fails closed for invalid JSON, unknown keys, and invalid stages", () => {
  for (const source of [
    "not-json",
    JSON.stringify({ rollouts: { unknown_capability: 100 } }),
    JSON.stringify({ rollouts: { chat_typing: 50 } })
  ]) {
    const parsed = parseCapabilityManifest(source)
    assert.equal(parsed.valid, false)
    assert.deepEqual(parsed.manifest.rollouts, {})
  }
})

test("stable cohort assignment is deterministic and supports staged rollout thresholds", () => {
  const userId = "user-stable-cohort"
  const bucket = stableCapabilityBucket(userId)
  assert.equal(stableCapabilityBucket(userId), bucket)
  assert.ok(bucket >= 0 && bucket < 100)

  const service = createCapabilityService({
    manifest: parseCapabilityManifest(JSON.stringify({
      rollouts: {
        db_chat_metadata_ready: 100,
        chat_typing: bucket < 5 ? 5 : bucket < 25 ? 25 : 100,
        chat_presence: "internal",
        chat_read_receipts: 100
      },
      internalUserIds: [userId]
    })).manifest
  })
  const resolution = service.resolve(userId, [
    "db_chat_metadata_ready",
    "chat_typing",
    "chat_presence",
    "chat_read_receipts"
  ])
  assert.equal(resolution.capabilities.chat_typing, true)
  assert.equal(resolution.capabilities.chat_presence, true)
  assert.equal(resolution.capabilities.chat_read_receipts, true)
})

test("5, 25, and 100 percent stages use stable zero-based bucket boundaries", () => {
  const fivePercentUser = findUserInBucketRange(0, 4)
  const twentyFivePercentUser = findUserInBucketRange(5, 24)
  const remainingUser = findUserInBucketRange(25, 99)
  const declared = [
    "db_chat_metadata_ready",
    "chat_typing",
    "chat_presence",
    "chat_read_receipts"
  ] as const
  const service = createCapabilityService({
    manifest: parseCapabilityManifest(JSON.stringify({
      rollouts: {
        db_chat_metadata_ready: 100,
        chat_typing: 5,
        chat_presence: 25,
        chat_read_receipts: 100
      }
    })).manifest
  })

  assert.deepEqual(pickChatCapabilities(service.resolve(fivePercentUser, declared)), {
    chat_typing: true,
    chat_presence: true,
    chat_read_receipts: true
  })
  assert.deepEqual(pickChatCapabilities(service.resolve(twentyFivePercentUser, declared)), {
    chat_typing: false,
    chat_presence: true,
    chat_read_receipts: true
  })
  assert.deepEqual(pickChatCapabilities(service.resolve(remainingUser, declared)), {
    chat_typing: false,
    chat_presence: false,
    chat_read_receipts: true
  })
})

test("resolution returns a complete immutable map and enforces prerequisites", () => {
  const service = createCapabilityService({
    manifest: parseCapabilityManifest(JSON.stringify({
      rollouts: {
        db_avatar_loadout_v2_ready: 100,
        avatar_loadout_v2_read: 100,
        avatar_loadout_v2_write: 100,
        chat_typing: 100
      }
    })).manifest
  })

  const withoutPrerequisites = service.resolve("user-1", [
    "avatar_loadout_v2_write",
    "chat_typing"
  ])
  assert.equal(withoutPrerequisites.capabilities.avatar_loadout_v2_write, false)
  assert.equal(withoutPrerequisites.capabilities.chat_typing, true)
  assert.deepEqual(Object.keys(withoutPrerequisites.capabilities), [...CAPABILITY_KEYS])
  assert.equal(Object.isFrozen(withoutPrerequisites.capabilities), true)

  const withPrerequisites = service.resolve("user-1", [
    "avatar_loadout_v2_read",
    "avatar_loadout_v2_write"
  ])
  assert.equal(withPrerequisites.capabilities.db_avatar_loadout_v2_ready, true)
  assert.equal(withPrerequisites.capabilities.avatar_loadout_v2_write, true)
})

test("dependent capabilities fail closed when any direct or transitive prerequisite is absent", () => {
  assert.deepEqual(CAPABILITY_PREREQUISITES, {
    avatar_loadout_v2_write: ["db_avatar_loadout_v2_ready", "avatar_loadout_v2_read"],
    avatar_dress_outerwear_render: ["db_avatar_loadout_v2_ready", "avatar_loadout_v2_read"],
    shop_multi_item_apply: ["avatar_loadout_v2_write"],
    discovery_public_profile: ["db_public_card_ready"],
    discovery_badges: ["discovery_public_profile"],
    discovery_room_showcase: ["db_room_snapshot_ready", "discovery_public_profile"],
    card_studio: ["discovery_public_profile", "discovery_badges", "discovery_room_showcase"],
    card_theme_economy: ["card_studio"],
    chat_presence: ["db_chat_metadata_ready"],
    chat_read_receipts: ["db_chat_metadata_ready"],
    chat_message_edit: ["db_chat_metadata_ready"]
  })

  const service = createCapabilityService({
    manifest: parseCapabilityManifest(JSON.stringify({
      rollouts: Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, 100]))
    })).manifest
  })
  const fullyEnabled = service.resolve("user-prerequisites", CAPABILITY_KEYS)
  assert.equal(Object.values(fullyEnabled.capabilities).every(Boolean), true)
  const basicShop = service.resolve("user-prerequisites", [
    "db_avatar_loadout_v2_ready",
    "avatar_loadout_v2_read",
    "avatar_loadout_v2_write",
    "shop_multi_item_apply"
  ])
  assert.equal(basicShop.capabilities.avatar_dress_outerwear_render, false)
  assert.equal(basicShop.capabilities.shop_multi_item_apply, true)

  for (const [dependent, prerequisites] of Object.entries(
    CAPABILITY_PREREQUISITES
  )) {
    for (const missing of prerequisites ?? []) {
      const declared = CAPABILITY_KEYS.filter((key) => key !== missing)
      const scopedService = missing.startsWith("db_")
        ? createCapabilityService({
            manifest: parseCapabilityManifest(JSON.stringify({
              rollouts: Object.fromEntries(
                CAPABILITY_KEYS
                  .filter((key) => key !== missing)
                  .map((key) => [key, 100])
              )
            })).manifest
          })
        : service
      const resolution = scopedService.resolve("user-prerequisites", declared)
      assert.equal(
        resolution.capabilities[dependent as keyof typeof resolution.capabilities],
        false,
        `${dependent} must fail closed without ${missing}`
      )
    }
  }
})

test("missing client declaration is legacy and fails closed", () => {
  const service = createCapabilityService({
    manifest: parseCapabilityManifest(JSON.stringify({
      rollouts: { chat_typing: 100 }
    })).manifest
  })
  const resolution = service.resolve("user-1", undefined)
  assert.equal(resolution.legacy, true)
  assert.equal(Object.values(resolution.capabilities).every((value) => !value), true)
})

function findUserInBucketRange(minimum: number, maximum: number): string {
  for (let index = 0; index < 10_000; index += 1) {
    const userId = `cohort-user-${index}`
    const bucket = stableCapabilityBucket(userId)
    if (bucket >= minimum && bucket <= maximum) return userId
  }
  throw new Error(`Unable to find cohort bucket ${minimum}-${maximum}.`)
}

function pickChatCapabilities(
  resolution: ReturnType<ReturnType<typeof createCapabilityService>["resolve"]>
) {
  return {
    chat_typing: resolution.capabilities.chat_typing,
    chat_presence: resolution.capabilities.chat_presence,
    chat_read_receipts: resolution.capabilities.chat_read_receipts
  }
}
