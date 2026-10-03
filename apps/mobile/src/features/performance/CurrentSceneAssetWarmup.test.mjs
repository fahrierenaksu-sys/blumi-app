import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"
import test from "node:test"

const source = readFileSync(new URL("./CurrentSceneAssetWarmup.tsx", import.meta.url), "utf8")
// The root chrome (bottom bar + current-scene warmup) lives beside RootNavigator.
const rootNavigatorSource = readFileSync(
  new URL("../../navigation/RootNavigationChrome.tsx", import.meta.url),
  "utf8"
)
const sourceFile = ts.createSourceFile(
  "CurrentSceneAssetWarmup.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
)
const schedulerDeclaration = sourceFile.statements.find((statement) =>
  ts.isFunctionDeclaration(statement) && statement.name?.text === "scheduleSceneAssetWarmup"
)
assert.ok(schedulerDeclaration, "warmup scheduler is declared in the component module")
const backgroundSlotDeclaration = sourceFile.statements.find((statement) =>
  ts.isFunctionDeclaration(statement) && statement.name?.text === "waitForBackgroundWarmupSlot"
)
assert.ok(backgroundSlotDeclaration)
const rootNavigatorSourceFile = ts.createSourceFile(
  "RootNavigationChrome.tsx",
  rootNavigatorSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
)
const routePolicyDeclaration = rootNavigatorSourceFile.statements.find((statement) =>
  ts.isFunctionDeclaration(statement) && statement.name?.text === "isCurrentSceneWarmupRoute"
)
assert.ok(routePolicyDeclaration, "RootNavigationChrome declares the warmup route allowlist")

const schedulerCode = ts.transpileModule(
  schedulerDeclaration.getText(sourceFile) + "\n" + backgroundSlotDeclaration.getText(sourceFile), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText + "\nmodule.exports.scheduleSceneAssetWarmup = scheduleSceneAssetWarmup" +
  "\nmodule.exports.waitForBackgroundWarmupSlot = waitForBackgroundWarmupSlot"
const routePolicyCode = ts.transpileModule(routePolicyDeclaration.getText(rootNavigatorSourceFile), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText + "\nmodule.exports.isCurrentSceneWarmupRoute = isCurrentSceneWarmupRoute"

function loadScheduler(overrides = {}) {
  let nextId = 1
  const timers = new Map()
  const idleCallbacks = new Map()
  const cancelledIdleIds = []
  const sandboxModule = { exports: {} }
  vm.runInNewContext(schedulerCode, {
    module: sandboxModule,
    exports: sandboxModule.exports,
    setTimeout(callback, delayMs) {
      const id = nextId++
      timers.set(id, { callback, delayMs })
      return id
    },
    clearTimeout(id) {
      timers.delete(id)
    },
    requestIdleCallback(callback) {
      const id = nextId++
      idleCallbacks.set(id, callback)
      return id
    },
    cancelIdleCallback(id) {
      cancelledIdleIds.push(id)
      idleCallbacks.delete(id)
    },
    ...overrides
  })
  return {
    schedule: sandboxModule.exports.scheduleSceneAssetWarmup,
    waitForBackgroundSlot: sandboxModule.exports.waitForBackgroundWarmupSlot,
    timers,
    idleCallbacks,
    cancelledIdleIds
  }
}

function fireTimer(fixture, delayMs) {
  const [id, timer] = [...fixture.timers.entries()].find(([, value]) => value.delayMs === delayMs)
  fixture.timers.delete(id)
  timer.callback()
}

function fireIdle(fixture) {
  const [id, callback] = fixture.idleCallbacks.entries().next().value
  fixture.idleCallbacks.delete(id)
  callback()
}

test("background idle slots recheck a newly started swipe or app suspension and resume only once safe", async () => {
  const f = loadScheduler()
  let canStart = true
  let accepted
  const slot = f.waitForBackgroundSlot(() => true, () => canStart)
    .then((result) => { accepted = result })
  fireTimer(f, 0)
  canStart = false
  fireIdle(f)
  await Promise.resolve()
  assert.equal(accepted, undefined)
  assert.equal([...f.timers.values()].some((timer) => timer.delayMs === 100), true)
  canStart = true
  fireTimer(f, 100)
  fireIdle(f)
  await slot
  assert.equal(accepted, true)
  assert.equal(f.timers.size, 0)
  assert.equal(f.idleCallbacks.size, 0)
})

test("cancelled generations consume no background slot and clear pending scheduling", async () => {
  const f = loadScheduler()
  let current = true
  const slot = f.waitForBackgroundSlot(() => current, () => true)
  fireTimer(f, 0)
  current = false
  fireIdle(f)
  assert.equal(await slot, false)
  assert.equal(f.timers.size, 0)
  assert.equal(f.idleCallbacks.size, 0)
  assert.equal(await f.waitForBackgroundSlot(() => false, () => true), false)
  assert.equal(f.timers.size, 0)
})

test("background slot deadline abandons work even when JS never gets an idle callback", async () => {
  const f = loadScheduler()
  const slot = f.waitForBackgroundSlot(() => true, () => false)
  fireTimer(f, 0)
  assert.equal(f.idleCallbacks.size, 1)
  fireTimer(f, 5_000)
  assert.equal(await slot, false)
  assert.equal(f.idleCallbacks.size, 0)
  assert.equal(f.timers.size, 0)
})

test("timer fallback rechecks activity before letting background work proceed", async () => {
  const f = loadScheduler({ requestIdleCallback: undefined })
  let foreground = false
  const slot = f.waitForBackgroundSlot(() => true, () => foreground)
  fireTimer(f, 0)
  foreground = true
  fireTimer(f, 100)
  assert.equal(await slot, true)
  assert.equal(f.timers.size, 0)
})

test("the background batch does not derive catalog or avatar sources during a swipe", async () => {
  const f = loadScheduler()
  let tracking = false
  let derivedSources = false
  f.schedule(() => { derivedSources = true }, true, 300, () => !tracking)
  fireTimer(f, 300)
  tracking = true
  fireIdle(f)
  fireTimer(f, 0)
  fireIdle(f)
  assert.equal(derivedSources, false)
  tracking = false
  fireTimer(f, 100)
  fireIdle(f)
  await Promise.resolve()
  assert.equal(derivedSources, true)
  assert.equal(f.timers.size, 0)
})

test("route cancellation while batch planning waits prevents source derivation", async () => {
  const f = loadScheduler()
  let derivedSources = false
  const cancel = f.schedule(() => { derivedSources = true }, true, 300, () => false)
  fireTimer(f, 300)
  fireIdle(f)
  cancel()
  fireTimer(f, 0)
  fireIdle(f)
  await Promise.resolve()
  assert.equal(derivedSources, false)
  assert.equal(f.timers.size, 0)
  assert.equal(f.idleCallbacks.size, 0)
})

function loadRoutePolicy() {
  const sandboxModule = { exports: {} }
  vm.runInNewContext(routePolicyCode, {
    module: sandboxModule,
    exports: sandboxModule.exports
  })
  return sandboxModule.exports.isCurrentSceneWarmupRoute
}

test("Lobby and Shop share warmup lifecycle; other routes and restricted sessions close it", () => {
  const isCurrentSceneWarmupRoute = loadRoutePolicy()
  assert.deepEqual(
    ["Lobby", "CosmeticShop", "Lobby", "CosmeticShop", "ChatThread", "MyRoom"]
      .map((route) => isCurrentSceneWarmupRoute(route, "Main", false)),
    [true, true, true, true, false, false]
  )
  for (const route of [
    undefined,
    "Legal",
    "MyRoom",
    "MiniRoom",
    "MyRoomEditor",
    "Inbox",
    "Settings"
  ]) {
    assert.equal(isCurrentSceneWarmupRoute(route, "Main", false), false, `${String(route)} stays gated`)
  }
  assert.equal(isCurrentSceneWarmupRoute("Lobby", "AvatarSetup", false), false)
  assert.equal(isCurrentSceneWarmupRoute("CosmeticShop", "AvatarSetup", false), false)
  assert.equal(isCurrentSceneWarmupRoute("Lobby", "Main", true), false)
  assert.equal(isCurrentSceneWarmupRoute("CosmeticShop", "Main", true), false)
})

test("disabled route does not schedule a timer or native warmup", () => {
  const { schedule, timers, idleCallbacks } = loadScheduler()
  let started = 0
  schedule(() => { started += 1 }, false)
  assert.equal(timers.size, 0)
  assert.equal(idleCallbacks.size, 0)
  assert.equal(started, 0)
})

test("current-scene warmup waits one second and then waits for JS idle", () => {
  const { schedule, timers, idleCallbacks } = loadScheduler()
  let started = 0
  schedule(() => { started += 1 }, true)

  assert.deepEqual([...timers.values()].map(({ delayMs }) => delayMs), [1_000])
  assert.equal(idleCallbacks.size, 0)
  const [timerId, timer] = timers.entries().next().value
  timers.delete(timerId)
  timer.callback()

  assert.equal(started, 0)
  assert.equal(idleCallbacks.size, 1)
  const [idleId, idleCallback] = idleCallbacks.entries().next().value
  idleCallbacks.delete(idleId)
  idleCallback()
  assert.equal(started, 1)
})

test("Shop first-viewport warmup may request the next idle slot without a one-second delay", () => {
  const { schedule, timers, idleCallbacks } = loadScheduler()
  let started = 0
  schedule(() => { started += 1 }, true, 0)
  assert.deepEqual([...timers.values()].map(({ delayMs }) => delayMs), [0])
  const [, timer] = timers.entries().next().value
  timer.callback()
  assert.equal(started, 0)
  assert.equal(idleCallbacks.size, 1)
})

test("current-scene warmup can be cancelled before or after its idle slot", () => {
  const beforeIdle = loadScheduler()
  let beforeIdleStarted = 0
  const cancelBeforeIdle = beforeIdle.schedule(() => { beforeIdleStarted += 1 }, true)
  const [, timer] = beforeIdle.timers.entries().next().value
  cancelBeforeIdle()
  timer.callback()
  assert.equal(beforeIdleStarted, 0)
  assert.equal(beforeIdle.idleCallbacks.size, 0)

  const afterIdle = loadScheduler()
  let afterIdleStarted = 0
  const cancelAfterIdle = afterIdle.schedule(() => { afterIdleStarted += 1 }, true)
  const [scheduledTimerId, scheduledTimer] = afterIdle.timers.entries().next().value
  afterIdle.timers.delete(scheduledTimerId)
  scheduledTimer.callback()
  const [idleId, idleCallback] = afterIdle.idleCallbacks.entries().next().value
  cancelAfterIdle()
  idleCallback()
  assert.equal(afterIdleStarted, 0)
  assert.deepEqual(afterIdle.cancelledIdleIds, [idleId])
})
