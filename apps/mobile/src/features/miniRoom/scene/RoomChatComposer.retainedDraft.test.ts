import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, createReanimatedStub, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import { getMiniRoomCopy } from "../miniRoomCopy"
import type { FailedRoomMessage } from "../useInRoomChat"
import type * as Composer from "./RoomChatComposer"

type Element = { type: unknown; props: Record<string, any> }
function findInput(node: unknown): Element | undefined {
  if (Array.isArray(node)) return node.map(findInput).find(Boolean)
  if (!node || typeof node !== "object") return
  const element = node as Element
  return element.type === "TextInput" ? element : findInput(element.props?.children)
}

function mountComposer() {
  const runtime = createFakeReactRuntime()
  const reanimated = createReanimatedStub(runtime)
  const typing: string[] = []
  let nativeClears = 0
  const { RoomChatComposer } = loadSourceWithFakeReact<typeof Composer>("features/miniRoom/scene/RoomChatComposer.tsx", runtime, {
    modules: {
      "react-native": createReactNativeStub({ TextInput: "TextInput" }).module,
      "react-native-reanimated": reanimated.module,
      "../../../ui/motion": { useMotion: () => ({ reduceMotion: false, snappy: {} }), animateTo: (value: number) => value },
      "../../../ui/haptics": { hapticSelection: () => undefined },
      "../../../ui/PressableScale": { PressableScale: "Pressable" },
      "../../../ui/GesturePressableScale": { GesturePressableScale: "Pressable" },
      "@expo/vector-icons/Ionicons": { __esModule: true, default: "Ionicons" }
    }, real: ["./miniRoomLayout", "../../chat/thread/chatComposerDraftModel"], globals: { setTimeout, clearTimeout }
  })
  const render = RoomChatComposer as unknown as (props: Composer.RoomChatComposerProps) => unknown
  let failures: readonly FailedRoomMessage[] = []
  const sent: { body: string; retry?: string }[] = []
  let accepts = true
  let disabled = false
  const copy = getMiniRoomCopy("en")
  const show = () => runtime.render(() => render({
    copy, suggestionsEnabled: false, disabled, mode: "typing", maxInputHeight: 92, inputHeight: 44,
    onSubmit: (body, retry) => { sent.push({ body, retry }); return accepts },
    failedMessages: failures, onToggleHistory: () => undefined, onContentHeightChange: () => undefined,
    draftTyping: { noteDraft: (text: string) => typing.push(text), endDraft: () => undefined } as never
  }))
  show()
  const input = () => findInput(runtime.output)!
  input().props.ref.current = { clear: () => { nativeClears += 1 } }
  return {
    runtime, input, sent, typing, clears: () => nativeClears,
    type: (value: string) => input().props.onChangeText(value),
    send: () => input().props.onSubmitEditing(),
    fail: (next: readonly FailedRoomMessage[]) => { failures = next; show() },
    refuse: () => { accepts = false },
    disable: () => { disabled = true; show() }, show
  }
}

test("the retained local draft sends the latest native edit and keeps late keystrokes without parent updates", () => {
  const composer = mountComposer()
  try {
    composer.type("Selam")
    composer.send()
    assert.deepEqual(composer.sent, [{ body: "Selam", retry: undefined }])
    assert.equal(composer.clears(), 1)
    assert.equal(composer.input().props.value, "")
    composer.type("Selamn")
    composer.type("Selamna")
    assert.equal(composer.input().props.value, "na")
    composer.send()
    assert.equal(composer.sent[1]?.body, "na")
    composer.type("x".repeat(150))
    assert.equal(composer.input().props.value.length, 140)
    composer.disable()
    composer.send()
    assert.equal(composer.sent.length, 2, "offline send preserves the draft without sending")
    assert.equal(composer.input().props.value.length, 140)
  } finally { composer.runtime.unmount() }
})

test("multiple failures preserve the exact recovered identity and never overwrite active text", () => {
  const composer = mountComposer()
  const first = { clientMessageId: "first", body: "One" }
  const second = { clientMessageId: "second", body: "Two" }
  try {
    composer.fail([first])
    assert.equal(composer.input().props.value, "One")
    assert.deepEqual(composer.typing, [], "recovered text is never a typing signal")
    composer.fail([first, second])
    assert.equal(composer.input().props.value, "One")
    composer.send()
    assert.deepEqual(composer.sent[0], { body: "One", retry: "first" })
    assert.equal(composer.input().props.value, "Two")
    composer.fail([second])
    composer.send()
    assert.deepEqual(composer.sent[1], { body: "Two", retry: "second" })
    assert.equal(composer.input().props.value, "")
    // Same client identity, a new failure occurrence after its retry timed out.
    composer.fail([{ ...first }])
    assert.equal(composer.input().props.value, "One")
  } finally { composer.runtime.unmount() }
})

test("editing a recovery sends a new message and does not unexpectedly restore the old failure", () => {
  const composer = mountComposer()
  const failure = { clientMessageId: "failed", body: "One" }
  try {
    composer.fail([failure])
    composer.type("  One edited  ")
    composer.send()
    assert.deepEqual(composer.sent, [{ body: "One edited", retry: undefined }])
    assert.equal(composer.input().props.value, "")
    composer.fail([failure])
    assert.equal(composer.input().props.value, "", "the still retryable older failure does not overwrite a fresh draft")
  } finally { composer.runtime.unmount() }
})

test("late acknowledgement keeps the recovered identity, so an unchanged retry cannot duplicate a sent message", () => {
  const composer = mountComposer()
  try {
    composer.fail([{ clientMessageId: "failed", body: "One" }])
    composer.fail([])
    composer.refuse()
    composer.send()
    assert.deepEqual(composer.sent, [{ body: "One", retry: "failed" }])
    assert.equal(composer.input().props.value, "One")
    assert.equal(composer.clears(), 0)
  } finally { composer.runtime.unmount() }
})

test("a failure preserves the current native draft and recovery arrives only after that draft sends", () => {
  const composer = mountComposer()
  try {
    composer.type("New draft")
    composer.fail([{ clientMessageId: "failed", body: "Previous" }])
    assert.equal(composer.input().props.value, "New draft")
    composer.show()
    assert.equal(composer.input().props.value, "New draft", "parent rerenders retain native input")
    composer.send()
    assert.deepEqual(composer.sent, [{ body: "New draft", retry: undefined }])
    assert.equal(composer.input().props.value, "Previous")
  } finally { composer.runtime.unmount() }
})
