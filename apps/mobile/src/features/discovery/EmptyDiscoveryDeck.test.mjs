import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

const source = readFileSync(new URL("./EmptyDiscoveryDeck.tsx", import.meta.url), "utf8")
const file = ts.createSourceFile("EmptyDiscoveryDeck.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const lobbySource = readFileSync(new URL("../../screens/LobbyScreen.tsx", import.meta.url), "utf8")
const lobbyFile = ts.createSourceFile("LobbyScreen.tsx", lobbySource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

function loadLobbyPureFunction(name) {
  const declaration = lobbyFile.statements.find((node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === name
  )
  assert.ok(declaration, `expected ${name} to define the production placeholder policy`)
  const output = ts.transpileModule(declaration.getText(lobbyFile), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText
  const exports = {}
  runInNewContext(output, { exports })
  return exports[name]
}

test("Discovery card shell and content exist before its image decodes", () => {
  const component = file.statements.find((node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === "DiscoveryCardSurface"
  )
  assert.ok(component, "the loading, empty and error states need a shared first-paint shell")

  const runnable = ts.transpileModule(`(${component.getText(file)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText
  const shell = { backgroundColor: "rgba(255, 255, 255, 0.34)", overflow: "hidden" }
  const absoluteFill = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }
  const jsx = (type, props) => ({ type, props })
  const render = runInNewContext(runnable, {
    exports: {},
    require: (name) => {
      assert.equal(name, "react/jsx-runtime")
      return { jsx, jsxs: jsx }
    },
    View: "View",
    ExpoImage: "ExpoImage",
    discoverCardSurface: "discover-card-surface.png",
    StyleSheet: { absoluteFill },
    styles: { emptyCard: shell }
  })
  const result = render({ children: "card content", priority: "high", style: { gap: 10 } })
  assert.equal(result.type, "View")
  assert.equal(result.props.style[0], shell)
  assert.equal(result.props.children[0].type, "ExpoImage")
  assert.equal(result.props.children[0].props.source, "discover-card-surface.png")
  assert.equal(result.props.children[0].props.pointerEvents, "none")
  assert.equal(result.props.children[0].props.cachePolicy, "memory-disk")
  assert.equal(result.props.children[0].props.priority, "high")
  assert.equal(result.props.children[0].props.transition, 0)
  assert.equal(result.props.children[0].props.style, absoluteFill)
  assert.equal(result.props.children[1], "card content")
  assert.match(source, /emptyCard:\s*\{[^}]*backgroundColor:\s*uiTheme\.ambientGlass\.surface/s)
  assert.equal((source.match(/<DiscoveryCardSurface\b/g) ?? []).length, 3)
  assert.doesNotMatch(source, /\bImageBackground\b/, "every deck layer must use the same cached image path")
})

test("preloaded rear empty-deck surfaces use low image priority", () => {
  const component = file.statements.find((node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === "EmptyDeckBack"
  )
  assert.ok(component)
  const runnable = ts.transpileModule(`(${component.getText(file)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText
  const jsx = (type, props) => ({ type, props })
  const render = runInNewContext(runnable, {
    exports: {},
    require: (name) => {
      assert.equal(name, "react/jsx-runtime")
      return { jsx, jsxs: jsx }
    },
    View: "View",
    ExpoImage: "ExpoImage",
    LinearGradient: "LinearGradient",
    discoverCardSurface: "discover-card-surface.png",
    StyleSheet: { absoluteFill: { position: "absolute" } },
    styles: { emptyBackCard: {}, backCardLines: {}, backCardLine: {}, backCardLineWide: {} }
  })
  const result = render({ style: {} })
  assert.equal(result.props.children[0].type, "ExpoImage")
  assert.equal(result.props.children[0].props.priority, "low")
  assert.equal(result.props.children[0].props.cachePolicy, "memory-disk")
  assert.equal(result.props.children[0].props.transition, 0)
})

test("first-route loading shell keeps its deck footprint and stays static for Reduce Motion", () => {
  const component = file.statements.find((node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === "LoadingDiscoveryDeck"
  )
  assert.ok(component)
  const componentSource = component.getText(file)

  assert.match(componentSource, /style=\{\[styles\.emptyDeck, \{ height: deckHeight \}\]\}/)
  assert.match(componentSource, /accessibilityState=\{\{ busy: true \}\}/)
  assert.doesNotMatch(componentSource, /ActivityIndicator|Animated|emptyPhotoProgress|<Text\b/)
  assert.match(componentSource, /<EmptyDeckBack[^>]*showDecorativeLines=\{false\}/)
  assert.match(source, /emptyDeck:\s*\{[^}]*width:\s*"100%"/s)

  for (const name of ["EmptyDiscoveryDeck", "DiscoverErrorCard"]) {
    const stateComponent = file.statements.find((node) =>
      ts.isFunctionDeclaration(node) && node.name?.text === name
    )
    assert.ok(stateComponent)
    assert.match(stateComponent.getText(file), /style=\{\[styles\.emptyDeck, \{ height: deckHeight \}\]\}/)
  }

  const deckSource = readFileSync(new URL("./DiscoveryDeckView.tsx", import.meta.url), "utf8")
  assert.match(deckSource, /height: viewportLayout\.deckHeight/)
})

test("production placeholder policy waits for filters and the complete safety list even with cached profile pages", () => {
  const resolve = loadLobbyPureFunction("resolveProductionDiscoveryPlaceholderState")
  const base = {
    isProductionDiscovery: true,
    filtersReady: true,
    isSafetyListReady: true,
    safetyHydrationFailed: false,
    hasCachedProfiles: false,
    queryLoading: false,
    hasError: false
  }

  assert.equal(resolve({ ...base, filtersReady: false }), "loading")
  assert.equal(resolve({ ...base, isSafetyListReady: false }), "loading")
  assert.equal(resolve({ ...base, isSafetyListReady: false, hasCachedProfiles: true }), "loading")
  assert.equal(resolve({ ...base, isSafetyListReady: false, safetyHydrationFailed: true }), "error")
  assert.equal(resolve({ ...base, isSafetyListReady: false, safetyHydrationFailed: true, hasCachedProfiles: true }), "error")
  assert.equal(resolve({ ...base, queryLoading: true }), "loading")
  assert.equal(resolve({ ...base, hasCachedProfiles: true, queryLoading: true }), "empty")
})

test("production query error and settled-empty branches remain distinct", () => {
  const resolve = loadLobbyPureFunction("resolveProductionDiscoveryPlaceholderState")
  const base = {
    isProductionDiscovery: true,
    filtersReady: true,
    isSafetyListReady: true,
    safetyHydrationFailed: false,
    hasCachedProfiles: false,
    queryLoading: false,
    hasError: false
  }

  assert.equal(resolve({ ...base, hasError: true, isSafetyListReady: false }), "error")
  assert.equal(resolve(base), "empty")
  assert.equal(resolve({ ...base, isProductionDiscovery: false }), "empty")
})

test("production candidate list remains closed until safety readiness", () => {
  const safetyGate = lobbySource.indexOf("if (isProductionDiscovery && !isSafetyListReady) return []")
  const candidateBuild = lobbySource.indexOf("return buildAvailableDiscoveryCandidates(discoverSourceUsers")
  assert.notEqual(safetyGate, -1)
  assert.ok(candidateBuild > safetyGate)
  assert.match(lobbySource, /profiles=\{visibleDiscoverDeck\}/)
})

test("a failed safety hydration shows an actionable error without revealing cached cards", () => {
  assert.match(lobbySource, /hydrationStatus: safetyHydrationStatus/)
  assert.match(lobbySource, /safetyHydrationFailed: safetyHydrationStatus === "failed"/)
  assert.match(lobbySource, /productionDiscoverError \|\| discoveryPlaceholderState === "error"/)
  assert.match(lobbySource, /if \(safetyHydrationStatus === "failed"\) handleRetrySafetyList\(\)/)
  assert.match(lobbySource, /hydrateBlockedUsersFromServer\(/)
})
