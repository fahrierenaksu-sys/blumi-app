import assert from "node:assert/strict"
import test from "node:test"
import { createInMemoryChatRepository } from "./chatRepository"
import { applyTestPersonaPolicy } from "./testPersonaPolicy"

function repositoryWithPersona() {
  const repository = createInMemoryChatRepository()
  return {
    ...repository,
    async findTestPersona(userId: string) {
      return userId === "test-persona-001"
        ? { userId, greeting: "hi", replies: ["hello"] }
        : null
    }
  }
}

async function sendToPersona(repository: ReturnType<typeof repositoryWithPersona>) {
  await repository.saveThread({
    threadId: "thread-persona", miniRoomId: "room-persona", createdAt: "2026-10-01T10:00:00.000Z",
    participantUserIds: ["user-a", "test-persona-001"],
    participants: [{ userId: "user-a" }, { userId: "test-persona-001" }]
  })
  const result = await repository.sendMessageChecked({
    message: { messageId: "message-persona", threadId: "thread-persona", senderUserId: "user-a", body: "hi", sentAt: "2026-10-01T10:01:00.000Z" },
    leaseUntil: new Date("2026-10-01T10:01:30.000Z")
  })
  assert.equal(result.outcome, "created")
  return result.outcome === "created" ? result.recipientPersonas.map((persona) => persona.userId) : []
}

test("production deployments never resolve seeded test personas", async () => {
  const repository = applyTestPersonaPolicy(repositoryWithPersona(), "production")
  assert.equal(await repository.findTestPersona("test-persona-001"), null)
  assert.deepEqual(await sendToPersona(repository), [], "nor through the one-statement send")
})

for (const environment of ["development", "staging"] as const) {
  test(`${environment} deployments keep seeded test personas available`, async () => {
    const repository = applyTestPersonaPolicy(repositoryWithPersona(), environment)
    assert.equal((await repository.findTestPersona("test-persona-001"))?.greeting, "hi")
    assert.deepEqual(await sendToPersona(repository), ["test-persona-001"])
  })
}

test("the production policy keeps every other repository method intact", async () => {
  const source = repositoryWithPersona()
  const repository = applyTestPersonaPolicy(source, "production")
  for (const key of Object.keys(source) as (keyof typeof source)[]) {
    if (key === "findTestPersona") continue
    assert.equal(typeof repository[key], "function")
  }
  assert.deepEqual(await repository.listThreads("user-a"), [])
})
