import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService } from "../auth/authService"
import { createBlumiBackendStore } from "../auth/authStore"
import { createInMemorySafetyRepository } from "../safety/safetyRepository"
import { createSafetyService } from "../safety/safetyService"
import { createServer } from "../server"

test("route boundaries expose expected input errors but hide infrastructure details", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const baseRepository = createInMemorySafetyRepository()
  const safetyService = createSafetyService({
    repository: {
      ...baseRepository,
      async findBlock() {
        throw new Error("database host leaked detail")
      }
    }
  })
  const app = createServer({ authService, safetyService })

  try {
    await authService.sendCode("+905551112233")
    const verified = await authService.verifyCode("+905551112233", "482931")

    const infrastructureFailure = await app.inject({
      method: "POST",
      url: "/v1/safety/blocks",
      headers: { authorization: `Bearer ${verified.sessionToken}` },
      payload: { blockedUserId: "other_user" }
    })
    assert.equal(infrastructureFailure.statusCode, 500)
    assert.equal(infrastructureFailure.json().error, "Something went wrong.")
    assert.doesNotMatch(infrastructureFailure.body, /database host leaked detail/)

    const publicInputFailure = await app.inject({
      method: "POST",
      url: "/v1/safety/blocks",
      headers: { authorization: `Bearer ${verified.sessionToken}` },
      payload: { blockedUserId: verified.account.userId }
    })
    assert.equal(publicInputFailure.statusCode, 400)
    assert.equal(publicInputFailure.json().error, "You cannot block yourself.")
  } finally {
    await app.close()
  }
})

test("database races answer 409 and transient database failures 503 with Retry-After, without PostgreSQL text", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const baseRepository = createInMemorySafetyRepository()
  let nextError: Error = new Error("unset")
  const safetyService = createSafetyService({
    repository: {
      ...baseRepository,
      async findBlock() {
        throw nextError
      }
    }
  })
  const app = createServer({ authService, safetyService })
  const pgError = (code: string, message: string) => Object.assign(new Error(message), { name: "DatabaseError", code })

  try {
    await authService.sendCode("+905551112233")
    const verified = await authService.verifyCode("+905551112233", "482931")
    const block = () => app.inject({
      method: "POST",
      url: "/v1/safety/blocks",
      headers: { authorization: `Bearer ${verified.sessionToken}` },
      payload: { blockedUserId: "other_user" }
    })

    nextError = pgError("23505", "duplicate key value violates unique constraint (+905551112233)")
    const conflict = await block()
    assert.equal(conflict.statusCode, 409)
    assert.doesNotMatch(conflict.body, /duplicate key|905551112233/)

    nextError = pgError("40P01", "deadlock detected on relation blumi_safety_blocks")
    const deadlock = await block()
    assert.equal(deadlock.statusCode, 503)
    assert.equal(deadlock.headers["retry-after"], "1")
    assert.doesNotMatch(deadlock.body, /deadlock|blumi_safety_blocks/)

    nextError = new Error("timeout exceeded when trying to connect")
    const poolTimeout = await block()
    assert.equal(poolTimeout.statusCode, 503)
    assert.equal(poolTimeout.headers["retry-after"], "1")

    nextError = pgError("22P02", "invalid input syntax for type uuid")
    const bug = await block()
    assert.equal(bug.statusCode, 500)
    assert.equal(bug.json().error, "Something went wrong.")
  } finally {
    await app.close()
  }
})
