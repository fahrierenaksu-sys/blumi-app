import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Delivery and read receipts need migration 070. The binary ships before the
 * owner applies it (code deploys on push; migrations are applied separately
 * after a restore-tested backup), so the feature probes the migration ledger
 * at runtime instead of assuming the schema: until the ledger row with the
 * packaged checksum exists, no query touches the 070 columns or table and
 * receipts stay off. Once applied, receipts turn on within one probe interval
 * without a redeploy.
 */
export const CHAT_RECEIPTS_MIGRATION_ID = "070_chat_delivery_receipts.sql"

const DEFAULT_PROBE_TTL_MS = 30_000

interface LedgerQueryExecutor {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>
}

export interface ChatReceiptSchemaProbe {
  /**
   * Whether 070 is applied. Cached for the probe interval; a failed lookup
   * reads as "not applied" (fail closed) and is retried on the next call.
   */
  isReady(): Promise<boolean>
  /**
   * The last known answer without waiting (false before the first probe
   * resolves). A stale answer starts a refresh in the background.
   */
  peek(): boolean
}

/** A fixed answer: in-memory storage has no schema, tests pin either state. */
export function createStaticChatReceiptSchema(ready: boolean): ChatReceiptSchemaProbe {
  return Object.freeze({
    async isReady() { return ready },
    peek() { return ready }
  })
}

export function createChatReceiptSchemaProbe(
  pool: LedgerQueryExecutor,
  options: { checksum?: string; ttlMs?: number; now?: () => number } = {}
): ChatReceiptSchemaProbe {
  const checksum = options.checksum ?? readPackagedChecksum()
  const ttlMs = options.ttlMs ?? DEFAULT_PROBE_TTL_MS
  const now = options.now ?? Date.now
  let known = false
  let checkedAt = Number.NEGATIVE_INFINITY
  let pending: Promise<boolean> | null = null

  const refresh = (): Promise<boolean> => {
    pending ??= pool.query(
      "SELECT checksum FROM blumi_migrations WHERE id = $1",
      [CHAT_RECEIPTS_MIGRATION_ID]
    ).then((result) => {
      known = String(result.rows[0]?.checksum ?? "").trim() === checksum
      checkedAt = now()
      return known
    }, () => {
      // Fail closed without caching the failure: the next call retries.
      known = false
      return false
    }).finally(() => { pending = null })
    return pending
  }
  const isStale = () => now() - checkedAt >= ttlMs

  return Object.freeze({
    async isReady() {
      return isStale() ? refresh() : known
    },
    peek() {
      if (isStale()) void refresh()
      return known
    }
  })
}

function readPackagedChecksum(): string {
  const path = resolve(__dirname, "../../db/migrations", CHAT_RECEIPTS_MIGRATION_ID)
  return createHash("sha256").update(readFileSync(path, "utf8")).digest("hex")
}
