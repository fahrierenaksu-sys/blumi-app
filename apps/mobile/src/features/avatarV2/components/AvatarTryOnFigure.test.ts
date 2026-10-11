import assert from "node:assert/strict"
import test from "node:test"
import { AVATAR_STILL_MANIFEST, DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT } from "@blumi/domain"
import { avatarTryOnRenderer } from "../../avatar/model/avatarTryOnModel"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"

// Phase 4 4.1 (lane G): the Wardrobe stage, Shop preview and avatar setup draw the tried-on look as static images:
// the showcase figure when the 2.5D art covers it, otherwise the old drawing for the whole figure. No canvas.

interface Element {
  type: unknown
  props: Record<string, unknown> & { children?: unknown }
}

function AvatarShowcase() {
  return null
}
function RoomAvatarRenderer2D() {
  return null
}

function find(node: unknown, type: unknown): Element | undefined {
  if (!node || typeof node !== "object") return undefined
  if (Array.isArray(node)) return node.map((child) => find(child, type)).find(Boolean)
  const element = node as Element
  if (element.type === type) return element
  if (typeof element.type === "function" && element.type !== AvatarShowcase && element.type !== RoomAvatarRenderer2D) {
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

function mountFigure() {
  const runtime = createFakeReactRuntime()
  const legacyLooks: unknown[] = []
  const { AvatarTryOnFigure } = loadSourceWithFakeReact<{ AvatarTryOnFigure: (props: Record<string, unknown>) => unknown }>(
    "features/avatarV2/components/AvatarTryOnFigure.tsx",
    runtime,
    {
      modules: {
        "../../avatar/components/AvatarShowcase": { AvatarShowcase },
        "../../avatar/model/avatarTryOnModel": { avatarTryOnRenderer },
        "../avatarV2Catalog": { AVATAR_V2_CATALOG: [] },
        "../room/avatarRoomCatalog": { ROOM_AVATAR_CATALOG: [] },
        "../room/avatarRoomProjection": {
          projectAvatarV2ToRoomAvatarAppearance: (input: { avatar: unknown }) => {
            legacyLooks.push(input.avatar)
            return { appearance: input.avatar }
          }
        },
        "../room/avatarRoomSelectors": { getRoomAvatarRenderLayers: (input: { appearance: unknown }) => [input.appearance] },
        "../room/components/RoomAvatarRenderer2D": { RoomAvatarRenderer2D }
      }
    }
  )
  return {
    legacyLooks,
    render: (props: Record<string, unknown>) => runtime.render(() => AvatarTryOnFigure(props))
  }
}

test("a look the 2.5D art covers is the showcase figure of exactly that look, in the surface's box", () => {
  const figure = mountFigure()
  const output = figure.render({ avatar: GIRL_2_5D, width: 200, height: 300, accessibilityLabel: "Karakterim" })
  const showcase = find(output, AvatarShowcase)
  assert.ok(showcase, "drawn by AvatarShowcase")
  assert.equal(showcase.props.loadout, GIRL_2_5D)
  assert.equal(showcase.props.crop, "card")
  assert.equal(showcase.props.fallbackCrop, "full", "without front art the whole 3/4 figure stands in")
  assert.equal(showcase.props.width, 200)
  assert.equal(showcase.props.height, 300)
  assert.equal(showcase.props.accessibilityLabel, "Karakterim")
  for (const liveProp of ["liveScope", "liveActive", "waveSignal"]) assert.equal(liveProp in showcase.props, false)
  assert.equal(find(output, RoomAvatarRenderer2D), undefined)
})

test("trying on an old piece draws that piece (old drawing, whole figure), never the 2.5D starter in its place", () => {
  const figure = mountFigure()
  const look = { ...GIRL_2_5D, topId: DEFAULT_FEMALE_AVATAR_LOADOUT.topId }
  const output = figure.render({ avatar: look, width: 200, height: 300, accessibilityLabel: "Karakterim" })
  assert.equal(find(output, AvatarShowcase), undefined)
  const legacy = find(output, RoomAvatarRenderer2D)
  assert.ok(legacy, "the old drawing")
  assert.ok(figure.legacyLooks.length > 0)
  for (const drawn of figure.legacyLooks) assert.equal(drawn, look, "the old drawing gets the tried-on look itself")
})

test("the boy before his 2.5D pieces land keeps his old dressed drawing, not a bald base", () => {
  const output = mountFigure().render({ avatar: DEFAULT_MALE_AVATAR_LOADOUT, width: 200, height: 300, accessibilityLabel: "x" })
  assert.equal(find(output, AvatarShowcase), undefined)
  assert.ok(find(output, RoomAvatarRenderer2D))
})
