import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, createReanimatedStub, loadSourceWithFakeReact } from "../testing/hookHarness"
import { getMiniRoomCopy } from "../features/miniRoom/miniRoomCopy"
import type * as Screen from "./MiniRoomScreen"
import type * as Composer from "../features/miniRoom/scene/RoomChatComposer"

type Element = { type: unknown; props: Record<string, any>; key?: unknown }
function find(node: unknown, type: unknown): Element | undefined {
  if (Array.isArray(node)) return node.map((item) => find(item, type)).find(Boolean)
  if (!node || typeof node !== "object") return
  const element = node as Element
  return element.type === type ? element : find(element.props?.children, type)
}

test("a reused room route resets recovered drafts on room/thread changes and retains them on reconnect", () => {
  const screenRuntime = createFakeReactRuntime()
  const copy = getMiniRoomCopy("en")
  const failure = { clientMessageId: "previous-failure", body: "Previous draft" }
  let failedMessages = [failure]
  const scene = "MiniRoomScene"
  const { MiniRoomScreen } = loadSourceWithFakeReact<typeof Screen>("screens/MiniRoomScreen.tsx", screenRuntime, {
    modules: {
      "react-native": createReactNativeStub().module,
      "@react-navigation/native": { useIsFocused: () => true },
      "../features/miniRoom/scene/MiniRoomScene": { MiniRoomScene: scene },
      "../features/miniRoom/useMiniRoomMotion": { useMiniRoomMotion: () => ({ superseded: false }) },
      "../features/avatarV2/state/AvatarV2Provider": { useAvatarV2: () => ({ avatar: {}, catalog: [] }) },
      "../features/realtime/globalRealtimeProvider": { useGlobalRealtime: () => ({ connectionStatus: "connected" }), useGlobalRealtimeEvents: () => undefined },
      "../features/miniRoom/miniRoomCopy": { getMiniRoomCopy: () => copy },
      "../features/miniRoom/sharedRoomDecor": { resolveSharedRoomDecor: () => ({ decor: {}, legacyFallback: false }) },
      "../features/miniRoom/useMiniRoomMedia": { useMiniRoomMedia: () => ({ mediaState: { localMedia: {} }, voiceAvailable: false }) },
      "../features/miniRoom/useInRoomChat": { useInRoomChat: () => ({ threadId: null, failedRoomMessages: failedMessages, newMessages: [], canSend: true }) },
      "../features/miniRoom/useRoomChatHistory": { useRoomChatHistory: () => ({ items: [], status: "ready" }) },
      "../features/chat/chatStore": { useChatThreadStore: () => ({ thread: null }) },
      "../features/miniRoom/miniRoomPartnerIdentity": { selectMiniRoomLivePartner: () => null, resolveMiniRoomPartnerIdentity: (partner: unknown) => partner },
      "../features/miniRoom/useMiniRoomLeave": { useMiniRoomLeave: () => ({ leaveRequested: false, requestLeave: () => undefined }) },
      "../features/miniRoom/useMiniRoomNotices": { useMiniRoomNotices: () => null },
      "../features/miniRoom/useMiniRoomLeaveGuard": { useMiniRoomLeaveGuard: () => ({ confirmLeave: () => undefined, leavePrompt: { visible: false } }) }
    }, inertUnknown: true, globals: { setTimeout, clearTimeout }
  })
  const route = { params: { readyMiniRoom: { miniRoom: { miniRoomId: "room-one", sourceThreadId: "thread-one" }, mediaSession: {} },
    participants: { you: { userId: "", displayName: "You" }, partner: { userId: "", displayName: "Partner" } } } }
  const props = { route, navigation: {}, sessionActor: { profile: { userId: "" }, session: { mode: "demo" } },
    requestChatMessages: () => undefined } as never
  let composerRuntime: ReturnType<typeof createFakeReactRuntime> | undefined
  let currentKey: unknown = Symbol("unmounted")
  let component: ((props: Composer.RoomChatComposerProps) => unknown) | undefined
  const sent: { body: string; retry?: string }[] = []
  const show = () => {
    screenRuntime.render(() => MiniRoomScreen(props))
    const output = find(screenRuntime.output, scene)!
    assert.ok(output, "the real screen renders its scene")
    // React retains this child tree for one scene key and replaces it for a new key.
    if (output.key !== currentKey) {
      composerRuntime?.unmount()
      composerRuntime = createFakeReactRuntime()
      currentKey = output.key
      const loaded = loadSourceWithFakeReact<typeof Composer>("features/miniRoom/scene/RoomChatComposer.tsx", composerRuntime, {
        modules: { "react-native": createReactNativeStub({ TextInput: "TextInput" }).module,
          "react-native-reanimated": createReanimatedStub(composerRuntime).module,
          "../../../ui/motion": { useMotion: () => ({ reduceMotion: true }) },
          "../../../ui/haptics": { hapticSelection: () => undefined },
          "../../../ui/PressableScale": { PressableScale: "Pressable" },
          "../../../ui/GesturePressableScale": { GesturePressableScale: "Pressable" },
          "@expo/vector-icons/Ionicons": { __esModule: true, default: "Ionicons" } },
        real: ["./miniRoomLayout", "../../chat/thread/chatComposerDraftModel"], globals: { setTimeout, clearTimeout }
      })
      component = loaded.RoomChatComposer as unknown as typeof component
    }
    composerRuntime!.render(() => component!({ copy, suggestionsEnabled: false, disabled: false, mode: "typing",
      inputHeight: 44, maxInputHeight: 92, failedMessages: output.props.failedRoomMessages,
      onSubmit: (body, retry) => { sent.push({ body, retry }); return true },
      onToggleHistory: () => undefined, onContentHeightChange: () => undefined }))
    return find(composerRuntime!.output, "TextInput")!
  }
  try {
    assert.equal(show().props.value, "Previous draft")
    const firstRuntime = composerRuntime
    assert.equal(show().props.value, "Previous draft", "same-room reconnect keeps recovery")
    assert.equal(composerRuntime, firstRuntime)
    failedMessages = []
    route.params.readyMiniRoom.miniRoom = { miniRoomId: "room-two", sourceThreadId: "thread-one" }
    let input = show()
    assert.equal(input.props.value, "", "old room recovery never enters a new room")
    input.props.onChangeText("New room draft")
    input = show()
    input.props.onSubmitEditing()
    assert.deepEqual(sent, [{ body: "New room draft", retry: undefined }], "old retry identity never enters a new room")
    input = show()
    input.props.onChangeText("Keep on reconnect")
    assert.equal(show().props.value, "Keep on reconnect")
    route.params.readyMiniRoom.miniRoom = { miniRoomId: "room-two", sourceThreadId: "thread-two" }
    assert.equal(show().props.value, "", "thread transition also starts with an empty draft")
  } finally { composerRuntime?.unmount(); screenRuntime.unmount() }
})
