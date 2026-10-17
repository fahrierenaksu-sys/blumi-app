import type { Pool } from "pg"
import type { StreetSaveTransaction } from "../street/streetDigestSaves"
import { createPostgresAuthRepository } from "./postgresAuthRepository"
import { createPostgresPersonalRoomDecorRepository } from "./postgresPersonalRoomDecorRepository"
import { createPostgresStreetRepository } from "./postgresStreetRepository"

/**
 * One BEGIN/COMMIT on one pooled connection for a save and its street digest.
 * The auth repository is built on the transaction's client: its avatar read and
 * update are single statements on `query`, so they join the transaction.
 */
export function createPostgresStreetSaveTransaction(pool: Pick<Pool, "connect">): StreetSaveTransaction {
  return async (work) => {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const result = await work({
        authRepository: createPostgresAuthRepository(client as unknown as Pool),
        roomRepository: createPostgresPersonalRoomDecorRepository(client),
        streetRepository: createPostgresStreetRepository(client)
      })
      await client.query("COMMIT")
      return result
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }
}
