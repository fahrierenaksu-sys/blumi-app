import assert from "node:assert/strict"
import test from "node:test"
import { createPostgresAccountDataExporter } from "./accountDataExporter"
import { createAccountRecord } from "../auth/authStore"

function fixture(messageCount = 3, failCommit = false) {
  const account = { ...createAccountRecord("+905551112233"), accountId: "account-a", userId: "user-a" }
  const statements: string[] = []
  let table = ""
  let offset = 0
  let largestBatch = 0
  let released = false
  const client = {
    async query(sql: string, values?: readonly unknown[]) {
      statements.push(sql)
      if (failCommit && sql === "COMMIT") throw new Error("commit failed")
      if (sql.includes("FROM blumi_accounts")) return { rows: [{
        account_id: "account-a", user_id: "user-a", phone_number: "+905551112233", display_name: "A",
        avatar_preset_id: account.profile.avatar.presetId, avatar_selection: account.profile.avatar.loadout,
        avatar_revision: account.profile.avatar.revision,
        created_at: "2026-09-05T00:00:00Z", updated_at: "2026-09-05T00:00:00Z"
      }] }
      if (sql.startsWith("DECLARE")) {
        assert.deepEqual(values, ["user-a"])
        table = sql
        offset = 0
      }
      if (sql.startsWith("FETCH") && table.includes("blumi_chat_messages")) {
        const count = Math.min(500, messageCount - offset)
        largestBatch = Math.max(largestBatch, count)
        const rows = Array.from({ length: count }, (_, i) => ({ message_id: `message-${offset + i}`,
          thread_id: "thread-a", body: "mine", sent_at: new Date("2026-09-05T00:00:00Z") }))
        offset += count
        return { rows }
      }
      return { rows: [] }
    },
    release() { released = true }
  }
  const exporter = createPostgresAccountDataExporter({ query: client.query,
    connect: async () => client })
  const stream = () => exporter.streamExport(account, {
    schemaVersion: "2026-07-21", exportedAt: "2026-09-05T00:00:00Z", exclusions: ["secrets"]
  })
  return { stream, statements, largestBatch: () => largestBatch, released: () => released }
}

test("export JSON keeps schema and all sections within one readonly repeatable-read snapshot", async () => {
  const f = fixture()
  let json = ""
  for await (const chunk of f.stream()) json += chunk
  const result = JSON.parse(json)
  assert.equal(result.schemaVersion, "2026-07-21")
  assert.equal(result.account.userId, "user-a")
  assert.equal(result.data.messages.length, 3)
  assert.equal(result.data.messages[0].sent_at, "2026-09-05T00:00:00.000Z")
  assert.equal(result.data.inventory, null)
  assert.equal(Object.keys(result.data).length, 11)
  assert.match(f.statements[0], /BEGIN.*REPEATABLE READ.*READ ONLY/)
  assert.equal(f.statements.at(-1), "COMMIT")
  assert.equal(f.released(), true)
  const queries = f.statements.join("\n")
  assert.match(queries, /sender_user_id = \$1/)
  assert.doesNotMatch(queries, /safety_reports|blumi_sessions|push_devices/i)
})

test("100000 messages are fetched in bounded batches, with release when a consumer disconnects", async () => {
  const f = fixture(100_000)
  let messages = 0
  for await (const chunk of f.stream()) if (chunk.includes('"message_id"')) messages += 1
  assert.equal(messages, 100_000)
  assert.equal(f.largestBatch(), 500)
  assert.equal(f.released(), true)
  const disconnected = fixture()
  for await (const _chunk of disconnected.stream()) break
  assert.equal(disconnected.statements.at(-1), "ROLLBACK")
  assert.equal(disconnected.released(), true)
})

test("failed transaction never emits completion delimiter and rolls back/releases", async () => {
  const f = fixture(3, true)
  let finalChunk = ""
  await assert.rejects(async () => {
    for await (const chunk of f.stream()) finalChunk = chunk
  }, /commit failed/)
  assert.notEqual(finalChunk, "}}\n")
  assert.equal(f.statements.at(-1), "ROLLBACK")
  assert.equal(f.released(), true)
})
