import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"
import test from "node:test"

const source = readFileSync(new URL("./CurrentSceneAssetWarmup.tsx", import.meta.url), "utf8")
const roomRendererSource = readFileSync(
  new URL("../roomV2/components/RoomRenderer2D.tsx", import.meta.url), "utf8"
)
const rootNavigatorSource = readFileSync(
  new URL("../../navigation/RootNavigator.tsx", import.meta.url),
  "utf8"
)
const roomEditorSource = readFileSync(
  new URL("../../screens/MyRoomEditorScreen.tsx", import.meta.url),
  "utf8"
)
const shopScreenSource = readFileSync(
  new URL("../../screens/CosmeticShopScreen.tsx", import.meta.url),
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
const rootNavigatorSourceFile = ts.createSourceFile(
  "RootNavigator.tsx",
  rootNavigatorSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
)
const routePolicyDeclaration = rootNavigatorSourceFile.statements.find((statement) =>
  ts.isFunctionDeclaration(statement) && statement.name?.text === "isCurrentSceneWarmupRoute"
)
assert.ok(routePolicyDeclaration, "RootNavigator declares the warmup route allowlist")

const schedulerCode = ts.transpileModule(schedulerDeclaration.getText(sourceFile), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText + "\nmodule.exports.scheduleSceneAssetWarmup = scheduleSceneAssetWarmup"
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
    timers,
    idleCallbacks,
    cancelledIdleIds
  }
}

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
  assert.match(
    rootNavigatorSource,
    /<CurrentSceneAssetWarmup[\s\S]*?enabled=\{canWarmCurrentSceneAssets\}[\s\S]*?initialShopMode=\{hasCurrentNavigatorSnapshot \? routeSnapshot\.shopMode : undefined\}/
  )
  assert.match(
    rootNavigatorSource,
    /const canWarmCurrentSceneAssets = isCurrentSceneWarmupRoute\(\s*routeName,\s*sessionEntryRoute,\s*isAccountRestricted\s*\)/
  )
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

test("the room shell warms in the next idle slot without advancing the avatar batch", () => {
  assert.match(source, /const cancelShellWarmup = scheduleSceneAssetWarmup\([\s\S]*?roomShellSource[\s\S]*?\}, true, 0\)/)
  assert.match(source, /const cancelScheduled = scheduleSceneAssetWarmup\([\s\S]*?getIdleAvatarLayerAssets\(avatar\)[\s\S]*?\}, true\)/)
  assert.match(source, /cancelShellWarmup\(\)/)
})

test("the room shell is immediately opaque instead of fading in after decode", () => {
  const shellImage = roomRendererSource.match(/<ExpoImage\s+testID=\{testID \? `\$\{testID\}-shell`[\s\S]*?\/>/)?.[0]
  assert.ok(shellImage)
  assert.match(shellImage, /transition=\{0\}/)
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

test("warmup stays scoped to equipped idle layers and the active room shell", () => {
  assert.match(source, /getIdleAvatarLayerAssets\(avatar\)/)
  assert.match(source, /resolveRoomV2Shell\([\s\S]*?roomShellId/)
  assert.match(source, /home-liquid-background-v2\.png/)
  assert.match(source, /selectInitialShopTopIds\(/)
  assert.match(source, /selectBoundedWarmupUris\(/)
  assert.match(source, /SESSION_BUDGET = \{ maxAssets: 32, maxDecodedBytes: 48 \* 1024 \* 1024 \}/)
  assert.match(source, /warmSources\(sources, SHOP_BUDGET/)
  assert.match(source, /warmSources\(sources, CURRENT_SCENE_BUDGET/)
  assert.match(source, /getShopProductThumbnailSource\(/)
  assert.match(source, /SELECTED_PREVIEW_BUDGET = \{ maxAssets: 4, maxDecodedBytes: 8 \* 1024 \* 1024 \}/)
  assert.match(source, /createPrioritySequentialPrefetchLane\(/)
  assert.match(source, /subscribeToSelectedShopPreviewWarmup\(/)
  assert.match(source, /logicalDeadlineMs: 5_000/)
  assert.match(source, /uriCooldownMs: 30_000/)
  assert.match(source, /onNativeStart: \(uri\) => admitWarmupUri\(uri, sourceDimensions\.get\(uri\), sessionBudget\)/)
  assert.match(source, /onNativeSettled: \(uri, accepted\) => \{[\s\S]*?settleWarmupUri\(uri, accepted, sessionBudget\)/)
  assert.match(source, /sourceDimensions\.set\(uri, \{ width: source\.width, height: source\.height \}\)/)
  assert.match(source, /if \(completedRef\.current === null\) completedRef\.current = new Set<string>\(\)/)
  assert.match(source, /if \(inFlightRef\.current === null\) inFlightRef\.current = new Map<string, Promise<boolean>>\(\)/)
  assert.match(source, /if \(sourceDimensionsRef\.current === null\)\s*\{\s*sourceDimensionsRef\.current = new Map<string, \{ width\?: number; height\?: number \}>\(\)/)
  assert.match(source, /const prefetchLane = prefetchLaneRef\.current \?\? \(prefetchLaneRef\.current = createPrioritySequentialPrefetchLane/)
  assert.doesNotMatch(source, /useRef\(new (?:Set|Map)\(/)
  assert.match(source, /enabledRef\.current/)
  assert.match(source, /if \(enabled\) \{\s*startCommonWarmup\(\)\s*\} else \{\s*cancelCommonRef\.current\?\.\(\)/)
  assert.doesNotMatch(source, /InteractionManager/)
  assert.doesNotMatch(source, /for \(const item of AVATAR_V2_CATALOG\)/)
})

test("home Shop route mode reaches warmup and selects the bounded room-card viewport", () => {
  assert.match(roomEditorSource, /navigation\.navigate\("CosmeticShop", \{ initialShopMode: "home" \}\)/)
  assert.match(rootNavigatorSource, /const hasCurrentNavigatorSnapshot = routeSnapshot\.navigatorKey === navigatorKey/)
  assert.match(rootNavigatorSource, /initialShopMode=\{hasCurrentNavigatorSnapshot \? routeSnapshot\.shopMode : undefined\}/)
  assert.match(source, /initialShopMode\?: "avatar" \| "home"/)
  assert.match(source, /initialShopMode \?\? "avatar"/)
  assert.match(source, /ROOM_V2_FURNITURE_CATALOG/)
  assert.match(source, /getShopLayoutMetrics/)
  assert.match(source, /selectInitialShopRoomItemIds\(/)
  assert.match(source, /getRoomProductThumbnailSource\(/)
  assert.match(source, /shopMode === "home"/)
  assert.match(source, /shopLayoutMetrics\.catalog\.accessibilityLayout \? 2 : 4/)
  assert.doesNotMatch(source, /for \(const item of ROOM_V2_FURNITURE_CATALOG\)\s*\{\s*sources\.push/)
  assert.match(shopScreenSource, /const SHOP_PRODUCT_COLUMNS_PER_PAGE = 2/)
  assert.match(shopScreenSource, /catalog\.accessibilityLayout \? 1 : SHOP_PRODUCT_COLUMNS_PER_PAGE/)
  assert.match(shopScreenSource, /function sortRoomShopProducts\([\s\S]*?HOME_CATEGORY_SORT_ORDER[\s\S]*?left\.title\.localeCompare\(right\.title\)/)
})

test("selected furniture warmup uses the full renderer source, not its thumbnail", () => {
  assert.match(shopScreenSource, /selectedWarmupSources\.push\(product\.roomItem\.asset\.source\)/)
  assert.match(shopScreenSource, /getShopPreviewAddedAssets\(currentAvatar, product\.avatarItem\)/)
  assert.match(shopScreenSource, /publishSelectedShopPreviewWarmup\(selectedWarmupSources\)/)
  assert.match(shopScreenSource, /navigation\.addListener\("blur",[\s\S]*?publishSelectedShopPreviewWarmup\(\[\]\)/)
  assert.match(source, /selectedGenerationRef\.current === request\.generation/)
  assert.match(source, /onNativeNotStarted: \(uri\) => sourceDimensions\.delete\(uri\)/)
})
