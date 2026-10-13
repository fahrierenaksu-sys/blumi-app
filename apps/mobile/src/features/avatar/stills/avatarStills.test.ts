import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import test from "node:test"
import { AVATAR_STILL_MANIFEST, DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT, GIRL_WARDROBE_PREVIEW_ITEM_IDS, resolveAvatarStillLayers, type AvatarStillRigId } from "@blumi/domain"
import { listAvatarItemArt } from "../model/avatarItemArt"
import { resolveAvatarDraw } from "../model/resolveAvatarDraw"
import { avatar25StandEntries } from "../renderer/avatar25Pose"
import type { Rig25 } from "../renderer/rigTypes"

const HERE = import.meta.dirname
const RIG_DIRS: Record<AvatarStillRigId, string> = { female: "girl", male: "boy" }
const rigDir = (rig: AvatarStillRigId) => resolve(HERE, "../rigs", RIG_DIRS[rig])
const RIGS = Object.fromEntries((Object.keys(RIG_DIRS) as AvatarStillRigId[]).map((rig) =>
  [rig, JSON.parse(readFileSync(join(rigDir(rig), "rig25.json"), "utf8")) as Rig25])) as Record<AvatarStillRigId, Rig25>
const BODIES = Object.keys(RIG_DIRS) as AvatarStillRigId[]

/** The baker's rig hash: rig25.json, then each front page, by name. */
function rigSha256(rig: AvatarStillRigId): string {
  const hash = createHash("sha256")
  for (const name of ["rig25.json", ...RIGS[rig].views.front.pages]) {
    hash.update(`${name}\n`)
    hash.update(readFileSync(join(rigDir(rig), name)))
  }
  return hash.digest("hex")
}

// L13: a rig changed without a re-bake (node tools/avatar25d/bake-stills.mjs) fails here
test("the baked stills match the committed rigs", () => {
  for (const rig of BODIES) assert.equal(AVATAR_STILL_MANIFEST.bodies[rig].rigSha256, rigSha256(rig), `${rig}: re-run tools/avatar25d/bake-stills.mjs`)
})

test("every layer and thumbnail in the manifest is a bundled file in the still require table", () => {
  const table = readFileSync(join(HERE, "stillAssets.ts"), "utf8")
  const bundled = new Set([...table.matchAll(/^ {2}"([^"]+)": require\("\.\/layers\/\1\.webp"\),$/gm)].map((m) => m[1]!))
  const expected = BODIES.flatMap((rig) => {
    const body = AVATAR_STILL_MANIFEST.bodies[rig]
    // a composed leg is drawn from a shared sheet (`source.key`), one file per bottom and leg
    const file = (l: { key: string; source?: { key: string } }) => l.source?.key ?? l.key
    return [...new Set([...body.layers.full.map((l) => `${rig}/full/${file(l)}`), ...body.layers.bust.map((l) => `${rig}/bust/${file(l)}`)]),
      ...Object.values(body.items).map((item) => `${rig}/thumb/${item.thumb}`),
      // front (showcase) art: the base, each item's front layer and the part drawn behind the body (hair back)
      ...(body.showcaseBase ? [`${rig}/showcase/${body.showcaseBase.key}`] : []),
      ...Object.values(body.items).flatMap((item) => (item.showcase ? [`${rig}/showcase/${item.showcase.key}`, ...(item.showcase.back ? [`${rig}/showcase/${item.showcase.back.key}`] : [])] : []))]
  })
  assert.deepEqual([...bundled].sort(), [...expected].sort())
  for (const key of expected) assert.ok(existsSync(join(HERE, "layers", `${key}.webp`)), key)
})

// review R4: walks the art map (not the economy catalog, which still holds the old items until X15)
test("every item with rig art has full layers, its bust layers and a thumbnail", () => {
  for (const { rig, itemId } of listAvatarItemArt()) {
    const body = AVATAR_STILL_MANIFEST.bodies[rig]
    assert.ok(body.items[itemId], `${rig} ${itemId} is baked`)
    const full = body.layers.full.filter((l) => l.owner === itemId)
    assert.ok(full.length > 0, `${rig} ${itemId} has full layers`)
    const [bx, by, bw, bh] = body.windows.bust
    const inBust = full.filter(({ rect: [x, y, w, h] }) => x < bx + bw && x + w > bx && y < by + bh && y + h > by).map((l) => l.key)
    const bust = body.layers.bust.filter((l) => l.owner === itemId).map((l) => l.key)
    assert.deepEqual(bust.sort(), inBust.sort(), `${rig} ${itemId}: a bust layer for every full layer in the bust window`)
  }
})

/** The live draw order of a loadout as (owner, order, leg variant) groups, from compileAvatar's own entries. */
function liveGroups(loadout: unknown) {
  const spec = resolveAvatarDraw(RIGS, { loadout, state: "idle", direction: "front" })
  const canonical = Object.fromEntries(listAvatarItemArt().filter((a) => a.rig === spec.rig).map((a) => [a.rigItemId, a.itemId]))
  const groups: string[] = []
  for (const entry of avatar25StandEntries(RIGS[spec.rig], "front", spec.itemIds)) {
    const owner = entry.owner === "body" ? "body" : canonical[entry.owner]
    const key = `${owner}|${entry.order}|${entry.legVariant ?? ""}`
    if (groups[groups.length - 1] !== key) groups.push(key)
  }
  return { rig: spec.rig, groups }
}

test("a still stacks its layers in exactly the order the live renderer draws frame 0, for both bodies", () => {
  const girl = { ...DEFAULT_FEMALE_AVATAR_LOADOUT, hairId: "avatar_v2_hair_ink_pageboy_star", topId: "avatar_v2_top_coral_wave_polo" }
  // the girl's pieces that draw body ranges (avatar25BodySwap): each alone, mixed with each other and with her starter
  const [whiteCrop, blackCrop] = GIRL_WARDROBE_PREVIEW_ITEM_IDS.top
  const [trousers] = GIRL_WARDROBE_PREVIEW_ITEM_IDS.bottom
  const loadouts: unknown[] = [DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT, undefined, { bodyId: "x" }, girl,
    { ...girl, topId: whiteCrop }, { ...girl, topId: blackCrop }, { ...girl, bottomId: trousers },
    { ...girl, topId: whiteCrop, bottomId: trousers }, { ...girl, topId: blackCrop, bottomId: trousers }]
  for (const loadout of loadouts) {
    const live = liveGroups(loadout)
    const still = resolveAvatarStillLayers(loadout, "full")
    assert.equal(still.rig, live.rig)
    const body = AVATAR_STILL_MANIFEST.bodies[still.rig]
    const groups = still.layers.map((layer) => {
      const entry = body.layers.full.find((l) => `${still.rig}/full/${l.source?.key ?? l.key}` === layer.asset &&
        (l.source === undefined || JSON.stringify(l.source.rect) === JSON.stringify(layer.source?.rect)))!
      return `${entry.owner}|${entry.order}|${entry.legVariant ?? ""}`
    })
    assert.deepEqual(groups, live.groups, JSON.stringify(loadout))
  }
})
