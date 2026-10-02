import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import * as transitionModel from "./wardrobeCatalogTransitionModel"
import { resolveWardrobeCatalogFrame } from "./wardrobeCatalogTransitionModel"

const hair = ["hair-a", "hair-b"]
const tops = ["top-a", "top-b", "top-c"]

test("the shown category always draws its freshest cards", () => {
  const frame = resolveWardrobeCatalogFrame({
    requestedCategory: "hair", shownCategory: "hair", cards: hair, lastShownCards: ["stale"], reduceMotion: false
  })
  assert.deepEqual(frame, { cards: hair, switching: false })
})

test("a new category keeps the old cards until they are invisible, so new cards never flash", () => {
  const frame = resolveWardrobeCatalogFrame({
    requestedCategory: "top", shownCategory: "hair", cards: tops, lastShownCards: hair, reduceMotion: false
  })
  assert.deepEqual(frame, { cards: hair, switching: true })
})

test("Reduce Motion swaps at once without a fade", () => {
  const frame = resolveWardrobeCatalogFrame({
    requestedCategory: "top", shownCategory: "hair", cards: tops, lastShownCards: hair, reduceMotion: true
  })
  assert.deepEqual(frame, { cards: tops, switching: false })
})

function renderCategoryMotion() {
  // A Reanimated stand-in whose fades keep running until the test ends them,
  // so a tap can land mid fade-out.
  const runtime = createFakeReactRuntime()
  const useRef = runtime.react.useRef as <T>(initial: T) => { current: T }
  type Fade = { target: number; done?: (finished: boolean) => void }
  let running: Fade | null = null
  let opacity: { value: number } | undefined
  const endRunning = (): void => {
    const previous = running
    running = null
    previous?.done?.(false)
  }
  const reanimated = {
    useSharedValue: (initial: number) => {
      const ref = useRef<{ value: number } | null>(null)
      if (!ref.current) {
        let current = initial
        ref.current = {
          get value() { return current },
          set value(next: number) {
            const fade = next as unknown as Fade | number
            // Assigning replaces the running fade, which ends unfinished.
            endRunning()
            if (typeof fade === "number") current = fade
            else running = fade
          }
        }
        opacity = ref.current
      }
      return ref.current
    },
    useAnimatedStyle: (worklet: () => unknown) => worklet(),
    withTiming: (target: number, _config: unknown, done?: (finished: boolean) => void): Fade => ({ target, done }),
    cancelAnimation: endRunning
  }
  type Transition = { shownCategory: string; cards: readonly string[]; switching: boolean }
  const { useWardrobeCatalogTransition } = loadSourceWithFakeReact<{
    useWardrobeCatalogTransition: (input: { activeCategory: string; cards: readonly string[]; reduceMotion: boolean }) => Transition
  }>("features/avatarV2/wardrobe/useWardrobeCategoryMotion.ts", runtime, {
    modules: {
      "react-native-reanimated": reanimated,
      "react-native-worklets": {
        scheduleOnRN: (callback: (...args: unknown[]) => void, ...args: unknown[]) => callback(...args)
      },
      "./wardrobeCatalogTransitionModel": transitionModel
    }
  })
  let input = { activeCategory: "hair", cards: hair as readonly string[], reduceMotion: false }
  runtime.render(() => useWardrobeCatalogTransition(input))
  return {
    result: () => runtime.output as Transition,
    opacity: () => opacity?.value,
    running: () => running,
    /** The UI thread finishes the running fade. */
    finishFade: () => {
      const fade = running
      if (!fade) return
      running = null
      opacity!.value = fade.target
      fade.done?.(true)
    },
    select: (activeCategory: string, cards: readonly string[]) => {
      input = { ...input, activeCategory, cards }
      runtime.rerender()
    }
  }
}

test("tapping back to the shown category mid fade-out cancels the swap and fades the products back in", () => {
  const motion = renderCategoryMotion()
  motion.finishFade() // the fade-in on mount
  motion.select("top", tops)
  assert.equal(motion.running()?.target, 0, "the hair products fade out")
  assert.equal(motion.result().switching, true)

  motion.select("hair", hair)
  assert.equal(motion.running()?.target, 1, "they fade straight back in")
  motion.finishFade()
  assert.equal(motion.opacity(), 1)
  assert.equal(motion.result().shownCategory, "hair", "the abandoned category never swaps in")
  assert.deepEqual(motion.result().cards, hair)
  assert.equal(motion.result().switching, false)
})

test("a finished fade-out swaps to the requested category, then fades it in", () => {
  const motion = renderCategoryMotion()
  motion.finishFade()
  motion.select("top", tops)
  motion.finishFade()
  assert.equal(motion.result().shownCategory, "top")
  assert.deepEqual(motion.result().cards, tops)
  assert.equal(motion.running()?.target, 1)
})
