import assert from "node:assert/strict"
import test from "node:test"
import { AVATAR_STILL_MANIFEST, DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT } from "@blumi/domain"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../../../testing/hookHarness"

// The showcase surfaces (Discover card, profile and You hero, match moment) draw AvatarShowcase. Until the factory
// delivers front art, every look must be today's 3/4 still exactly as those surfaces drew it before: same loadout,
// crop, box and mirroring, and the same startup receipt.

interface Element {
  type: unknown
  props: Record<string, unknown> & { children?: unknown }
}

function AvatarStill() {
  return null
}
function useStillDisplayReceipts() {
  return () => undefined
}

/** Every layer key resolves to a bundled source: the fallback below comes from the manifest, not a missing file. */
const EVERY_ASSET_BUNDLED = new Proxy({}, { get: () => 1, has: () => true })

function find(node: unknown, type: unknown): Element | undefined {
  if (!node || typeof node !== "object") return undefined
  if (Array.isArray(node)) return node.map((child) => find(child, type)).find(Boolean)
  const element = node as Element
  if (element.type === type) return element
  return find(element.props?.children, type)
}

function mountShowcase() {
  const runtime = createFakeReactRuntime()
  const { AvatarShowcase } = loadSourceWithFakeReact<{ AvatarShowcase: (props: Record<string, unknown>) => unknown }>(
    "features/avatar/components/AvatarShowcase.tsx",
    runtime,
    {
      modules: {
        "react-native": createReactNativeStub().module,
        "expo-image": { Image: "Image" },
        "../stills/stillAssets": { AVATAR_STILL_ASSETS: EVERY_ASSET_BUNDLED },
        "./AvatarStill": { AvatarStill },
        "./useStillDisplayReceipts": { useStillDisplayReceipts }
      },
      real: ["@blumi/domain", "../model/avatarShowcaseModel"]
    }
  )
  let props: Record<string, unknown> = {}
  const render = (next: Record<string, unknown>) => {
    props = next
    return runtime.render(() => AvatarShowcase(props)) as Element
  }
  const rerender = (next: Record<string, unknown>) => {
    props = next
    return runtime.rerender() as Element
  }
  return { render, rerender }
}

const looks = [
  ["the girl starter", DEFAULT_FEMALE_AVATAR_LOADOUT],
  ["the boy starter", DEFAULT_MALE_AVATAR_LOADOUT],
  ["an empty loadout", undefined],
  ["an unreadable loadout", "nonsense"]
] as const

test("with today's art every look on every showcase surface is the 3/4 still the surface drew before", () => {
  assert.ok(AVATAR_STILL_MANIFEST.bodies.female, "the baked manifest is loaded")
  const surfaces = [
    { name: "Discover front", crop: "card", fallbackCrop: "full", width: 184, height: 194, mirror: false, still: "full" },
    { name: "profile hero", crop: "card", fallbackCrop: undefined, width: 190, height: 300, mirror: false, still: "full" },
    { name: "match partner", crop: "card", fallbackCrop: "half", width: 112, height: 168, mirror: true, still: "half" },
    { name: "chat head", crop: "head", fallbackCrop: undefined, width: 40, height: 40, mirror: false, still: "bust" }
  ] as const
  for (const [lookName, loadout] of looks) {
    for (const surface of surfaces) {
      const showcase = mountShowcase()
      const hints = { bodyPreset: "female" }
      const output = showcase.render({
        loadout,
        hints,
        crop: surface.crop,
        fallbackCrop: surface.fallbackCrop,
        width: surface.width,
        height: surface.height,
        mirror: surface.mirror,
        accessibilityLabel: "Defne avatar"
      })
      const still = find(output, AvatarStill)
      assert.ok(still, `${lookName} on the ${surface.name} draws the 3/4 still`)
      assert.equal(find(output, "Image"), undefined, `${lookName} on the ${surface.name} draws no front layer`)
      assert.equal(still.props.loadout, loadout)
      assert.equal(still.props.hints, hints)
      assert.equal(still.props.crop, surface.still)
      assert.equal(still.props.width, surface.width)
      assert.equal(still.props.height, surface.height)
      assert.equal(still.props.mirror, surface.mirror)
      assert.deepEqual(output.props.style, [{ width: surface.width, height: surface.height }, undefined], "the box is the still's box")
    }
  }
})

test("the figure is one accessible image named for the person", () => {
  const output = mountShowcase().render({ loadout: undefined, crop: "card", width: 100, height: 100, accessibilityLabel: "Defne avatar" })
  assert.equal(output.props.accessible, true)
  assert.equal(output.props.accessibilityRole, "image")
  assert.equal(output.props.accessibilityLabel, "Defne avatar")
})

test("an inline display callback keeps one identity, so the drawn figure is reported once, to the latest listener", () => {
  const showcase = mountShowcase()
  const calls: string[] = []
  const base = { loadout: DEFAULT_FEMALE_AVATAR_LOADOUT, crop: "card", width: 100, height: 100, accessibilityLabel: "a" }
  const first = find(showcase.render({ ...base, onDisplay: () => calls.push("first") }), AvatarStill)
  const second = find(showcase.rerender({ ...base, onDisplay: () => calls.push("second") }), AvatarStill)
  assert.equal(typeof first?.props.onDisplay, "function")
  assert.equal(second?.props.onDisplay, first?.props.onDisplay, "a new inline callback does not re-arm the report")
  ;(second?.props.onDisplay as () => void)()
  assert.deepEqual(calls, ["second"])
})

test("a listener that arrives later (a card promoted to the top) is handed down; none means no report", () => {
  const showcase = mountShowcase()
  const base = { loadout: DEFAULT_FEMALE_AVATAR_LOADOUT, crop: "card", width: 100, height: 100, accessibilityLabel: "a" }
  const behind = find(showcase.render(base), AvatarStill)
  assert.equal(behind?.props.onDisplay, undefined)
  const calls: number[] = []
  const onTop = find(showcase.rerender({ ...base, onDisplay: () => calls.push(1), onError: () => calls.push(2) }), AvatarStill)
  ;(onTop?.props.onDisplay as () => void)()
  ;(onTop?.props.onError as () => void)()
  assert.deepEqual(calls, [1, 2])
})

test("a figure without a label is decorative and hands the fallback window to the 3/4 still", () => {
  const window = [52, 28, 160, 160] as const
  const output = mountShowcase().render({
    loadout: DEFAULT_FEMALE_AVATAR_LOADOUT,
    crop: "head",
    fallbackCrop: "bust",
    fallbackWindow: window,
    width: 32,
    height: 32
  })
  assert.equal(output.props.accessible, false)
  assert.equal(output.props.accessibilityRole, undefined)
  const still = find(output, AvatarStill)
  assert.equal(still?.props.crop, "bust")
  assert.deepEqual(still?.props.window, window)
})
