import assert from "node:assert/strict"
import test from "node:test"
import { scheduleMatchResultNavigation } from "./matchResultNavigation"

test("cancelled or unfocused match presentations do not navigate", async () => {
  let navigations = 0
  const cancelled = scheduleMatchResultNavigation(() => { navigations += 1 }, () => true, 0)
  cancelled()
  scheduleMatchResultNavigation(() => { navigations += 1 }, () => false, 0)
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(navigations, 0)
  scheduleMatchResultNavigation(() => { navigations += 1 }, () => true, 0)
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(navigations, 1)
})
