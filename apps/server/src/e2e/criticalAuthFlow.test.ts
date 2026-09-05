import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService } from "../auth/authService"
import { createBlumiBackendStore } from "../auth/authStore"
import { createServer } from "../server"

test("critical auth flow survives a real loopback HTTP boundary", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const app = createServer({ authService })
  await app.listen({ host: "127.0.0.1", port: 0 })

  try {
    const address = app.server.address()
    assert.ok(address && typeof address === "object")
    const baseUrl = `http://127.0.0.1:${address.port}`

    const health = await fetch(`${baseUrl}/health`)
    assert.equal(health.status, 200)
    const healthBody = await health.json() as { ok?: unknown }
    assert.equal(healthBody.ok, true)

    const sendCode = await fetch(`${baseUrl}/v1/auth/send-code`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumber: "+905551112233" })
    })
    assert.equal(sendCode.status, 202)

    const verified = await fetch(`${baseUrl}/v1/accounts/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        termsAcceptance: { version: "test-terms-v1", locale: "tr" },
        phoneNumber: "+905551112233",
        verificationCode: "482931"
      })
    })
    assert.equal(verified.status, 200)
    const verifiedBody = await verified.json() as { session?: {
      sessionToken: string
    } }
    assert.ok(verifiedBody.session)
    const session = verifiedBody.session
    assert.match(session.sessionToken, /^dv_/)

    const refreshed = await fetch(`${baseUrl}/v1/auth/refresh`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.sessionToken}` }
    })
    assert.equal(refreshed.status, 200)
    const refreshedBody = await refreshed.json() as { session?: {
      sessionToken: string
    } }
    assert.ok(refreshedBody.session)
    const refreshedSession = refreshedBody.session
    assert.notEqual(refreshedSession.sessionToken, session.sessionToken)

    const oldToken = await fetch(`${baseUrl}/v1/users/me`, {
      headers: { authorization: `Bearer ${session.sessionToken}` }
    })
    assert.equal(oldToken.status, 401)

    const revoked = await fetch(`${baseUrl}/v1/auth/session`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${refreshedSession.sessionToken}` }
    })
    assert.equal(revoked.status, 204)
  } finally {
    await app.close()
  }
})
