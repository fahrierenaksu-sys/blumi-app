import assert from "node:assert/strict"
import test from "node:test"
import {
  createFakeReactRuntime,
  createReactNativeStub,
  loadSourceWithFakeReact
} from "../../testing/hookHarness"
import * as chatComposerDraftModel from "../chat/thread/chatComposerDraftModel"
import * as profileEditModel from "./profileEditModel"

type Element = { type: unknown; props: Record<string, any> }

function findElement(node: unknown, type: string): Element | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, type)
      if (found) return found
    }
    return undefined
  }
  if (!node || typeof node !== "object" || !("props" in node)) return undefined
  const element = node as Element
  if (element.type === type) return element
  return findElement(element.props?.children, type)
}

function renderInterestsField() {
  const runtime = createFakeReactRuntime()
  const { ProfileInterestsField } = loadSourceWithFakeReact<{
    ProfileInterestsField: (props: Record<string, unknown>) => unknown
  }>("features/session/ProfileInterestsField.tsx", runtime, {
    modules: {
      "react-native": createReactNativeStub({ TextInput: "TextInput" }).module,
      "../../ui/haptics": { hapticSelection: () => undefined },
      "../chat/thread/chatComposerDraftModel": chatComposerDraftModel,
      "./profileEditModel": profileEditModel
    },
    inertUnknown: true
  })
  let interestsText = ""
  const render = () => ProfileInterestsField({
    interestsText,
    interests: profileEditModel.parseProfileInterests(interestsText),
    onChangeInterestsText: (next: string) => {
      interestsText = next
      runtime.rerender()
    },
    copy: { interestsAccessibility: "", interestsPlaceholder: "", removeInterest: () => "" }
  })
  runtime.render(render)
  const input = () => {
    const element = findElement(runtime.output, "TextInput")
    assert.ok(element, "the field renders its text input")
    return element
  }
  return {
    type: (fieldText: string) => input().props.onChangeText(fieldText),
    submit: () => input().props.onSubmitEditing(),
    entry: () => input().props.value as string,
    interests: () => profileEditModel.parseProfileInterests(interestsText)
  }
}

test("a keystroke that lands before the comma clears the field stays as the next interest's text", () => {
  const field = renderInterestsField()
  field.type("music,")
  assert.deepEqual(field.interests(), ["music"])
  assert.equal(field.entry(), "")

  // The stale native text arrives with the new letter: never a chip of it.
  field.type("music,a")
  assert.deepEqual(field.interests(), ["music"])
  assert.equal(field.entry(), "a")

  field.type("ar")
  assert.equal(field.entry(), "ar", "an ordinary edit after that is kept as typed")
  field.type("art,")
  assert.deepEqual(field.interests(), ["music", "art"])
})

test("a late echo of the committed text leaves the field empty", () => {
  const field = renderInterestsField()
  field.type("books")
  field.submit()
  assert.deepEqual(field.interests(), ["books"])
  field.type("books")
  assert.equal(field.entry(), "")
  assert.deepEqual(field.interests(), ["books"])
})

test("a late keystroke that itself ends with a comma commits only the new text", () => {
  const field = renderInterestsField()
  field.type("music,")
  field.type("music,film,")
  assert.deepEqual(field.interests(), ["music", "film"])
  assert.equal(field.entry(), "")
})
