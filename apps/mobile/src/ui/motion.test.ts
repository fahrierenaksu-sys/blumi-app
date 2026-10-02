import assert from "node:assert/strict"
import test from "node:test"
import {
  createFakeReactRuntime,
  createReactNativeStub,
  createReanimatedStub,
  loadSourceWithFakeReact
} from "../testing/hookHarness"
import type * as MotionModule from "./motion"

type Motion = typeof MotionModule

function load(osReduceMotion: boolean | Error = false) {
  const runtime = createFakeReactRuntime()
  const reanimated = createReanimatedStub(runtime)
  const osListeners = new Set<(enabled: boolean) => void>()
  const reactNative = createReactNativeStub({
    AccessibilityInfo: {
      isReduceMotionEnabled: () => osReduceMotion instanceof Error
        ? Promise.reject(osReduceMotion)
        : Promise.resolve(osReduceMotion),
      addEventListener: (_event: string, listener: (enabled: boolean) => void) => {
        osListeners.add(listener)
        return { remove: () => osListeners.delete(listener) }
      }
    }
  })
  const motion = loadSourceWithFakeReact<Motion>("ui/motion.ts", runtime, {
    modules: { "react-native": reactNative.module, "react-native-reanimated": reanimated.module },
    real: ["./reducedMotionStore", "./motionTokens"]
  })
  return {
    motion,
    runtime,
    reanimated,
    emitOs: (enabled: boolean) => { for (const listener of osListeners) listener(enabled) }
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

test("full motion: movement tokens are springs with the planned feel, opacity tokens are short fades", () => {
  const { motion } = load()
  const full = motion.resolveMotion(false)
  assert.equal(full.reduceMotion, false)
  for (const name of ["press", "snappy", "smooth", "bouncy"] as const) {
    assert.equal(full[name].kind, "spring", `${name} springs`)
  }
  // Ordering, not literals: a press settles fastest, a celebration overshoots most.
  const duration = (token: MotionModule.ResolvedMotion) => token.duration
  assert.ok(duration(full.press) < duration(full.snappy))
  assert.ok(duration(full.snappy) < duration(full.smooth))
  assert.ok(duration(full.smooth) < duration(full.bouncy))
  const ratio = (token: MotionModule.ResolvedMotion) => token.kind === "spring" ? token.dampingRatio : 1
  assert.equal(ratio(full.smooth), 1, "smooth never overshoots")
  assert.ok(ratio(full.bouncy) < ratio(full.snappy), "bouncy overshoots more than snappy")
  // Exits are faster than entrances.
  assert.ok(full.fadeOut.duration < full.fadeIn.duration)
})

test("Reduce Motion: movement lands at once and opacity crossfades", () => {
  const { motion } = load()
  const reduced = motion.resolveMotion(true)
  assert.equal(reduced.reduceMotion, true)
  for (const name of ["press", "snappy", "smooth", "bouncy"] as const) {
    assert.deepEqual({ ...reduced[name] }, { kind: "timing", duration: 0 }, `${name} does not travel`)
  }
  const crossfade = motion.MOTION_DURATIONS.crossfade
  for (const name of ["fadeIn", "fadeOut", "crossfade"] as const) {
    assert.deepEqual({ ...reduced[name] }, { kind: "timing", duration: crossfade })
  }
  assert.equal(reduced.staggerDelay(4), 0, "no stagger under Reduce Motion")
})

test("stagger delays only the first six items, in order", () => {
  const { motion } = load()
  const delays = Array.from({ length: 9 }, (_, index) => motion.resolveMotion(false).staggerDelay(index))
  assert.equal(delays[0], 0)
  for (let index = 1; index < 6; index += 1) assert.ok(delays[index]! > delays[index - 1]!)
  assert.equal(delays[6], delays[5], "the seventh item and later arrive with the sixth")
  assert.equal(delays[8], delays[5])
})

test("animateTo drives a spring for springs and a timing for fades, never deferring to Reanimated's own Reduce Motion switch", () => {
  const { motion, reanimated } = load()
  motion.animateTo(1, motion.resolveMotion(false).snappy, undefined, 3)
  motion.animateTo(0, motion.resolveMotion(false).fadeOut)
  motion.animateTo(1, motion.resolveMotion(true).snappy)
  const [spring, fade, instant] = reanimated.calls
  assert.equal(spring!.kind, "withSpring")
  assert.equal(spring!.config!.velocity, 3, "a spring after a gesture inherits the release velocity")
  assert.equal(spring!.config!.reduceMotion, "never")
  assert.equal(fade!.kind, "withTiming")
  assert.equal(fade!.config!.reduceMotion, "never")
  assert.equal(instant!.kind, "withTiming")
  assert.equal(instant!.config!.duration, 0)
})

test("useMotion fails closed until the OS answers, then follows the OS preference", async () => {
  const { motion, runtime, emitOs } = load(false)
  const first = runtime.render(() => motion.useMotion())
  assert.equal(first.reduceMotion, true, "unresolved preference behaves as Reduce Motion")
  await flush()
  assert.equal((runtime.output as MotionModule.Motion).reduceMotion, false)
  emitOs(true)
  assert.equal((runtime.output as MotionModule.Motion).reduceMotion, true)
  runtime.unmount()
})

test("useMotion stays in Reduce Motion when the OS query fails", async () => {
  const { motion, runtime } = load(new Error("unavailable"))
  runtime.render(() => motion.useMotion())
  await flush()
  assert.equal((runtime.output as MotionModule.Motion).reduceMotion, true)
  runtime.unmount()
})
