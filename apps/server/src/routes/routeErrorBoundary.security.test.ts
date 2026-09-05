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
