import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createInertModule, createReactNativeStub, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import { getMiniRoomCopy } from "../miniRoomCopy"
import type * as Composer from "./RoomChatComposer"

interface Element { type: unknown; props: Record<string, unknown> }

function findInput(node: unknown): Element | undefined {
  if (!node || typeof node !== "object") return undefined
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findInput(child)
      if (found) return found
    }
    return undefined
  }
  const element = node as Element
  if (element.type === "TextInput") return element
  return findInput(element.props?.children)
}

function renderInput(disabled: boolean) {
  const runtime = createFakeReactRuntime()
  const { RoomChatComposer } = loadSourceWithFakeReact<typeof Composer>("features/miniRoom/scene/RoomChatComposer.tsx", runtime, {
    modules: {
      "react-native": createReactNativeStub({ TextInput: "TextInput" }).module,
      "@expo/vector-icons/Ionicons": { __esModule: true, default: createInertModule("Ionicons") }
    },
    real: ["./miniRoomLayout"],
    inertUnknown: true,
    globals: { setTimeout, clearTimeout }
  })
  const render = RoomChatComposer as unknown as (props: Composer.RoomChatComposerProps) => unknown
  const tree = runtime.render(() => render({
    copy: getMiniRoomCopy("en"), value: "", suggestionsEnabled: true, disabled, mode: "history",
    maxInputHeight: 92, inputHeight: 44, onChangeText: () => undefined, onSubmit: () => false,
    onToggleHistory: () => undefined, onContentHeightChange: () => undefined
  }))
  const input = findInput(tree)
  runtime.unmount()
  assert.ok(input, "the composer renders its text field")
  return { input }
}

// The scene moves only with a real keyboard (useMiniRoomCameraTransform.test):
// a disabled field never focuses, so touching it can never lift the dock.
test("a disabled composer never focuses; an enabled one does", () => {
  assert.equal(renderInput(true).input.props.editable, false)
  assert.equal(renderInput(false).input.props.editable, true)
})

function findAll(node: unknown, match: (element: Element) => boolean, found: Element[] = []): Element[] {
  if (!node || typeof node !== "object") return found
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, match, found)
    return found
  }
  const element = node as Element
  if (match(element)) found.push(element)
  findAll(element.props?.children, match, found)
  return found
}

test("the history-mode left button names its action: going to the latest message", () => {
  for (const locale of ["en", "tr"] as const) {
    const copy = getMiniRoomCopy(locale)
    const runtime = createFakeReactRuntime()
    const { RoomChatComposer } = loadSourceWithFakeReact<typeof Composer>("features/miniRoom/scene/RoomChatComposer.tsx", runtime, {
      modules: {
        "react-native": createReactNativeStub({ TextInput: "TextInput" }).module,
        "@expo/vector-icons/Ionicons": { __esModule: true, default: createInertModule("Ionicons") }
      },
      real: ["./miniRoomLayout"],
      inertUnknown: true,
      globals: { setTimeout, clearTimeout }
    })
    let toggles = 0
    const render = RoomChatComposer as unknown as (props: Composer.RoomChatComposerProps) => unknown
    const labels = (["history", "typing"] as const).map((mode) => {
      const tree = runtime.render(() => render({
        copy, value: "", suggestionsEnabled: false, disabled: false, mode,
        maxInputHeight: 92, inputHeight: 44, onChangeText: () => undefined, onSubmit: () => false,
        onToggleHistory: () => { toggles += 1 }, onContentHeightChange: () => undefined
      }))
      const toggle = findAll(tree, (element) => element.props?.accessibilityLabel === (mode === "history"
        ? copy.goToLatestMessage : copy.returnToRoom))
      assert.equal(toggle.length, 1, `${locale} ${mode}: one left button names its action`)
      ;(toggle[0]!.props.onPress as () => void)()
      return toggle[0]!.props.accessibilityLabel
    })
    runtime.unmount()
    assert.notEqual(labels[0], labels[1], "the two modes describe their different actions")
    assert.notEqual(labels[0], copy.chatHistory, "the button is not labelled as the list it scrolls")
    assert.equal(toggles, 2)
  }
})
