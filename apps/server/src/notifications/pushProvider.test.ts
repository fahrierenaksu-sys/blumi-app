import assert from "node:assert/strict"
import test from "node:test"
import { createExpoPushProvider, PushProviderHttpError } from "./pushProvider"

test("expo push provider sends an authenticated Expo push request", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const provider = createExpoPushProvider({
    accessToken: "expo-access-token",
    fetcher: async (url, init) => {
      requests.push({ url: String(url), init })
      return new Response(
        JSON.stringify({ data: { status: "ok", id: "ticket_123" } }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }
  })

  await provider.sendPush("ExponentPushToken[device-123]", {
    title: "New match",
    body: "Mina wants to meet you.",
    data: { type: "match", matchId: "match_123" }
  })

  assert.equal(requests.length, 1)
  assert.equal(requests[0]?.url, "https://exp.host/--/api/v2/push/send")
  assert.deepEqual(requests[0]?.init?.headers, {
    accept: "application/json",
    authorization: "Bearer expo-access-token",
    "content-type": "application/json"
  })
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    to: "ExponentPushToken[device-123]",
    sound: "default",
    title: "New match",
    body: "Mina wants to meet you.",
    data: { type: "match", matchId: "match_123" }
  })
})

test("expo push provider maps delivery options onto the Expo message fields", async () => {
  const bodies: unknown[] = []
  const provider = createExpoPushProvider({
    fetcher: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify({ data: { status: "ok", id: "ticket_1" } }), { status: 200 })
    }
  })
  await provider.sendPush("ExponentPushToken[device]", {
    title: "Blumi",
    body: "You have a new room invitation.",
    data: { type: "chat.room_invite", threadId: "t", inviteId: "i", recipientUserId: "u" },
    delivery: { priority: "high", collapseId: "invite.abc", threadId: "thread.abc", channelId: "default", expiration: 1790000000 }
  })
  await provider.sendPush("ExponentPushToken[device]", {
    title: "Blumi", body: "Update", delivery: { ttlSeconds: 86400 }
  })
  assert.deepEqual(bodies[0], {
    to: "ExponentPushToken[device]",
    sound: "default",
    title: "Blumi",
    body: "You have a new room invitation.",
    data: { type: "chat.room_invite", threadId: "t", inviteId: "i", recipientUserId: "u" },
    priority: "high",
    collapseId: "invite.abc",
    tag: "invite.abc",
    threadId: "thread.abc",
    channelId: "default",
    expiration: 1790000000
  })
  assert.deepEqual(bodies[1], { to: "ExponentPushToken[device]", sound: "default", title: "Blumi", body: "Update", ttl: 86400 })
})

test("expo push provider asks iOS for the notification category and the picture extension", async () => {
  const bodies: Array<Record<string, unknown>> = []
  const provider = createExpoPushProvider({
    fetcher: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify({ data: { status: "ok", id: "ticket_1" } }), { status: 200 })
    }
  })
  await provider.sendPush("ExponentPushToken[device]", {
    title: "Ada",
    body: "Ada invited you to their room",
    data: { type: "chat.room_invite", senderImage: "https://api.example.test/p" },
    delivery: { categoryId: "ROOM_INVITE", mutableContent: true, imageUrl: "https://api.example.test/p" }
  })
  assert.equal(bodies[0]?.categoryId, "ROOM_INVITE")
  assert.equal(bodies[0]?.mutableContent, true)
  assert.deepEqual(bodies[0]?.richContent, { image: "https://api.example.test/p" })
})

test("receipt lookup forwards cancellation and reads only requested ticket", async () => {
  const controller = new AbortController()
  const provider = createExpoPushProvider({ fetcher: async (url, init) => {
    assert.match(String(url), /getReceipts$/)
    assert.equal(init?.signal, controller.signal)
    assert.deepEqual(JSON.parse(String(init?.body)), { ids: ["ticket"] })
    return new Response(JSON.stringify({ data: { ticket: { status: "error", details: { error: "DeviceNotRegistered" } } } }))
  } })
  assert.deepEqual(await provider.getReceipt?.("ticket", { signal: controller.signal }), { status: "error", errorCode: "DeviceNotRegistered" })
})

test("the recipient's unread total travels as the Expo badge; an invalid count is left out", async () => {
  const bodies: Array<Record<string, unknown>> = []
  const provider = createExpoPushProvider({
    fetcher: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify({ data: { status: "ok", id: "ticket" } }), { status: 200 })
    }
  })
  await provider.sendPush("ExponentPushToken[device]", { title: "Blumi", body: "Update", delivery: { badge: 3 } })
  await provider.sendPush("ExponentPushToken[device]", { title: "Blumi", body: "Update", delivery: { badge: 0 } })
  await provider.sendPush("ExponentPushToken[device]", { title: "Blumi", body: "Update", delivery: { badge: -1 } })
  await provider.sendPush("ExponentPushToken[device]", { title: "Blumi", body: "Update", delivery: { badge: 1.5 } })
  assert.deepEqual(bodies.map((body) => body.badge), [3, 0, undefined, undefined])
})

test("receipts for many tickets are read in one request per 1000 ids", async () => {
  const requests: string[][] = []
  const provider = createExpoPushProvider({
    accessToken: "expo-access-token",
    fetcher: async (url, init) => {
      assert.match(String(url), /getReceipts$/)
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer expo-access-token")
      const ids = (JSON.parse(String(init?.body)) as { ids: string[] }).ids
      requests.push(ids)
      return new Response(JSON.stringify({ data: Object.fromEntries(ids
        .filter((id) => id !== "pending")
        .map((id) => [id, id === "gone"
          ? { status: "error", message: "private text", details: { error: "DeviceNotRegistered" } }
          : { status: "ok" }])) }))
    }
  })
  const ids = ["ok", "gone", "pending", ...Array.from({ length: 1000 }, (_value, index) => `t${index}`)]
  const receipts = await provider.getReceipts!(ids)
  assert.deepEqual(requests.map((batch) => batch.length), [1000, 3])
  assert.deepEqual(receipts.get("ok"), { status: "ok" })
  assert.deepEqual(receipts.get("gone"), { status: "error", errorCode: "DeviceNotRegistered" })
  assert.equal(receipts.has("pending"), false, "a receipt Expo does not have yet stays unknown")
  assert.equal(receipts.size, ids.length - 1)
})

test("an Expo rate limit response is reported as such so the outbox can back off", async () => {
  const provider = createExpoPushProvider({
    fetcher: async () => new Response(JSON.stringify({ errors: [{ code: "TOO_MANY_REQUESTS" }] }), { status: 429 })
  })
  await assert.rejects(
    () => provider.sendPush("ExponentPushToken[device]", { title: "Blumi", body: "Update" }),
    (error: unknown) => error instanceof PushProviderHttpError && error.status === 429
  )
})

test("expo push provider rejects non-Expo tokens without making a request", async () => {
  let requestCount = 0
  const provider = createExpoPushProvider({
    fetcher: async () => {
      requestCount += 1
      return new Response(null, { status: 200 })
    }
  })

  await assert.rejects(
    () => provider.sendPush("raw-apns-or-fcm-token", {
      title: "New message",
      body: "Hello"
    }),
    /Expo push token/
  )
  assert.equal(requestCount, 0)
})

test("expo push provider surfaces rejected Expo tickets", async () => {
  const provider = createExpoPushProvider({
    fetcher: async () => new Response(
      JSON.stringify({
        data: {
          status: "error",
          message: "The device is not registered",
          details: { error: "DeviceNotRegistered" }
        }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  })

  await assert.rejects(
    () => provider.sendPush("ExpoPushToken[expired-device]", {
      title: "New message",
      body: "Hello"
    }),
    /DeviceNotRegistered/
  )
})
