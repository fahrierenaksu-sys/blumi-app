import type { PoolClient } from "pg"

/**
 * The one-shot marker of the beta reset (migration 076). An applied reset records one row in its own transaction,
 * so a row exists exactly when a reset committed. A second apply needs a typed reason, which is recorded as well.
 * Rows hold the source commit, the plan hash, the time and the reason: no IDs, phone numbers or message bodies.
 */
export const BETA_RESET_RUNS_TABLE = "blumi_beta_reset_runs"
export const BETA_RESET_RUNS_MIGRATION_ID = "076_beta_reset_runs.sql"
export const REPEAT_REASON_FLAG = "--repeat-reason"

const REASON_LENGTH = { min: 12, max: 200 } as const
// Letters, digits, spaces and plain punctuation only; a run of 7+ digits looks like a phone number and is refused.
const REASON_TEXT = /^[\p{L}\p{N} .,:;'()/_-]+$/u
const PHONE_LIKE = /\d[\d\s-]{5,}\d/

/** The typed reason for a repeated apply, or null when none was given. Refused without --apply or when malformed. */
export function parseRepeatReason(argv: readonly string[], apply: boolean): string | null {
  const index = argv.indexOf(REPEAT_REASON_FLAG)
  if (index < 0) return null
  if (!apply) throw new Error(`${REPEAT_REASON_FLAG} is used only with --apply; reset refused.`)
  const reason = argv[index + 1]?.trim() ?? ""
  // A missing reason must not take the next flag (for example --deployed-commit) as its text.
  if (reason.length === 0 || reason.startsWith("-")) {
    throw new Error(`${REPEAT_REASON_FLAG} needs a typed reason right after it, not a flag; reset refused.`)
  }
  if (reason.length < REASON_LENGTH.min || reason.length > REASON_LENGTH.max || !REASON_TEXT.test(reason)) {
    throw new Error(`${REPEAT_REASON_FLAG} needs a plain-text reason of ${REASON_LENGTH.min}-${REASON_LENGTH.max} characters; reset refused.`)
  }
  if (PHONE_LIKE.test(reason)) throw new Error(`${REPEAT_REASON_FLAG} must not contain a phone-like number; reset refused.`)
  return reason
}

/** How many resets this database recorded, or null when migration 076 is not applied. Read-only. */
export async function countBetaResetRuns(client: PoolClient): Promise<number | null> {
  const { rows } = await client.query<{ present: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS present", [`public.${BETA_RESET_RUNS_TABLE}`])
  if (!rows[0]?.present) return null
  const counted = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${BETA_RESET_RUNS_TABLE}`)
  return Number(counted.rows[0]?.count ?? 0)
}

/** Before any lock: an apply needs the marker table, so a database without 076 is never reset unrecorded. */
export async function assertBetaResetRunsReady(client: PoolClient): Promise<void> {
  if (await countBetaResetRuns(client) === null) {
    throw new Error(`Migration ${BETA_RESET_RUNS_MIGRATION_ID} is not applied, so this reset cannot be recorded; reset refused.`)
  }
}

/** Under the reset's table locks: a database that was reset before needs a typed reason. */
export async function assertResetMayRun(client: PoolClient, repeatReason: string | null): Promise<void> {
  const previous = await countBetaResetRuns(client)
  if (previous === null) throw new Error(`Migration ${BETA_RESET_RUNS_MIGRATION_ID} is not applied; reset refused.`)
  if (previous > 0 && repeatReason === null) {
    throw new Error(`A beta reset was already applied to this database (${previous} recorded); `
      + `pass ${REPEAT_REASON_FLAG} "<why>" to apply it again. Reset refused.`)
  }
}

/** Inside the reset transaction, after its post-check: commits or rolls back with the reset. */
export async function recordBetaResetRun(
  client: PoolClient,
  run: { readonly commit: string; readonly planHash: string; readonly repeatReason: string | null }
): Promise<void> {
  await client.query(
    `INSERT INTO ${BETA_RESET_RUNS_TABLE} (source_commit, plan_hash, repeat_reason) VALUES ($1, $2, $3)`,
    [run.commit, run.planHash, run.repeatReason]
  )
}
