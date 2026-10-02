import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../testing/hookHarness"
import type { getBottomPanelEntering as GetBottomPanelEntering } from "./bottomPanelEntrance"

// The room editor dock and the wardrobe panel share one soft entrance: a
// UI-thread layout animation that rises and fades in, and no animation at all
// under Reduce Motion (the shared store is the only switch).
function load() {
  const calls: string[] = []
  const builder: Record<string, unknown> = {}
  for (const method of ["duration", "easing", "withInitialValues", "reduceMotion"]) {
    builder[method] = (value: unknown) => {
      calls.push(`${method}:${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
      return builder
    }
  }
  const reanimated = {
    Easing: { out: (curve: unknown) => curve, cubic: "cubic" },
    FadeInDown: builder,
    ReduceMotion: { Never: "never", System: "system" }
  }
  const { getBottomPanelEntering } = loadSourceWithFakeReact<{ getBottomPanelEntering: typeof GetBottomPanelEntering }>(
    "ui/bottomPanelEntrance.ts",
    createFakeReactRuntime(),
    { modules: { "react-native-reanimated": reanimated } }
  )
  return { getBottomPanelEntering, builder, calls }
}

test("the bottom panel rises and fades in on the UI thread, ignoring Reanimated's own Reduce Motion switch", () => {
  const { getBottomPanelEntering, builder, calls } = load()
  assert.equal(getBottomPanelEntering(false), builder)
  assert.ok(calls.includes("reduceMotion:never"))
  const initial = calls.find((call) => call.startsWith("withInitialValues:"))
  assert.ok(initial, "the panel starts below its resting place")
  const values = JSON.parse(initial.slice("withInitialValues:".length)) as { opacity: number; transform: { translateY: number }[] }
  assert.equal(values.opacity, 0)
  assert.ok(values.transform[0]!.translateY > 0)
})

test("Reduce Motion: the panel simply appears, with no entering animation", () => {
  assert.equal(load().getBottomPanelEntering(true), undefined)
})
