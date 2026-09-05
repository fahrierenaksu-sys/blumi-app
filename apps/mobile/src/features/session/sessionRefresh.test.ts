import assert from "node:assert/strict"
import test from "node:test"
import {
  createSessionRefreshCoordinator,
  refreshAndPersistSession,
  refreshSession,
  shouldRefreshSessionSoon
} from "./sessionRefresh"
import { createDemoSessionActor } from "./sessionModel"
import type { SessionActor } from "./sessionModel"

test("refreshSession rotates a production token through the auth boundary", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const actor = await refreshSession(
    "https://api.blumi.test/",
    "old_token",
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return createJsonResponse(200, {
        session: {
          accountId: "account-1",
          sessionId: "session-2",
          mode: "production",
          userId: "user-1",
          sessionToken: "new_token",
          expiresAt: "2999-01-01T00:00:00.000Z",
          onboarding: {
            profile: "complete",
            avatar: "incomplete",
            room: "incomplete"
          }
        },
        profile: {
          userId: "user-1",
          displayName: "Defne",
          avatar: { presetId: "dusk" }
        }
      })
    }) as typeof fetch
  )

  assert.equal(calls[0]?.url, "https://api.blumi.test/v1/auth/refresh")
  assert.equal(calls[0]?.init?.method, "POST")
  assert.equal(
    (calls[0]?.init?.headers as Record<string, string>).authorization,
    "Bearer old_token"
  )
  assert.equal(actor.session.sessionToken, "new_token")
})

test("refreshAndPersistSession saves the refreshed actor", async () => {
  let savedToken = ""
  const currentActor = createProductionActor()
  await refreshAndPersistSession(
    "https://api.blumi.test",
    currentActor,
    {
      fetcher: (async () => createJsonResponse(200, {
        session: {
          accountId: "account-1",
          sessionId: "session-2",
          mode: "production",
          userId: "user-1",
          sessionToken: "new_token",
          expiresAt: "2999-01-01T00:00:00.000Z",
          onboarding: {
            profile: "complete",
            avatar: "incomplete",
            room: "incomplete"
          }
        },
        profile: {
          userId: "user-1",
          displayName: "Defne",
          avatar: { presetId: "dusk" }
        }
      })) as typeof fetch,
      persistence: {
        save: async (actor) => {
          savedToken = actor.session.sessionToken
        }
      }
    }
  )

  assert.equal(savedToken, "new_token")
})

test("refresh persistence trusts the server-authoritative onboarding state", async () => {
  let savedActor: SessionActor | undefined
  const currentActor = createProductionActor()

  const refreshed = await refreshAndPersistSession(
    "https://api.blumi.test",
    currentActor,
    {
      fetcher: (async () => createJsonResponse(200, {
        session: {
          accountId: "account-1",
          sessionId: "session-2",
          mode: "production",
          userId: "user-1",
          sessionToken: "new_token",
          expiresAt: "2999-01-01T00:00:00.000Z",
          onboarding: {
            profile: "complete",
            avatar: "complete",
            room: "complete",
            completedAt: "2026-07-13T09:30:00.000Z"
          }
        },
        profile: {
          userId: "user-1",
          displayName: "Defne",
          avatar: { presetId: "dusk" }
        }
      })) as typeof fetch,
      persistence: {
        save: async (actor) => {
          savedActor = actor
        }
      }
    }
  )

  assert.deepEqual(refreshed.session.onboarding, {
    profile: "complete",
    avatar: "complete",
    room: "complete",
    completedAt: "2026-07-13T09:30:00.000Z"
  })
  assert.deepEqual(savedActor?.session.onboarding, refreshed.session.onboarding)
})

test("refresh fails closed when authoritative onboarding is missing", async () => {
  await assert.rejects(
    refreshSession(
      "https://api.blumi.test",
      "old_token",
      (async () => createJsonResponse(200, {
        session: {
          accountId: "account-1",
          sessionId: "session-2",
          mode: "production",
          userId: "user-1",
          sessionToken: "new_token",
          expiresAt: "2999-01-01T00:00:00.000Z"
        },
        profile: {
          userId: "user-1",
          displayName: "Defne",
          avatar: { presetId: "dusk" }
        }
      })) as typeof fetch
    ),
    /onboarding status/
  )
})

test("refresh rejects a rotated session for a different account", async () => {
  await assert.rejects(
    refreshAndPersistSession(
      "https://api.blumi.test",
      createProductionActor(),
      {
        fetcher: (async () => createJsonResponse(200, {
          session: {
            accountId: "account-2",
            sessionId: "session-2",
            mode: "production",
            userId: "user-1",
            sessionToken: "new_token",
            expiresAt: "2999-01-01T00:00:00.000Z",
            onboarding: {
              profile: "complete",
              avatar: "complete",
              room: "complete"
            }
          },
          profile: {
            userId: "user-1",
            displayName: "Defne",
            avatar: { presetId: "dusk" }
          }
        })) as typeof fetch,
        persistence: { save: async () => undefined }
      }
    ),
    /refresh your session safely/
  )
})

test("refresh coordinator coalesces concurrent rotation for one actor", async () => {
  const actor = createProductionActor()
  let runCalls = 0
  let release: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const coordinator = createSessionRefreshCoordinator(async (current) => {
    runCalls += 1
    await gate
    return {
      ...current,
      session: { ...current.session, sessionToken: "new_token" }
    }
  })

  const first = coordinator.refresh(actor)
  const second = coordinator.refresh(actor)
  release?.()
  const [firstResult, secondResult] = await Promise.all([first, second])

  assert.equal(runCalls, 1)
  assert.equal(firstResult.session.sessionToken, "new_token")
  assert.equal(secondResult.session.sessionToken, "new_token")
})

test("refresh coordinator aborts and drains work before logout clear", async () => {
  const actor = createProductionActor()
  let aborted = false
  const coordinator = createSessionRefreshCoordinator(async (_current, signal) => {
    await new Promise<void>((resolve) => {
      signal.addEventListener("abort", () => {
        aborted = true
        resolve()
      }, { once: true })
    })
    throw new Error("aborted")
  })

  const refresh = coordinator.refresh(actor)
  await coordinator.cancelAndWait()

  assert.equal(aborted, true)
  await assert.rejects(refresh)
})

test("shouldRefreshSessionSoon only targets expiring production sessions", () => {
  const demoActor = createDemoSessionActor({ displayName: "Demo" })
  assert.equal(shouldRefreshSessionSoon(demoActor), false)

  const productionActor = {
    ...demoActor,
    session: {
      ...demoActor.session,
      mode: "production" as const,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    }
  }

  assert.equal(shouldRefreshSessionSoon(productionActor), true)
})

function createJsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  } as Response
}

function createProductionActor(): SessionActor {
  const demo = createDemoSessionActor({ displayName: "Defne" })
  return {
    ...demo,
    session: {
      ...demo.session,
      accountId: "account-1",
      sessionId: "session-1",
      mode: "production" as const,
      userId: "user-1",
      sessionToken: "old_token",
      expiresAt: "2026-07-11T11:00:00.000Z",
      onboarding: {
        profile: "complete" as const,
        avatar: "incomplete" as const,
        room: "incomplete" as const
      }
    },
    profile: {
      ...demo.profile,
      userId: "user-1"
    }
  }
}
