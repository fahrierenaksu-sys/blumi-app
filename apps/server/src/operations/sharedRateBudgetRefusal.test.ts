import assert from "node:assert/strict"
import test from "node:test"
import { cacheRateBudgetRefusals, type SharedRateBudget, type UserRateBudgetScope } from "./sharedRateBudget"

test("a refused scope stays refused during an outage, then consults shared authority again", async () => {
  let now = 0
  let available = true
  let exhausted = true
  const authority: SharedRateBudget = {
    async consumeUser() {
      if (!available) throw new Error("unavailable")
      return { allowed: !exhausted, retryAfterSeconds: 10 }
    },
    async purgeExpired() {}
  }
  const budget = cacheRateBudgetRefusals(authority, { now: () => now })
  assert.equal((await budget.consumeUser("account", "general")).allowed, false)
  available = false
  now = 2_000
  assert.deepEqual(await budget.consumeUser("account", "general"), { allowed: false, retryAfterSeconds: 8 })
  await assert.rejects(budget.consumeUser("account", "chatSend"), /unavailable/)
  await assert.rejects(budget.consumeUser("another", "general"), /unavailable/)
  now = 10_000
  await assert.rejects(budget.consumeUser("account", "general"), /unavailable/)
  available = true
  exhausted = false
  assert.equal((await budget.consumeUser("account", "general")).allowed, true)
})

test("allowed traffic always consumes the shared budget and never borrows another scope", async () => {
  const remaining: Partial<Record<UserRateBudgetScope, number>> = { general: 1, chatSend: 2 }
  const budget = cacheRateBudgetRefusals({
    async consumeUser(_userId, scope = "general") {
      const left = remaining[scope] ?? 0
      remaining[scope] = left - 1
      return { allowed: left > 0, retryAfterSeconds: 5 }
    }, async purgeExpired() {}
  })
  assert.equal((await budget.consumeUser("account")).allowed, true)
  assert.equal((await budget.consumeUser("account")).allowed, false)
  assert.equal((await budget.consumeUser("account", "chatSend")).allowed, true)
  assert.equal((await budget.consumeUser("account", "chatSend")).allowed, true)
  assert.equal((await budget.consumeUser("account", "chatSend")).allowed, false)
})

test("a slow refusal does not extend its reported retry window", async () => {
  let now = 0
  let exhausted = true
  const budget = cacheRateBudgetRefusals({
    async consumeUser() {
      now += 4_000
      return { allowed: !exhausted, retryAfterSeconds: 5 }
    }, async purgeExpired() {}
  }, { now: () => now })
  await budget.consumeUser("account")
  now = 5_000
  exhausted = false
  assert.equal((await budget.consumeUser("account")).allowed, true)
})

test("evicting a full refusal cache falls back to authority and cannot grant access", async () => {
  let available = true
  const budget = cacheRateBudgetRefusals({
    async consumeUser() {
      if (!available) throw new Error("unavailable")
      return { allowed: false, retryAfterSeconds: 5 }
    }, async purgeExpired() {}
  }, { maxEntries: 1, now: () => 0 })
  await budget.consumeUser("first")
  await budget.consumeUser("second")
  available = false
  assert.equal((await budget.consumeUser("second")).allowed, false)
  await assert.rejects(budget.consumeUser("first"), /unavailable/)
})

test("a failed shared maintenance operation remains visible", async () => {
  const budget = cacheRateBudgetRefusals({
    async consumeUser() { return { allowed: false, retryAfterSeconds: 1 } },
    async purgeExpired() { throw new Error("maintenance unavailable") }
  })
  await assert.rejects(budget.purgeExpired(), /maintenance unavailable/)
})
