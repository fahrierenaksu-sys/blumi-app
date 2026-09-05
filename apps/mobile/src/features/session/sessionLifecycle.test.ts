import assert from "node:assert/strict"
import test from "node:test"
import { logoutCurrentSession } from "./sessionLifecycle"

test("logout clears persisted session and returns a logged-out state", async () => {
  let clearCalls = 0

  const result = await logoutCurrentSession({
    clear: async () => {
      clearCalls += 1
    }
  })

  assert.equal(clearCalls, 1)
  assert.equal(result, null)
})

test("logout clears local persistence even when remote revocation fails", async () => {
  let clearCalls = 0

  const result = await logoutCurrentSession({
    revoke: async () => {
      throw new Error("offline")
    },
    clear: async () => {
      clearCalls += 1
    }
  })

  assert.equal(clearCalls, 1)
  assert.equal(result, null)
})

test("logout does not wait for remote revocation before clearing locally", async () => {
  let cleared = false
  let releaseRevoke: (() => void) | undefined
  const revokeGate = new Promise<void>((resolve) => {
    releaseRevoke = resolve
  })

  const result = await logoutCurrentSession({
    revoke: () => revokeGate,
    clear: async () => {
      cleared = true
    }
  })

  assert.equal(result, null)
  assert.equal(cleared, true)
  releaseRevoke?.()
})

test("logout drains identity-bound session work before clearing credentials", async () => {
  const events: string[] = []
  let releasePending: (() => void) | undefined
  const pendingGate = new Promise<void>((resolve) => {
    releasePending = resolve
  })

  const logout = logoutCurrentSession({
    cancelPending: async () => {
      events.push("cancel-start")
      await pendingGate
      events.push("cancel-end")
    },
    clear: async () => {
      events.push("clear")
    }
  })

  await Promise.resolve()
  assert.deepEqual(events, ["cancel-start"])

  releasePending?.()
  await logout

  assert.deepEqual(events, ["cancel-start", "cancel-end", "clear"])
})
