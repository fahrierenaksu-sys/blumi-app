import assert from "node:assert/strict"
import test from "node:test"
import Fastify from "fastify"
import type { AuthService } from "../auth/authService"
import { resolveBearerSession } from "../routes/routeHelpers"
import { createInMemoryRateBudget } from "./sharedRateBudget"
import { registerSharedRateBudget } from "./sharedRateBudgetHook"

function countingAuth(): { auth: AuthService; calls: () => number } {
  let calls = 0
  const auth = {
    async getSession(token: string) {
      calls += 1
      if (token !== "valid-token") return null
      return {
        account: { accountId: "account_1", userId: "user_1", phoneNumber: "+905550000000" },
        session: { sessionId: "session_1", accountId: "account_1", userId: "user_1" }
      }
    }
  } as unknown as AuthService
  return { auth, calls: () => calls }
}

test("an authenticated request resolves its session once for the shared budget and the route", async () => {
  // Each resolution is two PostgreSQL round trips (session row, account row).
  const { auth, calls } = countingAuth()
  const app = Fastify()
  registerSharedRateBudget(app, auth, createInMemoryRateBudget())
  app.get("/probe", async (request, reply) => {
    const resolved = await resolveBearerSession({ request, reply, authService: auth })
    if (!resolved) return reply
    return { userId: resolved.account.userId }
  })
  try {
    const response = await app.inject({ method: "GET", url: "/probe", headers: { authorization: "Bearer valid-token" } })
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), { userId: "user_1" })
    assert.equal(calls(), 1)

    const second = await app.inject({ method: "GET", url: "/probe", headers: { authorization: "Bearer valid-token" } })
    assert.equal(second.statusCode, 200)
    assert.equal(calls(), 2, "a later request resolves its own session again")

    const rejected = await app.inject({ method: "GET", url: "/probe", headers: { authorization: "Bearer stale-token" } })
    assert.equal(rejected.statusCode, 401)
    assert.equal(calls(), 3)
  } finally {
    await app.close()
  }
})
