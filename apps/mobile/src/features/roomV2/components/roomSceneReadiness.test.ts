import assert from "node:assert/strict"
import test, { mock } from "node:test"
import {
  createFakeReactRuntime,
  createReactNativeStub,
  createReanimatedStub,
  loadSourceWithFakeReact
} from "../../../testing/hookHarness"
import { findElements, type RenderedElement } from "../../../testing/reanimatedClock"
import type { RoomShell, RoomV2RenderItem } from "../roomV2.types"
import { getRoomSceneReadinessKeys } from "./roomSceneReadiness"
import type * as RendererModule from "./RoomRenderer2D"
import type * as VeilModule from "./MyRoomStageVeil"

const shell = {
  id: "example-shell",
  asset: { key: "example-shell", source: 1 },
  canvasSize: { width: 1254, height: 714 }
} as unknown as RoomShell

function furniture(renderId: string, source: number, shadowSource?: number): RoomV2RenderItem {
  return {
    kind: "furniture", renderId, itemId: renderId, name: renderId, category: "table", layer: "floor", depth: 1,
    x: 0.5, y: 0.5, width: 0.2, height: 0.2, anchor: { x: 0.5, y: 1 },
    asset: { key: renderId, source },
    ...(shadowSource ? { contactShadowAsset: { key: `${renderId}-shadow`, source: shadowSource } } : {})
  } as unknown as RoomV2RenderItem
}

const avatar = {
  kind: "avatar", renderId: "example-avatar", avatarId: "example-avatar", layer: "floor", depth: 2,
  x: 0.4, y: 0.6, width: 0.1, height: 0.3, anchor: { x: 0.5, y: 1 }, layers: [], state: "idle", direction: "front"
} as unknown as RoomV2RenderItem

test("a scene needs its shell, the furniture and avatars it draws, and the shadows it draws", () => {
  const items = [furniture("table", 10, 11), furniture("lamp", 20), avatar]
  assert.deepEqual(
    getRoomSceneReadinessKeys({ renderItems: items, drawsContactShadows: false }).sort(),
    ["avatar:example-avatar", "furniture:lamp", "furniture:table", "shell"]
  )
  assert.deepEqual(
    getRoomSceneReadinessKeys({ renderItems: items, drawsContactShadows: true, hiddenRenderIds: new Set(["table"]) }).sort(),
    ["avatar:example-avatar", "furniture:lamp", "shadow:table", "shell"],
    "an item another layer draws is not this scene's, but its floor shadow is"
  )
})

function mountRenderer(props: Record<string, unknown>) {
  const runtime = createFakeReactRuntime()
  const { RoomRenderer2D } = loadSourceWithFakeReact<typeof RendererModule>(
    "features/roomV2/components/RoomRenderer2D.tsx", runtime, {
      modules: {
        "react-native": createReactNativeStub().module,
        "react-native-reanimated": createReanimatedStub(runtime).module,
        "react-native-worklets": { scheduleOnRN: (callback: () => void) => callback() },
        "expo-image": { Image: "ExpoImage" },
        "./RoomRendererAvatarBody": { RoomRendererAvatarBody: "AvatarBody" },
        "./RoomRendererLiveAvatarFrame": {
          RoomRendererLiveAvatarFrame: "LiveFrame",
          RoomRendererLiveAvatarLayoutContext: { Provider: "Provider" }
        },
        "./useRoomRendererLoops": {
          useRoomRendererAvatarLoops: () => ({
            breathe: { value: 0 }, walk: { value: 0 }, gesture: { value: 0 }, usesIdleBreathe: false
          }),
          useRoomRendererScreenFocused: () => true
        },
        "../../../ui/animations": { useReducedMotion: () => false },
        "../../../config/env": { IS_BLUMI_ROOM_VNEXT_RUNTIME_PROOF: false },
        "./roomSceneReadiness": loadSourceWithFakeReact("features/roomV2/components/roomSceneReadiness.ts", runtime)
      },
      inertUnknown: true
    }
  )
  const expand = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(expand)
    if (!node || typeof node !== "object" || !("props" in node)) return node
    const element = node as RenderedElement
    if (typeof element.type === "function") return expand((element.type as (p: unknown) => unknown)(element.props))
    return { ...element, props: { ...element.props, children: expand(element.props.children) } }
  }
  runtime.render(() => expand(RoomRenderer2D(props as never)))
  const image = (source: number) => {
    const found = findElements(runtime.output, ({ type, props: p }) => type === "ExpoImage" && p.source === source)[0]
    assert.ok(found, `image ${source} is drawn`)
    return found.props
  }
  return {
    runtime,
    images: () => findElements(runtime.output, ({ type }) => type === "ExpoImage"),
    display: (source: number) => (image(source).onDisplay as () => void)(),
    fail: (source: number) => (image(source).onError as () => void)(),
    avatarShown: () => {
      const body = findElements(runtime.output, ({ type }) => type === "AvatarBody")[0]
      assert.ok(body)
      ;(body.props.onAllLayersShown as () => void)()
    }
  }
}

test("the room reports ready once, only when the shell, every piece and the avatar are on screen", () => {
  let ready = 0
  const r = mountRenderer({
    shell, renderItems: [furniture("table", 10), furniture("lamp", 20), avatar], onSceneReady: () => { ready += 1 }
  })
  r.display(1)
  r.display(10)
  r.avatarShown()
  assert.equal(ready, 0, "a room missing its lamp is not ready")
  r.fail(20)
  assert.equal(ready, 1, "a failed image counts as drawn, so it never blocks")
  r.display(10)
  r.avatarShown()
  assert.equal(ready, 1)
  r.runtime.unmount()
})

test("furniture another layer draws does not hold the scene, and room art keeps full resolution", () => {
  let ready = 0
  const r = mountRenderer({
    shell, renderItems: [furniture("table", 10), furniture("bed", 30)], hiddenItemRenderIds: new Set(["bed"]),
    onSceneReady: () => { ready += 1 }
  })
  assert.deepEqual(r.images().map(({ props }) => props.source), [1, 10])
  assert.ok(r.images().every(({ props }) => props.allowDownscaling === false))
  r.display(10)
  r.display(1)
  assert.equal(ready, 1)
  r.runtime.unmount()
})

function mountCover(isLoading: boolean, capMs?: number) {
  const runtime = createFakeReactRuntime()
  const { useMyRoomStageCover } = loadSourceWithFakeReact<typeof VeilModule>(
    "features/roomV2/components/MyRoomStageVeil.tsx", runtime, {
      modules: {
        "react-native": createReactNativeStub().module,
        "react-native-reanimated": createReanimatedStub(runtime).module,
        "../../../ui/animations": { useReducedMotion: () => false }
      },
      real: ["../myRoomStageModel"],
      inertUnknown: true
    }
  )
  let loading = isLoading
  const state = { covered: true, markPainted: () => {} }
  runtime.render(() => Object.assign(state, useMyRoomStageCover(loading, capMs)))
  return { state, setLoading: (next: boolean) => { loading = next; runtime.rerender() }, runtime }
}

test("a stage stays covered until its scene is drawn, and a short cap never holds entry", () => {
  mock.timers.enable({ apis: ["setTimeout"] })
  try {
    const painted = mountCover(false, 320)
    assert.equal(painted.state.covered, true)
    painted.state.markPainted()
    assert.equal(painted.state.covered, false)
    painted.runtime.unmount()

    const stuck = mountCover(false, 320)
    mock.timers.tick(319)
    assert.equal(stuck.state.covered, true)
    mock.timers.tick(1)
    assert.equal(stuck.state.covered, false, "the cap uncovers a scene that never reports")
    stuck.runtime.unmount()

    const myRoom = mountCover(true)
    myRoom.setLoading(false)
    mock.timers.tick(1_199)
    assert.equal(myRoom.state.covered, true, "My Room keeps its longer default")
    mock.timers.tick(1)
    assert.equal(myRoom.state.covered, false)
    myRoom.runtime.unmount()
  } finally {
    mock.timers.reset()
  }
})
