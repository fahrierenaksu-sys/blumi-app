import assert from "node:assert/strict"
import test from "node:test"
import {
  ROOM_STUDIO_THEME_IDS,
  ROOM_STUDIO_ZONE_IDS,
  getRoomStudioThemeOption,
  getRoomStudioThemeOptions,
  getRoomStudioThemePreset,
  getRoomStudioZoneOptions,
  type RoomStudioThemeId,
  type RoomStudioZoneId
} from "./roomStudioThemeMatrix"

test("Home Studio exposes four coherent themes across four zones", () => {
  assert.deepEqual(ROOM_STUDIO_THEME_IDS, ["rose", "sky", "honey", "lilac"])
  assert.deepEqual(ROOM_STUDIO_ZONE_IDS, ["sleep", "cozyCorner", "wallStory", "softAccents"])

  for (const themeId of ROOM_STUDIO_THEME_IDS) {
    const options = getRoomStudioThemeOptions(themeId)
    assert.equal(options.length, 4)
    assert.deepEqual(options.map((option) => option.zone), ROOM_STUDIO_ZONE_IDS)
    assert.ok(options.every((option) => option.theme === themeId))
    assert.ok(options.every((option) => option.id.startsWith("room_studio_")))
  }
})

test("theme options return defensive copies and preserve stable IDs", () => {
  const first = getRoomStudioThemeOption("rose", "sleep")
  const second = getRoomStudioThemeOption("rose", "sleep")

  assert.equal(first.id, "room_studio_sleep_module_v1")
  assert.equal(first.zone, "sleep")
  assert.equal(first.theme, "rose")
  assert.notEqual(first, second)
  assert.throws(
    () => getRoomStudioThemeOption("unknown" as RoomStudioThemeId, "sleep"),
    /room_studio_theme_unknown/
  )
  assert.throws(
    () => getRoomStudioThemeOption("rose", "unknown" as RoomStudioZoneId),
    /room_studio_zone_unknown/
  )
})

test("each theme has one curated preset with all four zones", () => {
  for (const themeId of ROOM_STUDIO_THEME_IDS) {
    const preset = getRoomStudioThemePreset(themeId)
    assert.equal(preset.theme, themeId)
    assert.deepEqual(preset.optionIds, getRoomStudioThemeOptions(themeId).map(({ id }) => id))
  }
})

test("each editable room zone exposes one option per coherent theme", () => {
  for (const zone of ROOM_STUDIO_ZONE_IDS) {
    const options = getRoomStudioZoneOptions(zone)
    assert.equal(options.length, 4)
    assert.deepEqual(options.map((option) => option.theme), ROOM_STUDIO_THEME_IDS)
    assert.ok(options.every((option) => option.zone === zone))
    assert.ok(options.every((option) => option.themeLabel.length > 0))
  }
})
