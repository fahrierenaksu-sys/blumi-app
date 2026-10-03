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

type Element = { type: unknown; props: Record<string, unknown> }

function mount(layers: RoomV2AvatarRenderLayer[], allowDownscaling?: boolean) {
  const runtime = createFakeReactRuntime()
  const activeClocks: boolean[] = []
  const memoComparators = new Map<unknown, (a: Record<string, unknown>, b: Record<string, unknown>) => boolean>()
  const layerProps: { type: unknown; props: Record<string, unknown> }[] = []
  runtime.react.memo = <T>(component: T, comparator?: (a: Record<string, unknown>, b: Record<string, unknown>) => boolean) => {
    if (comparator) memoComparators.set(component, comparator)
    return component
  }
  const { RoomAvatarRenderer2D } = loadSourceWithFakeReact<typeof RendererModule>(
    "features/avatarV2/room/components/RoomAvatarRenderer2D.tsx", runtime, {
      modules: {
        "react-native": createReactNativeStub({ PixelRatio: { roundToNearestPixel: (n: number) => n } }).module,
        "expo-image": { Image: "ExpoImage" },
        "react-native-reanimated": {
          ...createReanimatedStub(runtime).module,
          useFrameCallback: () => ({ setActive: (active: boolean) => activeClocks.push(active) })
        },
        "../../../../ui/animations": { useReducedMotion: () => false }
      },
      real: ["../roomAvatarLayerRenderModel", "../../../roomV2/components/roomAvatarBodyMotionModel"],
      inertUnknown: true
    }
  )
  const expand = (node: unknown): Element[] => {
    if (Array.isArray(node)) return node.flatMap(expand)
    if (!node || typeof node !== "object") return []
    const element = node as Element
    if (typeof element.type === "function") {
      if (memoComparators.has(element.type)) layerProps.push(element)
      return expand(element.type(element.props))
    }
    return [element, ...expand(element.props?.children)]
  }
  const render = () => runtime.render(() => expand(RoomAvatarRenderer2D({ layers, allowDownscaling } as never)))
  return { runtime, render, activeClocks, memoComparators, layerProps }
}

const staticLayer: RoomV2AvatarRenderLayer = {
  id: "example-top", type: "top", layerOrder: 20,
  asset: { key: "example-static", source: 101 }, fitProfileId: "blumi_female_room_avatar_v1"
}

test("a transform-scaled avatar can keep full source resolution without changing source, fit or image transitions", () => {
  for (const allowDownscaling of [true, false]) {
    const f = mount([staticLayer], allowDownscaling)
    const images = f.render().filter(({ type }) => type === "ExpoImage")
    assert.equal(images.length, 1)
    assert.equal(images[0]!.props.allowDownscaling, allowDownscaling)
    assert.equal(images[0]!.props.source, staticLayer.asset.source)
    assert.equal(images[0]!.props.contentFit, "contain")
    assert.equal(images[0]!.props.transition, 0)
    assert.deepEqual(f.activeClocks, [false], "static quality does not start an animation clock")
    f.runtime.unmount()
  }
  const defaultSurface = mount([staticLayer])
  assert.equal(defaultSurface.render().find(({ type }) => type === "ExpoImage")!.props.allowDownscaling, true,
    "thumbnail and shop callers retain their default memory policy")
  defaultSurface.runtime.unmount()
})

test("changing decode quality reaches an existing memoized layer without replacing its asset", () => {
  const f = mount([staticLayer], true)
  f.render()
  const layer = f.layerProps[0]!
  const compare = f.memoComparators.get(layer.type)!
  assert.equal(compare(layer.props, { ...layer.props }), true)
  assert.equal(compare(layer.props, { ...layer.props, allowDownscaling: false }), false,
    "the quality option must reach the existing native image")
  f.runtime.unmount()
})

test("full-resolution mode preserves retained animation frames and atlas crop placement across layout", () => {
  const animated: RoomV2AvatarRenderLayer = {
    ...staticLayer,
    animation: { frames: [staticLayer.asset, { key: "example-next", source: 102 }], frameDurationMs: 120, loop: true }
  }
  const crop = {
    canvasWidth: 256, canvasHeight: 384, x: 80, y: 120, width: 72, height: 96,
    atlasX: 180, atlasY: 100, atlasWidth: 512, atlasHeight: 512, sourceName: "example-crop"
  }
  const atlasLayer = { ...staticLayer, id: "example-atlas", asset: { key: "example-atlas", source: 201, crop } }
  const f = mount([animated, atlasLayer], false)
  const root = f.render().find(({ props }) => typeof props.onLayout === "function")!
  ;(root.props.onLayout as (event: unknown) => void)({ nativeEvent: { layout: { width: 74, height: 108 } } })
  const images = (f.runtime.output as Element[]).filter(({ type }) => type === "ExpoImage")
  assert.deepEqual(images.map(({ props }) => props.source), [101, 102, 201])
  assert.ok(images.every(({ props }) => props.allowDownscaling === false))
  assert.deepEqual(images.map(({ props }) => props.contentFit), ["contain", "contain", "fill"])
  const atlasStyle = (images[2]!.props.style as Record<string, unknown>[])[1]!
  assert.ok((atlasStyle.width as number) > 0 && (atlasStyle.height as number) > 0)
  assert.equal(f.activeClocks.every(Boolean), true, "the same motion clock stays active")
  f.runtime.unmount()
})
