import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../testing/hookHarness"
import type { springPressScale as SpringPressScale } from "./animations"

// Press feedback must not move under Reduce Motion: the value jumps to its
// target and any running spring stops. Otherwise it springs on the native driver.
function load() {
  const reactNative = createReactNativeStub({
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => false,
      addEventListener: () => ({ remove: () => undefined })
    }
  })
  const { springPressScale } = loadSourceWithFakeReact<{ springPressScale: typeof SpringPressScale }>(
    "ui/animations.ts",
    createFakeReactRuntime(),
    {
      modules: {
        "react-native": reactNative.module,
        "./motion": { useReducedMotion: () => false, MOTION_STAGGER: { stepMs: 30, maxItems: 6 } }
      },
      real: ["./ambientMotionModel", "./theme"]
    }
  )
  return { springPressScale, reactNative }
}

const SPRING = { damping: 15, stiffness: 300, mass: 0.6 }

test("Reduce Motion sets the press scale immediately and starts no spring", () => {
  const { springPressScale, reactNative } = load()
  const value = new reactNative.AnimatedValue(1)
  springPressScale(value as never, 0.96, SPRING, true)
  assert.equal(value.value, 0.96)
  assert.deepEqual(reactNative.animatedCalls.map((call) => call.kind), ["stopAnimation", "setValue"])
})

test("without Reduce Motion the press scale springs on the native driver", () => {
  const { springPressScale, reactNative } = load()
  const value = new reactNative.AnimatedValue(1)
  springPressScale(value as never, 0.96, SPRING, false)
  assert.equal(value.value, 1)
  const calls = reactNative.animatedCalls
  assert.deepEqual(calls.map((call) => call.kind), ["spring.start"])
  assert.equal((calls[0]!.config as { useNativeDriver: boolean }).useNativeDriver, true)
  assert.equal((calls[0]!.config as { toValue: number }).toValue, 0.96)
})
