import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

function harness() {
  const source = readFileSync(new URL("./BlumiLoadingScreen.tsx", import.meta.url), "utf8")
  const file = ts.createSourceFile("BlumiLoadingScreen.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const component = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "PreparedDiscoveryLoadingScreen")
  const output = ts.transpileModule(component.getText(file), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX
  } }).outputText
  const slots = [], effects = [], scheduled = [], starts = []
  let cursor = 0, effectCursor = 0, completions = 0, failures = 0, stops = 0
  const motion = { reduceMotion: false, isResolved: true }
  const changed = (a, b) => !a || b.some((value, index) => !Object.is(value, a[index]))
  const jsx = (type, props) => ({ type, props })
  const animation = (kind, input) => ({ kind, input,
    start(callback) { starts.push({ animation: this, callback }) }, stop() { stops++ }
  })
  const exports = {}
  runInNewContext(output, {
    exports, View: "View", OnboardingScanStage: "Scan", SoftBlobBackground: "Background", styles: {},
    ONBOARDING_SCAN_FRAMES: Array(6).fill("asset"),
    timeline: { scanRowsComplete: 800, scanSweepStart: 250, scanSweepComplete: 1750, scanDissolveComplete: 1950 },
    useReducedMotionPreference: () => motion, getNativeOnboardingBootReduceMotion: () => null,
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = initial
      return [slots[index], (update) => { slots[index] = typeof update === "function" ? update(slots[index]) : update }]
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial } },
    useCallback(f, deps) {
      const index = cursor++
      if (changed(slots[index]?.deps, deps)) slots[index] = { deps, value: f }
      return slots[index].value
    },
    useEffect(f, deps) {
      const index = effectCursor++
      if (changed(effects[index]?.deps, deps)) scheduled.push(() => {
        effects[index]?.cleanup?.()
        effects[index] = { deps, cleanup: f() }
      })
    },
    Animated: {
      Value: class { constructor(value) { this.value = value } setValue(value) { this.value = value } },
      timing: (_, options) => animation("timing", options),
      delay: (duration) => animation("delay", { duration }),
      parallel: (children) => animation("parallel", children),
      sequence: (children) => animation("sequence", children)
    },
    Easing: { cubic: "cubic", out: (x) => x, inOut: (x) => x },
    require(name) { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx } }
  })
  const props = { onFinished: () => completions++, onError: () => failures++ }
  return {
    render() {
      cursor = 0; effectCursor = 0
      const tree = exports.PreparedDiscoveryLoadingScreen(props)
      scheduled.splice(0).forEach((effect) => effect())
      return tree.props.children[1]
    },
    motion, starts,
    get completions() { return completions }, get failures() { return failures }, get stops() { return stops },
    dispose() { effects.forEach((effect) => effect.cleanup?.()) }
  }
}

function loadAll(h) {
  const stage = h.render().props.children
  for (let id = 0; id < 7; id++) stage.props.onAssetLoad(id)
  return h.render()
}

test("all six scan characters plus laser must load before revealing or running the scan", () => {
  const h = harness()
  let stage = h.render()
  assert.equal(stage.props.style[1].opacity, 0)
  const load = stage.props.children.props.onAssetLoad
  load(-1); load(7); load(0); load(0)
  for (let id = 1; id < 6; id++) load(id)
  stage = h.render()
  assert.equal(stage.props.style[1].opacity, 0)
  assert.equal(h.starts.length, 0)
  load(6)
  assert.equal(h.render().props.style[1].opacity, 1)
  assert.equal(h.starts.length, 1)
})

test("loaded scan runs the full native-driver timeline and reports only natural completion", () => {
  const h = harness()
  loadAll(h)
  const sequence = h.starts[0].animation
  const parallel = sequence.input[0]
  assert.equal(parallel.input[0].input.duration, 800)
  assert.equal(parallel.input[0].input.useNativeDriver, true)
  assert.equal(parallel.input[0].input.isInteraction, false)
  assert.equal(parallel.input[1].input[0].input.duration, 250)
  assert.equal(parallel.input[1].input[1].input.duration, 1500)
  assert.equal(sequence.input[1].input.duration, 200)
  assert.equal(h.completions, 0)
  h.starts[0].callback({ finished: false })
  assert.equal(h.completions, 0)
  h.starts[0].callback({ finished: true })
  h.starts[0].callback({ finished: true })
  assert.equal(h.completions, 1)
})

test("unmount cancels the timeline and ignores late animation completion", () => {
  const h = harness()
  loadAll(h)
  h.dispose()
  h.starts[0].callback({ finished: true })
  assert.equal(h.stops, 1)
  assert.equal(h.completions, 0)
})

test("Reduce Motion shows the loaded static scan without a timed delay", () => {
  const h = harness()
  h.motion.reduceMotion = true
  loadAll(h)
  assert.equal(h.starts.length, 0)
  assert.equal(h.completions, 1)
})

test("unresolved accessibility preference does not consume the scan clock", () => {
  const h = harness()
  h.motion.isResolved = false
  assert.equal(loadAll(h).props.style[1].opacity, 0)
  assert.equal(h.starts.length, 0)
  h.motion.isResolved = true
  assert.equal(h.render().props.style[1].opacity, 1)
  assert.equal(h.starts.length, 1)
})

test("image failure is forwarded to bounded recovery without revealing a partial scan", () => {
  const h = harness(), stage = h.render()
  stage.props.children.props.onAssetError()
  assert.equal(h.failures, 1)
  assert.equal(h.render().props.style[1].opacity, 0)
  assert.equal(h.starts.length, 0)
})
