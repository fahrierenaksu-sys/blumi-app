import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../../../../testing/hookHarness"
import { createClockedReanimatedStub, findElements, styleValue, type RenderedElement } from "../../../../testing/reanimatedClock"
import type { RoomV2AvatarRenderLayer } from "../../../roomV2/roomV2.types"
import type * as RendererModule from "./RoomAvatarRenderer2D"

type RendererProps = Parameters<typeof RendererModule.RoomAvatarRenderer2D>[0]

/**
 * Mounts the renderer against the clocked Reanimated stub. The frame clock is
 * driven by hand (`tick`), and an image "displays" when the test says so,
 * as expo-image's onDisplay would after decoding.
 */
function mount(initial: RendererProps) {
  const runtime = createFakeReactRuntime()
  const reanimated = createClockedReanimatedStub(runtime)
  const clock = { callback: undefined as ((frame: { timestamp: number }) => void) | undefined, active: [] as boolean[] }
  const useSharedValue = reanimated.module.useSharedValue as <T>(initial: T) => { value: T }
  const { RoomAvatarRenderer2D } = loadSourceWithFakeReact<typeof RendererModule>(
    "features/avatarV2/room/components/RoomAvatarRenderer2D.tsx", runtime, {
      modules: {
        "react-native": createReactNativeStub({ PixelRatio: { roundToNearestPixel: (n: number) => n } }).module,
        "expo-image": { Image: "ExpoImage" },
        "react-native-reanimated": {
          ...reanimated.module,
          useSharedValue: <T>(value: T) => {
            const shared = useSharedValue(value) as { value: T; modify?: (update: (current: T) => T) => void }
            shared.modify ??= (update) => { shared.value = update(shared.value) }
            return shared
          },
          useFrameCallback: (callback: (frame: { timestamp: number }) => void) => {
            clock.callback = callback
            return { setActive: (active: boolean) => clock.active.push(active) }
          }
        },
        "react-native-worklets": reanimated.worklets,
        "../../../../ui/animations": { useReducedMotion: () => false }
      },
      real: ["../roomAvatarLayerRenderModel", "../../../roomV2/components/roomAvatarBodyMotionModel"],
      inertUnknown: true
    }
  )
  let props = initial
  const expand = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(expand)
    if (!node || typeof node !== "object" || !("props" in node)) return node
    const element = node as RenderedElement
    if (typeof element.type === "function") return expand((element.type as (p: unknown) => unknown)(element.props))
    return { ...element, props: { ...element.props, children: expand(element.props.children) } }
  }
  runtime.render(() => expand(RoomAvatarRenderer2D(props as never)))
  const images = () => findElements(runtime.output, ({ type }) => type === "ExpoImage")
  const imageOf = (source: number) => {
    const found = images().find(({ props: image }) => image.source === source)
    assert.ok(found, `image ${source} is mounted`)
    return found
  }
  return {
    runtime,
    images,
    /** Sources on screen now: an image's wrapper is fully opaque. */
    visible: () => findElements(runtime.output, ({ type }) => type === "Animated.View")
      .filter((view) => styleValue(view, "opacity") === 1)
      .flatMap((view) => findElements(view.props.children, ({ type }) => type === "ExpoImage"))
      .map(({ props: image }) => image.source as number)
      .sort((a, b) => a - b),
    display: (source: number) => (imageOf(source).props.onDisplay as () => void)(),
    fail: (source: number) => (imageOf(source).props.onError as () => void)(),
    tick: (timestamp: number) => {
      if (clock.active.at(-1)) clock.callback?.({ timestamp })
    },
    clockActive: () => clock.active.at(-1) === true,
    update: (next: Partial<RendererProps>) => {
      props = { ...props, ...next }
      runtime.rerender()
    }
  }
}

function still(id: string, type: string, layerOrder: number, source: number): RoomV2AvatarRenderLayer {
  return { id, type, layerOrder, asset: { key: `${id}-${source}`, source }, fitProfileId: "blumi_female_room_avatar_v1" }
}

function moving(id: string, type: string, layerOrder: number, sources: number[]): RoomV2AvatarRenderLayer {
  const frames = sources.map((source) => ({ key: `${id}-${source}`, source }))
  return {
    ...still(id, type, layerOrder, sources[0]!),
    animation: { frames: frames as [typeof frames[number], ...typeof frames], frameDurationMs: 120, loop: true }
  }
}

test("a first walk never tears: body and top change frames together, only once both have drawn", () => {
  let shownCount = 0
  const f = mount({
    layers: [moving("body", "base", 1, [11, 12]), moving("top", "top", 20, [21, 22])],
    onAllLayersShown: () => { shownCount += 1 }
  })
  assert.equal(f.clockActive(), true)
  f.tick(0)
  assert.deepEqual(f.visible(), [], "nothing is drawn before the avatar is complete")
  f.display(11)
  f.tick(16)
  assert.deepEqual(f.visible(), [], "a body without its clothes never shows")
  f.display(21)
  f.tick(32)
  assert.deepEqual(f.visible(), [11, 21])
  assert.equal(shownCount, 1)

  f.display(12)
  f.tick(130)
  assert.deepEqual(f.visible(), [11, 21], "the body waits for the top's next frame")
  f.display(22)
  f.tick(146)
  assert.deepEqual(f.visible(), [12, 22])
  f.tick(250)
  assert.deepEqual(f.visible(), [11, 21], "drawn frames loop together")
  assert.equal(shownCount, 1, "the same walk is reported once")
  f.runtime.unmount()
})

test("a still avatar appears whole, and an outfit change swaps without a bare frame", () => {
  const shownLayers: string[] = []
  const f = mount({
    layers: [still("body", "base", 1, 11), still("old-top", "top", 20, 21)],
    onLayerDisplay: (id) => shownLayers.push(id)
  })
  assert.equal(f.clockActive(), false, "a still look runs no frame clock")
  f.display(11)
  assert.deepEqual(f.visible(), [])
  f.display(21)
  assert.deepEqual(f.visible(), [11, 21])
  assert.deepEqual(shownLayers, ["base:body", "top:old-top"])

  f.update({ layers: [still("body", "base", 1, 11), still("new-top", "top", 20, 31)] })
  assert.deepEqual(f.visible(), [11, 21], "the old top stays until the new one has drawn")
  f.display(31)
  assert.deepEqual(f.visible(), [11, 31])
  assert.deepEqual(f.images().map(({ props }) => props.source).sort(), [11, 31], "the old top is unmounted")
  f.runtime.unmount()
})

test("a broken image never holds the rest of the avatar back", () => {
  let errors = 0
  const f = mount({
    layers: [still("body", "base", 1, 11), still("top", "top", 20, 21)],
    onImageError: () => { errors += 1 }
  })
  f.display(11)
  f.fail(21)
  assert.ok(f.visible().includes(11), "the body shows; the failed top simply draws nothing")
  assert.equal(errors, 1)
  f.runtime.unmount()
})

test("idle stays mounted through a walk and returns at once; walk frames unmount after it", () => {
  const idle = [still("body", "base", 1, 11)]
  const f = mount({ layers: idle })
  f.display(11)
  assert.deepEqual(f.visible(), [11])

  f.update({ layers: [moving("body", "base", 1, [12, 13])] })
  f.tick(0)
  assert.deepEqual(f.visible(), [11], "idle holds until the walk's first frame has drawn")
  f.display(12)
  f.display(13)
  f.tick(16)
  assert.deepEqual(f.visible(), [12])
  assert.deepEqual(f.images().map(({ props }) => props.source).sort(), [11, 12, 13])

  f.update({ layers: idle })
  assert.deepEqual(f.visible(), [11], "stopping shows the retained idle pose at once")
  assert.deepEqual(f.images().map(({ props }) => props.source), [11], "only idle stays mounted")
  f.runtime.unmount()
})

test("full-resolution mode reaches every image and atlas crops are placed from layout", () => {
  const crop = {
    canvasWidth: 256, canvasHeight: 384, x: 80, y: 120, width: 72, height: 96,
    atlasX: 180, atlasY: 100, atlasWidth: 512, atlasHeight: 512, sourceName: "example-crop"
  }
  const atlasLayer: RoomV2AvatarRenderLayer = { ...still("atlas", "hair", 30, 201), asset: { key: "atlas", source: 201, crop } }
  const f = mount({ layers: [moving("top", "top", 20, [101, 102]), atlasLayer], allowDownscaling: false })
  const root = findElements(f.runtime.output, ({ props }) => typeof props.onLayout === "function")[0]!
  ;(root.props.onLayout as (event: unknown) => void)({ nativeEvent: { layout: { width: 74, height: 108 } } })
  const images = f.images()
  assert.deepEqual(images.map(({ props }) => props.source), [101, 102, 201])
  assert.ok(images.every(({ props }) => props.allowDownscaling === false && props.transition === 0))
  assert.deepEqual(images.map(({ props }) => props.contentFit), ["contain", "contain", "fill"])
  const atlasStyle = (images[2]!.props.style as Record<string, unknown>[])[1]!
  assert.ok((atlasStyle.width as number) > 0 && (atlasStyle.height as number) > 0)
  f.runtime.unmount()
  const thumbnail = mount({ layers: [still("top", "top", 20, 101)] })
  assert.equal(thumbnail.images()[0]!.props.allowDownscaling, true, "thumbnail callers keep their memory policy")
  thumbnail.runtime.unmount()
})
