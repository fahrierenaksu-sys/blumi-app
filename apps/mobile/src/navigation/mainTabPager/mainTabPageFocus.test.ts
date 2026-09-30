import assert from "node:assert/strict"
import test from "node:test"
import {
  registerMainTabPagerController,
  requestMainTabPagerPage
} from "./mainTabPagerController"
import { createMainTabPageFocusHub, createMainTabPageNavigation } from "./mainTabPageFocus"

function recorder() {
  const events: string[] = []
  const hub = createMainTabPageFocusHub((page) => `slot:${page}`)
  for (const page of ["Lobby", "Inbox", "MyRoom"]) {
    hub.subscribe(page, "focus", (event) => events.push(`focus ${event.target}`))
    hub.subscribe(page, "blur", (event) => events.push(`blur ${event.target}`))
  }
  return { hub, events }
}

test("only the selected page of a focused slot is focused; blur precedes focus", () => {
  const { hub, events } = recorder()
  hub.update({ selectedPage: "Lobby", slotFocused: true })
  hub.update({ selectedPage: "Inbox", slotFocused: true })
  assert.deepEqual(events, ["focus slot:Lobby", "blur slot:Lobby", "focus slot:Inbox"])
  assert.equal(hub.isFocused("Inbox"), true)
  assert.equal(hub.isFocused("Lobby"), false)
  assert.equal(hub.isFocused("MyRoom"), false, "a mounted neighbour stays unfocused")
})

test("a detail route covering the pager blurs the selected page and restores it on return", () => {
  const { hub, events } = recorder()
  hub.update({ selectedPage: "Inbox", slotFocused: true })
  hub.update({ selectedPage: "Inbox", slotFocused: false })
  assert.equal(hub.isFocused("Inbox"), false)
  hub.update({ selectedPage: "Inbox", slotFocused: false })
  hub.update({ selectedPage: "Inbox", slotFocused: true })
  assert.deepEqual(events, ["focus slot:Inbox", "blur slot:Inbox", "focus slot:Inbox"], "no duplicate events")
})

test("unsubscribed listeners receive nothing", () => {
  const hub = createMainTabPageFocusHub()
  const calls: string[] = []
  const unsubscribe = hub.subscribe("MyRoom", "focus", () => calls.push("focus"))
  unsubscribe()
  hub.update({ selectedPage: "MyRoom", slotFocused: true })
  assert.deepEqual(calls, [])
})

function createSlotNavigation() {
  const calls: unknown[][] = []
  return {
    calls,
    navigation: {
      isFocused: () => true,
      addListener: ((type: string) => {
        calls.push(["slot.addListener", type])
        return () => calls.push(["slot.removeListener", type])
      }) as never,
      setParams: ((params: object) => calls.push(["slot.setParams", params])) as never,
      navigate: (name: string) => calls.push(["slot.navigate", name]),
      canGoBack: () => false
    }
  }
}

test("a page navigation delegates to the slot except focus and unselected setParams", () => {
  const hub = createMainTabPageFocusHub()
  const { navigation: slot, calls } = createSlotNavigation()
  let selected = "Lobby"
  const local: unknown[][] = []
  const inbox = createMainTabPageNavigation({
    slotNavigation: slot,
    page: "Inbox",
    hub,
    getSelectedPage: () => selected,
    setUnselectedPageParams: (page, params) => local.push([page, params])
  })

  hub.update({ selectedPage: "Lobby", slotFocused: true })
  assert.equal(inbox.isFocused(), false, "the slot is focused but Inbox is not on screen")
  let focused = 0
  const unsubscribe = (inbox.addListener as unknown as (type: string, cb: () => void) => () => void)("focus", () => { focused += 1 })
  hub.update({ selectedPage: "Inbox", slotFocused: true })
  assert.equal(focused, 1)
  assert.equal(inbox.isFocused(), true)
  unsubscribe()

  ;(inbox.addListener as unknown as (type: string, cb: () => void) => () => void)("beforeRemove", () => undefined)
  inbox.navigate("Lobby")
  assert.equal(inbox.canGoBack(), false)

  ;(inbox.setParams as unknown as (p: object) => void)({ a: 1 })
  selected = "Inbox"
  ;(inbox.setParams as unknown as (p: object) => void)({ b: 2 })
  assert.deepEqual(local, [["Inbox", { a: 1 }]], "params of a page that is not selected stay local")
  assert.deepEqual(calls, [
    ["slot.addListener", "beforeRemove"],
    ["slot.navigate", "Lobby"],
    ["slot.setParams", { b: 2 }]
  ])
})

test("bottom-bar requests reach the registered pager only", () => {
  assert.equal(requestMainTabPagerPage("chats"), false, "no pager: the stack fallback runs")
  const requests: string[] = []
  const unregister = registerMainTabPagerController({
    selectPage: (key) => {
      requests.push(key)
      return key !== "shop"
    }
  })
  assert.equal(requestMainTabPagerPage("chats"), true)
  assert.equal(requestMainTabPagerPage("shop"), false)
  unregister()
  assert.equal(requestMainTabPagerPage("myroom"), false)
  assert.deepEqual(requests, ["chats", "shop"])

  const first = registerMainTabPagerController({ selectPage: () => true })
  const second = registerMainTabPagerController({ selectPage: () => false })
  first()
  assert.equal(requestMainTabPagerPage("chats"), false, "an older pager cannot unregister the current one")
  second()
})
