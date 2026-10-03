import assert from "node:assert/strict"
import test from "node:test"
import {
  createFakeReactRuntime,
  createReactNativeStub,
  createReanimatedStub,
  loadSourceWithFakeReact
} from "../../../../testing/hookHarness"
import type { RoomV2AvatarRenderLayer } from "../../../roomV2/roomV2.types"
import type * as RendererModule from "./RoomAvatarRenderer2D"
import type * as StillModule from "./RoomAvatarStill"
import type * as CacheModule from "../avatarPortraitLayerCache"

type Element = { type: unknown; props: Record<string, unknown> }
type Comparator = (a: Record<string, unknown>, b: Record<string, unknown>) => boolean

const MODEL = ["../roomAvatarLayerRenderModel", "../../../roomV2/components/roomAvatarBodyMotionModel"]
const reactNative = () => createReactNativeStub({ PixelRatio: { roundToNearestPixel: (n: number) => n } }).module

function flatten(node: unknown, expandFunctions: (element: Element) => unknown = () => undefined): Element[] {
  if (Array.isArray(node)) return node.flatMap((child) => flatten(child, expandFunctions))
  if (!node || typeof node !== "object") return []
  const element = node as Element
  if (typeof element.type === "function") return flatten(expandFunctions(element), expandFunctions)
  return [element, ...flatten(element.props?.children, expandFunctions)]
}

function mountStill(layers: readonly RoomV2AvatarRenderLayer[]) {
  const runtime = createFakeReactRuntime()
  const comparators: Comparator[] = []
  runtime.react.memo = <T>(component: T, comparator?: Comparator) => {
    if (comparator) comparators.push(comparator)
    return component
  }
  const module = loadSourceWithFakeReact<typeof StillModule>(
    "features/avatarV2/room/components/RoomAvatarStill.tsx", runtime, {
      modules: { "react-native": reactNative(), "expo-image": { Image: "ExpoImage" } },
      real: MODEL,
      inertUnknown: true
    }
  )
  const render = (next: readonly RoomV2AvatarRenderLayer[] = layers) =>
    runtime.render(() => flatten(module.RoomAvatarStill({ layers: next } as never)))
  return { runtime, render, comparators, module }
}

/** The animated renderer with Reduce Motion on: the frame-0 pose every layer rests in. */
function mountRenderer(layers: readonly RoomV2AvatarRenderLayer[]) {
  const runtime = createFakeReactRuntime()
  const memoComparators = new Map<unknown, Comparator>()
  runtime.react.memo = <T>(component: T, comparator?: Comparator) => {
    if (comparator) memoComparators.set(component, comparator)
    return component
  }
  const { RoomAvatarRenderer2D } = loadSourceWithFakeReact<typeof RendererModule>(
    "features/avatarV2/room/components/RoomAvatarRenderer2D.tsx", runtime, {
      modules: {
        "react-native": reactNative(),
        "expo-image": { Image: "ExpoImage" },
        "react-native-reanimated": {
          ...createReanimatedStub(runtime).module,
          useFrameCallback: () => ({ setActive: () => undefined })
        },
        "../../../../ui/animations": { useReducedMotion: () => true }
      },
      real: MODEL,
      inertUnknown: true
    }
  )
  const expand = (element: Element) => (element.type as (props: unknown) => unknown)(element.props)
  return {
    runtime,
    render: () => runtime.render(() => flatten(RoomAvatarRenderer2D({ layers } as never), expand))
  }
}

const base = (id: string, type: string, source: number): RoomV2AvatarRenderLayer => ({
  id, type: type as RoomV2AvatarRenderLayer["type"], layerOrder: 1,
  asset: { key: `${id}-asset`, source }, fitProfileId: "blumi_female_room_avatar_v1"
})
const crop = {
  canvasWidth: 256, canvasHeight: 384, x: 80, y: 120, width: 72, height: 96,
  atlasX: 180, atlasY: 100, atlasWidth: 512, atlasHeight: 512, sourceName: "example-crop"
}
const portraitLayers = (): RoomV2AvatarRenderLayer[] => [
  base("back", "hairBack", 1),
  base("body", "base", 2),
  {
    ...base("blink", "eyes", 3),
    animation: { frames: [{ key: "blink-0", source: 3 }, { key: "blink-1", source: 4 }], frameDurationMs: 120, loop: true }
  },
  { ...base("atlas", "top", 5), asset: { key: "atlas-asset", source: 5, crop } },
  base("front", "hairFront", 6)
]

const isImage = ({ type }: Element) => type === "ExpoImage"
const layoutEvent = { nativeEvent: { layout: { width: 30, height: 39 } } }

test("a still portrait draws the same layers, order and positions as the animated renderer's idle frame", () => {
  const layers = portraitLayers()
  const still = mountStill(layers)
  const animated = mountRenderer(layers)
  for (const f of [still, animated]) {
    const root = f.render().find(({ props }) => typeof props.onLayout === "function")!
    ;(root.props.onLayout as (event: unknown) => void)(layoutEvent)
  }
  const stillImages = (still.runtime.output as Element[]).filter(isImage)
  const idleImages = (animated.runtime.output as Element[]).filter(isImage)
  // The animated renderer keeps every retained pose; only the visible frame 0 counts.
  const idleFrameZero = idleImages.filter(({ props }) => props.source !== 4)
  assert.deepEqual(stillImages.map(({ props }) => props.source), idleFrameZero.map(({ props }) => props.source))
  assert.deepEqual(stillImages.map(({ props }) => props.source), [1, 2, 3, 5, 6])
  assert.deepEqual(stillImages.map(({ props }) => props.contentFit), idleFrameZero.map(({ props }) => props.contentFit))
  const stillAtlas = stillImages.find(({ props }) => props.contentFit === "fill")!.props.style as Record<string, unknown>[]
  const idleAtlas = idleFrameZero.find(({ props }) => props.contentFit === "fill")!.props.style as Record<string, unknown>[]
  assert.deepEqual(stillAtlas[1], idleAtlas[1], "the atlas crop lands where the animated renderer puts it")
  assert.ok(stillImages.every(({ props }) => props.transition === 0 && props.allowDownscaling === false))
  still.runtime.unmount()
  animated.runtime.unmount()
})

test("the same look with new object identities is neither re-keyed nor redrawn", () => {
  const f = mountStill(portraitLayers())
  const [compare] = f.comparators
  assert.ok(compare)
  const first = portraitLayers()
  const second = portraitLayers()
  assert.notEqual(first, second)
  assert.equal(f.module.getRoomAvatarStillKey(first), f.module.getRoomAvatarStillKey(second))
  assert.equal(f.module.getRoomAvatarStillLayers(first), f.module.getRoomAvatarStillLayers(second),
    "equal looks share one resolved layer list")
  assert.equal(compare!({ layers: first }, { layers: second }), true)
  const changed = portraitLayers()
  changed[1] = base("body", "base", 99)
  assert.equal(compare!({ layers: first }, { layers: changed }), false, "a different image does redraw")
  const reordered = portraitLayers().reverse()
  assert.equal(compare!({ layers: first }, { layers: reordered }), false, "a different order does redraw")
  f.runtime.unmount()
})

test("portrait layers are resolved once per loadout content, not per avatar object", () => {
  const runtime = createFakeReactRuntime()
  let resolved = 0
  const { getCachedAvatarPortraitLayers } = loadSourceWithFakeReact<typeof CacheModule>(
    "features/avatarV2/room/avatarPortraitLayerCache.ts", runtime, {
      modules: {
        "./avatarPortraitLayers": {
          resolveAvatarPortraitRenderLayers: () => {
            resolved += 1
            return portraitLayers()
          }
        }
      }
    }
  )
  const loadout = (hair: string) => ({ schemaVersion: 2, bodyId: "body", hairId: hair, accessoryIds: ["a"] }) as never
  const first = getCachedAvatarPortraitLayers(loadout("hair-1"))
  const again = getCachedAvatarPortraitLayers(loadout("hair-1"))
  assert.equal(again, first)
  assert.equal(resolved, 1)
  assert.notEqual(getCachedAvatarPortraitLayers(loadout("hair-2")), first)
  assert.equal(resolved, 2)
})
