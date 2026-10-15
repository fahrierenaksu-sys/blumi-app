import assert from "node:assert/strict"
import test from "node:test"
import { AVATAR_STILL_MANIFEST, DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT } from "@blumi/domain"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"

// The Wardrobe stage, Shop preview and avatar setup draw the tried-on look as static images: always the 2.5D showcase
// figure. The pre-2.5D drawing is retired (its art is gone), so no look may fall back to it or draw a blank figure.

interface Element {
  type: unknown
  props: Record<string, unknown> & { children?: unknown }
}

function AvatarShowcase() {
  return null
}

function find(node: unknown, type: unknown): Element | undefined {
  if (!node || typeof node !== "object") return undefined
  if (Array.isArray(node)) return node.map((child) => find(child, type)).find(Boolean)
  const element = node as Element
  if (element.type === type) return element
  if (typeof element.type === "function" && element.type !== AvatarShowcase) {
    return find((element.type as (props: unknown) => unknown)(element.props), type)
  }
  return find(element.props?.children, type)
}

const starter = AVATAR_STILL_MANIFEST.bodies.female.starter
const GIRL_2_5D = {
  ...DEFAULT_FEMALE_AVATAR_LOADOUT,
  hairId: starter.hair!,
  topId: starter.top!,
  bottomId: starter.bottom!,
  shoesId: starter.shoes!,
  accessoryIds: []
}

function renderFigure(props: Record<string, unknown>) {
  const runtime = createFakeReactRuntime()
  const { AvatarTryOnFigure } = loadSourceWithFakeReact<{ AvatarTryOnFigure: (props: Record<string, unknown>) => unknown }>(
    "features/avatarV2/components/AvatarTryOnFigure.tsx",
    runtime,
    { modules: { "../../avatar/components/AvatarShowcase": { AvatarShowcase } } }
  )
  return runtime.render(() => AvatarTryOnFigure(props))
}

test("a look the 2.5D art covers is the showcase figure of exactly that look, in the surface's box", () => {
  const output = renderFigure({ avatar: GIRL_2_5D, width: 200, height: 300, accessibilityLabel: "Karakterim" })
  const showcase = find(output, AvatarShowcase)
  assert.ok(showcase, "drawn by AvatarShowcase")
  assert.equal(showcase.props.loadout, GIRL_2_5D)
  assert.equal(showcase.props.crop, "card")
  assert.equal(showcase.props.fallbackCrop, "full", "without front art the whole 3/4 figure stands in")
  assert.equal(showcase.props.width, 200)
  assert.equal(showcase.props.height, 300)
  assert.equal(showcase.props.accessibilityLabel, "Karakterim")
  for (const liveProp of ["liveScope", "liveActive", "waveSignal"]) assert.equal(liveProp in showcase.props, false)
})

test("a look holding a retired pre-2.5D piece still draws the 2.5D figure, never a blank or the retired drawing", () => {
  // An owned old item (retired, art removed) reaches try-on only from a stored look; the showcase reads it as the
  // body's starter piece for that slot, the same as every room and portrait.
  for (const look of [
    { ...GIRL_2_5D, topId: "avatar_v2_top_blush_lace_cardigan" },
    { ...GIRL_2_5D, dressId: "avatar_v2_top_boho_patchwork_maxi_dress" },
    { ...GIRL_2_5D, eyesId: "avatar_v2_eyes_sage_glass" },
    { ...DEFAULT_MALE_AVATAR_LOADOUT, topId: "avatar_v2_top_male_cream_basic_tee" }
  ]) {
    const showcase = find(renderFigure({ avatar: look, width: 120, height: 180, accessibilityLabel: "x" }), AvatarShowcase)
    assert.ok(showcase, "drawn by AvatarShowcase")
    assert.equal(showcase.props.loadout, look, "the look is passed through untouched; drawing never changes it")
  }
})

test("the boy's starter (curls + basic_a) draws as his 2.5D showcase figure", () => {
  const output = renderFigure({ avatar: DEFAULT_MALE_AVATAR_LOADOUT, width: 200, height: 300, accessibilityLabel: "x" })
  assert.ok(find(output, AvatarShowcase))
})
