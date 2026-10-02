import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

function componentCallback(path, componentName, callbackName, bindings) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8")
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const component = file.statements.find((node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === componentName
  )
  const declaration = component.body.statements.filter(ts.isVariableStatement)
    .flatMap((node) => [...node.declarationList.declarations])
    .find((node) => ts.isIdentifier(node.name) && node.name.text === callbackName)
  assert.ok(declaration?.initializer)
  const executable = ts.transpileModule(`(${declaration.initializer.getText(file)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText
  return runInNewContext(executable, bindings)
}

test("Keep Exploring returns to an existing Discover screen without stacking another", () => {
  const actions = []
  const navigation = {
    getState: () => ({ routes: [{ name: "Lobby" }, { name: "MatchResult" }] }),
    popTo: (name) => actions.push(`pop:${name}`),
    replace: (name) => actions.push(`replace:${name}`)
  }
  const handle = componentCallback("./MatchResultScreen.tsx", "MatchResultScreen", "handleKeepExploring", {
    navigation,
    getLobbyReturnStrategy: (routes) => routes.includes("Lobby") ? "popTo" : "replace"
  })
  handle()
  assert.deepEqual(actions, ["pop:Lobby"])
})

test("a match re-opened from chat is shown without a second success tap", () => {
  const modelPath = "../features/matches/matchResultPresentation.ts"
  const source = readFileSync(new URL(modelPath, import.meta.url), "utf8")
  const file = ts.createSourceFile(modelPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const declaration = file.statements.find((node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === "shouldCelebrateMatchResult"
  )
  assert.ok(declaration, "expected shouldCelebrateMatchResult in the match presentation model")
  const shouldCelebrateMatchResult = runInNewContext(ts.transpileModule(`(${declaration.getText(file).replace(/^export\s+/, "")})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText)

  // A fresh match (discovery, profile preview, demo) passes nothing and celebrates.
  assert.equal(shouldCelebrateMatchResult({ match: {} }), true)
  assert.equal(shouldCelebrateMatchResult({ match: {}, celebrate: true }), true)
  assert.equal(shouldCelebrateMatchResult(undefined), true)
  // Re-opening an existing match opts out explicitly.
  assert.equal(shouldCelebrateMatchResult({ match: {}, celebrate: false }), false)
})

test("profile decision rejects a rapid second tap while the first request is in flight", async () => {
  let resolveRequest
  let requests = 0
  const decisionInFlightRef = { current: false }
  const handle = componentCallback("./ProfilePreviewScreen.tsx", "ProfilePreviewScreen", "submitProductionDecision", {
    decisionDisabled: false,
    decisionInFlightRef,
    screenMountedRef: { current: true },
    setIsDeciding: () => undefined,
    setDecisionError: () => undefined,
    decideDiscoverProfile: () => {
      requests += 1
      return new Promise((resolve) => { resolveRequest = resolve })
    },
    MOBILE_HTTP_BASE_URL: "https://example.test",
    props: { sessionActor: { session: { sessionToken: "test" } } },
    profile: { userId: "partner" },
    navigation: { isFocused: () => true },
    captureProductEvent: () => undefined,
    returnToLobby: () => undefined
  })
  const first = handle("pass")
  const second = handle("pass")
  assert.equal(requests, 1)
  assert.equal(decisionInFlightRef.current, true)
  resolveRequest({ quota: { remaining: 1 } })
  await Promise.all([first, second])
  assert.equal(decisionInFlightRef.current, false)
})

test("an unfocused profile decision clears its busy state while ignoring stale navigation", async () => {
  let resolveRequest
  const updates = []
  let returned = false
  const handle = componentCallback("./ProfilePreviewScreen.tsx", "ProfilePreviewScreen", "submitProductionDecision", {
    decisionDisabled: false,
    decisionInFlightRef: { current: false },
    screenMountedRef: { current: true },
    setIsDeciding: (value) => updates.push(value),
    setDecisionError: () => undefined,
    decideDiscoverProfile: () => new Promise((resolve) => { resolveRequest = resolve }),
    MOBILE_HTTP_BASE_URL: "https://example.test",
    props: { sessionActor: { session: { sessionToken: "test" } } },
    profile: { userId: "partner" },
    navigation: { isFocused: () => false },
    captureProductEvent: () => undefined,
    returnToLobby: () => { returned = true }
  })
  const pending = handle("pass")
  resolveRequest({ quota: { remaining: 1 } })
  await pending
  assert.deepEqual(updates, [true, false])
  assert.equal(returned, false)
})
