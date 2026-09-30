import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { chmodSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

// The existing test database only. Changing the destination requires review.
export function connectionEnvironment(raw) {
  const url = new URL(raw)
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      url.hostname !== "aws-1-eu-west-1.pooler.supabase.com" ||
      decodeURIComponent(url.username) !== "postgres.nkqcbxufbhfibrgvajim" ||
      url.pathname !== "/postgres" || !url.password ||
      (url.searchParams.has("sslmode") && url.searchParams.get("sslmode") !== "require")) {
    throw new Error("Backup refused: database identity or TLS does not match the approved test database.")
  }
  return {
    PGHOST: url.hostname, PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: "postgres", PGSSLMODE: "require", PGCONNECT_TIMEOUT: "15",
    PGOPTIONS: "-c default_transaction_read_only=on -c statement_timeout=300000"
  }
}

export function backup() {
  const connection = connectionEnvironment(process.env.DATABASE_URL)
  const directory = join(homedir(), "BlumiReleaseBackups")
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  if (lstatSync(directory).isSymbolicLink()) throw new Error("Backup destination cannot be a symlink.")
  chmodSync(directory, 0o700)
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")
  const archive = join(directory, `scheduled-public-${stamp}-${process.pid}.dump`)
  const partial = `${archive}.partial`
  const pgBin = process.env.BLUMI_PG17_BIN || "/opt/homebrew/opt/postgresql@17/bin"
  const env = { PATH: process.env.PATH, ...connection }
  writeFileSync(partial, "", { mode: 0o600, flag: "wx" })
  const run = (command, args) => {
    const result = spawnSync(join(pgBin, command), args, { env, timeout: 360000, encoding: "utf8" })
    // Do not print database errors: they may contain private records or credentials.
    if (result.error || result.status !== 0) throw new Error(`${command} failed; no completed backup was published.`)
  }
  run("pg_dump", ["--format=custom", "--schema=public", "--no-owner", "--no-acl", "--file", partial])
  run("pg_restore", ["--list", partial])
  chmodSync(partial, 0o600)
  const bytes = readFileSync(partial)
  if (!bytes.length) throw new Error("Backup archive is empty.")
  const receipt = { createdAt: new Date().toISOString(), schema: "public", environment: "existing-supabase-test", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }
  renameSync(partial, archive)
  writeFileSync(`${archive}.manifest.json`, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600, flag: "wx" })
  console.log(JSON.stringify({ archive, ...receipt }))
  return archive
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { backup() } catch { console.error("Local backup failed safely; inspect configuration and PostgreSQL compatibility without displaying credentials."); process.exitCode = 1 }
}
