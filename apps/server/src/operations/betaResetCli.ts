import { Pool } from "pg"
import { applyBetaReset, planBetaReset, type BetaResetPlan } from "./betaReset"

/**
 * Operator entry for the beta reset (`apps/server/scripts/betaReset.ts`). Dry run is the default and runs READ ONLY.
 * `--apply` (alias `--execute`) needs the dry run's `--expect <hash>` and `--fingerprint <fp>`, plus
 * BLUMI_BETA_RESET_CONFIRM=reset-beta-<project-ref> typed by the operator. Output is counts only.
 */

export const BETA_RESET_CONFIRM_ENV = "BLUMI_BETA_RESET_CONFIRM"
const PROJECT_REF = /^[a-z0-9]{20}$/
const SHA256 = /^[0-9a-f]{64}$/
const FINGERPRINT = /^[0-9a-f]{16}$/

export interface BetaResetArgs {
  readonly projectRef: string
  readonly apply: boolean
  readonly expectHash: string | null
  readonly fingerprint: string | null
}

export function parseBetaResetArgs(argv: readonly string[]): BetaResetArgs {
  const known = new Set(["--project-ref", "--apply", "--execute", "--expect", "--fingerprint"])
  const unknown = argv.filter((arg) => arg.startsWith("--") && !known.has(arg))
  if (unknown.length > 0) throw new Error(`Unknown option ${unknown[0]}; reset refused.`)
  const valueOf = (flag: string): string | null => {
    const index = argv.indexOf(flag)
    return index >= 0 ? argv[index + 1] ?? null : null
  }
  const projectRef = valueOf("--project-ref") ?? ""
  if (!PROJECT_REF.test(projectRef)) throw new Error("Pass the exact Supabase project ref with --project-ref.")
  const apply = argv.includes("--apply") || argv.includes("--execute")
  const expectHash = valueOf("--expect")
  const fingerprint = valueOf("--fingerprint")
  if (apply && !SHA256.test(expectHash ?? "")) throw new Error("--apply needs --expect <sha256> from the dry run.")
  if (apply && !FINGERPRINT.test(fingerprint ?? "")) throw new Error("--apply needs --fingerprint <fp> from the dry run.")
  return { projectRef, apply, expectHash, fingerprint }
}

/** The Supabase pooler user is `postgres.<project-ref>`; any other database is refused. */
export function assertDatabaseMatchesProjectRef(connectionString: string | undefined, projectRef: string): string {
  const trimmed = connectionString?.trim()
  if (!trimmed) throw new Error("DATABASE_URL is required.")
  let username: string
  try {
    username = decodeURIComponent(new URL(trimmed).username)
  } catch {
    throw new Error("DATABASE_URL is not a valid URL; reset refused.")
  }
  if (username.split(".").at(-1) !== projectRef) throw new Error("DATABASE_URL does not match --project-ref; reset refused.")
  return trimmed
}

export function assertTypedConfirmation(environment: NodeJS.ProcessEnv, projectRef: string): void {
  if (environment[BETA_RESET_CONFIRM_ENV] !== `reset-beta-${projectRef}`) {
    throw new Error(`Set ${BETA_RESET_CONFIRM_ENV}=reset-beta-<project-ref> to apply; reset refused.`)
  }
}

export async function runBetaResetCli(
  argv: readonly string[],
  environment: NodeJS.ProcessEnv,
  write: (line: string) => void
): Promise<void> {
  const args = parseBetaResetArgs(argv)
  const connectionString = assertDatabaseMatchesProjectRef(environment.DATABASE_URL, args.projectRef)
  if (args.apply) assertTypedConfirmation(environment, args.projectRef)
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 })
  try {
    const client = await pool.connect()
    try {
      await client.query(args.apply ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
      await client.query("SET LOCAL lock_timeout = '5s'")
      await client.query("SET LOCAL statement_timeout = '120s'")
      if (!args.apply) {
        const plan = await planBetaReset(client)
        await client.query("ROLLBACK")
        writePlan(write, "dry-run", plan)
        return
      }
      const { before, after } = await applyBetaReset(client, { hash: args.expectHash!, fingerprint: args.fingerprint! })
      await client.query("COMMIT")
      writePlan(write, "applied", before)
      write(JSON.stringify({ mode: "post-check", counts: after.counts }))
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  } finally {
    await pool.end()
  }
}

function writePlan(write: (line: string) => void, mode: string, plan: BetaResetPlan): void {
  write(JSON.stringify({ mode, fingerprint: plan.fingerprint, counts: plan.counts }, null, 2))
  write(`fingerprint=${plan.fingerprint}`)
  write(`expect=${plan.hash}`)
}

/** Only the message: a PostgreSQL error's detail can quote row values, so it is never printed. */
export function describeBetaResetError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Beta reset failed."
  return message.replace(/\+?\d[\d\s-]{6,}\d/g, "[redacted]")
}
