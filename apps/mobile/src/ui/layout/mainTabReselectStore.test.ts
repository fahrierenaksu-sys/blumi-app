import assert from "node:assert/strict"
import test from "node:test"
import {
  publishMainTabReselect,
  subscribeToMainTabReselect,
  type MainTabReselectKey
} from "./mainTabReselectStore"

test("a reselect reaches every subscriber with the reselected tab key", () => {
  const received: MainTabReselectKey[] = []
  const unsubscribe = subscribeToMainTabReselect((key) => received.push(key))

  publishMainTabReselect("chats")

  assert.deepEqual(received, ["chats"])
  unsubscribe()
})

test("an unsubscribed listener is no longer called", () => {
  const received: MainTabReselectKey[] = []
  const unsubscribe = subscribeToMainTabReselect((key) => received.push(key))
  unsubscribe()

  publishMainTabReselect("discover")

  assert.deepEqual(received, [])
})

test("each listener sees only the reselects it filters for", () => {
  let shopReselects = 0
  let chatsReselects = 0
  const unsubscribeShop = subscribeToMainTabReselect((key) => {
    if (key === "shop") shopReselects += 1
  })
  const unsubscribeChats = subscribeToMainTabReselect((key) => {
    if (key === "chats") chatsReselects += 1
  })

  publishMainTabReselect("shop")

  assert.equal(shopReselects, 1)
  assert.equal(chatsReselects, 0, "a different tab's reselect does not trigger this listener")
  unsubscribeShop()
  unsubscribeChats()
})

test("a listener that unsubscribes while being notified does not stop the others", () => {
  const received: string[] = []
  const unsubscribeFirst = subscribeToMainTabReselect(() => {
    received.push("first")
    unsubscribeFirst()
  })
  const unsubscribeSecond = subscribeToMainTabReselect(() => received.push("second"))

  publishMainTabReselect("myroom")
  publishMainTabReselect("myroom")

  assert.deepEqual(received, ["first", "second", "second"])
  unsubscribeSecond()
})
