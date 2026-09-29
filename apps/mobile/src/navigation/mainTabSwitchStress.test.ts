import assert from "node:assert/strict"
import test from "node:test"
import { CommonActions, StackRouter } from "@react-navigation/routers"
import { shouldDispatchMainTabNavigation } from "./rootNavigationModel"

const TAB_ROUTES = ["Lobby", "Inbox", "MyRoom", "CosmeticShop"] as const
const NESTED_ROUTES = ["ChatThread", "ProfileEdit"] as const
const SWITCHES = 40
const router = StackRouter({ initialRouteName: "Lobby" })
const options = {
  routeNames: [...TAB_ROUTES, ...NESTED_ROUTES],
  routeParamList: Object.fromEntries([...TAB_ROUTES, ...NESTED_ROUTES].map((name) => [name, undefined])),
  routeGetIdList: {}
}
type StackState = ReturnType<typeof router.getInitialState>

function navigateWithPop(state: StackState, destination: typeof TAB_ROUTES[number]): StackState {
  const next = router.getStateForAction(
    state,
    CommonActions.navigate(destination, undefined, { pop: true, merge: true }),
    options
  )
  assert.ok(next && next.stale === false, `${destination} must be accepted by the installed StackRouter`)
  return next
}

test("plain NAVIGATE reproduces stack growth across 40 tab switches", () => {
  let state = router.getInitialState(options)
  for (let index = 0; index < SWITCHES; index += 1) {
    const target = TAB_ROUTES[1 + index % 3]!
    const next = router.getStateForAction(state, CommonActions.navigate(target), options)
    assert.ok(next && next.stale === false)
    state = next
  }
  assert.equal(state.routes.length, SWITCHES + 1)
})

test("focused-tab reselect guard avoids StackRouter's redundant fresh state", () => {
  const state = router.getInitialState(options)
  const redundant = router.getStateForAction(
    state,
    CommonActions.navigate("Lobby", undefined, { pop: true, merge: true }),
    options
  )

  assert.ok(redundant && redundant.stale === false)
  assert.notEqual(redundant, state, "the installed router rebuilds state for the same focused route")
  assert.equal(shouldDispatchMainTabNavigation("Lobby", "Lobby"), false)
  assert.equal(
    shouldDispatchMainTabNavigation("Lobby", "Lobby") ? redundant : state,
    state,
    "the guarded same-tab press leaves navigation state untouched"
  )
})

test("pop navigation bounds 40 tab switches without reordering native screen keys", () => {
  let state = router.getInitialState(options)
  const rootKey = state.key
  let maximumRouteCount = state.routes.length

  for (let index = 0; index < SWITCHES; index += 1) {
    const before = state.routes
    const target = TAB_ROUTES[1 + index % 3]!
    let existingIndex = -1
    for (let routeIndex = before.length - 1; routeIndex >= 0; routeIndex -= 1) {
      if (before[routeIndex]?.name === target) {
        existingIndex = routeIndex
        break
      }
    }
    state = navigateWithPop(state, target)
    maximumRouteCount = Math.max(maximumRouteCount, state.routes.length)

    assert.equal(state.key, rootKey)
    assert.equal(state.index, state.routes.length - 1)
    assert.equal(state.routes[state.index]?.name, target)
    assert.ok(state.routes.length <= TAB_ROUTES.length)
    assert.equal(new Set(state.routes.map((route) => route.name)).size, state.routes.length)
    const retained = existingIndex < 0 ? before : before.slice(0, existingIndex + 1)
    assert.deepEqual(
      state.routes.slice(0, retained.length).map((route) => route.key),
      retained.map((route) => route.key),
      "existing native controllers must keep their order and identity"
    )
  }

  assert.equal(maximumRouteCount, TAB_ROUTES.length)
})

test("returning to an existing tab preserves its key and params while popping later routes", () => {
  let state = router.getInitialState(options)
  const updated = router.getStateForAction(
    state,
    CommonActions.setParams({ pendingLikeUserId: "user-1" }),
    options
  )
  assert.ok(updated && updated.stale === false)
  state = updated
  const lobbyKey = state.routes[0]!.key
  state = navigateWithPop(state, "Inbox")
  state = navigateWithPop(state, "MyRoom")
  state = navigateWithPop(state, "Lobby")
  assert.equal(state.routes.length, 1)
  assert.equal(state.routes[0]?.key, lobbyKey)
  assert.deepEqual(state.routes[0]?.params, { pendingLikeUserId: "user-1" })
})

test("a tab switch from a nested route pops safely to the existing tab", () => {
  let state = router.getInitialState(options)
  for (const name of ["Inbox", "ChatThread", "ProfileEdit"] as const) {
    const next = router.getStateForAction(state, CommonActions.navigate(name), options)
    assert.ok(next && next.stale === false)
    state = next
  }
  const lobbyKey = state.routes[0]!.key
  state = navigateWithPop(state, "Lobby")
  assert.deepEqual(state.routes.map((route) => route.name), ["Lobby"])
  assert.equal(state.routes[0]?.key, lobbyKey)
})
