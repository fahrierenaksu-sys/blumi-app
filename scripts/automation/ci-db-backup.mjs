import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { appendFileSync, chmodSync, createReadStream, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

// GitHub Actions backup of the release database (.github/workflows/db-backup.yml)
// and its restore proof (.github/workflows/db-restore-proof.yml).
//
// Secrets arrive only as environment variables and never reach argv, stdout,
// stderr or an error message: libpq reads the connection from PG* variables
// and gpg reads the passphrase from stdin. PostgreSQL error text is reduced to
// a fixed category because it can quote hosts, roles or row data.

export const ARCHIVE_NAME = "blumi-public.dump.gpg"
export const MANIFEST_NAME = "blumi-public.manifest.json"
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/
const SAFE_SSL_MODES = new Set(["require", "verify-ca", "verify-full"])

class SafeError extends Error {}

/**
 * Turns the backup connection string into libpq environment variables, or
 * refuses it. Only the expected Supabase project is accepted, over TLS, in a
 * read-only session. The error never repeats any part of the string.
 */
export function connectionEnvironment(raw, expectedProjectRef) {
  if (!PROJECT_REF_PATTERN.test(expectedProjectRef ?? "")) {
    throw new SafeError("Backup refused: the expected Supabase project ref is not configured.")
  }
  let url
  try { url = new URL(raw) } catch { throw new SafeError("Backup refused: the connection string is not a URL.") }
  const username = decodeURIComponent(url.username)
  const pooler = url.hostname.endsWith(".pooler.supabase.com")
  const direct = url.hostname === `db.${expectedProjectRef}.supabase.co`
  const projectMatches = pooler ? username.endsWith(`.${expectedProjectRef}`) && username.length > expectedProjectRef.length + 1 : direct
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !projectMatches) {
    throw new SafeError("Backup refused: the connection string is not for the expected Supabase project.")
  }
  if (pooler && url.port === "6543") {
    throw new SafeError("Backup refused: port 6543 is the transaction pooler; use the session pooler (port 5432).")
  }
  if (!url.password) throw new SafeError("Backup refused: the connection string has no password.")
  if (url.searchParams.has("sslmode") && !SAFE_SSL_MODES.has(url.searchParams.get("sslmode"))) {
    throw new SafeError("Backup refused: TLS must be required.")
  }
  const database = decodeURIComponent(url.pathname.slice(1)) || "postgres"
  return {
    PGHOST: url.hostname, PGPORT: url.port || "5432",
    PGUSER: username, PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: database, PGSSLMODE: url.searchParams.get("sslmode") ?? "require",
    PGCONNECT_TIMEOUT: "20", PGAPPNAME: "blumi-ci-backup",
    PGOPTIONS: "-c default_transaction_read_only=on -c statement_timeout=600000"
  }
}

/** A fixed, secret-free explanation of a PostgreSQL client failure. */
export function failureCategory(stderr = "") {
  const text = String(stderr)
  if (/password authentication failed|SASL authentication|no password supplied/i.test(text)) return "authentication failed: check the role and password in the secret"
  if (/tenant or user not found/i.test(text)) return "the pooler did not recognise the user: it must be <role>.<project-ref>"
  if (/could not translate host name|connection refused|timeout expired|could not connect|Network is unreachable/i.test(text)) return "the database could not be reached: use the Supabase session pooler host"
  if (/server version mismatch|aborting because of server version/i.test(text)) return "pg_dump is older than the server"
  if (/row-level security|permission denied/i.test(text)) return "the backup role cannot read every table: it needs SELECT and BYPASSRLS"
  if (/SSL/i.test(text)) return "TLS negotiation failed"
  return "unrecognised error (details withheld because they can contain private data)"
}

export function sha256File(path) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash("sha256")
    createReadStream(path).on("data", (chunk) => hash.update(chunk)).on("error", reject)
      .on("end", () => resolvePromise(hash.digest("hex")))
  })
}

function run(command, args, { env, input, label = command, timeout = 900_000 } = {}) {
  const result = spawnSync(command, args, {
    env: { PATH: process.env.PATH, HOME: process.env.HOME ?? "", ...(process.env.GNUPGHOME ? { GNUPGHOME: process.env.GNUPGHOME } : {}), ...env },
    input, encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024
  })
  if (result.error || result.status !== 0) {
    throw new SafeError(`${label} failed: ${failureCategory(result.stderr)}.`)
  }
  return result.stdout ?? ""
}

/** Major version of a PostgreSQL client binary, e.g. 17. */
export function clientMajor(versionOutput) {
  const match = /\(PostgreSQL\)\s+(\d+)/.exec(versionOutput)
  return match ? Number(match[1]) : NaN
}

function gpgArgs(passphraseFd) {
  return ["--batch", "--yes", "--quiet", "--no-tty", "--pinentry-mode", "loopback", "--passphrase-fd", passphraseFd]
}

/** Encrypts with a symmetric passphrase read from stdin (never from argv). */
export function encryptFile(source, target, passphrase) {
  if (!passphrase || passphrase.length < 24) throw new SafeError("Encryption refused: the passphrase must have at least 24 characters.")
  run("gpg", [...gpgArgs("0"), "--symmetric", "--cipher-algo", "AES256", "--s2k-mode", "3",
    "--s2k-digest-algo", "SHA512", "--s2k-count", "65011712", "--compress-algo", "none",
    "--output", target, source], { input: passphrase, label: "gpg encrypt" })
}

/**
 * Decrypts a symmetric archive. gpg --decrypt also accepts an unencrypted
 * OpenPGP message and exits 0, so the status lines must prove a passphrase
 * decryption with an intact integrity check; otherwise anyone who can upload
 * an artifact with the same name could have it restored.
 */
export function decryptFile(source, target, passphrase) {
  if (!passphrase) throw new SafeError("Decryption refused: no passphrase.")
  const status = run("gpg", [...gpgArgs("0"), "--status-fd", "1", "--decrypt", "--output", target, source],
    { input: passphrase, label: "gpg decrypt" })
  const lines = new Set(status.split("\n").map((line) => line.split(" ").slice(0, 2).join(" ")))
  if (!["[GNUPG:] NEED_PASSPHRASE_SYM", "[GNUPG:] DECRYPTION_OKAY", "[GNUPG:] GOODMDC"].every((line) => lines.has(line))) {
    rmSync(target, { force: true })
    throw new SafeError("Decryption refused: the archive was not encrypted with the backup passphrase.")
  }
}

function summary(lines) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n")
}

/**
 * Dumps the public schema with the runbook's conventions, proves pg_restore
 * can read it, encrypts it and writes a manifest with both SHA-256 values.
 * The plaintext archive is deleted before this returns.
 */
export async function createBackup({ outDir, env = process.env, pgBin, expectedMajor = 17 }) {
  const connection = connectionEnvironment(env.BLUMI_BACKUP_DATABASE_URL, env.BLUMI_EXPECTED_PROJECT_REF)
  return createBackupFrom({ outDir, connection, passphrase: env.BLUMI_BACKUP_ENCRYPTION_KEY, pgBin, expectedMajor })
}

export async function createBackupFrom({ outDir, connection, passphrase, pgBin, expectedMajor = 17 }) {
  if (!passphrase || passphrase.length < 24) throw new SafeError("Backup refused: the encryption passphrase must have at least 24 characters.")
  const pgDump = join(pgBin, "pg_dump")
  const pgDumpVersion = run(pgDump, ["--version"]).trim()
  if (clientMajor(pgDumpVersion) !== expectedMajor) {
    throw new SafeError(`Backup refused: pg_dump ${expectedMajor} is required, found "${pgDumpVersion}".`)
  }
  mkdirSync(outDir, { recursive: true, mode: 0o700 })
  chmodSync(outDir, 0o700)
  const plain = join(outDir, "blumi-public.dump.partial")
  const archive = join(outDir, ARCHIVE_NAME)
  try {
    writeFileSync(plain, "", { mode: 0o600, flag: "wx" })
    run(pgDump, ["--format=custom", "--schema=public", "--no-owner", "--no-acl", "--file", plain], { env: connection, label: "pg_dump" })
    const toc = run(join(pgBin, "pg_restore"), ["--list", plain], { label: "pg_restore --list" })
    const tocEntries = toc.split("\n").filter((line) => /^\d+;/.test(line)).length
    if (!statSync(plain).size || !tocEntries) throw new SafeError("Backup refused: the archive is empty.")
    if (!/ TABLE public blumi_migrations\b/.test(toc)) throw new SafeError("Backup refused: the archive has no migration ledger.")
    const plaintextSha256 = await sha256File(plain)
    const plaintextBytes = statSync(plain).size
    encryptFile(plain, `${archive}.partial`, passphrase)
    renameSync(`${archive}.partial`, archive)
    const manifest = {
      kind: "blumi-public-schema-backup", version: 1, createdAt: new Date().toISOString(),
      schema: "public", format: "pg_dump custom (--no-owner --no-acl)", pgDumpVersion, tocEntries,
      plaintextBytes, plaintextSha256,
      encryption: "gpg symmetric AES256", encryptedFile: ARCHIVE_NAME,
      encryptedBytes: statSync(archive).size, encryptedSha256: await sha256File(archive)
    }
    writeFileSync(join(outDir, MANIFEST_NAME), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 })
    return manifest
  } finally {
    rmSync(plain, { force: true })
    rmSync(`${archive}.partial`, { force: true })
  }
}

/** Checks the encrypted archive against its manifest, decrypts it and checks the plaintext too. */
export async function decryptBackup({ inDir, outFile, passphrase, pgBin }) {
  const manifest = JSON.parse(readFileSync(join(inDir, MANIFEST_NAME), "utf8"))
  const archive = join(inDir, ARCHIVE_NAME)
  if (await sha256File(archive) !== manifest.encryptedSha256) throw new SafeError("Restore refused: the encrypted archive does not match its manifest.")
  rmSync(outFile, { force: true })
  writeFileSync(outFile, "", { mode: 0o600, flag: "wx" })
  decryptFile(archive, outFile, passphrase)
  if (await sha256File(outFile) !== manifest.plaintextSha256) {
    rmSync(outFile, { force: true })
    throw new SafeError("Restore refused: the decrypted archive does not match its manifest.")
  }
  run(join(pgBin, "pg_restore"), ["--list", outFile], { label: "pg_restore --list" })
  return manifest
}

/**
 * Restores the archive into a fresh database on a throwaway server and returns
 * aggregate counts only. `connection` is libpq environment for that server.
 */
export function restoreAndSmoke({ archive, connection, pgBin, database = "blumi_restore_proof" }) {
  const psql = (sql, db = connection.PGDATABASE) => run(join(pgBin, "psql"),
    ["--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--tuples-only", "--no-align", "--dbname", db, "--command", sql],
    { env: connection, label: "psql" }).trim()
  if (!/^blumi_restore_proof\w*$/.test(database)) throw new SafeError("Restore refused: the target must be a blumi_restore_proof database.")
  psql(`DROP DATABASE IF EXISTS ${database}`)
  psql(`CREATE DATABASE ${database}`)
  psql("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$")
  // The archive owns public; drop only the new database's empty default schema.
  psql("DROP SCHEMA public CASCADE", database)
  run(join(pgBin, "pg_restore"), ["--dbname", database, "--no-owner", "--no-privileges", "--exit-on-error", archive],
    { env: connection, label: "pg_restore" })
  const tables = psql("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p') ORDER BY 1", database)
    .split("\n").filter(Boolean)
  const tableRows = {}
  for (const table of tables) {
    if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new SafeError("Restore refused: unexpected table name shape.")
    tableRows[table] = Number(psql(`SELECT count(*) FROM public."${table}"`, database))
  }
  const ledgerRows = Number(psql("SELECT count(*) FROM public.blumi_migrations", database))
  const latestMigration = psql("SELECT id FROM public.blumi_migrations ORDER BY id DESC LIMIT 1", database)
  if (!tables.length || !ledgerRows) throw new SafeError("Restore proof failed: no tables or no migration ledger rows.")
  return { tables: tables.length, ledgerRows, latestMigration, tableRows }
}

/**
 * Decides whether a workflow run is enabled. Both secrets missing means the
 * owner has not turned backups on yet: a successful no-op. Only one present
 * is a misconfiguration and fails. Values are only tested for presence.
 */
export function backupConfiguration(env, purpose = "backup") {
  const needed = purpose === "restore" ? ["BLUMI_BACKUP_ENCRYPTION_KEY"] : ["BLUMI_BACKUP_DATABASE_URL", "BLUMI_BACKUP_ENCRYPTION_KEY"]
  const present = needed.filter((name) => Boolean(env[name]))
  if (!present.length) {
    return { enabled: false, message: `Database ${purpose} is off: add the ${needed.join(" and ")} repository secret${needed.length > 1 ? "s" : ""} to turn it on (docs/release/DATABASE_RELEASE_RUNBOOK.md). Nothing was done.` }
  }
  if (present.length !== needed.length) {
    const missing = needed.filter((name) => !present.includes(name))
    throw new SafeError(`Database ${purpose} is half configured: ${missing.join(", ")} is missing.`)
  }
  return { enabled: true, message: `Database ${purpose} is configured.` }
}

/**
 * Picks the backup artifact to restore from the repository's artifact list
 * (one API object per line). On a public repository a fork's pull request
 * run can upload an artifact with the same name, so only artifacts whose run
 * belongs to this repository, with this repository as its head, count.
 * Returns the newest matching workflow run id, or the requested one.
 */
export function pickBackupArtifact(artifactLines, { repositoryId, runId = "" }) {
  if (!/^\d+$/.test(String(repositoryId ?? ""))) throw new SafeError("Restore refused: the repository id is unknown.")
  if (runId && !/^\d+$/.test(runId)) throw new SafeError("Restore refused: backup_run_id must be a number.")
  const artifacts = artifactLines.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line))
  const own = artifacts.filter((artifact) => artifact.name === "blumi-db-backup" && !artifact.expired &&
    String(artifact.workflow_run?.repository_id) === String(repositoryId) &&
    String(artifact.workflow_run?.head_repository_id) === String(repositoryId))
    .filter((artifact) => !runId || String(artifact.workflow_run.id) === runId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  if (!own.length) throw new SafeError("No unexpired blumi-db-backup artifact from this repository was found. Run the Database backup workflow first.")
  return String(own[0].workflow_run.id)
}

/**
 * Runs scripts/security/restore-upgrade-gate.mjs on a restored archive and
 * returns only what is safe for a public Actions log. The gate prints raw
 * PostgreSQL and node-postgres errors, which can quote a failing row
 * ("Failing row contains ..."), so a failure is reduced to the step that failed,
 * a fixed category and, for the integrity audit, its numeric counts.
 */
export function redactedRehearsal({ archive, gate, env = process.env }) {
  const result = spawnSync(process.execPath, [gate, archive], { env, encoding: "utf8", timeout: 1_800_000, maxBuffer: 64 * 1024 * 1024 })
  if (!result.error && result.status === 0) {
    const summaryLine = String(result.stdout).split("\n").reverse().find((line) => line.startsWith("{"))
    try {
      const parsed = JSON.parse(summaryLine)
      const restored = parsed.restored ?? {}
      const numbers = Object.fromEntries(Object.entries(restored).filter(([, value]) => Number.isFinite(value)))
      return { ok: true, report: { archiveSha256: /^[0-9a-f]{64}$/.test(parsed.archiveSha256) ? parsed.archiveSha256 : undefined, archiveBytes: Number(parsed.archiveBytes) || undefined, restored: numbers } }
    } catch {
      return { ok: false, message: "Upgrade rehearsal finished but its report was unreadable; details withheld." }
    }
  }
  const stderr = String(result.stderr ?? "")
  const findings = /release integrity findings: (\{[^\n]*?\})(?:\n|$)/.exec(stderr)
  if (findings) {
    try {
      const counts = JSON.parse(findings[1])
      if (Object.values(counts).every((value) => Number.isFinite(value))) {
        return { ok: false, message: `Upgrade rehearsal failed: the restored data has release integrity findings ${JSON.stringify(counts)}.` }
      }
    } catch { /* fall through to the generic category */ }
  }
  if (/Migration rerun was not idempotent/.test(stderr)) return { ok: false, message: "Upgrade rehearsal failed: a second migration run applied migrations again." }
  const step = /(?:^|\/)(pg_restore|initdb|pg_ctl|psql|node)\b[^\n]*? failed:/m.exec(stderr)?.[1]
  const where = step === "node" ? "the migration or audit step" : step ?? "an unidentified step"
  return { ok: false, message: `Upgrade rehearsal failed in ${where}: ${failureCategory(stderr)}.` }
}

async function main([command, ...args]) {
  const pgBin = process.env.BLUMI_PG17_BIN || "/usr/lib/postgresql/17/bin"
  if (command === "config") {
    const { enabled, message } = backupConfiguration(process.env, args[0] === "restore" ? "restore" : "backup")
    console.log(enabled ? message : `::notice title=Backup off::${message}`)
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `enabled=${enabled}\n`)
    if (!enabled) summary([`> ${message}`])
  } else if (command === "pick-artifact") {
    const runId = pickBackupArtifact(readFileSync(0, "utf8"), { repositoryId: process.env.GITHUB_REPOSITORY_ID, runId: args[0] ?? "" })
    console.log(`Using the backup from workflow run ${runId}.`)
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run_id=${runId}\n`)
  } else if (command === "rehearse") {
    const archive = resolve(args[0] ?? "")
    const gate = new URL("../security/restore-upgrade-gate.mjs", import.meta.url).pathname
    const outcome = redactedRehearsal({ archive, gate })
    if (!outcome.ok) throw new SafeError(outcome.message)
    console.log(JSON.stringify(outcome.report, null, 2))
    summary(["### Upgrade rehearsal", "", "- pending migrations applied, rerun applied none, release integrity audit clean",
      ...Object.entries(outcome.report.restored).map(([key, value]) => `- ${key}: ${value}`)])
  } else if (command === "backup") {
    const outDir = resolve(args[0] ?? "")
    const manifest = await createBackup({ outDir, pgBin })
    console.log(JSON.stringify(manifest, null, 2))
    summary(["### Database backup", "", `- created: ${manifest.createdAt}`, `- ${manifest.pgDumpVersion}, ${manifest.tocEntries} archive entries`,
      `- encrypted SHA-256: \`${manifest.encryptedSha256}\` (${manifest.encryptedBytes} bytes)`,
      `- plaintext SHA-256: \`${manifest.plaintextSha256}\` (${manifest.plaintextBytes} bytes)`])
  } else if (command === "restore-proof") {
    const [inDir, workDir] = args.map((value) => resolve(value ?? ""))
    mkdirSync(workDir, { recursive: true, mode: 0o700 })
    const archive = join(workDir, "blumi-public.dump")
    const manifest = await decryptBackup({ inDir, outFile: archive, passphrase: process.env.BLUMI_BACKUP_ENCRYPTION_KEY, pgBin })
    const connection = {
      PGHOST: process.env.BLUMI_RESTORE_PGHOST || "localhost", PGPORT: process.env.BLUMI_RESTORE_PGPORT || "5432",
      PGUSER: process.env.BLUMI_RESTORE_PGUSER || "postgres", PGPASSWORD: process.env.BLUMI_RESTORE_PGPASSWORD || "",
      PGDATABASE: "postgres", PGSSLMODE: "disable"
    }
    if (!["localhost", "127.0.0.1"].includes(connection.PGHOST) && !connection.PGHOST.startsWith("/")) {
      throw new SafeError("Restore refused: the restore proof only targets a local throwaway server.")
    }
    const result = restoreAndSmoke({ archive, connection, pgBin })
    console.log(JSON.stringify({ backupCreatedAt: manifest.createdAt, encryptedSha256: manifest.encryptedSha256, ...result }, null, 2))
    summary(["### Restore proof", "", `- backup created: ${manifest.createdAt}`, `- encrypted SHA-256 verified: \`${manifest.encryptedSha256}\``,
      `- restored ${result.tables} tables; migration ledger ${result.ledgerRows} rows, latest \`${result.latestMigration}\``,
      "", "| table | rows |", "|---|---|", ...Object.entries(result.tableRows).map(([table, rows]) => `| ${table} | ${rows} |`)])
  } else {
    throw new SafeError("Usage: ci-db-backup.mjs config backup|restore | backup <out-dir> | pick-artifact [run-id] | rehearse <archive> | restore-proof <artifact-dir> <work-dir>")
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    // Only our own fixed messages are printed; anything else may carry private data.
    console.error(error instanceof SafeError ? error.message : `Backup tooling failed unexpectedly${typeof error?.code === "string" ? ` (${error.code})` : ""}; details withheld.`)
    process.exitCode = 1
  })
}
