import assert from "node:assert/strict"
import test from "node:test"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset fixtures need a Node require hook.
const { AVATAR_V2_CATALOG } = require("./avatarV2.mock") as typeof import("./avatarV2.mock")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset fixtures need a Node require hook.
const { MALE_CAPSULE_PREVIEW_SOURCES } = require("./maleCapsulePreviewSources") as typeof import("./maleCapsulePreviewSources")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset fixtures need a Node require hook.
const { ROOM_AVATAR_CATALOG } = require("./room/avatarRoom.mock") as typeof import("./room/avatarRoom.mock")

const approved = [
  "ash_blond_low_fade_crop",
  "blue_black_short_curls",
  "chestnut_short_waves",
  "cocoa_textured_quiff",
  "short_twists_textured_style",
  "soft_black_side_part",
  "soft_textured_crop",
  "voluminous_wavy_quiff",
] as const

test("all eight approved male hairs share Shop, Wardrobe, walking and sitting sources", () => {
  for (const slug of approved) {
    const avatarId = `avatar_v2_hair_male_${slug}`
    const roomId = `room_avatar_hair_front_male_${slug}_v1`
    const avatarItem = AVATAR_V2_CATALOG.find((item) => item.id === avatarId)
    const roomItem = ROOM_AVATAR_CATALOG.find((item) => item.id === roomId)
    const walking = roomItem?.assetsByMotion?.walking?.front
    const sitting = roomItem?.assetsByMotion?.sitting?.front

    assert.ok(avatarItem, `${avatarId} Shop/Wardrobe catalog`)
    assert.equal(avatarItem.type, "hair")
    assert.notEqual(avatarItem.hiddenFromShop, true)
    assert.notEqual(avatarItem.hiddenFromWardrobe, true)
    assert.ok(roomItem, `${roomId} Room catalog`)
    assert.match(String(roomItem.asset.source), new RegExp(`avatar_room_hair_front_male_${slug}_v2\\.png$`))
    assert.doesNotMatch(String(roomItem.asset.source), /\/candidates\//)
    assert.equal(MALE_CAPSULE_PREVIEW_SOURCES[avatarId], roomItem.asset.source)
    assert.ok(walking && "frames" in walking, `${roomId} walking`)
    assert.equal(walking.frames.length, 4)
    assert.ok(walking.frames.every((frame) => frame.source === roomItem.asset.source))
    assert.ok(sitting && !("frames" in sitting), `${roomId} sitting`)
    assert.equal(sitting.source, roomItem.asset.source)
  }
})
