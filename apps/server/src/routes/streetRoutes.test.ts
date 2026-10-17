import assert from "node:assert/strict"
import test from "node:test"
import { createCapabilityService } from "../capabilities/capabilityService"
import { createAdversarialServer, type SyntheticAccount } from "./adversarialFixture"

// Sokağım over HTTP: who may read whose window, and what a window never says.
const STREET_ON = createCapabilityService({
  manifest: { rollouts: { chat_street: 100, avatar_loadout_v2_read: 100 }, internalUserIds: [] }
})
const DECLARED = { "x-blumi-client-capabilities": "chat_street,avatar_loadout_v2_read" }
const FORBIDDEN_KEYS = /^(userId|userIds|participantUserIds|lastSeen|lastSeenAt|online|presence|updatedAt|changedAt|createdAt|matchedAt|sentAt)$/

async function streetHarness() {
  const harness = createAdversarialServer({ capabilityService: STREET_ON })
  await harness.app.ready()
  const ada = await harness.createAccount("ada")
  const bora = await harness.createAccount("bora")
  const stranger = await harness.createAccount("cem")
  const threadId = await harness.matchAndThread(ada, bora, "street_1")
  const readStreet = (account: SyntheticAccount) =>
    harness.call("GET", "/v1/street", { token: account.sessionToken, headers: DECLARED })
  const closeWindow = (account: SyntheticAccount, closed: boolean) =>
    harness.call("PUT", "/v1/street/visibility", { token: account.sessionToken, headers: DECLARED, payload: { closed } })
  return { harness, ada, bora, stranger, threadId, readStreet, closeWindow }
}

function collectKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((entry) => collectKeys(entry, keys))
  else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      keys.push(key)
      collectKeys(entry, keys)
    }
  }
  return keys
}

test("the street is dark while chat_street is off: both routes answer 404", async () => {
  // Arrange: the default capability service has no manifest entry for the street
  const harness = createAdversarialServer()
  const ada = await harness.createAccount("ada")
  // Act
  const read = await harness.call("GET", "/v1/street", { token: ada.sessionToken, headers: DECLARED })
  const write = await harness.call("PUT", "/v1/street/visibility", { token: ada.sessionToken, headers: DECLARED, payload: { closed: true } })
  // Assert
  assert.equal(read.statusCode, 404)
  assert.equal(write.statusCode, 404)
  await harness.app.close()
})

test("a build that does not declare chat_street gets 404 even when it is rolled out", async () => {
  const { harness, ada } = await streetHarness()
  const response = await harness.call("GET", "/v1/street", { token: ada.sessionToken })
  assert.equal(response.statusCode, 404)
  await harness.app.close()
})

test("a mutual match's window is open by default and a non-match never appears", async () => {
  const { harness, ada, bora, stranger, threadId, readStreet } = await streetHarness()
  // Act
  const adaStreet = await readStreet(ada)
  const strangerStreet = await readStreet(stranger)
  // Assert
  assert.equal(adaStreet.statusCode, 200)
  const windows = adaStreet.json().windows
  assert.equal(windows.length, 1)
  assert.equal(windows[0].threadId, threadId)
  assert.equal(windows[0].closed, false)
  assert.equal(adaStreet.json().self.closed, false)
  assert.equal(strangerStreet.statusCode, 200)
  assert.deepEqual(strangerStreet.json().windows, [])
  assert.ok(!JSON.stringify(strangerStreet.json()).includes(bora.userId))
  await harness.app.close()
})

test("a thread without an active match is not a window", async () => {
  // Arrange: a chat thread exists, but no match or connection backs it
  const { harness, stranger, readStreet } = await streetHarness()
  const other = await harness.createAccount("dila")
  await harness.chatService.createThread({
    threadId: "thread_match_orphan",
    miniRoomId: "match_orphan",
    participantUserIds: [stranger.userId, other.userId],
    participants: [{ userId: stranger.userId }, { userId: other.userId }]
  })
  // Act
  const response = await readStreet(stranger)
  // Assert
  assert.deepEqual(response.json().windows, [])
  await harness.app.close()
})

test("a closed window shows only curtains: no avatar, room or change", async () => {
  const { harness, ada, bora, readStreet, closeWindow } = await streetHarness()
  // Act
  const closed = await closeWindow(bora, true)
  const street = await readStreet(ada)
  const own = await readStreet(bora)
  // Assert
  assert.equal(closed.statusCode, 200)
  const [window] = street.json().windows
  assert.equal(window.closed, true)
  assert.equal(window.avatar, null)
  assert.equal(window.room, null)
  assert.equal(window.change, null)
  assert.equal(own.json().self.closed, true)
  // Reopening is one call
  assert.equal((await closeWindow(bora, false)).statusCode, 200)
  assert.equal((await readStreet(ada)).json().windows[0].closed, false)
  await harness.app.close()
})

test("a block in either direction, a ban or a deletion removes the window", async () => {
  const { harness, ada, bora, readStreet } = await streetHarness()
  await harness.safetyService.blockUser(bora.userId, ada.userId)
  assert.deepEqual((await readStreet(ada)).json().windows, [])
  await harness.safetyService.unblockUser(bora.userId, ada.userId)
  assert.equal((await readStreet(ada)).json().windows.length, 1)

  await harness.banAccount(bora)
  assert.deepEqual((await readStreet(ada)).json().windows, [])
  await harness.app.close()

  const second = await streetHarness()
  const deleted = await second.harness.deleteAccountOverHttp(second.bora)
  assert.ok(deleted.statusCode < 300, `deletion answered ${deleted.statusCode}`)
  assert.deepEqual((await second.readStreet(second.ada)).json().windows, [])
  await second.harness.app.close()
})

test("the response never carries user ids, timestamps or presence", async () => {
  const { harness, ada, bora, readStreet } = await streetHarness()
  const body = (await readStreet(ada)).json()
  const leaked = collectKeys(body).filter((key) => FORBIDDEN_KEYS.test(key))
  assert.deepEqual(leaked, [])
  const text = JSON.stringify(body)
  assert.ok(!text.includes(bora.userId))
  assert.ok(!text.includes(ada.userId))
  await harness.app.close()
})

test("the visibility route refuses anything but a boolean", async () => {
  const { harness, bora } = await streetHarness()
  for (const payload of [{}, { closed: "yes" }, []]) {
    const response = await harness.call("PUT", "/v1/street/visibility", { token: bora.sessionToken, headers: DECLARED, payload })
    assert.equal(response.statusCode, 400, JSON.stringify(payload))
  }
  await harness.app.close()
})
