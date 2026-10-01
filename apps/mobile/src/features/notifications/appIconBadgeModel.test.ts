import assert from "node:assert/strict"
import test from "node:test"
import { createAppIconBadgeSync, resolveAppIconBadgeCount } from "./appIconBadgeModel"

test("the badge follows the loaded unread total and never guesses before the list loads", () => {
  assert.equal(resolveAppIconBadgeCount({ enabled: true, listStatus: "ready", totalUnread: 3 }), 3)
  assert.equal(resolveAppIconBadgeCount({ enabled: true, listStatus: "ready", totalUnread: 0 }), 0, "everything read clears it")
  for (const listStatus of ["idle", "loading", "failed"] as const) {
    assert.equal(resolveAppIconBadgeCount({ enabled: true, listStatus, totalUnread: 0 }), null,
      `${listStatus}: keep the server's badge`)
  }
  assert.equal(resolveAppIconBadgeCount({ enabled: false, listStatus: "ready", totalUnread: 2 }), null)
  assert.equal(resolveAppIconBadgeCount({ enabled: true, listStatus: "ready", totalUnread: Number.NaN }), null)
})

test("the native badge is set once per change and re-applied when the app leaves the foreground", async () => {
  const calls: number[] = []
  const sync = createAppIconBadgeSync(async (count) => { calls.push(count) })
  sync.update(null)
  sync.update(2)
  sync.update(2)
  sync.update(0)
  assert.deepEqual(calls, [2, 0])
  sync.appStateChanged("inactive")
  assert.deepEqual(calls, [2, 0])
  sync.appStateChanged("background")
  assert.deepEqual(calls, [2, 0, 0], "a background push may have changed it; the app's count wins on leaving")
  sync.appStateChanged("active")
  assert.deepEqual(calls, [2, 0, 0, 0])
  sync.dispose()
  sync.update(5)
  assert.deepEqual(calls, [2, 0, 0, 0], "a signed-out session never writes a badge")
})

test("a failed native call is retried on the next update", async () => {
  const calls: number[] = []
  const errors: unknown[] = []
  let fail = true
  const sync = createAppIconBadgeSync(async (count) => {
    calls.push(count)
    if (fail) throw new Error("no permission")
  }, (error) => { errors.push(error) })
  sync.update(1)
  await new Promise(setImmediate)
  fail = false
  sync.update(1)
  assert.deepEqual(calls, [1, 1])
  assert.equal(errors.length, 1)
})
