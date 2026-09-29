import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

function harness() {
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
test("an unmounted account's completion cannot release a new account's boundary", () => {
  const oldAccount = harness(), nextAccount = harness()
  const oldReport = oldAccount.render().props.value.report
  oldAccount.dispose()
  oldReport("ready")
  assert.ok(nextAccount.render().props.children.props.children[1])
})
test("the real avatar callback aggregates all layers and rejects prior-snapshot completeness", () => {
  const source = readFileSync(new URL("../../components/DiscoverCard.tsx", import.meta.url), "utf8")
  const file = ts.createSourceFile("DiscoverCard.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const component = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "CandidateAvatarPreview")
  const output = ts.transpileModule(component.getText(file), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX
  } }).outputText
  let receipts = [], effects = []
  const exports = {}, jsx = (type, props) => ({ type, props })
  runInNewContext(output, {
    exports, View: "View", RoomAvatarRenderer2D: "Renderer", cardStyles: {}, ROOM_AVATAR_CATALOG: {},
    createCandidateAvatarAppearance: (snapshot) => snapshot,
    getRoomAvatarRenderLayers: () => [{ type: "body", id: "base" }, { type: "top", id: "outfit" }],
    useMemo: (f) => f(), useCallback: (f) => f,
    useState: () => [receipts, (update) => { receipts = update(receipts) }],
    useEffect: (f) => effects.push(f),
    require: (name) => { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx } }
  })
  let displayed = 0, failed = 0
  const render = (id) => {
    effects = []
    const tree = exports.CandidateAvatarPreview({ snapshot: { displayName: id }, onDisplay: () => displayed++, onImageError: () => failed++ })
    effects.forEach((effect) => effect())
    return tree.props.children[2].props.children.props
  }
  const first = render("A")
  first.onLayerDisplay("body:base")
  render("A")
  assert.equal(displayed, 0)
  first.onLayerDisplay("top:outfit")
  render("A")
  assert.equal(displayed, 1)
  const next = render("B")
  assert.equal(displayed, 1)
  first.onLayerDisplay("body:base")
  render("B")
  assert.equal(displayed, 1)
  next.onImageError()
  assert.equal(failed, 1)
  next.onLayerDisplay("body:base")
  next.onLayerDisplay("top:outfit")
  render("B")
  assert.equal(displayed, 2)
})
test("display callbacks are used rather than prefetch/load completion, with scoped retry and mounted recovery", () => {
  const lobby = readFileSync(new URL("../../screens/LobbyScreen.tsx", import.meta.url), "utf8")
  assert.match(lobby, /profiles=\{visibleDiscoverDeck\}/)
  assert.match(lobby, /style=\{showStartupFailure \? \{ opacity: 0 \}/)
  assert.match(lobby, /key=\{startupScope\}/)
  assert.match(lobby, /showStartupFailure = isProductionDiscovery && !startupComplete/)
  assert.match(lobby, /setCompletedStartupScope\(startupSessionScope\)/)
  assert.match(lobby, /if \(isProductionDiscovery && !isSafetyListReady\) return \[\]/)
  const renderer = readFileSync(new URL("../avatarV2/room/components/RoomAvatarRenderer2D.tsx", import.meta.url), "utf8")
  assert.match(renderer, /onDisplay=\{/)
  assert.match(renderer, /previous\.onLayerDisplay === next\.onLayerDisplay/)
  const card = readFileSync(new URL("../demo/SwipeableDiscoverCard.tsx", import.meta.url), "utf8")
  assert.match(card, /!props\.deferFrontAvatar/)
  assert.match(card, /deferAvatar=\{props\.deferBackAvatar && !isBackVisible\}/)
})
