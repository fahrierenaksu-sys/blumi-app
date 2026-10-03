import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, createReanimatedStub, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import { getMiniRoomCopy } from "../miniRoomCopy"
import type { RoomChatHistoryItem } from "../roomChatHistoryModel"
import type * as Panel from "./MiniRoomChatPanel"

type Element = { type: unknown; props: Record<string, any>; key?: unknown }
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!node || typeof node !== "object") return []
  const element = node as Element
  return [element, ...elements(element.props?.children)]
}

test("mounted transcript freezes during typing and catches up in the close render before the fade reveals it", () => {
  const runtime = createFakeReactRuntime()
  const reanimated = createReanimatedStub(runtime)
  const { MiniRoomChatPanel } = loadSourceWithFakeReact<typeof Panel>("features/miniRoom/scene/MiniRoomChatPanel.tsx", runtime, {
    modules: {
      "react-native": createReactNativeStub().module,
      "react-native-reanimated": reanimated.module,
      "../../../ui/motion": { useMotion: () => ({ reduceMotion: false, smooth: {}, staggerDelay: () => 0 }), animateToAfter: (_delay: number, value: number) => value },
      "../../../ui/haptics": { hapticSelection: () => undefined },
      "../../../ui/PressableScale": { PressableScale: "Pressable" },
      "@expo/vector-icons/Ionicons": { __esModule: true, default: "Ionicons" },
      "./MiniRoomChatHistory": { MiniRoomChatHistory: "History" },
      "./useRetainedMiniRoomTranscript": loadSourceWithFakeReact("features/miniRoom/scene/useRetainedMiniRoomTranscript.ts", runtime)
    }, real: ["./miniRoomTransitionModel"]
  })
  const initial = [{ id: "old", body: "Initial", mine: false, delivery: "sent" }] as RoomChatHistoryItem[]
  let items: readonly RoomChatHistoryItem[] = initial
  let mode: "history" | "typing" = "history"
  let status: "ready" | "error" = "ready"
  const contentProgress = { value: 0 }
  const props = { copy: getMiniRoomCopy("en"), transition: { value: { progress: 0, margin: 0, height: 297,
    bottom: 0, restHeight: 297 } } as never, contentProgress: contentProgress as never,
    windowWidth: 390, windowHeight: 844, historyHeight: 200, partnerName: "Partner",
    onRecentHeightChange: () => undefined, onRecentRowsHeightChange: () => undefined,
    onCloseKeyboard: () => undefined, scrollToLatestRequest: 0, children: null }
  const show = () => runtime.render(() => (MiniRoomChatPanel as any)({ ...props, mode, historyItems: items,
    historyStatus: status, recentMessage: items[0] }))
  // Observe the child boundary's props without making the harness pretend to be a native renderer.
  const transcript = () => elements(runtime.output).find((element) => typeof element.type === "function")!
  try {
    show()
    const mountedType = transcript().type
    assert.equal(transcript().props.items, initial)
    mode = "typing"; contentProgress.value = 1; show()
    items = [{ id: "new", body: "Newest", mine: true, delivery: "sent" }, ...initial] as RoomChatHistoryItem[]
    status = "error"; show()
    assert.equal(transcript().props.items, initial, "hidden list does not receive new row data")
    assert.equal(transcript().props.status, "ready", "hidden list does not relayout on status changes")
    assert.ok(elements(runtime.output).some((element) => element.props?.children === "Newest"), "the visible recent strip stays current")
    mode = "history"; show() // UI fade has not moved yet: reads current data in this very render.
    assert.equal(contentProgress.value, 1)
    assert.equal(transcript().props.items, items)
    assert.equal(transcript().props.status, "error")
    assert.equal(transcript().type, mountedType, "same transcript component and key remain mounted")
    assert.equal(transcript().key, undefined)
    mode = "typing"; show()
    items = [...items]; show()
    assert.notEqual(transcript().props.items, items, "next typing session retains the caught-up snapshot")
  } finally { runtime.unmount() }
})
