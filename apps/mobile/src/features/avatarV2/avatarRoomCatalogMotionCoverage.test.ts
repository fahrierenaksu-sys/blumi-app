import assert from "node:assert/strict"
import test from "node:test"
import type { AvatarCatalogItem, UserAvatar } from "./avatarV2.types"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { ROOM_AVATAR_CATALOG } = require("./room/avatarRoomCatalog") as typeof import("./room/avatarRoomCatalog")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { ROOM_AVATAR_FRAME_DURATION_MS } = require("./room/avatarRoomMotionContract") as typeof import("./room/avatarRoomMotionContract")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { AVATAR_V2_CATALOG, DEFAULT_AVATAR_V2 } = require("./avatarV2Catalog") as typeof import("./avatarV2Catalog")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { normalizeAvatarV2ForBody } = require("./avatarBodyCompatibility") as typeof import("./avatarBodyCompatibility")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { projectAvatarV2ToRoomAvatarAppearance } = require("./room/avatarRoomProjection") as typeof import("./room/avatarRoomProjection")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { getRoomAvatarAssetCoverage } = require("./room/avatarRoomSelectors") as typeof import("./room/avatarRoomSelectors")

const MOTION_REQUIRED_TYPES = new Set([
  "face",
  "eyes",
  "nose",
  "mouth",
  "hairBack",
  "hairFront",
  "top",
  "bottom",
  "shoes",
  "accessory"
])

const SLOT_BY_TYPE: Partial<Record<AvatarCatalogItem["type"], keyof UserAvatar>> = {
  face: "faceId",
  eyes: "eyesId",
  nose: "noseId",
  mouth: "mouthId",
  hair: "hairId",
  top: "topId",
  bottom: "bottomId",
  shoes: "shoesId"
}

function wearOnDefaultAvatar(item: AvatarCatalogItem): UserAvatar {
  const bodyId = item.type === "body"
    ? item.id
    : item.compatibleBodyIds?.[0] ?? DEFAULT_AVATAR_V2.bodyId
  const base = normalizeAvatarV2ForBody(DEFAULT_AVATAR_V2, bodyId, AVATAR_V2_CATALOG)
  if (item.type === "accessory") return { ...base, accessoryIds: [item.id] }
  const slot = SLOT_BY_TYPE[item.type]
  return slot ? { ...base, [slot]: item.id } : base
}

test("every visible wardrobe item renders walking and sitting in the room without static fallbacks", () => {
  const visibleItems = AVATAR_V2_CATALOG.filter((item) => item.hiddenFromWardrobe !== true)
  assert.ok(visibleItems.length > 0)
  const fallbacks = visibleItems.flatMap((item) => {
    const { appearance } = projectAvatarV2ToRoomAvatarAppearance({ avatar: wearOnDefaultAvatar(item) })
    return (["walking", "sitting"] as const).flatMap((state) => {
      const coverage = getRoomAvatarAssetCoverage({
        appearance,
        catalog: ROOM_AVATAR_CATALOG,
        state,
        direction: "front"
      })
      return coverage.fallbackLayerCount === 0
        ? []
        : [`${item.id} ${state}: ${coverage.fallbackLayerCount} fallback layer(s)`]
    })
  })

  assert.deepEqual(fallbacks, [])
})

test("every runtime walking sequence uses the shared playback contract", () => {
  const mismatchedDurations = ROOM_AVATAR_CATALOG
    .filter((item) => MOTION_REQUIRED_TYPES.has(item.type))
    .flatMap((item) => {
      const walking = item.assetsByMotion?.walking?.front
      if (!walking || !("frames" in walking)) return []
      return walking.frameDurationMs === ROOM_AVATAR_FRAME_DURATION_MS
        ? []
        : [`${item.id}: ${walking.frameDurationMs}`]
    })

  assert.deepEqual(mismatchedDurations, [])
})
