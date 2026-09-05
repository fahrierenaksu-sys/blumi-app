import assert from "node:assert/strict"
import test from "node:test"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { ROOM_AVATAR_CATALOG } = require("./room/avatarRoom.mock") as typeof import("./room/avatarRoom.mock")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { ROOM_AVATAR_FRAME_DURATION_MS } = require("./room/avatarRoomMotionContract") as typeof import("./room/avatarRoomMotionContract")

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

function frameCount(asset: unknown): number {
  if (!asset || typeof asset !== "object") return 0
  if ("source" in asset) return 1
  if (!("frames" in asset)) return 0
  const frames = (asset as { frames?: unknown }).frames
  return Array.isArray(frames) ? frames.length : 0
}

test("every visible female and male room layer has front walking and sitting motion coverage", () => {
  const missingCoverage = ROOM_AVATAR_CATALOG
    .filter(
      (item) =>
        (item.bodyPreset === "female" || item.bodyPreset === "male") &&
        MOTION_REQUIRED_TYPES.has(item.type)
    )
    .flatMap((item) => {
      const walking = item.assetsByMotion?.walking?.front
      const sitting = item.assetsByMotion?.sitting?.front
      const issues: string[] = []

      if (frameCount(walking) < 4) {
        issues.push(`${item.id}: walking front requires 4 frames`)
      }
      if (frameCount(sitting) < 1) {
        issues.push(`${item.id}: sitting front requires 1 frame`)
      }
      return issues
    })

  assert.deepEqual(missingCoverage, [])
})

test("every runtime walking sequence uses the shared 120ms playback contract", () => {
  const mismatchedDurations = ROOM_AVATAR_CATALOG
    .filter((item) => MOTION_REQUIRED_TYPES.has(item.type))
    .flatMap((item) => {
      const walking = item.assetsByMotion?.walking?.front
      if (!walking || !("frames" in walking)) return []
      return walking.frameDurationMs === ROOM_AVATAR_FRAME_DURATION_MS
        ? []
        : [`${item.id}: ${walking.frameDurationMs}`]
    })

  assert.equal(ROOM_AVATAR_FRAME_DURATION_MS, 120)
  assert.deepEqual(mismatchedDurations, [])
})
