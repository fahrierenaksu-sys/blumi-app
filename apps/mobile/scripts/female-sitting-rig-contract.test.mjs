import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

import { PNG } from "pngjs"

const scripts = dirname(fileURLToPath(import.meta.url))
const root = resolve(scripts, "../../..")
const feature = resolve(root, "apps/mobile/src/features/avatarV2")
const room = resolve(feature, "assets/room")
const motion = resolve(room, "motion")

function projectedFemaleNonDressItems() {
  const catalog = readFileSync(resolve(feature, "avatarV2.mock.ts"), "utf8")
  const projection = readFileSync(resolve(feature, "room/avatarRoomProjection.ts"), "utf8")
  const catalogIds = new Set(
    [...catalog.matchAll(/\bid:\s*"(avatar_v2_[^"]+)"/g)].map((match) => match[1])
  )
  const defaultBlock = catalog.match(/export const DEFAULT_AVATAR_V2[^=]*=\s*\{([^}]+)\}/)
  for (const match of defaultBlock?.[1]?.matchAll(/"(avatar_v2_[^"]+)"/g) ?? []) {
    catalogIds.add(match[1])
  }

  const items = new Map()
  for (const match of projection.matchAll(/(avatar_v2_[a-z0-9_]+):\s*\{([^}]+)\}/g)) {
    const [, avatarId, body] = match
    if (!avatarId || !body || !catalogIds.has(avatarId)) continue
    for (const [kind, field] of [["top", "topId"], ["bottom", "bottomId"], ["shoes", "shoesId"]]) {
      const roomMatch = body.match(new RegExp(`${field}:\\s*"(room_avatar_${kind}_female_[^"]+)"`))
      const roomId = roomMatch?.[1]
      if (roomId && !roomId.includes("dress")) items.set(roomId, { kind, roomId })
    }
    for (const accessory of body.matchAll(/"(room_avatar_accessory_female_[^"]+)"/g)) {
      if (accessory[1]) items.set(accessory[1], { kind: "accessory", roomId: accessory[1] })
    }
  }
  return [...items.values()]
}

test("female sitting scope is derived from catalog projection without external Python packages", () => {
  const items = projectedFemaleNonDressItems()
  const counts = Object.fromEntries(
    ["top", "bottom", "shoes", "accessory"].map((kind) => [
      kind,
      items.filter((item) => item.kind === kind).length
    ])
  )
  assert.deepEqual(counts, { top: 6, bottom: 7, shoes: 5, accessory: 12 })

  for (const item of items) {
    const path = resolve(motion, `${item.roomId}_sitting_front_f01.png`)
    assert.equal(existsSync(path), true, `${item.roomId} sitting asset is required`)
    const image = PNG.sync.read(readFileSync(path))
    assert.deepEqual([image.width, image.height], [256, 384], item.roomId)
  }
})
