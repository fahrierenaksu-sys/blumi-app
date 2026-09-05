import assert from "node:assert/strict"
import test from "node:test"
import { createExpoPushProvider } from "./pushProvider"

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
