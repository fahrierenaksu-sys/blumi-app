/**
 * Test-only harness: a deterministic, renderer-free React hooks runtime plus a
 * loader that executes one production source file against it.
 *
 * It models what dependency-list regressions break: hook slot order, memo and
 * callback identity, effect scheduling and cleanup (layout before passive),
 * `useEffectEvent` (latest closure, callable only outside render) and
 * `useSyncExternalStore` (subscribe after commit, re-render on a changed
 * snapshot). State updates made outside render re-render synchronously, like
 * `act()`. It does not model concurrent rendering, Suspense or native views.
 *
 * Never import this from production code.
 */
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import vm from "node:vm"
import ts from "typescript"

type Deps = readonly unknown[] | undefined
type EffectRun = () => void | (() => void)
interface Slot {
  value?: unknown
  deps?: Deps
  cleanup?: () => void
  impl?: (...args: never[]) => unknown
  getSnapshot?: () => unknown
}
interface QueuedEffect {
  slot: Slot
  run: EffectRun
}

export interface FakeContext<T> {
  currentValue: T
  Provider: string
  Consumer: string
}

export interface FakeReactRuntime {
  readonly react: Record<string, unknown>
  readonly jsxRuntime: Record<string, unknown>
  /** Mounts (or replaces) the rendered function and flushes effects and updates. */
  render<T>(component: () => T): T
  /** Renders the current function again, as a parent re-render would. */
  rerender(): unknown
  unmount(): void
  readonly renderCount: number
  readonly output: unknown
}

const sameDeps = (previous: Deps, next: Deps) =>
  previous !== undefined && next !== undefined && previous.length === next.length &&
  previous.every((value, index) => Object.is(value, next[index]))

export function createFakeReactRuntime(): FakeReactRuntime {
  const slots: Slot[] = []
  let cursor = 0
  let phase: "idle" | "render" | "commit" = "idle"
  let dirty = false
  let mounted = false
  let component: (() => unknown) | undefined
  let output: unknown
  let renderCount = 0
  let idCounter = 0
  const layoutEffects: QueuedEffect[] = []
  const passiveEffects: QueuedEffect[] = []
  const eventUpdates: (() => void)[] = []

  const nextSlot = (): Slot => {
    const slot = slots[cursor] ?? (slots[cursor] = {})
    cursor += 1
    return slot
  }
  const scheduleUpdate = () => {
    dirty = true
    if (phase === "idle" && mounted) flush()
  }
  const runQueue = (queue: QueuedEffect[]) => {
    const pending = queue.splice(0)
    for (const { slot } of pending) {
      slot.cleanup?.()
      slot.cleanup = undefined
    }
    for (const { slot, run } of pending) {
      const cleanup = run()
      slot.cleanup = typeof cleanup === "function" ? cleanup : undefined
    }
  }
  function renderOnce() {
    if (!component) throw new Error("Nothing is mounted")
    phase = "render"
    cursor = 0
    dirty = false
    renderCount += 1
    try {
      output = component()
    } finally {
      phase = "commit"
    }
    try {
      for (const update of eventUpdates.splice(0)) update()
      runQueue(layoutEffects)
      runQueue(passiveEffects)
    } finally {
      phase = "idle"
    }
  }
  function flush() {
    for (let guard = 0; dirty && mounted; guard += 1) {
      if (guard > 50) throw new Error("Render loop: state keeps changing after every render")
      renderOnce()
    }
  }
  const effectHook = (queue: QueuedEffect[]) => (run: EffectRun, deps?: Deps) => {
    const slot = nextSlot()
    if (deps !== undefined && sameDeps(slot.deps, deps)) return
    slot.deps = deps
    queue.push({ slot, run })
  }
  const memoHook = <T>(work: () => T, deps: Deps): T => {
    const slot = nextSlot()
    if (deps === undefined || !sameDeps(slot.deps, deps)) {
      slot.value = work()
      slot.deps = deps
    }
    return slot.value as T
  }
  const useState = <T>(initial: T | (() => T)) => {
    const slot = nextSlot()
    if (!("value" in slot)) {
      slot.value = typeof initial === "function" ? (initial as () => T)() : initial
      slot.impl = ((next: T | ((current: T) => T)) => {
        const value = typeof next === "function" ? (next as (current: T) => T)(slot.value as T) : next
        if (Object.is(value, slot.value)) return
        slot.value = value
        scheduleUpdate()
      }) as never
    }
    return [slot.value as T, slot.impl]
  }

  const react: Record<string, unknown> = {
    useState,
    useReducer: <S, A>(reducer: (state: S, action: A) => S, initialArg: S, init?: (arg: S) => S) => {
      const [state, setState] = useState(() => (init ? init(initialArg) : initialArg))
      const slot = nextSlot()
      slot.value ??= (action: A) => (setState as (next: (current: S) => S) => void)((current) => reducer(current, action))
      return [state, slot.value]
    },
    useRef: <T>(initial: T) => {
      const slot = nextSlot()
      if (!("value" in slot)) slot.value = { current: initial }
      return slot.value as { current: T }
    },
    useMemo: memoHook,
    useCallback: <T>(callback: T, deps: Deps) => memoHook(() => callback, deps),
    useEffect: effectHook(passiveEffects),
    useLayoutEffect: effectHook(layoutEffects),
    useInsertionEffect: effectHook(layoutEffects),
    useEffectEvent: <T extends (...args: never[]) => unknown>(callback: T): T => {
      const slot = nextSlot()
      eventUpdates.push(() => { slot.impl = callback })
      if (!slot.value) {
        slot.impl = callback
        slot.value = (...args: never[]) => {
          if (phase === "render") throw new Error("An effect event was called during render")
          return slot.impl?.(...args)
        }
      }
      return slot.value as T
    },
    useSyncExternalStore: <T>(subscribe: (listener: () => void) => () => void, getSnapshot: () => T) => {
      const slot = nextSlot()
      const value = getSnapshot()
      if (!Object.is(value, getSnapshot())) {
        throw new Error("getSnapshot must return a cached value between store changes")
      }
      slot.value = value
      slot.getSnapshot = getSnapshot
      if (!sameDeps(slot.deps, [subscribe])) {
        slot.deps = [subscribe]
        passiveEffects.push({
          slot,
          run: () => {
            const check = () => {
              if (!Object.is(slot.getSnapshot?.(), slot.value)) scheduleUpdate()
            }
            const unsubscribe = subscribe(check)
            check()
            return unsubscribe
          }
        })
      }
      return value
    },
    useContext: <T>(context: FakeContext<T>) => context.currentValue,
    useId: () => {
      const slot = nextSlot()
      slot.value ??= `:r${(idCounter += 1)}:`
      return slot.value
    },
    useTransition: () => [false, (work: () => void) => work()],
    useDeferredValue: <T>(value: T) => value,
    useImperativeHandle: () => undefined,
    useDebugValue: () => undefined,
    createContext: <T>(currentValue: T): FakeContext<T> => ({
      currentValue,
      Provider: "Context.Provider",
      Consumer: "Context.Consumer"
    }),
    memo: <T>(component: T) => component,
    forwardRef: <T>(component: T) => component,
    Fragment: "Fragment",
    Children: { map: () => [], toArray: () => [], only: (child: unknown) => child, count: () => 0 }
  }
  react.default = react
  const element = (type: unknown, props: unknown, key?: unknown) => ({ type, props, key })
  const jsxRuntime = { jsx: element, jsxs: element, jsxDEV: element, Fragment: "Fragment" }

  return {
    react,
    jsxRuntime,
    render<T>(next: () => T): T {
      component = next
      mounted = true
      renderOnce()
      flush()
      return output as T
    },
    rerender() {
      renderOnce()
      flush()
      return output
    },
    unmount() {
      mounted = false
      for (const slot of slots) {
        slot.cleanup?.()
        slot.cleanup = undefined
      }
    },
    get renderCount() { return renderCount },
    get output() { return output }
  }
}

/** A module whose every member (at any depth) is an inert callable. */
export function createInertModule(name = "inert"): unknown {
  const handler: ProxyHandler<() => void> = {
    get(_target, property) {
      if (property === "then") return undefined
      if (property === "__esModule") return true
      if (property === Symbol.toPrimitive) return () => ""
      if (property === Symbol.iterator) return function* empty() {}
      if (property === "length") return 0
      if (property === "toString") return () => `[inert ${name}]`
      return createInertModule(`${name}.${String(property)}`)
    },
    apply: () => createInertModule(`${name}()`),
    construct: () => createInertModule(`new ${name}`) as object
  }
  return new Proxy(() => undefined, handler)
}

export interface AnimatedCall {
  kind: string
  value?: unknown
  config?: unknown
}

/** Minimal react-native surface for hook and component logic under test. */
export function createReactNativeStub(overrides: Record<string, unknown> = {}) {
  const animatedCalls: AnimatedCall[] = []
  class AnimatedValue {
    value: number
    private listeners = new Map<string, (state: { value: number }) => void>()
    private nextListenerId = 0
    constructor(value: number) { this.value = value }
    setValue(value: number) {
      this.value = value
      animatedCalls.push({ kind: "setValue", value })
      for (const listener of this.listeners.values()) listener({ value })
    }
    stopAnimation() { animatedCalls.push({ kind: "stopAnimation" }) }
    addListener(listener: (state: { value: number }) => void) {
      const id = String((this.nextListenerId += 1))
      this.listeners.set(id, listener)
      return id
    }
    removeListener(id: string) { this.listeners.delete(id) }
    interpolate(config: unknown) { return { interpolate: config } }
  }
  const animation = (kind: string, value?: unknown, config?: unknown) => ({
    start: () => { animatedCalls.push({ kind: `${kind}.start`, value, config }) },
    stop: () => { animatedCalls.push({ kind: `${kind}.stop`, value, config }) }
  })
  const easing = (): ((value: number) => number) => (value: number) => value
  const Easing = new Proxy({}, { get: () => (..._args: unknown[]) => easing() })
  const appStateListeners = new Set<(state: string) => void>()
  const stub: Record<string, unknown> = {
    Animated: {
      Value: AnimatedValue,
      View: "Animated.View",
      Text: "Animated.Text",
      Image: "Animated.Image",
      timing: (value: unknown, config: unknown) => animation("timing", value, config),
      spring: (value: unknown, config: unknown) => animation("spring", value, config),
      decay: (value: unknown, config: unknown) => animation("decay", value, config),
      sequence: (items: unknown) => animation("sequence", items),
      parallel: (items: unknown) => animation("parallel", items),
      stagger: (_delay: number, items: unknown) => animation("stagger", items),
      loop: (item: unknown, config?: unknown) => animation("loop", item, config),
      delay: (ms: number) => animation("delay", ms),
      add: () => new AnimatedValue(0),
      multiply: () => new AnimatedValue(0),
      event: () => () => undefined,
      createAnimatedComponent: <T>(component: T) => component
    },
    Easing,
    StyleSheet: {
      create: <T>(styles: T) => styles,
      flatten: <T>(style: T) => style,
      hairlineWidth: 1,
      absoluteFill: {},
      absoluteFillObject: {}
    },
    Platform: { OS: "ios", select: (options: Record<string, unknown>) => options.ios ?? options.default },
    AppState: {
      currentState: "active",
      addEventListener: (_event: string, listener: (state: string) => void) => {
        appStateListeners.add(listener)
        return { remove: () => appStateListeners.delete(listener) }
      }
    },
    Alert: { alert: () => undefined },
    Dimensions: { get: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }) },
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
    View: "View",
    Text: "Text",
    Image: "Image",
    Pressable: "Pressable",
    ScrollView: "ScrollView",
    ActivityIndicator: "ActivityIndicator",
    ...overrides
  }
  return {
    module: stub,
    animatedCalls,
    AnimatedValue,
    emitAppState(state: string) {
      for (const listener of [...appStateListeners]) listener(state)
    },
    appStateListenerCount: () => appStateListeners.size
  }
}

export interface LoadSourceOptions {
  /** Modules by the exact specifier the source imports. */
  modules?: Record<string, unknown>
  /** Free variables visible to the source (for example `__DEV__`, timers). */
  globals?: Record<string, unknown>
  /** Specifiers loaded with the real module loader (pure modules only). */
  real?: readonly string[]
  /** Unlisted imports become inert modules instead of failing the test. */
  inertUnknown?: boolean
}

const mobileSourceRoot = resolve(__dirname, "..")

/**
 * Executes `apps/mobile/src/<sourcePath>` against the fake runtime and returns
 * its exports. Only listed imports resolve; anything else fails loudly unless
 * `inertUnknown` is set.
 */
export function loadSourceWithFakeReact<T = Record<string, unknown>>(
  sourcePath: string,
  runtime: FakeReactRuntime,
  options: LoadSourceOptions = {}
): T {
  const file = resolve(mobileSourceRoot, sourcePath)
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true
    }
  }).outputText
  const realRequire = createRequire(file)
  const modules = options.modules ?? {}
  const requireModule = (specifier: string): unknown => {
    if (specifier in modules) return modules[specifier]
    if (specifier === "react") return runtime.react
    if (specifier === "react/jsx-runtime" || specifier === "react/jsx-dev-runtime") return runtime.jsxRuntime
    if (options.real?.includes(specifier)) return realRequire(specifier)
    if (options.inertUnknown) return createInertModule(specifier)
    throw new Error(`${sourcePath}: unexpected import ${specifier}`)
  }
  const globals = { __DEV__: false, ...options.globals }
  const parameters = ["exports", "require", "module", "__filename", "__dirname", ...Object.keys(globals)]
  const wrapper = vm.runInThisContext(
    `(function (${parameters.join(", ")}) {\n${code}\n})`,
    { filename: file }
  ) as (...args: unknown[]) => void
  const module = { exports: {} as T }
  wrapper(module.exports, requireModule, module, file, dirname(file), ...Object.values(globals))
  return module.exports
}
