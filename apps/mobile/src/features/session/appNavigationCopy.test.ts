import assert from "node:assert/strict"
import test from "node:test"
import { getAppNavigationCopy } from "./appNavigationCopy"

test("app navigation copy exposes a complete Turkish tab set", () => {
  assert.deepEqual(getAppNavigationCopy("tr"), {
    discover: "Keşfet",
    chats: "Sohbetler",
    myRoom: "Odam",
    shop: "Mağaza"
  })
})

test("app navigation copy retains English tab labels", () => {
  assert.deepEqual(getAppNavigationCopy("en"), {
    discover: "Discover",
    chats: "Chats",
    myRoom: "My Room",
    shop: "Shop"
  })
})
