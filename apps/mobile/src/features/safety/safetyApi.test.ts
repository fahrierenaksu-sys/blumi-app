import assert from "node:assert/strict"
import test from "node:test"
import {
  blockSafetyUser,
  fetchMySafetyReports,
  fetchSafetyBlocks,
  reportSafetyUser,
  unblockSafetyUser
} from "./safetyApi"
import { registerBoundedRequestTests } from "../network/boundedRequestContract"

registerBoundedRequestTests([
  {
    name: "safety blocks GET",
    run: (fetcher) => fetchSafetyBlocks("https://api.blumi.test", "token", fetcher)
  },
  {
    name: "safety block POST",
    run: (fetcher) => blockSafetyUser("https://api.blumi.test", "token", "user-2", fetcher)
  },
  {
    name: "safety unblock DELETE",
    run: (fetcher) => unblockSafetyUser("https://api.blumi.test", "token", "user-2", fetcher)
  },
  {
    name: "safety report POST",
    run: (fetcher) => reportSafetyUser("https://api.blumi.test", "token", {
      reportedUserId: "user-2",
      reason: "spam",
      idempotencyKey: "report-key-1"
    }, fetcher)
  },
  {
    name: "my safety reports GET",
    run: (fetcher) => fetchMySafetyReports("https://api.blumi.test", "token", fetcher)
  }
])

test("safety API forwards caller cancellation and skips pre-aborted requests", async () => {
  const controller = new AbortController()
  let calls = 0
  let transportSignal: AbortSignal | null | undefined
  let entered!: () => void
  const started = new Promise<void>((resolve) => { entered = resolve })
  const request = blockSafetyUser("https://api.blumi.test", "token", "user-2", async (_url, init) => {
    calls += 1
    transportSignal = init?.signal
    entered()
    return new Promise<Response>(() => {})
  }, controller.signal)
  const rejected = assert.rejects(request, { name: "AbortError" })
  await started
  controller.abort()
  await rejected
  assert.equal(transportSignal?.aborted, true)
  await assert.rejects(unblockSafetyUser("https://api.blumi.test", "token", "user-2", async () => {
    calls += 1
    return new Response(null, { status: 204 })
  }, controller.signal), { name: "AbortError" })
  assert.equal(calls, 1)
})

test("safety unblock accepts an empty 204 and keeps fallback copy for unreadable errors", async () => {
  await unblockSafetyUser("https://api.blumi.test", "token", "user-2",
    async () => new Response(null, { status: 204 }))
  await assert.rejects(
    unblockSafetyUser("https://api.blumi.test", "token", "user-2",
      async () => new Response("<html>bad gateway</html>", { status: 502 })),
    /could not be shown again/
  )
})

test("fetchMySafetyReports returns only the caller-facing status and generic response", async () => {
  const reports = await fetchMySafetyReports(
    "http://localhost:4000/",
    "session_token",
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(url), "http://localhost:4000/v1/safety/reports")
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer session_token")
      return createJsonResponse(200, {
        reports: [{
          reportId: "report_private",
          createdAt: "2026-09-28T10:00:00.000Z",
          status: "resolved",
          response: "We reviewed your report and closed it.",
          actorUserId: "must_not_be_kept",
          reportedUserId: "must_not_be_kept",
          adminNote: "must_not_be_kept",
          sanction: "must_not_be_kept"
        }]
      })
    }) as typeof fetch
  )

  assert.deepEqual(reports, [{
    reportId: "report_private",
    createdAt: "2026-09-28T10:00:00.000Z",
    status: "resolved",
    response: "We reviewed your report and closed it."
  }])
})

test("fetchSafetyBlocks loads authenticated production block list", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const blocks = await fetchSafetyBlocks(
    "http://localhost:4000/",
    "session_token",
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return createJsonResponse(200, {
        userId: "user_one",
        blocks: [
          {
            actorUserId: "user_one",
            blockedUserId: "target_user",
            createdAt: "2026-06-27T00:00:00.000Z",
            blockedProfile: {
              userId: "target_user",
              displayName: "Defne",
              avatarPresetId: "dusk"
            }
          }
        ]
      })
    }) as typeof fetch
  )

  assert.equal(calls[0]?.url, "http://localhost:4000/v1/safety/blocks")
  assert.equal(
    (calls[0]?.init?.headers as Record<string, string>).authorization,
    "Bearer session_token"
  )
  assert.equal(blocks[0]?.blockedUserId, "target_user")
  assert.equal(blocks[0]?.blockedProfile?.displayName, "Defne")
})

test("blockSafetyUser and unblockSafetyUser use server-authoritative routes", async () => {
  const block = await blockSafetyUser(
    "http://localhost:4000",
    "session_token",
    "target user",
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(url), "http://localhost:4000/v1/safety/blocks")
      assert.equal(init?.method, "POST")
      assert.equal(init?.body, JSON.stringify({ blockedUserId: "target user" }))
      assert.equal(
        (init?.headers as Record<string, string>).authorization,
        "Bearer session_token"
      )
      return createJsonResponse(201, {
        block: {
          actorUserId: "user_one",
          blockedUserId: "target user",
          createdAt: "2026-06-27T00:00:00.000Z"
        }
      })
    }) as typeof fetch
  )

  let deleteCalled = false
  await unblockSafetyUser(
    "http://localhost:4000",
    "session_token",
    "target user",
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      deleteCalled = true
      assert.equal(
        String(url),
        "http://localhost:4000/v1/safety/blocks/target%20user"
      )
      assert.equal(init?.method, "DELETE")
      return {
        ok: true,
        status: 204,
        json: async () => ({})
      } as Response
    }) as typeof fetch
  )

  assert.equal(block.blockedUserId, "target user")
  assert.equal(deleteCalled, true)
})

test("reportSafetyUser posts a report and receives the automatic block", async () => {
  const result = await reportSafetyUser(
    "http://localhost:4000",
    "session_token",
    {
      reportedUserId: "target_user",
      reason: "underage",
      note: "profile says 16",
      idempotencyKey: "report-attempt-001"
    },
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(url), "http://localhost:4000/v1/safety/reports")
      assert.equal(init?.method, "POST")
      assert.equal(
        (init?.headers as Record<string, string>)["idempotency-key"],
        "report-attempt-001"
      )
      assert.equal(
        init?.body,
        JSON.stringify({
          reportedUserId: "target_user",
          reason: "underage",
          note: "profile says 16"
        })
      )
      return createJsonResponse(201, {
        report: {
          reportId: "report_one",
          actorUserId: "user_one",
          reportedUserId: "target_user",
          reason: "underage",
          note: "profile says 16",
          createdAt: "2026-06-27T00:00:00.000Z"
        },
        block: {
          actorUserId: "user_one",
          blockedUserId: "target_user",
          createdAt: "2026-06-27T00:00:00.000Z"
        }
      })
    }) as typeof fetch
  )

  assert.equal(result.report.reason, "underage")
  assert.equal(result.block.blockedUserId, "target_user")
})

test("reportSafetyUser accepts the fake-or-bot moderation reason from the server", async () => {
  const result = await reportSafetyUser(
    "http://localhost:4000",
    "session_token",
    {
      reportedUserId: "target_user",
      reason: "fake_or_bot",
      idempotencyKey: "report-attempt-fake-or-bot"
    },
    (async () => createJsonResponse(201, {
      report: {
        reportId: "report_bot",
        actorUserId: "user_one",
        reportedUserId: "target_user",
        reason: "fake_or_bot",
        createdAt: "2026-08-13T00:00:00.000Z"
      },
      block: {
        actorUserId: "user_one",
        blockedUserId: "target_user",
        createdAt: "2026-08-13T00:00:00.000Z"
      }
    })) as typeof fetch
  )

  assert.equal(result.report.reason, "fake_or_bot")
})

test("safety API surfaces server errors and rejects malformed payloads", async () => {
  await assert.rejects(
    () =>
      blockSafetyUser(
        "http://localhost:4000",
        "session_token",
        "target_user",
        (async () => createJsonResponse(400, { error: "Choose a person first." })) as typeof fetch
      ),
    /Choose a person/
  )

  await assert.rejects(
    () =>
      fetchSafetyBlocks(
        "http://localhost:4000",
        "session_token",
        (async () => createJsonResponse(200, { blocks: [{ blockedUserId: 4 }] })) as typeof fetch
      ),
    /hidden person/
  )

  await assert.rejects(
    () =>
      reportSafetyUser(
        "http://localhost:4000",
        "session_token",
        {
          reportedUserId: "target_user",
          reason: "spam",
          idempotencyKey: "report-attempt-invalid-response"
        },
        (async () => createJsonResponse(201, { report: { reportId: "bad" } })) as typeof fetch
      ),
    /report/
  )
})

function createJsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  } as Response
}
