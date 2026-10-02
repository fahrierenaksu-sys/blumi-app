import assert from "node:assert/strict"
import test from "node:test"
import {
  createFakeReactRuntime,
  createReactNativeStub,
  createReanimatedStub,
  loadSourceWithFakeReact
} from "../testing/hookHarness"
import type * as PressableScaleModule from "./PressableScale"

type Element = { type: unknown; props: Record<string, any> }

const flush = () => new Promise((resolve) => setImmediate(resolve))

// Mounts the real PressableScale over the real motion module; the OS Reduce
// Motion answer is the only input.
async function mount(osReduceMotion: boolean, props: Record<string, unknown> = {}) {
  const runtime = createFakeReactRuntime()
  const reanimated = createReanimatedStub(runtime)
  const reactNative = createReactNativeStub({
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(osReduceMotion),
      addEventListener: () => ({ remove: () => undefined })
    }
  })
  const modules = { "react-native": reactNative.module, "react-native-reanimated": reanimated.module }
  const motion = loadSourceWithFakeReact("ui/motion.ts", runtime, {
    modules,
    real: ["./reducedMotionStore", "./motionTokens"]
  })
  const { PressableScale } = loadSourceWithFakeReact<typeof PressableScaleModule>("ui/PressableScale.tsx", runtime, {
    modules: { ...modules, "./motion": motion }
  })
  runtime.render(() => PressableScale({ accessibilityRole: "button", accessibilityLabel: "Save", ...props }))
  await flush()
  const element = () => runtime.output as Element
  const style = () => Object.assign({}, ...(element().props.style as unknown[]).filter(Boolean)) as Record<string, any>
  return { runtime, reanimated, element, style }
}

const pressEvent = {} as never

test("a press scales the control down on the press spring and springs back on release", async () => {
  const { reanimated, element, style } = await mount(false)
  assert.equal(style().transform[0].scale, 1, "at rest the control is full size")
  element().props.onPressIn(pressEvent)
  const pressIn = reanimated.calls.at(-1)!
  assert.equal(pressIn.kind, "withSpring")
  assert.equal(pressIn.target, 1)
  assert.equal(pressIn.config!.reduceMotion, "never", "the shared store is the only Reduce Motion switch")
  element().props.onPressOut(pressEvent)
  const pressOut = reanimated.calls.at(-1)!
  assert.equal(pressOut.kind, "withSpring")
  assert.equal(pressOut.target, 0)
})

test("the pressed scale is visible on the next frame and follows pressedScale", async () => {
  const { runtime, element, style } = await mount(false, { pressedScale: 0.9 })
  element().props.onPressIn(pressEvent)
  runtime.rerender()
  assert.equal(style().transform[0].scale, 0.9)
})

test("Reduce Motion: a pressed control dims in place and never moves", async () => {
  const { runtime, reanimated, element, style } = await mount(true)
  element().props.onPressIn(pressEvent)
  const pressIn = reanimated.calls.at(-1)!
  assert.equal(pressIn.kind, "withTiming")
  assert.equal(pressIn.config!.duration, 0)
  runtime.rerender()
  assert.equal(style().transform, undefined, "no scale under Reduce Motion")
  assert.ok(style().opacity < 1, "the press is still visible as a dim")
})

test("caller press handlers, accessibility and a pressed-state style function keep working", async () => {
  const seen: string[] = []
  const { runtime, element, style } = await mount(false, {
    onPressIn: () => seen.push("in"),
    onPressOut: () => seen.push("out"),
    style: ({ pressed }: { pressed: boolean }) => ({ borderWidth: pressed ? 2 : 1 })
  })
  assert.equal(element().props.accessibilityRole, "button")
  assert.equal(element().props.accessibilityLabel, "Save")
  assert.equal(style().borderWidth, 1)
  element().props.onPressIn(pressEvent)
  runtime.rerender()
  assert.equal(style().borderWidth, 2)
  element().props.onPressOut(pressEvent)
  runtime.rerender()
  assert.equal(style().borderWidth, 1)
  assert.deepEqual(seen, ["in", "out"])
})
