import assert from "node:assert/strict"
import test from "node:test"
import { Pool } from "pg"
import { createPostgresAccountDataExporter } from "./accountDataExporter"
import { createPostgresAuthRepository } from "../db/postgresAuthRepository"
import { createAccountRecord } from "../auth/authStore"

const databaseUrl = process.env.DATABASE_URL?.trim()

test("real PostgreSQL export streams 100000 own messages from one stable snapshot", { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl })
  const account = createAccountRecord("+905559991234")
  let largestBatch = 0
  try {
    await createPostgresAuthRepository(pool).saveAccount(account)
    await pool.query("INSERT INTO blumi_chat_threads(thread_id,mini_room_id,created_at) VALUES('export-thread','export-room',NOW())")
    await pool.query(`INSERT INTO blumi_chat_messages(message_id,thread_id,sender_user_id,body,sent_at)
      SELECT 'export-message-' || n, 'export-thread', $1, 'own text', NOW() FROM generate_series(1,100000) n`, [account.userId])
    const exporter = createPostgresAccountDataExporter({ query: pool.query.bind(pool), connect: async () => {
      const client = await pool.connect()
      return { release: () => client.release(), query: async (sql: string, values?: readonly unknown[]) => {
        const result = await client.query(sql, values ? [...values] : undefined)
        if (sql.startsWith("FETCH")) largestBatch = Math.max(largestBatch, result.rows.length)
        return result
      } }
    } })
    const iterator = exporter.streamExport(account, {
      schemaVersion: "2026-07-21", exportedAt: new Date().toISOString(), exclusions: []
    })[Symbol.asyncIterator]()
    const first = await iterator.next()
    assert.equal(first.done, false)
    await pool.query(`INSERT INTO blumi_chat_messages(message_id,thread_id,sender_user_id,body,sent_at)
      VALUES ('late-message','export-thread',$1,'outside snapshot',NOW())`, [account.userId])
    let count = 0
    let ending = ""
    for (;;) {
      const chunk = await iterator.next()
      if (chunk.done) break
      assert.doesNotMatch(chunk.value, /late-message|outside snapshot/)
      if (chunk.value.includes('"message_id"')) count += 1
      ending = chunk.value
    }
    assert.equal(count, 100_000)
    assert.equal(largestBatch, 500)
    assert.equal(ending, "}}\n")
  } finally {
    await pool.end()
  }
})
