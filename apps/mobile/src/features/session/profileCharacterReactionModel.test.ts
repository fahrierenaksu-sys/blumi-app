import assert from "node:assert/strict"
import test from "node:test"
import {
  createFakeReactRuntime,
  createReactNativeStub,
  createReanimatedStub,
  loadSourceWithFakeReact
} from "../../testing/hookHarness"
import * as profileCharacterReactionModel from "./profileCharacterReactionModel"
import {
  getProfileCharacterReaction,
  getProfileCharacterReactionAtlasOffset,
  getProfileCharacterReactionFrameSteps,
  getProfileCharacterReactionSettleDelayMs
} from "./profileCharacterReactionModel"
import * as profileSetupVisualModel from "./profileSetupVisualModel"

test("an unselected profile hero stays neutral", () => {
  assert.deepEqual(getProfileCharacterReaction(undefined), {
    interactionLabel: "Karakterini seçebilirsin",
    motionStyle: "idle",
    timeline: null
  })
})

test("the authored timelines have one duration per transition and settle on the last frame", () => {
  for (const gender of ["woman", "man"] as const) {
    const reaction = getProfileCharacterReaction(gender)
    assert.ok(reaction.timeline)
    assert.equal(
      reaction.timeline.frameDurationsMs.length,
      reaction.timeline.frameCount - 1
    )
    assert.equal(
      reaction.timeline.settleFrameIndex,
      reaction.timeline.frameCount - 1
    )
    assert.ok(reaction.timeline.frameDurationsMs.every((duration) => duration > 0))
  }
})

test("the reaction cuts through every authored frame in order and floats once the settle frame shows", () => {
  for (const gender of ["woman", "man"] as const) {
    const timeline = getProfileCharacterReaction(gender).timeline
    assert.ok(timeline)
    const steps = getProfileCharacterReactionFrameSteps(timeline)
    assert.deepEqual(
      steps.map((step) => step.frameIndex),
      Array.from({ length: timeline.frameCount - 1 }, (_, index) => index + 1)
    )
    assert.deepEqual(steps.map((step) => step.holdMs), [...timeline.frameDurationsMs])
    const settleStep = steps.findIndex((step) => step.frameIndex === timeline.settleFrameIndex)
    assert.equal(
      getProfileCharacterReactionSettleDelayMs(timeline),
      steps.slice(0, settleStep + 1).reduce((total, step) => total + step.holdMs, 0)
    )
  }
})

test("each frame shifts the atlas so exactly that cell fills the frame", () => {
  const atlas = { atlasColumns: 4, frameCount: 16 }
  const offset = (frame: number) => {
    const { x, y } = getProfileCharacterReactionAtlasOffset(frame, atlas, 152, 228)
    return { x: x + 0, y: y + 0 }
  }
  assert.deepEqual(offset(0), { x: 0, y: 0 })
  assert.deepEqual(offset(5), { x: -152, y: -228 })
  assert.deepEqual(offset(15), { x: -456, y: -684 })
  assert.deepEqual(offset(40), { x: -456, y: -684 }, "never past the last frame")
  assert.deepEqual(offset(Number.NaN), { x: 0, y: 0 })
})

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

function flattenStyle(style: unknown): Record<string, any> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle))
  return style && typeof style === "object" ? style as Record<string, any> : {}
}

test("the gender reaction plays on the UI thread: no timers and no React render per frame", () => {
  const timers: unknown[] = []
  const runtime = createFakeReactRuntime()
  const reanimated = createReanimatedStub(runtime)
  const { GeneratedReactionSprite } = loadSourceWithFakeReact<{
    GeneratedReactionSprite: (props: Record<string, unknown>) => unknown
  }>("features/session/ProfileCharacterReactionStage.tsx", runtime, {
    modules: {
      "react-native": createReactNativeStub().module,
      "react-native-reanimated": reanimated.module,
      "../../ui/animations": {
        useReducedMotionPreference: () => ({ reduceMotion: false, isResolved: true })
      },
      "./profileCharacterReactionModel": profileCharacterReactionModel,
      "./profileSetupVisualModel": profileSetupVisualModel
    },
    globals: {
      setTimeout: (callback: unknown) => timers.push(callback),
      clearTimeout: () => undefined
    },
    inertUnknown: true
  })
  runtime.render(() => GeneratedReactionSprite({ compact: false, gender: "woman", motionActive: true }))

  const timeline = getProfileCharacterReaction("woman").timeline
  assert.ok(timeline)
  assert.deepEqual(timers, [], "no JS timer drives the frames")
  const holds = reanimated.calls
    .filter((call) => call.kind === "withDelay")
    .map((call) => call.config?.delay)
  assert.deepEqual(holds.slice(0, timeline.frameDurationsMs.length), [...timeline.frameDurationsMs])
  assert.equal(runtime.renderCount, 1, "starting the reaction renders once")

  // The stub settles the whole sequence at once; the next style evaluation
  // shows the settle frame through the atlas transform.
  runtime.rerender()
  const atlas = findElement(runtime.output, "Animated.Image")
  assert.ok(atlas, "the atlas is an animated image")
  assert.deepEqual(flattenStyle(atlas.props.style).transform, [{ translateX: -456 }, { translateY: -684 }])
})
