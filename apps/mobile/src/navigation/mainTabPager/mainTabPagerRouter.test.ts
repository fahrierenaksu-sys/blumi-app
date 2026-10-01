import assert from "node:assert/strict"
import test from "node:test"
import {
  CommonActions,
  StackActions,
  StackRouter,
  type NavigationAction,
  type ParamListBase,
  type Router,
  type StackNavigationState
} from "@react-navigation/routers"
import { MAIN_TAB_ROUTE_NAMES } from "./mainTabPagerConfig"
import {
  collapseMainTabRoutes,
  createMainTabPagerSelectAction,
  getMainTabSlotKey,
  withMainTabPagerRouter
} from "./mainTabPagerRouter"

const DETAIL_ROUTES = ["ChatThread", "MiniRoom", "ProfilePreview", "MatchResult", "MyRoomEditor", "WardrobeV2"] as const
const ROUTE_NAMES = [...MAIN_TAB_ROUTE_NAMES, ...DETAIL_ROUTES]
type State = StackNavigationState<ParamListBase>

const original = StackRouter({ initialRouteName: "Lobby" }) as unknown as Router<State, NavigationAction>
const router: Router<State, NavigationAction> = { ...original, ...withMainTabPagerRouter(original) }
const options = {
  routeNames: ROUTE_NAMES,
  routeParamList: Object.fromEntries(ROUTE_NAMES.map((name) => [name, undefined])),
  routeGetIdList: {}
}

function apply(state: State, action: NavigationAction): State {
  const next = router.getStateForAction(state, action, options)
  assert.ok(next, `${action.type} must be handled`)
  // Actions carrying partial states are rehydrated by React Navigation.
  return next.stale === false ? next as State : router.getRehydratedState(next as never, options)
}

function names(state: State): string[] {
  return state.routes.map((route) => route.name)
}

function tabRoutes(state: State) {
  return state.routes.filter((route) => (MAIN_TAB_ROUTE_NAMES as readonly string[]).includes(route.name))
}

test("room exit pops to the existing chat without duplicating it or showing a debrief", () => {
  let state = router.getInitialState(options)
  state = apply(state, CommonActions.navigate("ChatThread", { threadId: "room_thread" }))
  const chatKey = state.routes[1]!.key
  state = apply(state, CommonActions.navigate("MiniRoom", { readyMiniRoom: { miniRoom: { sourceThreadId: "room_thread" } } }))
  state = apply(state, StackActions.popTo("ChatThread", { threadId: "room_thread" }))
  assert.deepEqual(names(state), ["Lobby", "ChatThread"])
  assert.equal(state.routes[1]!.key, chatKey)
  assert.deepEqual(state.routes[1]!.params, { threadId: "room_thread" })
})

test("a directly opened room exits to chat; a room with no chat returns to Inbox in the stable main slot", () => {
  let state = router.getInitialState(options)
  const slotKey = getMainTabSlotKey(state)
  state = apply(state, CommonActions.navigate("MiniRoom"))
  state = apply(state, StackActions.popTo("ChatThread", { threadId: "room_thread" }))
  assert.deepEqual(names(state), ["Lobby", "ChatThread"])
  state = apply(state, CommonActions.navigate("MiniRoom"))
  state = apply(state, StackActions.popTo("Inbox"))
  assert.deepEqual(names(state), ["Inbox"])
  assert.equal(state.routes[0]!.key, slotKey)
})

test("the pager select action renames the slot in place with a stable key", () => {
  let state = router.getInitialState(options)
  const slotKey = getMainTabSlotKey(state)
  assert.ok(slotKey)
  for (let index = 0; index < 40; index += 1) {
    const name = MAIN_TAB_ROUTE_NAMES[(index + 1) % MAIN_TAB_ROUTE_NAMES.length]!
    state = apply(state, createMainTabPagerSelectAction(name, undefined, state.key))
    assert.deepEqual(names(state), [name])
    assert.equal(state.routes[0]!.key, slotKey, "the native screen and pager are never recreated")
    assert.equal(state.index, 0)
  }
})

test("selecting the already selected page returns the same state object", () => {
  const state = router.getInitialState(options)
  assert.equal(router.getStateForAction(state, createMainTabPagerSelectAction("Lobby", undefined), options), state)
})

test("the select action carries page params and never pops a detail route above the pager", () => {
  let state = router.getInitialState(options)
  const slotKey = getMainTabSlotKey(state)
  state = apply(state, CommonActions.navigate("ChatThread", { threadId: "t1" }))
  state = apply(state, createMainTabPagerSelectAction("CosmeticShop", { initialShopMode: "home" }))
  assert.deepEqual(names(state), ["CosmeticShop", "ChatThread"])
  assert.equal(state.index, 1, "the detail route stays focused")
  assert.equal(state.routes[0]!.key, slotKey)
  assert.deepEqual(state.routes[0]!.params, { initialShopMode: "home" })
})

test("an unknown page name is not handled", () => {
  const state = router.getInitialState(options)
  const action = { ...createMainTabPagerSelectAction("Lobby", undefined), payload: { name: "Nope" } } as never
  assert.equal(router.getStateForAction(state, action, options), null)
})

test("the legacy bottom-bar navigate collapses into the slot", () => {
  let state = router.getInitialState(options)
  const slotKey = getMainTabSlotKey(state)
  for (const name of ["Inbox", "MyRoom", "Lobby", "CosmeticShop", "Inbox"]) {
    state = apply(state, CommonActions.navigate(name, undefined, { pop: true, merge: true }))
    assert.deepEqual(names(state), [name])
    assert.equal(state.routes[0]!.key, slotKey)
  }
})

test("navigate to a tab from a detail route returns to the pager on that page", () => {
  let state = router.getInitialState(options)
  const slotKey = getMainTabSlotKey(state)
  state = apply(state, createMainTabPagerSelectAction("Inbox", undefined))
  state = apply(state, CommonActions.navigate("ChatThread", { threadId: "t1" }))
  state = apply(state, CommonActions.navigate("Lobby"))
  assert.deepEqual(names(state), ["Lobby"])
  assert.equal(state.routes[0]!.key, slotKey)
  assert.equal(state.index, 0)
})

test("navigate with params to another tab moves the params onto the slot", () => {
  let state = router.getInitialState(options)
  state = apply(state, createMainTabPagerSelectAction("Inbox", undefined))
  state = apply(state, CommonActions.navigate("ProfilePreview", { userId: "u1" }))
  state = apply(state, CommonActions.navigate("Lobby", { pendingLikeUserId: "u1" }))
  assert.deepEqual(names(state), ["Lobby"])
  assert.deepEqual(state.routes[0]!.params, { pendingLikeUserId: "u1" })
})

test("popTo and replace a tab keep the slot key", () => {
  let state = router.getInitialState(options)
  const slotKey = getMainTabSlotKey(state)
  state = apply(state, createMainTabPagerSelectAction("Inbox", undefined))
  state = apply(state, CommonActions.navigate("ProfilePreview", { userId: "u1" }))
  state = apply(state, StackActions.popTo("Lobby", { completedProductionDecision: { decision: "like" } }))
  assert.deepEqual(names(state), ["Lobby"])
  assert.equal(state.routes[0]!.key, slotKey)
  assert.deepEqual(state.routes[0]!.params, { completedProductionDecision: { decision: "like" } })

  // `goBackOrFallback(..., () => navigation.replace("Lobby"))` from a page.
  state = apply(state, createMainTabPagerSelectAction("Inbox", undefined))
  state = apply(state, { ...StackActions.replace("Lobby"), source: slotKey } as NavigationAction)
  assert.deepEqual(names(state), ["Lobby"])
  assert.equal(state.routes[0]!.key, slotKey)

  // A detail route replaced by a tab (MatchResult -> Lobby) returns to the pager.
  state = apply(state, CommonActions.navigate("MatchResult", {}))
  state = apply(state, StackActions.replace("Lobby"))
  assert.deepEqual(names(state), ["Lobby"])
  assert.equal(state.routes[0]!.key, slotKey)
})

test("a reset to the post-match chat state keeps the pager under the chat", () => {
  let state = router.getInitialState(options)
  const slotKey = getMainTabSlotKey(state)
  state = apply(state, CommonActions.navigate("MatchResult", {}))
  state = apply(state, CommonActions.reset({
    index: 1,
    routes: [{ name: "Inbox" }, { name: "ChatThread", params: { threadId: "t1" } }]
  }))
  assert.deepEqual(names(state), ["Inbox", "ChatThread"])
  assert.equal(state.routes[0]!.key, slotKey)
  assert.equal(state.index, 1)
})

test("rehydrated or deep-linked states with several tabs keep exactly one slot", () => {
  const rehydrated = router.getRehydratedState({
    routes: [{ name: "Lobby" }, { name: "ChatThread" }, { name: "Inbox" }, { name: "MyRoomEditor" }]
  } as never, options)
  assert.deepEqual(names(rehydrated), ["Inbox", "MyRoomEditor"])
  assert.equal(rehydrated.index, 1)
  assert.equal(tabRoutes(rehydrated).length, 1)
})

test("the collapse keeps routes below the slot and above the newest tab", () => {
  const collapsed = collapseMainTabRoutes(
    { routes: [{ key: "slot", name: "Lobby" }] },
    {
      index: 4,
      routes: [
        { key: "a", name: "ChatThread" },
        { key: "slot", name: "Lobby" },
        { key: "b", name: "ProfilePreview" },
        { key: "c", name: "MyRoom", params: { x: 1 } },
        { key: "d", name: "MyRoomEditor" }
      ]
    }
  )
  assert.deepEqual(collapsed.routes, [
    { key: "a", name: "ChatThread" },
    { key: "slot", name: "MyRoom", params: { x: 1 } },
    { key: "d", name: "MyRoomEditor" }
  ])
  assert.equal(collapsed.index, 2)
  const untouched = { index: 0, routes: [{ key: "x", name: "ChatThread" }] }
  assert.equal(collapseMainTabRoutes(undefined, untouched), untouched)
})

test("40 mixed tab changes, detail pushes and backs never create a second tab route", () => {
  let state = router.getInitialState(options)
  const slotKey = getMainTabSlotKey(state)
  const actions: NavigationAction[] = []
  for (let index = 0; index < 40; index += 1) {
    const tab = MAIN_TAB_ROUTE_NAMES[index % MAIN_TAB_ROUTE_NAMES.length]!
    actions.push(
      createMainTabPagerSelectAction(tab, undefined),
      CommonActions.navigate(DETAIL_ROUTES[index % DETAIL_ROUTES.length]!, {}),
      index % 3 === 0 ? CommonActions.goBack() : CommonActions.navigate(tab, undefined, { pop: true, merge: true })
    )
  }
  for (const action of actions) {
    state = apply(state, action)
    const tabs = tabRoutes(state)
    assert.equal(tabs.length, 1)
    assert.equal(tabs[0]!.key, slotKey)
  }
})
