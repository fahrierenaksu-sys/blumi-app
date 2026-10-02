import assert from "node:assert/strict"
import test from "node:test"
import {
  createThread,
  fetchChatThreads,
  fetchThreadMessages,
  hideThreadForMe,
  markThreadRead,
  sendThreadMessage
} from "./chatApi"

test("message rate limits and server failures display their cause instead of a connection warning", async () => {
  const { getMessageSendErrorMessageForDisplay } = await import("./chatErrorCopy")
  for (const [status, expected] of [
    [429, "Mesaj gönderme sınırına ulaştın. Biraz bekleyip tekrar dene."],
    [503, "Sunucu şu anda mesajını gönderemiyor. Biraz sonra tekrar dene."],
    [401, "Oturumun doğrulanamadı. Tekrar giriş yapıp mesajını yeniden gönder."]
  ] as const) {
    const error = await sendThreadMessage("https://example.test", "token", "thread", "hello", {},
      (async () => createJsonResponse(status, { error: "opaque server diagnostics" })) as typeof fetch).catch((error: Error) => error)
    assert.ok(error instanceof Error)
    assert.equal(getMessageSendErrorMessageForDisplay(error, "tr"), expected)
    assert.doesNotMatch(getMessageSendErrorMessageForDisplay(error, "en"), /opaque|connection/i)
  }
})

test("chat refresh consumes cursor pages and rejects nonadvancing or cross-account pages", async () => {
  const urls: string[] = []
  const result = await fetchChatThreads("http://localhost:4000", "token", (async (url) => {
    urls.push(String(url))
    return createJsonResponse(200, { userId: "a", threads: [], nextCursor: urls.length === 1 ? "next" : null })
  }) as typeof fetch)
  assert.equal(result.nextCursor, null)
  assert.deepEqual(urls, ["http://localhost:4000/v1/threads", "http://localhost:4000/v1/threads?cursor=next"])
  await assert.rejects(fetchChatThreads("http://localhost:4000", "token", (async () => createJsonResponse(200, { userId: "a", threads: [], nextCursor: "stuck" })) as typeof fetch), /did not advance/)
  let page = 0
  await assert.rejects(fetchChatThreads("http://localhost:4000", "token", (async () => createJsonResponse(200, { userId: ++page === 1 ? "a" : "b", threads: [], nextCursor: page === 1 ? "next" : null })) as typeof fetch), /ownership changed/)
})

test("match-aware refresh syncs the first page and paginates without repeating writes", async () => {
  const requests: { url: string; method: string | undefined }[] = []
  await fetchChatThreads("http://localhost:4000", "token", (async (url, init) => {
    requests.push({ url: String(url), method: init?.method })
    return createJsonResponse(200, {
      userId: "ada",
      threads: [],
      nextCursor: requests.length === 1 ? "next" : null
    })
  }) as typeof fetch, undefined, { syncMatches: true })
  assert.deepEqual(requests, [
    { url: "http://localhost:4000/v1/threads/sync-matches", method: "POST" },
    { url: "http://localhost:4000/v1/threads?cursor=next", method: "GET" }
  ])
})

test("match sync failure leaves existing chats readable through the regular list route", async () => {
  const requests: { url: string; method: string | undefined }[] = []
  const result = await fetchChatThreads("http://localhost:4000", "token", (async (url, init) => {
    requests.push({ url: String(url), method: init?.method })
    return createJsonResponse(requests.length === 1 ? 503 : 200,
      requests.length === 1
        ? { error: "Match recovery is temporarily unavailable." }
        : { userId: "ada", threads: [], nextCursor: null })
  }) as typeof fetch, undefined, { syncMatches: true })
  assert.equal(result.userId, "ada")
  assert.deepEqual(requests, [
    { url: "http://localhost:4000/v1/threads/sync-matches", method: "POST" },
    { url: "http://localhost:4000/v1/threads", method: "GET" }
  ])
})

test("match sync authentication failure is not hidden by a list fallback", async () => {
  let requests = 0
  await assert.rejects(fetchChatThreads("http://localhost:4000", "token", (async () => {
    requests += 1
    return createJsonResponse(401, { error: "Sign in again." })
  }) as typeof fetch, undefined, { syncMatches: true }), /Sign in again/)
  assert.equal(requests, 1)
})

test("older servers without the match-sync route still serve the normal Inbox", async () => {
  let requests = 0
  const result = await fetchChatThreads("http://localhost:4000", "token", (async () => {
    requests += 1
    return createJsonResponse(requests === 1 ? 404 : 200,
      requests === 1 ? { error: "Not found" } : { userId: "ada", threads: [] })
  }) as typeof fetch, undefined, { syncMatches: true })
  assert.equal(result.userId, "ada")
  assert.equal(requests, 2)
})

test("a cancelled match-sync request never starts a fallback read", async () => {
  const controller = new AbortController()
  let requests = 0
  await assert.rejects(fetchChatThreads("http://localhost:4000", "token", (async () => {
    requests += 1
    controller.abort()
    const error = new Error("Request cancelled.")
    error.name = "AbortError"
    throw error
  }) as typeof fetch, controller.signal, { syncMatches: true }), /cancelled/)
  assert.equal(requests, 1)
})

test("fetchChatThreads loads authenticated production threads", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const threads = await fetchChatThreads(
    "http://localhost:4000/",
    "session_token",
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return createJsonResponse(200, {
        userId: "user_one",
        threads: [
          {
            threadId: "thread_one",
            miniRoomId: "room_one",
            participantUserIds: ["user_one", "user_two"],
            participants: [
              { userId: "user_one", displayName: "Mina" },
              {
                userId: "user_two",
                displayName: "Defne",
                avatar: {
                  presetId: "avatar_v2_body_default",
                  revision: 2,
                  loadout: {
                    schemaVersion: 1,
                    bodyId: "avatar_v2_body_default",
                    faceId: "face_default",
                    eyesId: "eyes_default",
                    noseId: "nose_default",
                    mouthId: "mouth_default",
                    hairId: "hair_default",
                    topId: "top_default",
                    bottomId: "bottom_default",
                    shoesId: "shoes_default",
                    accessoryIds: []
                  }
                }
              }
            ],
            createdAt: "2026-06-27T00:00:00.000Z"
          }
        ]
      })
    }) as typeof fetch
  )

  assert.equal(calls[0]?.url, "http://localhost:4000/v1/threads")
  assert.equal(
    (calls[0]?.init?.headers as Record<string, string>).authorization,
    "Bearer session_token"
  )
  assert.equal(threads.userId, "user_one")
  assert.equal(threads.threads[0]?.participants[1]?.displayName, "Defne")
  assert.equal(
    threads.threads[0]?.participants[1]?.avatar?.revision,
    2
  )
})

test("fetchThreadMessages and sendThreadMessage use the thread route", async () => {
  const messages = await fetchThreadMessages(
    "http://localhost:4000",
    "session_token",
    "thread one",
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(url), "http://localhost:4000/v1/threads/thread%20one/messages")
      assert.equal(
        (init?.headers as Record<string, string>).authorization,
        "Bearer session_token"
      )
      return createJsonResponse(200, {
        userId: "user_one",
        threadId: "thread one",
        messages: [
          {
            messageId: "message_one",
            threadId: "thread one",
            senderUserId: "user_two",
            body: "Coffee?",
            sentAt: "2026-06-27T00:00:00.000Z"
          }
        ]
      })
    }) as typeof fetch
  )

  const sent = await sendThreadMessage(
    "http://localhost:4000",
    "session_token",
    "thread one",
    "hello",
    { clientMessageId: "client-message-001" },
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(url), "http://localhost:4000/v1/threads/thread%20one/messages")
      assert.equal(init?.method, "POST")
      assert.equal(
        (init?.headers as Record<string, string>).authorization,
        "Bearer session_token"
      )
      assert.equal(
        (init?.headers as Record<string, string>)["content-type"],
        "application/json"
      )
      assert.equal(init?.body, JSON.stringify({
        body: "hello",
        clientMessageId: "client-message-001"
      }))
      return createJsonResponse(201, {
        message: {
          messageId: "message_two",
          threadId: "thread one",
          senderUserId: "user_one",
          body: "hello",
          sentAt: "2026-06-27T00:01:00.000Z"
        }
      })
    }) as typeof fetch
  )

  assert.equal(messages.messages[0]?.body, "Coffee?")
  assert.equal(sent.messageId, "message_two")
})

test("fetchThreadMessages supports cursor pagination", async () => {
  const messages = await fetchThreadMessages(
    "http://localhost:4000",
    "session_token",
    "thread one",
    { before: "message_later", limit: 20 },
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(
        String(url),
        "http://localhost:4000/v1/threads/thread%20one/messages?before=message_later&limit=20"
      )
      assert.equal(
        (init?.headers as Record<string, string>).authorization,
        "Bearer session_token"
      )
      return createJsonResponse(200, {
        userId: "user_one",
        threadId: "thread one",
        messages: []
      })
    }) as typeof fetch
  )

  assert.equal(messages.threadId, "thread one")
  assert.deepEqual(messages.messages, [])
})

test("createThread and markThreadRead use authenticated thread routes", async () => {
  const created = await createThread(
    "http://localhost:4000",
    "session_token",
    { participantUserIds: ["user_one", "user_two"] },
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(url), "http://localhost:4000/v1/threads")
      assert.equal(init?.method, "POST")
      assert.equal(
        (init?.headers as Record<string, string>).authorization,
        "Bearer session_token"
      )
      assert.equal(
        init?.body,
        JSON.stringify({ participantUserIds: ["user_one", "user_two"] })
      )
      return createJsonResponse(201, {
        thread: {
          threadId: "thread_one",
          miniRoomId: "mini_room_one",
          participantUserIds: ["user_one", "user_two"],
          participants: [
            { userId: "user_one", displayName: "Mina" },
            { userId: "user_two", displayName: "Defne" }
          ],
          createdAt: "2026-06-27T00:00:00.000Z"
        }
      })
    }) as typeof fetch
  )

  await markThreadRead(
    "http://localhost:4000",
    "session_token",
    "thread one",
    {
      expectedUserId: "user_one"
    },
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(url), "http://localhost:4000/v1/threads/thread%20one/read")
      assert.equal(init?.method, "POST")
      assert.equal(
        (init?.headers as Record<string, string>).authorization,
        "Bearer session_token"
      )
      return createJsonResponse(200, {
        userId: "user_one",
        threadId: "thread one",
        readAt: "2026-06-27T00:02:00.000Z"
      })
    }) as typeof fetch
  )

  assert.equal(created.threadId, "thread_one")
})

test("a read that names the newest partner message sends it as the only body field", async () => {
  await markThreadRead(
    "http://localhost:4000",
    "session_token",
    "thread_one",
    { expectedUserId: "user_one", upToMessageId: "message_9" },
    (async (_url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal((init?.headers as Record<string, string>)["content-type"], "application/json")
      assert.equal(init?.body, JSON.stringify({ upToMessageId: "message_9" }))
      return createJsonResponse(200, { userId: "user_one", threadId: "thread_one", readAt: "2026-10-01T10:00:00.000Z" })
    }) as typeof fetch
  )
  // Without a message the request stays bodyless, exactly as before.
  await markThreadRead("http://localhost:4000", "session_token", "thread_one", {},
    (async (_url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(init?.body, undefined)
      assert.equal((init?.headers as Record<string, string>)["content-type"], undefined)
      return createJsonResponse(200, { userId: "user_one", threadId: "thread_one", readAt: "2026-10-01T10:00:00.000Z" })
    }) as typeof fetch)
})

test("delete for me reaches the server when it supports it and reports when it does not", async () => {
  const hidden = await hideThreadForMe("http://localhost:4000", "session_token", "thread one",
    { throughMessageId: "message_9", expectedUserId: "user_one" },
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(url), "http://localhost:4000/v1/threads/thread%20one/hide")
      assert.equal(init?.method, "POST")
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer session_token")
      assert.equal(init?.body, JSON.stringify({ throughMessageId: "message_9" }))
      return createJsonResponse(200, {
        userId: "user_one", threadId: "thread one",
        hiddenThrough: "2026-10-02T10:00:00.000Z", readAt: "2026-10-02T10:00:00.000Z"
      })
    }) as typeof fetch)
  assert.deepEqual(hidden, { hidden: true, hiddenThrough: "2026-10-02T10:00:00.000Z", readAt: "2026-10-02T10:00:00.000Z" })

  // Migration 071 not applied (409) or an older server without the route (404).
  for (const status of [404, 409]) {
    const result = await hideThreadForMe("http://localhost:4000", "session_token", "thread_one", {},
      (async (_url: RequestInfo | URL, init?: RequestInit) => {
        assert.equal(init?.body, "{}")
        return createJsonResponse(status, { code: "CHAT_HIDE_UNAVAILABLE", error: "not yet" })
      }) as typeof fetch)
    assert.deepEqual(result, { hidden: false })
  }
  await assert.rejects(hideThreadForMe("http://localhost:4000", "session_token", "thread_one", {},
    (async () => createJsonResponse(503, { error: "busy" })) as typeof fetch))
  await assert.rejects(hideThreadForMe("http://localhost:4000", "session_token", "thread_one", { expectedUserId: "user_one" },
    (async () => createJsonResponse(200, {
      userId: "someone_else", threadId: "thread_one",
      hiddenThrough: "2026-10-02T10:00:00.000Z", readAt: "2026-10-02T10:00:00.000Z"
    })) as typeof fetch), /confirm/)
})

test("message lists keep the partner's receipt cursors and stay valid without them", async () => {
  const messages = [{ messageId: "m1", threadId: "thread_one", senderUserId: "user_one", body: "hi", sentAt: "2026-10-01T10:00:00.000Z" }]
  const withReceipts = await fetchThreadMessages("http://localhost:4000", "session_token", "thread_one", {},
    (async () => createJsonResponse(200, {
      userId: "user_one", threadId: "thread_one", messages,
      partnerReceipts: { deliveredUpTo: { sentAt: "2026-10-01T10:00:00.000Z", messageId: "m1" } }
    })) as typeof fetch)
  assert.deepEqual(withReceipts.partnerReceipts, { deliveredUpTo: { sentAt: "2026-10-01T10:00:00.000Z", messageId: "m1" } })
  const oldServer = await fetchThreadMessages("http://localhost:4000", "session_token", "thread_one", {},
    (async () => createJsonResponse(200, { userId: "user_one", threadId: "thread_one", messages })) as typeof fetch)
  assert.equal("partnerReceipts" in oldServer, false)
})

test("chat API rejects server errors and malformed payloads", async () => {
  await assert.rejects(
    () =>
      fetchChatThreads(
        "http://localhost:4000",
        "session_token",
        (async () => createJsonResponse(401, { error: "Sign in again." })) as typeof fetch
      ),
    /Sign in again/
  )

  await assert.rejects(
    () =>
      fetchThreadMessages(
        "http://localhost:4000",
        "session_token",
        "thread_one",
        (async () => createJsonResponse(200, { threadId: "thread_one" })) as typeof fetch
      ),
    /conversation/
  )

  await assert.rejects(
    () =>
      fetchThreadMessages(
        "http://localhost:4000",
        "session_token",
        "thread_one",
        (async () => createJsonResponse(503, {})) as typeof fetch
      ),
    (error: unknown) =>
      error instanceof Error && error.message === "We could not open that conversation yet."
  )

  await assert.rejects(
    () =>
      sendThreadMessage(
        "http://localhost:4000",
        "session_token",
        "thread_one",
        "hello",
        {},
        (async () => createJsonResponse(201, { message: { messageId: 4 } })) as typeof fetch
      ),
    /message/
  )

  await assert.rejects(
    () =>
      fetchChatThreads(
        "http://localhost:4000",
        "session_token",
        (async () => createInvalidJsonResponse(502)) as typeof fetch
      ),
    (error: unknown) =>
      error instanceof Error && error.message === "We could not refresh your chats yet."
  )

  await assert.rejects(
    () =>
      markThreadRead(
        "http://localhost:4000",
        "session_token",
        "thread_one",
        {
          expectedUserId: "user_one"
        },
        (async () => createJsonResponse(200, {})) as typeof fetch
      ),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "Blumi could not confirm that chat was read."
  )

  await assert.rejects(
    () =>
      markThreadRead(
        "http://localhost:4000",
        "session_token",
        "thread_one",
        {
          expectedUserId: "user_one"
        },
        (async () => createJsonResponse(200, {
          userId: "user_one",
          threadId: "another_thread",
          readAt: "2026-06-27T00:02:00.000Z"
        })) as typeof fetch
      ),
    /confirm that chat was read/
  )

  await assert.rejects(
    () =>
      markThreadRead(
        "http://localhost:4000",
        "session_token",
        "thread_one",
        {
          expectedUserId: "user_one"
        },
        (async () => createJsonResponse(200, {
          userId: "another_user",
          threadId: "thread_one",
          readAt: "2026-06-27T00:02:00.000Z"
        })) as typeof fetch
      ),
    /confirm that chat was read/
  )

  await markThreadRead(
    "http://localhost:4000",
    "session_token",
    "thread_one",
    {
      expectedUserId: "user_one"
    },
    (async () => createEmptyResponse(204)) as typeof fetch
  )
})

function createJsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  } as unknown as Response
}

function createInvalidJsonResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError("Unexpected HTML response")
    }
  } as unknown as Response
}

function createEmptyResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError("Unexpected end of JSON input")
    }
  } as unknown as Response
}
