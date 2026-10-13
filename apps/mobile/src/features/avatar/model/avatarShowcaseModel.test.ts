import assert from "node:assert/strict"
import test from "node:test"
import {
  AVATAR_STILL_MANIFEST,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  type AvatarStillManifest
} from "@blumi/domain"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createAvatarShowcasePlanCache, planAvatarShowcase, type AvatarShowcasePlan } from "./avatarShowcaseModel"

/** The bundled still table as the app has it (keys of stillAssets.ts; the requires themselves need Metro). */
const AVATAR_STILL_ASSETS: Readonly<Record<string, unknown>> = Object.fromEntries(
  [...readFileSync(join(import.meta.dirname, "../stills/stillAssets.ts"), "utf8").matchAll(/^ {2}"([^"]+)": require\(/gm)].map((m) => [m[1]!, m[1]!])
)

const HAIR = "avatar_v2_hair_ink_pageboy_star"
const TOP = "avatar_v2_top_coral_wave_polo"
const BOTTOM = "avatar_v2_bottom_coral_wave_pants"
const SHOES = "avatar_v2_shoes_mint_ribbon_court_sneakers"
const GIRL_OUTFIT = { ...DEFAULT_FEMALE_AVATAR_LOADOUT, hairId: HAIR, topId: TOP, bottomId: BOTTOM, shoesId: SHOES, accessoryIds: [] }
const CARD_BOX = { width: 300, height: 480 }

/** The baked manifest with front art for the girl: a base and one front layer for each given item. */
function girlWithFront(itemIds: readonly string[]): AvatarStillManifest {
  const female = AVATAR_STILL_MANIFEST.bodies.female
  const items = Object.fromEntries(
    // starting from items without front art: the baked manifest's own front layers are data these tests ignore
    Object.entries(female.items).map(([id, { showcase: _baked, ...item }]) => {
      const order = itemIds.indexOf(id)
      return [id, order < 0 ? item : { ...item, showcase: { key: `${id}__front`, rect: [0, 0, 600, 1400] as const, order: order + 1 } }]
    })
  )
  const showcaseBase = {
    key: "base__front",
    canvas: { width: 600, height: 1440 },
    ground: [300, 1420] as const,
    windows: { card: [0, 0, 600, 1440] as const, head: [150, 0, 300, 300] as const, push: [100, 0, 400, 400] as const }
  }
  return { ...AVATAR_STILL_MANIFEST, bodies: { ...AVATAR_STILL_MANIFEST.bodies, female: { ...female, items, showcaseBase } } }
}

const ALL_FRONT = girlWithFront([SHOES, BOTTOM, TOP, HAIR])

/** Every front layer of the girl is bundled (lane B delivers the art; here the sources are stand-ins). */
const BUNDLED_FRONT: Readonly<Record<string, unknown>> = {
  "female/showcase/base__front": 1,
  ...Object.fromEntries([SHOES, BOTTOM, TOP, HAIR].map((id, index) => [`female/showcase/${id}__front`, index + 2]))
}

function front(plan: AvatarShowcasePlan) {
  assert.equal(plan.kind, "showcase", "expected the front figure")
  if (plan.kind !== "showcase") throw new Error("unreachable")
  return plan
}

test("a whole front look draws as one stack: base first, every layer bundled, inside the box", () => {
  const plan = front(planAvatarShowcase(GIRL_OUTFIT, "card", CARD_BOX, { assets: BUNDLED_FRONT, manifest: ALL_FRONT }))
  assert.equal(plan.frames[0]!.asset, "female/showcase/base__front")
  // the base and each worn item, once
  assert.deepEqual(new Set(plan.frames.slice(1).map((frame) => frame.asset.split("/")[2]!.split("__")[0])), new Set([SHOES, BOTTOM, TOP, HAIR]))
  for (const frame of plan.frames) {
    assert.ok(BUNDLED_FRONT[frame.asset] !== undefined, `${frame.asset} not bundled`)
    assert.ok(frame.left >= -1e-9 && frame.top >= -1e-9, `${frame.asset} starts outside the box`)
    assert.ok(frame.left + frame.width <= CARD_BOX.width + 1e-9 && frame.top + frame.height <= CARD_BOX.height + 1e-9)
  }
})

test("the head crop zooms on the head window: the same base is drawn larger than on the card", () => {
  const card = front(planAvatarShowcase(GIRL_OUTFIT, "card", { width: 80, height: 80 }, { assets: BUNDLED_FRONT, manifest: ALL_FRONT }))
  const head = front(planAvatarShowcase(GIRL_OUTFIT, "head", { width: 80, height: 80 }, { assets: BUNDLED_FRONT, manifest: ALL_FRONT }))
  assert.ok(head.frames[0]!.height > card.frames[0]!.height)
  assert.notEqual(head.cacheKey, card.cacheKey)
})

test("when the resolver falls back, the whole figure is today's 3/4 still in the matching crop", () => {
  // a body without a front base (the boy today): the whole figure is the 3/4 still
  const female = AVATAR_STILL_MANIFEST.bodies.female
  const { showcaseBase: _base, ...femaleWithoutBase } = female
  const noBase: AvatarStillManifest = { ...AVATAR_STILL_MANIFEST, bodies: { ...AVATAR_STILL_MANIFEST.bodies, female: femaleWithoutBase } }
  for (const loadout of [GIRL_OUTFIT, undefined, "nonsense"]) {
    assert.deepEqual(planAvatarShowcase(loadout, "card", CARD_BOX, { assets: BUNDLED_FRONT, manifest: noBase }), { kind: "still", reason: "no-showcase-base", stillCrop: "full" })
    assert.deepEqual(planAvatarShowcase(loadout, "head", { width: 40, height: 40 }, { assets: BUNDLED_FRONT, manifest: noBase }), { kind: "still", reason: "no-showcase-base", stillCrop: "bust" })
  }
  // one worn item without a front layer: no mix, the whole figure falls back
  const mixed = planAvatarShowcase(GIRL_OUTFIT, "card", CARD_BOX, { assets: BUNDLED_FRONT, manifest: girlWithFront([SHOES, BOTTOM, HAIR]) })
  assert.deepEqual(mixed, { kind: "still", reason: "item-without-showcase", stillCrop: "full" })
})

test("a front layer that is not bundled draws the whole 3/4 still instead of a figure with a hole", () => {
  const { [`female/showcase/${TOP}__front`]: _missing, ...withoutTop } = BUNDLED_FRONT
  const plan = planAvatarShowcase(GIRL_OUTFIT, "card", CARD_BOX, { assets: withoutTop, manifest: ALL_FRONT })
  assert.deepEqual(plan, { kind: "still", reason: "missing-asset", stillCrop: "full" })
})

test("planning never throws and never changes the loadout it is given", () => {
  for (const raw of [undefined, null, 42, {}, GIRL_OUTFIT, { ...GIRL_OUTFIT, topId: "avatar_v2_top_made_up" }, DEFAULT_MALE_AVATAR_LOADOUT]) {
    const before = JSON.stringify(raw)
    for (const crop of ["card", "head", "push"] as const) {
      const plan = planAvatarShowcase(raw, crop, CARD_BOX, { assets: BUNDLED_FRONT, manifest: ALL_FRONT })
      assert.ok(plan.kind === "still" || plan.frames.length > 0)
    }
    assert.equal(JSON.stringify(raw), before)
  }
})

test("equal looks in the same crop and box share one plan; another crop or box gets its own", () => {
  const plan = createAvatarShowcasePlanCache()
  const options = { assets: BUNDLED_FRONT, manifest: ALL_FRONT }
  const first = plan(GIRL_OUTFIT, "card", CARD_BOX, options)
  assert.equal(plan({ ...GIRL_OUTFIT }, "card", { ...CARD_BOX }, options), first)
  assert.notEqual(plan(GIRL_OUTFIT, "head", CARD_BOX, options), first)
  assert.notEqual(plan(GIRL_OUTFIT, "card", { width: 200, height: 320 }, options), first)
  assert.ok(Object.isFrozen(first) && first.kind === "showcase" && Object.isFrozen(first.frames[0]))
})

test("the plan cache stays bounded: the oldest look is dropped first", () => {
  const plan = createAvatarShowcasePlanCache(2)
  const options = { assets: BUNDLED_FRONT, manifest: ALL_FRONT }
  const first = plan(GIRL_OUTFIT, "card", { width: 100, height: 100 }, options)
  plan(GIRL_OUTFIT, "card", { width: 101, height: 100 }, options)
  plan(GIRL_OUTFIT, "card", { width: 102, height: 100 }, options)
  const again = plan(GIRL_OUTFIT, "card", { width: 100, height: 100 }, options)
  assert.notEqual(again, first)
  assert.deepEqual(again, first)
})

test("every baked item of both bodies draws its front look from bundled layers", () => {
  const field = { top: "topId", bottom: "bottomId", shoes: "shoesId", hair: "hairId" } as const
  const looks = { female: DEFAULT_FEMALE_AVATAR_LOADOUT, male: DEFAULT_MALE_AVATAR_LOADOUT } as const
  for (const rig of ["female", "male"] as const) {
    const items = Object.entries(AVATAR_STILL_MANIFEST.bodies[rig].items).filter(([, item]) => item.showcase)
    assert.ok(items.length > 0, `${rig}: front art is baked`)
    for (const [itemId, item] of items) {
      const loadout = { ...looks[rig], [field[item.slot as keyof typeof field]]: itemId }
      const plan = planAvatarShowcase(loadout, "card", CARD_BOX, { assets: AVATAR_STILL_ASSETS })
      assert.equal(plan.kind, "showcase", `${rig} ${itemId}: every layer of its look is bundled`)
    }
  }
})

test("a mixed look whose body-under layer is not bundled draws the whole 3/4 still", () => {
  const look = { ...DEFAULT_MALE_AVATAR_LOADOUT, topId: "avatar_v2_top_male_olive_overshirt", bottomId: "avatar_v2_bottom_male_charcoal_trousers" }
  const assets = Object.fromEntries(Object.entries(AVATAR_STILL_ASSETS).filter(([key]) => key !== "male/showcase/avatar_v2_bottom_male_charcoal_trousers__under"))
  assert.equal(planAvatarShowcase(look, "card", CARD_BOX, { assets: AVATAR_STILL_ASSETS }).kind, "showcase")
  const plan = planAvatarShowcase(look, "card", CARD_BOX, { assets })
  assert.equal(plan.kind, "still")
  if (plan.kind === "still") assert.equal(plan.reason, "missing-asset")
})
