import assert from "node:assert/strict"
import test from "node:test"
import {
  createFakeReactRuntime,
  createReactNativeStub,
  createReanimatedStub,
  loadSourceWithFakeReact
} from "../../../testing/hookHarness"
import { getMiniRoomCopy } from "../miniRoomCopy"
import type * as SceneModule from "./MiniRoomScene"
import type * as ComposerModule from "./RoomChatComposer"

type Element = { type: unknown; props: Record<string, any> }

function findAll(node: unknown, match: (element: Element) => boolean, found: Element[] = []): Element[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, match, found)
    return found
  }
  if (!node || typeof node !== "object") return found
  const element = node as Element
  if (match(element)) found.push(element)
  findAll(element.props?.children, match, found)
  return found
}

function mountTypingScene(messages: { messageId: string; senderUserId: string; body: string }[] = []) {
  const runtime = createFakeReactRuntime()
  const dismissals: number[] = []
  const moves: unknown[] = []
  const hotspotMoves: string[] = []
  const speechBatches: unknown[] = [], consumedBatches: unknown[] = []
  const Keyboard = { dismiss: () => dismissals.push(dismissals.length + 1) }
  const native = createReactNativeStub({ Keyboard })
  const floorLayer = () => null
  const hotspotLayer = () => null
  const chatPanel = () => null
  const composer = () => null
  const hud = () => null
  const context = () => null
  const avatarLayer = () => null
  const roomMapLayer = () => null
  const roomDecorLayer = () => null
  const store = {
    hotspots: [], interaction: {}, avatars: [], avatarPositions: [], bubbles: [], scene: {},
    dismissSpeechBubble: () => undefined,
    moveLocalAvatar: (target: unknown) => moves.push(target),
    moveLocalAvatarToHotspot: (id: string) => hotspotMoves.push(id),
    sayPhrase: () => undefined,
    sayPhrases: (batch: unknown) => speechBatches.push(batch),
    deferUntilArrivalLands: () => true
  }
  const cameraPresentation = { cameraStyle: {}, transition: { value: {} }, contentProgress: { value: 1 } }
  const scrollPresentation = { noteMessageSent: () => undefined, requestScrollToLatest: () => undefined, request: 0 }
  const modules = {
    "react-native": native.module,
    "react-native-reanimated": { __esModule: true, default: { View: "Reanimated.View" } },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }) },
    "../../../ui/animations": { useReducedMotion: () => false },
    "../../../ui/haptics": { hapticSoft: () => undefined },
    "../../roomV2/components/RoomFloorTapLayer": { RoomFloorTapLayer: floorLayer },
    "../../roomV2/components/MyRoomStageVeil": {
      useMyRoomStageCover: () => ({ covered: false, markPainted: () => undefined }),
      useStageRevealStyle: () => ({ opacity: 1 })
    },
    // the dev-only 2.5D avatar switch, as every release bundle gets it (the stub: off)
    "../../avatar/roomAvatarSeam": { roomAvatar25d: { enabled: false } },
    "./AvatarLayer": { AvatarLayer: avatarLayer },
    "./HotspotLayer": { HotspotLayer: hotspotLayer },
    "./MiniRoomChatPanel": { MiniRoomChatPanel: chatPanel },
    "./MiniRoomContext": { MiniRoomContext: context },
    "./MiniRoomHud": { MiniRoomHud: hud },
    "./MiniRoomRoomDecorLayer": { MiniRoomRoomDecorLayer: roomDecorLayer },
    "./RoomChatComposer": { MAX_ROOM_MESSAGE_LENGTH: 140, RoomChatComposer: composer },
    "./RoomMapLayer": { RoomMapLayer: roomMapLayer },
    "./miniRoomSceneStore": { useMiniRoomSceneStore: () => store },
    "./miniRoomDepthModel": { createMiniRoomDepthScene: () => ({ occluderIds: [] }) },
    "./miniRoomReducedMotion": { MINI_ROOM_PARTNER_ARRIVAL_MS: 100, resolveMiniRoomMotionPolicy: () => ({ animateJoin: false }) },
    "./miniRoomPresentation": { shouldAnnouncePartnerJoin: () => false },
    "./miniRoomLayout": {
      resolveComposerLineCount: () => 1,
      resolveMiniRoomLayout: () => ({ panelMode: "typing", historyVisible: false, headerTop: 52, headerBottom: 96,
        contextTop: 117, horizontalInset: 16, panelMargin: 0, panelBottom: 300, panelHeight: 108,
        historyHeight: 0, composerMaxInputHeight: 92, composerInputHeight: 44,
        camera: { left: 0, top: 120, width: 546, height: 311 } }),
      resolveMiniRoomRestCamera: () => ({ left: -78, top: 200, width: 546, height: 311 })
    },
    "./useMiniRoomKeyboard": { useMiniRoomKeyboard: () => ({ visible: true, progress: { value: 1 }, openHeight: { value: 300 } }) },
    "./useMiniRoomCameraTransform": {
      useMiniRoomCameraTransform: () => cameraPresentation
    },
    "./useMiniRoomMotionPresentation": { useMiniRoomMotionPresentation: () => false },
    "./useMiniRoomScrollToLatest": { useMiniRoomScrollToLatest: () => scrollPresentation },
    "../useMiniRoomKeyboardPreference": { useMiniRoomKeyboardPreference: () => ({ suggestionsEnabled: false,
      toggle: () => undefined }) }
  }
  const { MiniRoomScene } = loadSourceWithFakeReact<typeof SceneModule>(
    "features/miniRoom/scene/MiniRoomScene.tsx", runtime, { modules }
  )
  const copy = getMiniRoomCopy("en")
  const props: Parameters<typeof SceneModule.MiniRoomScene>[0] = {
    copy,
    localUser: { userId: "", displayName: "Me" },
    partnerUser: { userId: "", displayName: "Bora" },
    participantAvatarSnapshots: {} as never,
    connectionStatus: "connected",
    voiceAvailable: false,
    localMedia: { micEnabled: false } as never,
    leaveDisabled: false,
    onLeave: () => undefined,
    onOpenSafety: () => undefined,
    onRetryConnect: () => undefined,
    onToggleMic: () => undefined,
    inRoomMessages: messages as never,
    consumeInRoomMessage: () => undefined,
    consumeInRoomMessages: (ids) => consumedBatches.push(ids),
    canChatSend: true,
    onSendRoomMessage: () => true
  }
  runtime.render(() => MiniRoomScene(props))
  return { runtime, dismissals, moves, hotspotMoves, floorLayer, hotspotLayer, chatPanel, composer, hud, speechBatches, consumedBatches }
}

test("room, hotspot and empty-area taps keep typing open; only the two chat controls dismiss it", () => {
  const scene = mountTypingScene()
  try {
    const floor = findAll(scene.runtime.output, (element) => element.type === scene.floorLayer)[0]!
    const hotspot = findAll(scene.runtime.output, (element) => element.type === scene.hotspotLayer)[0]!
    const panel = findAll(scene.runtime.output, (element) => element.type === scene.chatPanel)[0]!
    const composer = findAll(scene.runtime.output, (element) => element.type === scene.composer)[0]!
    const hud = findAll(scene.runtime.output, (element) => element.type === scene.hud)[0]!

    floor.props.onTap({ x: 0.08, y: 0.7 })
    hotspot.props.onSelect("sofa")
    assert.equal(scene.dismissals.length, 0, "room and hotspot interactions do not dismiss the keyboard")
    assert.deepEqual(scene.moves, [{ x: 0.08, y: 0.7 }])
    assert.deepEqual(scene.hotspotMoves, ["sofa"])

    // An outside-tap backdrop would be a full-screen Pressable. None is placed over the scene.
    assert.equal(findAll(scene.runtime.output, (element) => element.type === "Pressable").length, 0,
      "an empty-area press has no keyboard-dismiss overlay")
    assert.equal(hud.props.onCloseKeyboard, undefined, "opening room options does not dismiss typing")

    panel.props.onCloseKeyboard()
    assert.equal(scene.dismissals.length, 1, "the collapse chevron dismisses the keyboard")
    composer.props.onToggleHistory()
    assert.equal(scene.dismissals.length, 2, "the chat toggle under the frame dismisses the keyboard")
  } finally {
    scene.runtime.unmount()
  }
})

test("speech-only scene updates retain the chat child and panel inputs; bursts are queued and consumed together", () => {
  const messages = ["a", "b", "c"].map((messageId) => ({ messageId, senderUserId: "partner", body: "Message" }))
  const scene = mountTypingScene(messages)
  try {
    assert.deepEqual(scene.consumedBatches, [["a", "b", "c"]])
    assert.equal(scene.speechBatches.length, 1)
    const panel = () => findAll(scene.runtime.output, (element) => element.type === scene.chatPanel)[0]!
    const before = panel().props
    const composer = findAll(scene.runtime.output, (element) => element.type === scene.composer)[0]!
    assert.equal(composer.props.onChangeText, undefined, "typing never publishes draft state to the scene")
    const composerRuntime = createFakeReactRuntime()
    const { RoomChatComposer } = loadSourceWithFakeReact<typeof ComposerModule>(
      "features/miniRoom/scene/RoomChatComposer.tsx", composerRuntime, {
        modules: {
          "react-native": createReactNativeStub({ TextInput: "TextInput" }).module,
          "react-native-reanimated": createReanimatedStub(composerRuntime).module,
          "../../../ui/motion": { useMotion: () => ({ reduceMotion: true }) },
          "../../../ui/haptics": { hapticSelection: () => undefined },
          "../../../ui/PressableScale": { PressableScale: "Pressable" },
          "../../../ui/GesturePressableScale": { GesturePressableScale: "Pressable" },
          "@expo/vector-icons/Ionicons": { __esModule: true, default: "Ionicons" }
        }, real: ["./miniRoomLayout", "../../chat/thread/chatComposerDraftModel"], globals: { setTimeout, clearTimeout }
      })
    composerRuntime.render(() => (RoomChatComposer as any)(composer.props))
    const sceneRenders = scene.runtime.renderCount
    for (const text of ["a", "ab", "abc"]) {
      findAll(composerRuntime.output, (element) => element.type === "TextInput")[0]!.props.onChangeText(text)
    }
    assert.equal(findAll(composerRuntime.output, (element) => element.type === "TextInput")[0]!.props.value, "abc")
    assert.equal(scene.runtime.renderCount, sceneRenders, "real composer edits do not update room hooks")
    composerRuntime.unmount()
    scene.runtime.rerender()
    const after = panel().props
    for (const key of Object.keys(before)) assert.equal(after[key], before[key], `panel ${key} remains memo-compatible`)
    assert.equal(scene.speechBatches.length, 1, "same pending snapshot is not replayed on unrelated render")
  } finally { scene.runtime.unmount() }
})
