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

test("production deployments never resolve seeded test personas", async () => {
  const repository = applyTestPersonaPolicy(repositoryWithPersona(), "production")
  assert.equal(await repository.findTestPersona("test-persona-001"), null)
})

for (const environment of ["development", "staging"] as const) {
  test(`${environment} deployments keep seeded test personas available`, async () => {
    const repository = applyTestPersonaPolicy(repositoryWithPersona(), environment)
    assert.equal((await repository.findTestPersona("test-persona-001"))?.greeting, "hi")
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
