import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

function harness({ reduceMotion = false } = {}) {
  const source = readFileSync(new URL("./DiscoveryStartupBoundary.tsx", import.meta.url), "utf8")
  const output = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX
  } }).outputText
  const states = [], effects = []
  let cursor = 0, effectCursor = 0, revision = 0
  const timers = new Map()
  const jsx = (type, props) => ({ type, props })
  const exports = {}
  const changed = (a, b) => !a || b.some((value, index) => !Object.is(value, a[index]))
  runInNewContext(output, {
    exports,
    setTimeout: (callback, ms) => { const id = Symbol(); timers.set(id, { callback, ms }); return id },
    clearTimeout: (id) => timers.delete(id),
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx }
      if (name === "react-native") return { View: "View", StyleSheet: { create: (x) => x, absoluteFill: {} } }
      if (name.endsWith("BlumiLoadingScreen")) return { PreparedDiscoveryLoadingScreen: "Boot" }
      if (name === "react-native-reanimated") return { __esModule: true, default: { View: "Animated.View" }, withTiming: (toValue, config) => ({ toValue, config }) }
      if (name.endsWith("ui/animations")) return { useReducedMotion: () => reduceMotion }
      if (name === "react") return {
        createContext: () => ({ Provider: "Provider" }),
        useState(initial) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], (next) => { const value = typeof next === "function" ? next(states[index]) : next; if (!Object.is(value, states[index])) { states[index] = value; revision++ } }] },
        useCallback: (f) => f, useMemo: (f) => f(),
        useEffect(callback, deps) {
          const index = effectCursor++
          if (changed(effects[index]?.deps, deps)) {
            effects[index]?.cleanup?.()
            effects[index] = { deps, cleanup: callback() }
          }
        }
      }
      throw new Error(name)
    }
  })
  return {
    render(active = true) {
      let tree, previous
      do {
        previous = revision; cursor = 0; effectCursor = 0
        tree = exports.DiscoveryStartupBoundary({ active, children: "mounted-Discover" })
      } while (previous !== revision)
      return tree
    },
    timers,
    dispose() { effects.forEach((effect) => effect.cleanup?.()) }
  }
}

test("Discover remains mounted behind the cover, without touch or accessibility access", () => {
  const h = harness(), tree = h.render()
  const [content, cover] = tree.props.children.props.children
  assert.equal(content.props.children, "mounted-Discover")
  assert.equal(content.props.pointerEvents, "none")
  assert.equal(content.props.accessibilityElementsHidden, true)
  assert.equal(content.props.importantForAccessibility, "no-hide-descendants")
  assert.equal(cover.props.children.type, "Boot")
  tree.props.value.report("pending")
  assert.ok(h.render().props.children.props.children[1])
  h.dispose()
  assert.equal(h.timers.size, 0)
})
test("ready waits for the scan's natural completion; errors do not wait", () => {
  for (const status of ["ready", "error"]) {
    const h = harness()
    h.render().props.value.report(status)
    if (status === "ready") {
      const waiting = h.render()
      const cover = waiting.props.children.props.children[1]
      assert.ok(cover, "data readiness alone must not interrupt the scan")
      cover.props.children.props.onFinished()
    }
    const released = h.render()
    assert.equal(released.props.children.props.children[1], null)
    assert.equal(released.props.children.props.children[0].props.pointerEvents, "auto")
    released.props.value.report("pending")
    assert.equal(h.render().props.children.props.children[1], null)
    assert.equal(h.timers.size, 0)
  }
})
test("a completed scan alone cannot expose pending Discover content", () => {
  const h = harness()
  h.render().props.children.props.children[1].props.children.props.onFinished()
  assert.ok(h.render().props.children.props.children[1])
  h.render().props.value.report("ready")
  assert.equal(h.render().props.children.props.children[1], null)
})
test("three-second deadline opens recovery, not a partial-card readiness receipt", () => {
  const h = harness()
  h.render()
  const timer = [...h.timers.values()][0]
  assert.equal(timer.ms, 3000)
  timer.callback()
  const tree = h.render()
  assert.equal(tree.props.value.deadlineExpired, true)
  assert.equal(tree.props.children.props.children[1], null)
  // Retry keeps the mounted content running; a fresh boundary (new account) starts covered.
  assert.equal(harness().render().props.value.deadlineExpired, false)
  assert.equal(harness().render(false).props.children.props.children[1], null)
})
test("the released cover lifts off with a short fade, or at once under Reduce Motion", () => {
  const cover = harness().render().props.children.props.children[1]
  assert.equal(cover.type, "Animated.View")
  assert.equal(cover.props.pointerEvents, "none")
  assert.equal(typeof cover.props.exiting, "function", "the cover fades out instead of cutting")
  const reduced = harness({ reduceMotion: true }).render().props.children.props.children[1]
  assert.equal(reduced.props.exiting, undefined)
})
