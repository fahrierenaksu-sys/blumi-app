/**
 * Test-only: a react-native-reanimated surface that plays animations against
 * the wall clock, so `mock.timers` (Date + setTimeout) can move a scene
 * through time and a test can read what is on screen at any moment.
 *
 * - `withTiming`, `withDelay`, `withSequence`, `withRepeat` (and `withSpring`
 *   as a timing of its `duration`) build plain descriptions; assigning one to
 *   a shared value starts it from the value's current position.
 * - `springRestFactor` (default 1) models a real spring's late completion:
 *   the value arrives at `duration`, but the completion callback fires at
 *   `duration × springRestFactor` (about 1.5 on device), when it rests.
 * - Reading `.value` samples the running animation at `Date.now()`.
 * - Completion callbacks fire through `setTimeout` at their end time with
 *   `true`, and with `false` when the animation is cancelled or replaced.
 * - `useAnimatedStyle` returns an object whose properties re-run the worklet
 *   on every read, so a rendered style reports the frame at the current time.
 * - Easing curves are linear: tests assert where a value is at the start and
 *   end of a segment, never the shape of the curve between.
 *
 * Never import this from production code.
 */
import { loadSourceWithFakeReact, type FakeReactRuntime } from "./hookHarness"

type Callback = ((finished?: boolean) => void) | undefined

type ClockAnimation =
  | { readonly kind: "timing"; readonly to: number; readonly duration: number; readonly callback: Callback }
  | { readonly kind: "delay"; readonly delay: number; readonly inner: ClockAnimation }
  | { readonly kind: "sequence"; readonly items: readonly ClockAnimation[] }
  | { readonly kind: "repeat"; readonly inner: ClockAnimation; readonly count: number; readonly callback: Callback }

const ANIMATION = Symbol("clock-animation")
type Tagged = ClockAnimation & { readonly [ANIMATION]: true }

const tag = (animation: ClockAnimation): Tagged => ({ ...animation, [ANIMATION]: true }) as Tagged
const isAnimation = (value: unknown): value is Tagged =>
  typeof value === "object" && value !== null && ANIMATION in value

function durationOf(animation: ClockAnimation): number {
  switch (animation.kind) {
    case "timing": return animation.duration
    case "delay": return animation.delay + durationOf(animation.inner)
    case "sequence": return animation.items.reduce((sum, item) => sum + durationOf(item), 0)
    case "repeat": return animation.count < 0 ? Infinity : animation.count * durationOf(animation.inner)
  }
}

function endOf(animation: ClockAnimation, from: number): number {
  switch (animation.kind) {
    case "timing": return animation.to
    case "delay": return endOf(animation.inner, from)
    case "sequence": return animation.items.reduce((value, item) => endOf(item, value), from)
    case "repeat": return endOf(animation.inner, from)
  }
}

function sample(animation: ClockAnimation, from: number, elapsed: number): number {
  switch (animation.kind) {
    case "timing":
      if (elapsed >= animation.duration) return animation.to
      return from + (animation.to - from) * (Math.max(0, elapsed) / animation.duration)
    case "delay":
      return elapsed < animation.delay ? from : sample(animation.inner, from, elapsed - animation.delay)
    case "sequence": {
      let value = from
      let remaining = elapsed
      for (const item of animation.items) {
        const duration = durationOf(item)
        if (remaining < duration) return sample(item, value, remaining)
        remaining -= duration
        value = endOf(item, value)
      }
      return value
    }
    case "repeat": {
      const pass = durationOf(animation.inner)
      if (pass <= 0) return endOf(animation.inner, from)
      const completed = Math.floor(elapsed / pass)
      if (animation.count > 0 && completed >= animation.count) return endOf(animation.inner, from)
      return sample(animation.inner, from, elapsed - completed * pass)
    }
  }
}

/** Callbacks of the finite parts, with the time each one fires. */
function callbacksOf(
  animation: ClockAnimation,
  offset: number,
  out: { at: number; callback: NonNullable<Callback> }[]
): void {
  switch (animation.kind) {
    case "timing":
      if (animation.callback) out.push({ at: offset + animation.duration, callback: animation.callback })
      return
    case "delay":
      callbacksOf(animation.inner, offset + animation.delay, out)
      return
    case "sequence": {
      let at = offset
      for (const item of animation.items) {
        callbacksOf(item, at, out)
        at += durationOf(item)
      }
      return
    }
    case "repeat": {
      if (animation.count < 0) return
      const pass = durationOf(animation.inner)
      for (let index = 0; index < animation.count; index += 1) callbacksOf(animation.inner, offset + index * pass, out)
      if (animation.callback) out.push({ at: offset + animation.count * pass, callback: animation.callback })
    }
  }
}

export interface ClockSharedValue<T = number> {
  value: T
  /** True while an animation is running. */
  readonly animating: boolean
  cancel(): void
}

function createClockSharedValue<T>(initial: T): ClockSharedValue<T> {
  let base = initial
  let running: { animation: ClockAnimation; from: number; startedAt: number } | null = null
  let pending: { callback: NonNullable<Callback>; timer: ReturnType<typeof setTimeout> }[] = []

  const current = (): T => {
    if (!running) return base
    const elapsed = Date.now() - running.startedAt
    if (elapsed >= durationOf(running.animation)) {
      base = endOf(running.animation, running.from) as T
      running = null
      return base
    }
    return sample(running.animation, running.from, elapsed) as T
  }
  const cancel = () => {
    if (!running) return
    base = current()
    running = null
    const interrupted = pending
    pending = []
    for (const { callback, timer } of interrupted) {
      clearTimeout(timer)
      callback(false)
    }
  }

  return {
    get value() { return current() },
    set value(next: T) {
      const from = current()
      cancel()
      base = from
      if (!isAnimation(next)) {
        base = next
        return
      }
      running = { animation: next, from: from as number, startedAt: Date.now() }
      const events: { at: number; callback: NonNullable<Callback> }[] = []
      callbacksOf(next, 0, events)
      for (const event of events) {
        const entry = {
          callback: event.callback,
          timer: setTimeout(() => {
            pending = pending.filter((item) => item !== entry)
            event.callback(true)
          }, event.at)
        }
        pending.push(entry)
      }
    },
    get animating() {
      current()
      return running !== null
    },
    cancel
  }
}

type Extrapolate = "clamp" | "extend" | "identity"
type ExtrapolationConfig = Extrapolate | { extrapolateLeft?: Extrapolate; extrapolateRight?: Extrapolate }

export function clockInterpolate(
  value: number,
  input: readonly number[],
  output: readonly number[],
  extrapolation: ExtrapolationConfig = "extend"
): number {
  const left = typeof extrapolation === "string" ? extrapolation : extrapolation.extrapolateLeft ?? "extend"
  const right = typeof extrapolation === "string" ? extrapolation : extrapolation.extrapolateRight ?? "extend"
  const last = input.length - 1
  let segment = 0
  while (segment < last - 1 && value > input[segment + 1]!) segment += 1
  const i0 = input[segment]!, i1 = input[segment + 1]!
  const o0 = output[segment]!, o1 = output[segment + 1]!
  if (value < input[0]!) {
    if (left === "clamp") return output[0]!
    if (left === "identity") return value
  }
  if (value > input[last]!) {
    if (right === "clamp") return output[last]!
    if (right === "identity") return value
  }
  if (i1 === i0) return value <= i0 ? o0 : o1
  return o0 + ((value - i0) / (i1 - i0)) * (o1 - o0)
}

/**
 * The clocked react-native-reanimated module plus a react-native-worklets
 * module whose `scheduleOnRN` calls straight through.
 */
export function createClockedReanimatedStub(
  runtime: FakeReactRuntime,
  options: { springRestFactor?: number } = {}
) {
  const springRestFactor = Math.max(1, options.springRestFactor ?? 1)
  const useRef = runtime.react.useRef as <T>(initial: T) => { current: T }
  const easing: (...args: unknown[]) => unknown = (first?: unknown) =>
    typeof first === "number" ? first : easing
  const Easing = new Proxy({}, { get: () => easing })
  const builder = (): Record<string, unknown> =>
    new Proxy({}, { get: (_target, property) => property === "then" ? undefined : () => builder() })
  const namespace = {
    View: "Animated.View",
    Text: "Animated.Text",
    Image: "Animated.Image",
    ScrollView: "Animated.ScrollView",
    createAnimatedComponent: <T>(component: T) => component
  }
  const sequenceItems = (args: unknown[]) => args.filter(isAnimation)
  const module: Record<string, unknown> = {
    __esModule: true,
    default: namespace,
    ...namespace,
    Easing,
    ReduceMotion: { Never: "never", System: "system", Always: "always" },
    Extrapolation: { CLAMP: "clamp", EXTEND: "extend", IDENTITY: "identity" },
    interpolate: clockInterpolate,
    makeMutable: <T>(initial: T) => createClockSharedValue(initial),
    useSharedValue: <T>(initial: T) => {
      const ref = useRef<ClockSharedValue<T> | null>(null)
      ref.current ??= createClockSharedValue(initial)
      return ref.current
    },
    useDerivedValue: <T>(worklet: () => T) => {
      const ref = useRef<{ worklet: () => T; derived: { readonly value: T } } | null>(null)
      if (!ref.current) {
        const holder = { worklet, derived: { get value() { return holder.worklet() } } }
        ref.current = holder
      }
      ref.current.worklet = worklet
      return ref.current.derived
    },
    useAnimatedStyle: (worklet: () => Record<string, unknown>) => {
      const style: Record<string, unknown> = {}
      for (const key of Object.keys(worklet())) {
        Object.defineProperty(style, key, { enumerable: true, get: () => worklet()[key] })
      }
      return style
    },
    useAnimatedReaction: () => undefined,
    cancelAnimation: (shared: ClockSharedValue<unknown>) => shared.cancel(),
    withTiming: (to: number, config?: { duration?: number }, callback?: Callback) =>
      tag({ kind: "timing", to, duration: config?.duration ?? 300, callback }),
    withSpring: (to: number, config?: { duration?: number }, callback?: Callback) => {
      const duration = config?.duration ?? 300
      if (springRestFactor === 1) return tag({ kind: "timing", to, duration, callback })
      return tag({
        kind: "sequence",
        items: [
          { kind: "timing", to, duration, callback: undefined },
          { kind: "timing", to, duration: duration * (springRestFactor - 1), callback }
        ]
      })
    },
    withDelay: (delay: number, inner: Tagged) => tag({ kind: "delay", delay, inner }),
    withSequence: (...args: unknown[]) => tag({ kind: "sequence", items: sequenceItems(args) }),
    withRepeat: (inner: Tagged, count = 2, _reverse = false, callback?: Callback) =>
      tag({ kind: "repeat", inner, count, callback }),
    LinearTransition: builder(),
    FadeIn: builder(),
    FadeOut: builder()
  }
  const worklets = {
    scheduleOnRN: (callback: (...args: unknown[]) => void, ...args: unknown[]) => callback(...args),
    runOnJS: <T>(callback: T) => callback
  }
  return { module, worklets }
}

/** The real `ui/motion` module, driven by the clocked Reanimated stub. */
export function loadClockedMotion(
  runtime: FakeReactRuntime,
  reanimated: Record<string, unknown>,
  reactNative: Record<string, unknown>
): Record<string, unknown> {
  return loadSourceWithFakeReact("ui/motion.ts", runtime, {
    modules: { "react-native": reactNative, "react-native-reanimated": reanimated },
    real: ["./reducedMotionStore", "./motionTokens"]
  })
}

export interface RenderedElement {
  type: unknown
  props: Record<string, unknown> & { children?: unknown; style?: unknown }
}

/** Every element of a rendered tree (host and component elements alike) that matches. */
export function findElements(
  tree: unknown,
  matches: (element: RenderedElement) => boolean
): RenderedElement[] {
  const found: RenderedElement[] = []
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (!node || typeof node !== "object" || !("props" in node)) return
    const element = node as RenderedElement
    if (matches(element)) found.push(element)
    visit(element.props.children)
  }
  visit(tree)
  return found
}

/** One style property of an element as it is on screen now (the last style that sets it wins). */
export function styleValue(element: RenderedElement, property: string): unknown {
  let value: unknown
  const visit = (style: unknown) => {
    if (Array.isArray(style)) {
      style.forEach(visit)
      return
    }
    if (style && typeof style === "object" && property in style) {
      value = (style as Record<string, unknown>)[property]
    }
  }
  visit(element.props.style)
  return value
}
