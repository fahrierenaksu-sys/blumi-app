import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_FEMALE_AVATAR_LOADOUT } from "@blumi/domain"
import {
  createFakeReactRuntime,
  createReactNativeStub,
  createReanimatedStub,
  loadSourceWithFakeReact
} from "../../testing/hookHarness"

// Lead decision 2026-10-11: the You and profile hero and every chip outside the room show the showcase still; a live
// avatar exists only inside rooms. Until the look has front art, each draws today's 3/4 still in its old crop.

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
  return find(element.props?.children, type)
}

test("the You hero is the showcase still of the whole figure, named for screen readers, with no live canvas", () => {
  const runtime = createFakeReactRuntime()
  const { ProfileAvatarHero } = loadSourceWithFakeReact<{ ProfileAvatarHero: (props: Record<string, unknown>, ref: unknown) => unknown }>(
    "features/profile/ProfileAvatarHero.tsx",
    runtime,
    {
      modules: {
        "react-native": createReactNativeStub().module,
        "react-native-reanimated": createReanimatedStub(runtime).module,
        "../avatar/components/AvatarShowcase": { AvatarShowcase },
        "./profileMotionModel": { PROFILE_AVATAR_ASPECT: 1.5 },
        "./useOwnAvatarLoadout": { useOwnAvatarLoadout: () => DEFAULT_FEMALE_AVATAR_LOADOUT }
      }
    }
  )
  const output = runtime.render(() => ProfileAvatarHero({ width: 190, accessibilityLabel: "Your character, Defne" }, null))
  const figure = find(output, AvatarShowcase)
  assert.ok(figure, "the hero draws the showcase")
  assert.equal(figure.props.crop, "card")
  assert.equal(figure.props.fallbackCrop, undefined, "the card crop falls back to the whole 3/4 figure, as before")
  assert.equal(figure.props.loadout, DEFAULT_FEMALE_AVATAR_LOADOUT)
  assert.equal(figure.props.width, 190)
  assert.equal(figure.props.height, 285)
  assert.equal(figure.props.accessibilityLabel, "Your character, Defne")
  for (const liveProp of ["liveScope", "liveActive", "waveSignal"]) assert.equal(liveProp in figure.props, false)
})

test("the own chip (Discover, match moment) is the showcase still in the crop it drew before, turned when asked", () => {
  const runtime = createFakeReactRuntime()
  const { MyAvatarStill } = loadSourceWithFakeReact<{ MyAvatarStill: (props: Record<string, unknown>) => unknown }>(
    "ui/myAvatarStill.tsx",
    runtime,
    {
      modules: {
        "react-native": createReactNativeStub().module,
        "../features/avatar/components/AvatarShowcase": { AvatarShowcase },
        "../features/avatarV2/state/AvatarV2Provider": { useAvatarV2: () => ({ avatar: DEFAULT_FEMALE_AVATAR_LOADOUT }) },
        "./theme": { uiTheme: { shadow: { soft: {} } } }
      }
    }
  )
  for (const [crop, mirror] of [["full", false], ["half", true]] as const) {
    const figure = find(runtime.render(() => MyAvatarStill({ name: "Defne", size: 84, ring: "strong", crop, mirror })), AvatarShowcase)
    assert.ok(figure)
    assert.equal(figure.props.crop, "card")
    assert.equal(figure.props.fallbackCrop, crop)
    assert.equal(figure.props.mirror, mirror)
    assert.equal(figure.props.loadout, DEFAULT_FEMALE_AVATAR_LOADOUT)
    assert.equal(figure.props.accessibilityLabel, "Defne avatar")
  }
})
