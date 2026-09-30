import assert from "node:assert/strict"
import test from "node:test"
import { createFirebaseUserDeletionDispatch } from "../auth/firebaseUserDeletionWorker"
import { authenticateRealtimeRequest } from "../realtime/realtimeAuth"
import { createAdversarialServer, firebaseIdToken, type AdversarialServer } from "./adversarialFixture"

// Adversarial authentication and account-lifecycle flows over HTTP (audit
// domain C). Clock-dependent refresh rules (grace window, family cap) are
// covered at the service level in auth/sessionAdversarial.postgres.test.ts.
async function withServer(run: (server: AdversarialServer) => Promise<void>): Promise<void> {
  const server = createAdversarialServer()
  try {
    await server.app.ready()
    await run(server)
  } finally {
    await server.app.close()
  }
}

function realtimeUpgrade(server: AdversarialServer, ticket: string, now?: Date) {
  const service = now
    ? { ...server.realtimeTicketService, consume: (value: string) => server.realtimeTicketService.consume(value, now) }
    : server.realtimeTicketService
  return authenticateRealtimeRequest({
    request: { headers: { "sec-websocket-protocol": `ticket-${ticket}` } } as never,
    authService: server.authService,
    realtimeTicketService: service
  })
}

test("twenty concurrent HTTP refreshes of one token leave exactly one live token", async () => {
  await withServer(async (server) => {
    const member = await server.createAccount("burst")
    const responses = await Promise.all(Array.from({ length: 20 }, () =>
      server.call("POST", "/v1/auth/refresh", { token: member.sessionToken })))
    for (const response of responses) assert.ok([200, 401].includes(response.statusCode), String(response.statusCode))
    const tokens = responses.filter((response) => response.statusCode === 200)
      .map((response) => response.json().session.sessionToken as string)
    assert.ok(tokens.length >= 1)
    let live = 0
    for (const token of tokens) {
      if ((await server.call("GET", "/v1/users/me", { token })).statusCode === 200) live += 1
    }
    assert.equal(live, 1)
    assert.equal((await server.call("GET", "/v1/users/me", { token: member.sessionToken })).statusCode, 401)
  })
})

test("refresh and logout refuse missing, malformed and oversized bearer tokens without a server error", async () => {
  await withServer(async (server) => {
    for (const authorization of [undefined, "", "Bearer", "Bearer ", "Basic abc", "bearer lower", "Bearer \u0000", `Bearer ${"x".repeat(8_000)}`]) {
      for (const [method, url] of [["POST", "/v1/auth/refresh"], ["DELETE", "/v1/auth/session"], ["GET", "/v1/users/me"]] as const) {
        const response = await server.app.inject({
          method,
          url,
          remoteAddress: "10.99.0.1",
          headers: authorization === undefined ? {} : { authorization }
        }).catch((error: unknown) => ({ statusCode: -1, error }))
        assert.ok(
          [401, 204].includes(response.statusCode),
          `${method} ${url} with ${JSON.stringify(authorization?.slice(0, 20))}: ${response.statusCode}`
        )
        if (response.statusCode === 204) assert.equal(method, "DELETE", "only logout is idempotent for an unknown token")
      }
    }
  })
})

test("Firebase completion refuses a foreign uid, unknown sign-ins, missing terms and bad tokens", async () => {
  await withServer(async (server) => {
    const owner = await server.createAccount("owner")
    const complete = (payload: unknown) => server.call("POST", "/v1/auth/firebase/complete", { payload })

    const hijack = await complete({ idToken: firebaseIdToken("uid_attacker_1", owner.phoneNumber), authIntent: "sign-in" })
    assert.equal(hijack.statusCode, 409)
    assert.equal(hijack.json().code, "ACCOUNT_RECOVERY_REQUIRED")
    assert.equal(hijack.json().session, undefined)

    const secondPhone = await complete({
      idToken: firebaseIdToken(owner.firebaseUid, "+15579990001"),
      authIntent: "create",
      termsAcceptance: { version: "test-terms-v1", locale: "en" }
    })
    assert.equal(secondPhone.statusCode, 409, "a bound uid cannot claim a second phone")
    assert.equal(await server.authService.repository.getAccountByPhone("+15579990001"), null)

    const unknown = await complete({ idToken: firebaseIdToken("uid_new_1", "+15579990002"), authIntent: "sign-in" })
    assert.equal(unknown.statusCode, 401)
    assert.equal(await server.authService.repository.getAccountByPhone("+15579990002"), null)

    const noTerms = await complete({ idToken: firebaseIdToken("uid_new_2", "+15579990003"), authIntent: "create" })
    assert.equal(noTerms.statusCode, 400)

    for (const idToken of ["garbage", firebaseIdToken("uid_new_3", "not-a-phone"), firebaseIdToken("uid_new_4", "+1")]) {
      const response = await complete({ idToken, authIntent: "sign-in" })
      assert.equal(response.statusCode, 401, idToken)
    }

    const legit = await complete({ idToken: firebaseIdToken(owner.firebaseUid, owner.phoneNumber), authIntent: "sign-in" })
    assert.equal(legit.statusCode, 200)
    assert.equal(legit.json().session.userId, owner.userId)
  })
})

test("concurrent first HTTP completions of two phones with one Firebase uid create one account", async () => {
  await withServer(async (server) => {
    const phones = ["+15579990101", "+15579990102"]
    const responses = await Promise.all(phones.map((phone) => server.call("POST", "/v1/auth/firebase/complete", {
      payload: {
        idToken: firebaseIdToken("uid_contested_http", phone),
        authIntent: "create",
        termsAcceptance: { version: "test-terms-v1", locale: "en" }
      }
    })))
    assert.deepEqual(responses.map((response) => response.statusCode).sort(), [200, 409])
    const created = await Promise.all(phones.map((phone) => server.authService.repository.getAccountByPhone(phone)))
    assert.equal(created.filter(Boolean).length, 1)
  })
})

test("a deleted account's Firebase uid cannot sign straight back in while its deletion is pending", async () => {
  await withServer(async (server) => {
    const member = await server.createAccount("leaving")
    const deleted = await server.deleteAccountOverHttp(member)
    assert.equal(deleted.statusCode, 202)
    const back = await server.call("POST", "/v1/auth/firebase/complete", {
      payload: {
        idToken: firebaseIdToken(member.firebaseUid, member.phoneNumber),
        authIntent: "create",
        termsAcceptance: { version: "test-terms-v1", locale: "en" }
      }
    })
    assert.equal(back.statusCode, 403)
  })
})

test("realtime tickets are single-use, expire, and die with logout and account deletion", async () => {
  await withServer(async (server) => {
    const member = await server.createAccount("socket")
    const issue = async (token: string) => {
      const response = await server.call("POST", "/v1/auth/realtime-ticket", { token, payload: {} })
      assert.equal(response.statusCode, 201)
      assert.equal(response.headers["cache-control"], "no-store")
      return response.json().ticket as string
    }

    const once = await issue(member.sessionToken)
    assert.equal((await realtimeUpgrade(server, once))?.userId, member.userId)
    assert.equal(await realtimeUpgrade(server, once), null, "a ticket cannot be replayed")

    const late = await issue(member.sessionToken)
    assert.equal(await realtimeUpgrade(server, late, new Date(Date.now() + 31_000)), null, "an expired ticket is refused")

    for (const forged of ["", "short", "x".repeat(129), "../../etc", `${once}x`]) {
      assert.equal(await realtimeUpgrade(server, forged), null, `forged ${forged.slice(0, 10)}`)
    }

    const beforeLogout = await issue(member.sessionToken)
    assert.equal((await server.call("DELETE", "/v1/auth/session", { token: member.sessionToken })).statusCode, 204)
    assert.equal(await realtimeUpgrade(server, beforeLogout), null, "logout invalidates an unused ticket")

    const doomed = await server.createAccount("socketdoomed")
    const beforeDeletion = await issue(doomed.sessionToken)
    assert.ok([202, 204].includes((await server.deleteAccountOverHttp(doomed)).statusCode))
    assert.equal(await realtimeUpgrade(server, beforeDeletion), null, "account deletion invalidates an unused ticket")
  })
})

test("realtime tickets are refused to restricted and unfinished accounts", async () => {
  await withServer(async (server) => {
    const banned = await server.createAccount("socketbanned")
    await server.banAccount(banned)
    assert.equal((await server.call("POST", "/v1/auth/realtime-ticket", { token: banned.sessionToken, payload: {} })).statusCode, 403)
    const unfinished = await server.createAccount("socketnew", { eligible: false })
    assert.equal((await server.call("POST", "/v1/auth/realtime-ticket", { token: unfinished.sessionToken, payload: {} })).statusCode, 403)
  })
})

test("a realtime ticket issued before a ban cannot open a socket after it", async () => {
  await withServer(async (server) => {
    const member = await server.createAccount("socketlate")
    const issued = await server.call("POST", "/v1/auth/realtime-ticket", { token: member.sessionToken, payload: {} })
    assert.equal(issued.statusCode, 201)
    await server.banAccount(member)
    assert.equal(await realtimeUpgrade(server, issued.json().ticket), null)
  })
})

test(
  "a banned member cannot shed the ban by deleting the account and signing up again with the same phone",
  async () => {
    await withServer(async (server) => {
      const banned = await server.createAccount("evader")
      await server.banAccount(banned)
      const deleted = await server.deleteAccountOverHttp(banned)
      assert.ok([202, 204].includes(deleted.statusCode), `deletion of a banned account: ${deleted.statusCode}`)
      // Simulate the Firebase deletion worker finishing: the phone's next
      // Firebase user has a new uid and the outbox row is gone.
      await createFirebaseUserDeletionDispatch({
        repository: server.authService.repository,
        async deleteUser() {},
        now: () => new Date(Date.now() + 60_000)
      })()
      const again = await server.call("POST", "/v1/auth/firebase/complete", {
        payload: {
          idToken: firebaseIdToken(`${banned.firebaseUid}_recreated`, banned.phoneNumber),
          authIntent: "create",
          termsAcceptance: { version: "test-terms-v1", locale: "en" }
        }
      })
      if (again.statusCode === 200) {
        const me = await server.call("GET", "/v1/users/me", { token: again.json().session.sessionToken })
        assert.equal(me.statusCode, 403, "the re-registered phone must still be banned")
        assert.equal(me.json().code, "ACCOUNT_BANNED")
      } else {
        assert.ok([403, 409].includes(again.statusCode), `re-registration: ${again.statusCode}`)
      }
    })
  }
)
