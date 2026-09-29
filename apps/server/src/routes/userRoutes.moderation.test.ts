import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService } from "../auth/authService"
import { createInMemoryAuthRepository } from "../auth/authRepository"
import {
  createAccountRecord,
  createBlumiBackendStore,
  createSessionRecord,
  createSessionToken
} from "../auth/authStore"
import { createServer } from "../server"

async function createRestrictedAccountServer(
  moderation: { status: "banned" } | { status: "suspended"; suspendedUntil: string }
) {
  const repository = createInMemoryAuthRepository(createBlumiBackendStore())
  const authService = createAuthService({ repository, otpHmacSecret: "test-secret" })
  const now = new Date()
  const account = createAccountRecord("+905550000123", now)
  await repository.saveAccount({
    ...account,
    moderation: { ...moderation, updatedAt: now.toISOString() }
  })
  const token = createSessionToken()
  await repository.saveSession(createSessionRecord(account, token, now))
  return {
    app: createServer({ authService }),
    headers: { authorization: `Bearer ${token}` }
  }
}

const restrictedWrites = [
  { method: "PATCH" as const, url: "/v1/users/me", payload: { displayName: "Changed" } },
  { method: "PUT" as const, url: "/v1/users/me/avatar", payload: { loadout: {}, revision: 0 } },
  { method: "PATCH" as const, url: "/v1/users/me/onboarding", payload: { step: "profile" } }
]

for (const write of restrictedWrites) {
  test(`banned accounts cannot ${write.method} ${write.url}`, async () => {
    const { app, headers } = await createRestrictedAccountServer({ status: "banned" })
    const response = await app.inject({ ...write, headers })
    assert.equal(response.statusCode, 403)
    assert.equal(response.json().code, "ACCOUNT_BANNED")
    await app.close()
  })

  test(`suspended accounts cannot ${write.method} ${write.url}`, async () => {
    const { app, headers } = await createRestrictedAccountServer({
      status: "suspended",
      suspendedUntil: new Date(Date.now() + 86_400_000).toISOString()
    })
    const response = await app.inject({ ...write, headers })
    assert.equal(response.statusCode, 403)
    assert.equal(response.json().code, "ACCOUNT_SUSPENDED")
    await app.close()
  })
}
