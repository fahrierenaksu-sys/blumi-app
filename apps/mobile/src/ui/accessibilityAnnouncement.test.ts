import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../testing/hookHarness"
import type * as AnnouncementModule from "./accessibilityAnnouncement"
import { getAppNavigationCopy, getBottomNavTabAccessibilityLabel } from "../features/session/appNavigationCopy"

function mount(os: "ios" | "android", initiallyFocused = true) {
  const focus = { isFocused: initiallyFocused }
  const runtime = createFakeReactRuntime()
  const spoken: string[] = []
  const reactNative = createReactNativeStub({
    Platform: { OS: os, select: (choices: Record<string, unknown>) => choices[os] },
    AccessibilityInfo: { announceForAccessibility: (message: string) => { spoken.push(message) } }
  })
  const { useAccessibilityAnnouncement } = loadSourceWithFakeReact<typeof AnnouncementModule>(
    "ui/accessibilityAnnouncement.ts",
    runtime,
    {
      modules: {
        "react-native": reactNative.module,
        "../features/avatar/components/useIsSurfaceFocused": { useIsSurfaceFocused: () => focus.isFocused }
      }
    }
  )
  let message: string | null = null
  runtime.render(() => useAccessibilityAnnouncement(message))
  const show = (next: string | null) => {
    message = next
    runtime.rerender()
  }
  const setFocused = (next: boolean) => {
    focus.isFocused = next
    runtime.rerender()
  }
  return { show, setFocused, spoken }
}

test("iOS hears an error once, however often the screen re-renders", () => {
  const { show, spoken } = mount("ios")
  show("Could not save")
  show("Could not save")
  show("Could not save")
  assert.deepEqual(spoken, ["Could not save"])
})

test("iOS hears a new message, and the same message again after it was cleared", () => {
  const { show, spoken } = mount("ios")
  show("Loading")
  show("Could not load")
  show(null)
  show("Could not load")
  assert.deepEqual(spoken, ["Loading", "Could not load", "Could not load"])
})

test("Android relies on the live region and never announces twice", () => {
  const { show, spoken } = mount("android")
  show("Could not save")
  assert.deepEqual(spoken, [])
})

test("a tab page warming up in the background stays silent while another tab is shown", () => {
  const { show, spoken } = mount("ios", false)
  show("Shop is loading")
  show("Shop is loading")
  assert.deepEqual(spoken, [])
})

test("the shown page speaks its status exactly once", () => {
  const { show, spoken } = mount("ios", true)
  show("Shop is loading")
  show("Shop is loading")
  assert.deepEqual(spoken, ["Shop is loading"])
})

test("a background page speaks its status once when the person swipes to it, not again on return", () => {
  const { show, setFocused, spoken } = mount("ios", false)
  show("Could not load the shop")
  assert.deepEqual(spoken, [])
  setFocused(true)
  assert.deepEqual(spoken, ["Could not load the shop"])
  setFocused(false)
  setFocused(true)
  assert.deepEqual(spoken, ["Could not load the shop"])
})

for (const locale of ["en", "tr"] as const) {
  test(`the ${locale} Chats tab label speaks the unread count the badge shows`, () => {
    const copy = getAppNavigationCopy(locale)
    assert.equal(getBottomNavTabAccessibilityLabel(copy, copy.chats, null), copy.chats)
    assert.equal(getBottomNavTabAccessibilityLabel(copy, copy.chats, 0), copy.chats, "no badge, no count")
    for (const count of [1, 7, 140]) {
      const label = getBottomNavTabAccessibilityLabel(copy, copy.chats, count)
      assert.ok(label.includes(copy.chats), "the tab keeps its name")
      assert.ok(label.includes(String(count)), "the real count is spoken, not the capped 99+")
    }
  })
}
