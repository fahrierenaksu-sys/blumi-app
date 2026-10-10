import assert from "node:assert/strict"
import test from "node:test"
import { isMainTabPagerShowingPage, registerMainTabPagerController } from "./mainTabPagerController"

test("a tab press asks the pager which page it shows, not the navigation route", () => {
  const unregister = registerMainTabPagerController({
    selectPage: () => true,
    isPageShown: (key) => key === "discover"
  })
  try {
    // after Discover the route can already say My Room while the pager still shows Discover
    assert.equal(isMainTabPagerShowingPage("myroom"), false)
    assert.equal(isMainTabPagerShowingPage("discover"), true)
  } finally {
    unregister()
  }
  // with no pager registered the route alone decides (rollback path)
  assert.equal(isMainTabPagerShowingPage("myroom"), true)
})
