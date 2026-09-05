import type { QueryResultRow } from "pg"
import type { AccountRecord } from "../auth/authStore"
import { streamPostgresAccountExport, type AccountExportMetadata, type ExportConnection } from "./accountDataExportStream"

export interface AccountDataExportSections {
  inventory: Record<string, unknown> | null
  roomDecor: Record<string, unknown> | null
  rewardLedger: readonly Record<string, unknown>[]
  iapLedger: readonly Record<string, unknown>[]
  discoveryDecisions: readonly Record<string, unknown>[]
  matches: readonly Record<string, unknown>[]
  connectionDecisions: readonly Record<string, unknown>[]
  connectionMatches: readonly Record<string, unknown>[]
  reactions: readonly Record<string, unknown>[]
  blocks: readonly Record<string, unknown>[]
  messages: readonly Record<string, unknown>[]
}

export interface AccountDataExporter {
  streamExport(account: AccountRecord, metadata: AccountExportMetadata): AsyncIterable<string>
}

interface QueryExecutor {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: QueryResultRow[] }>
  connect?: () => Promise<ExportConnection>
}

export function createEmptyAccountDataExporter(): AccountDataExporter {
  return {
    async *streamExport(account, metadata) {
      yield JSON.stringify({ ...metadata, account: exportAccountFields(account), data: emptySections() }) + "\n"
    }
  }
}

export function exportAccountFields(account: AccountRecord) {
  return { accountId: account.accountId, userId: account.userId, phoneNumber: account.phoneNumber,
    profile: account.profile, onboarding: account.onboarding, createdAt: account.createdAt,
    updatedAt: account.updatedAt, ...(account.acceptedTerms ? { acceptedTerms: account.acceptedTerms } : {}) }
}

export function createPostgresAccountDataExporter(pool: QueryExecutor): AccountDataExporter {
  return {
    async *streamExport(account, metadata) {
      if (!pool.connect) throw new Error("Account export requires a dedicated database connection.")
      yield* streamPostgresAccountExport(await pool.connect(), account, metadata)
    },
  }
}

function emptySections(): AccountDataExportSections {
  return {
    inventory: null,
    roomDecor: null,
    rewardLedger: [],
    iapLedger: [],
    discoveryDecisions: [],
    matches: [],
    connectionDecisions: [],
    connectionMatches: [],
    reactions: [],
    blocks: [],
    messages: []
  }
}
