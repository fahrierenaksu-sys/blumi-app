import assert from "node:assert/strict"
import test from "node:test"
import {
  TOAST_BAR_GAP,
  TOAST_EDGE_GAP,
  TOAST_KEYBOARD_GAP,
  TOAST_PRESENTATION_HIDDEN,
  getToastAnnouncement,
  getToastBottomOffset,
  getToastHapticKind,
  getToastPressLabel,
  handleToastPress,
  reduceToastPresentation,
  resolveToastKeyboardInset,
  type ToastData
} from "./toastPresentationModel"
import { getToastCopy, resolveToastLocale } from "./toastCopy"

const first: ToastData = { id: "toast_1", title: "Saved", type: "success" }
const second: ToastData = { id: "toast_2", title: "Oops", body: "Try again", type: "warning" }

test("a shown toast becomes the displayed, visible toast", () => {
  const state = reduceToastPresentation(TOAST_PRESENTATION_HIDDEN, { type: "show", toast: first })
  assert.deepEqual(state, { toast: first, phase: "visible" })
})

test("hiding keeps the last toast on screen while it exits", () => {
  const visible = reduceToastPresentation(TOAST_PRESENTATION_HIDDEN, { type: "show", toast: first })
  const exiting = reduceToastPresentation(visible, { type: "hide" })
  assert.deepEqual(exiting, { toast: first, phase: "exiting" })
})

test("the toast unmounts only when its own exit animation finishes", () => {
  const exiting = { toast: first, phase: "exiting" as const }
  assert.equal(
    reduceToastPresentation(exiting, { type: "exitFinished", id: first.id }),
    TOAST_PRESENTATION_HIDDEN
  )
  assert.equal(
    reduceToastPresentation(exiting, { type: "exitFinished", id: "toast_other" }),
    exiting,
    "a stale exit callback leaves the state untouched"
  )
})

test("a new toast during the exit cancels it and enters instead", () => {
  const exiting = { toast: first, phase: "exiting" as const }
  const next = reduceToastPresentation(exiting, { type: "show", toast: second })
  assert.deepEqual(next, { toast: second, phase: "visible" })
  assert.equal(
    reduceToastPresentation(next, { type: "exitFinished", id: first.id }),
    next,
    "the interrupted exit cannot unmount the new toast"
  )
})

test("hide and exitFinished are no-ops without a visible toast", () => {
  assert.equal(reduceToastPresentation(TOAST_PRESENTATION_HIDDEN, { type: "hide" }), TOAST_PRESENTATION_HIDDEN)
  const exiting = { toast: first, phase: "exiting" as const }
  assert.equal(reduceToastPresentation(exiting, { type: "hide" }), exiting)
  const visible = { toast: first, phase: "visible" as const }
  assert.equal(reduceToastPresentation(visible, { type: "exitFinished", id: first.id }), visible)
})

test("without a bar or keyboard the toast sits above the safe area", () => {
  assert.equal(
    getToastBottomOffset({ safeAreaBottom: 34, bottomBarInset: null, keyboard: { visible: false, inset: 0 } }),
    34 + TOAST_EDGE_GAP
  )
})

test("with the bottom bar visible the toast sits above the bar", () => {
  assert.equal(
    getToastBottomOffset({ safeAreaBottom: 34, bottomBarInset: 92, keyboard: { visible: false, inset: 0 } }),
    92 + TOAST_BAR_GAP
  )
})

test("an open keyboard lifts the toast above the keyboard, ignoring the covered safe area", () => {
  assert.equal(
    getToastBottomOffset({ safeAreaBottom: 34, bottomBarInset: null, keyboard: { visible: true, inset: 336 } }),
    336 + TOAST_KEYBOARD_GAP
  )
  assert.equal(
    getToastBottomOffset({ safeAreaBottom: 34, bottomBarInset: 92, keyboard: { visible: true, inset: 336 } }),
    336 + TOAST_KEYBOARD_GAP
  )
})

test("a resized window (Android, inset 0) keeps the toast above a bar that rides with it", () => {
  assert.equal(
    getToastBottomOffset({ safeAreaBottom: 24, bottomBarInset: 92, keyboard: { visible: true, inset: 0 } }),
    92 + TOAST_BAR_GAP
  )
  assert.equal(
    getToastBottomOffset({ safeAreaBottom: 24, bottomBarInset: null, keyboard: { visible: true, inset: 0 } }),
    TOAST_KEYBOARD_GAP
  )
})

test("invalid layout numbers never push the toast off screen", () => {
  assert.equal(
    getToastBottomOffset({ safeAreaBottom: Number.NaN, bottomBarInset: null, keyboard: { visible: false, inset: 0 } }),
    TOAST_EDGE_GAP
  )
  assert.equal(
    getToastBottomOffset({ safeAreaBottom: 0, bottomBarInset: null, keyboard: { visible: true, inset: -40 } }),
    TOAST_KEYBOARD_GAP
  )
})

test("the keyboard inset is the part of the window the keyboard covers", () => {
  assert.equal(resolveToastKeyboardInset({ windowHeight: 844, keyboardScreenY: 508 }), 336)
  assert.equal(resolveToastKeyboardInset({ windowHeight: 844, keyboardScreenY: 844 }), 0)
  assert.equal(resolveToastKeyboardInset({ windowHeight: 844, keyboardScreenY: 900 }), 0)
  assert.equal(resolveToastKeyboardInset({ windowHeight: 844, keyboardScreenY: Number.NaN }), 0)
})

test("haptics map to the toast type and stay off for info", () => {
  assert.equal(getToastHapticKind("success"), "success")
  assert.equal(getToastHapticKind("warning"), "error")
  assert.equal(getToastHapticKind("info"), null)
})

test("the announcement reads the title and the body", () => {
  assert.equal(getToastAnnouncement(first), "Saved")
  assert.equal(getToastAnnouncement(second), "Oops. Try again")
})

test("pressing an actionable toast dismisses it, then runs its action once", () => {
  const calls: string[] = []
  const actionable: ToastData = {
    id: "toast_3",
    title: "Ayşe odada",
    body: "Katılmak için dokun",
    type: "info",
    accessibilityLabel: "Ayşe odada. Katılmak için dokun",
    onPress: () => { calls.push("join") }
  }
  handleToastPress(actionable, () => { calls.push("dismiss") })
  assert.deepEqual(calls, ["dismiss", "join"])

  calls.length = 0
  handleToastPress(first, () => { calls.push("dismiss") })
  assert.deepEqual(calls, ["dismiss"], "a plain toast only dismisses")

  const labels = getToastCopy("tr")
  assert.equal(getToastPressLabel(actionable, labels), "Ayşe odada. Katılmak için dokun")
  assert.equal(getToastPressLabel(first, labels), "Bildirimi kapat: Saved")
  assert.equal(
    getToastPressLabel({ title: "Bora", onPress: () => undefined }, labels),
    "Aç: Bora",
    "an actionable toast without its own label says it opens"
  )
})

test("the toast locale is Turkish only for Turkish locales", () => {
  assert.equal(resolveToastLocale("tr-TR"), "tr")
  assert.equal(resolveToastLocale("TR"), "tr")
  assert.equal(resolveToastLocale("en-US"), "en")
  assert.equal(resolveToastLocale("de-DE"), "en")
  assert.equal(resolveToastLocale(undefined), "en")
})
