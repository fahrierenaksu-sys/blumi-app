import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import { OPTIONAL_READINESS_MIGRATIONS } from "../operations/schemaReadiness"

// One tree-wide guard for the migration ledger. It needs no database.
//
// - Naming: three-digit prefixes in order. The production ledger has two 032
//   files and no 044; those quirks stay and are never "fixed".
// - Immutability: db/migrations.applied.json lists every migration applied in
//   production with its sha256. Entries are append-only; add one when the
//   owner applies a migration. A changed or missing applied file fails here,
//   before /ready would fail on the live checksum.
// - Forward only: every migration that is not applied yet must be additive and
//   backward compatible, and every new table is closed to the Supabase API
//   roles.

const SERVER_ROOT = resolve(__dirname, "../..")
const MIGRATIONS = resolve(SERVER_ROOT, "db/migrations")
const APPLIED_MANIFEST = resolve(SERVER_ROOT, "db/migrations.applied.json")

const KNOWN_DUPLICATE_PREFIX = "032"
const KNOWN_MISSING_PREFIX = 44

// file -> reason. A pending migration may break the forward-only policy only
// with a written reason here.
const FORWARD_ONLY_EXCEPTIONS: Readonly<Record<string, string>> = Object.freeze({})

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort()
}

function appliedManifest(): Record<string, string> {
  return JSON.parse(readFileSync(APPLIED_MANIFEST, "utf8")) as Record<string, string>
}

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(resolve(MIGRATIONS, file), "utf8"), "utf8").digest("hex")
}

function prefixOf(file: string): number {
  return Number(file.slice(0, 3))
}

function assertPendingOrder(files: readonly string[], applied: readonly string[]): void {
  const highestApplied = Math.max(...applied.map(prefixOf))
  const optional = new Set(OPTIONAL_READINESS_MIGRATIONS)
  for (const file of files) {
    if (applied.includes(file)) continue
    assert.ok(prefixOf(file) > highestApplied || optional.has(file),
      `${file} is required but pending below applied ${highestApplied}`)
  }
}

test("migration files keep the ledger's naming and numbering", () => {
  const files = migrationFiles()
  assert.ok(files.length > 0)
  for (const file of files) {
    assert.match(file, /^\d{3}_[a-z0-9_]+\.sql$/, file)
  }

  const byPrefix = new Map<string, string[]>()
  for (const file of files) {
    byPrefix.set(file.slice(0, 3), [...(byPrefix.get(file.slice(0, 3)) ?? []), file])
  }
  for (const [prefix, names] of byPrefix) {
    const allowed = prefix === KNOWN_DUPLICATE_PREFIX ? 2 : 1
    assert.equal(names.length, allowed, `prefix ${prefix} is used by ${names.join(", ")}`)
  }

  const highest = Math.max(...files.map(prefixOf))
  for (let prefix = 1; prefix <= highest; prefix += 1) {
    const present = byPrefix.has(String(prefix).padStart(3, "0"))
    if (prefix === KNOWN_MISSING_PREFIX) {
      assert.equal(present, false, "the 044 gap stays empty; never fill it")
    } else {
      assert.equal(present, true, `prefix ${String(prefix).padStart(3, "0")} is missing`)
    }
  }
})

test("applied migrations stay byte-for-byte what production applied", () => {
  const manifest = appliedManifest()
  const files = new Set(migrationFiles())
  const applied = Object.keys(manifest)
  assert.ok(applied.length > 0)

  for (const file of applied) {
    assert.ok(files.has(file), `applied migration ${file} is missing`)
    assert.match(manifest[file] ?? "", /^[0-9a-f]{64}$/, file)
    assert.equal(sha256(file), manifest[file], `applied migration ${file} changed; applied migrations are immutable`)
  }

  // Required schema cannot have holes. Independently gated, additive optional
  // features may remain pending when a later feature is deployed: SMS 072 was
  // authorized without the pending chat migrations 070/071. Reuse the runtime
  // contract rather than adding a separate exception list. Checksums above
  // still protect every applied file, including optional migrations.
  assertPendingOrder([...files], applied)
})

test("only runtime-gated optional migrations can remain below an applied migration", () => {
  const required = "069_moderation_phone_bans.sql"
  const sms = "072_firebase_sms_admission.sql"
  const chat = ["070_chat_delivery_receipts.sql", "071_chat_hide_for_me_and_advisor_fixes.sql"]
  assert.doesNotThrow(() => assertPendingOrder([required, ...chat, sms], [required, sms]))
  assert.throws(() => assertPendingOrder([required, ...chat, sms], [sms]), /required but pending/)
  assert.throws(() => assertPendingOrder(["071_unknown_schema.sql", sms], [sms]), /required but pending/)
})

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")
}

// Function bodies (`AS $tag$ ... $tag$`) define code, they do not run at
// migration time. DO blocks do run, so they stay in the checked text.
function stripFunctionBodies(sql: string): string {
  return sql.replace(/\bAS\s+(\$[A-Za-z_]*\$)[\s\S]*?\1/gi, "AS $body$")
}

function forwardOnlyViolations(sql: string): string[] {
  const text = stripFunctionBodies(stripComments(sql))
  const violations: string[] = []
  const forbidden: Array<[RegExp, string]> = [
    [/\bDROP\s+TABLE\b/i, "DROP TABLE"],
    [/\bDROP\s+(?:COLUMN\b|\w+\s*(?:,|;|CASCADE|RESTRICT))/i, "DROP COLUMN"],
    [/\bTRUNCATE\b/i, "TRUNCATE"],
    [/\bRENAME\b/i, "RENAME"],
    [/\bALTER\s+COLUMN\b[^;,]*\bSET\s+NOT\s+NULL\b/i, "ALTER COLUMN .. SET NOT NULL"],
    [/\bALTER\s+COLUMN\b[^;,]*\b(?:SET\s+DATA\s+)?TYPE\b/i, "ALTER COLUMN .. TYPE"],
    [/^\s*(?:UPDATE|DELETE|INSERT)\b/im, "data write (UPDATE/DELETE/INSERT)"]
  ]
  for (const [pattern, label] of forbidden) {
    if (pattern.test(text)) violations.push(label)
  }

  for (const match of text.matchAll(/\bADD\s+COLUMN\b[^,;]*/gi)) {
    const clause = match[0]
    if (/\bNOT\s+NULL\b/i.test(clause) && !/\bDEFAULT\b/i.test(clause)) {
      violations.push(`ADD COLUMN .. NOT NULL without DEFAULT: ${clause.trim()}`)
    }
  }

  for (const match of text.matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
    const table = match[1]!
    const rls = new RegExp(`ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:public\\.)?${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i")
    const revoke = new RegExp(
      `REVOKE\\s+ALL\\s+(?:PRIVILEGES\\s+)?ON\\s+(?:TABLE\\s+)?(?:public\\.)?${table}\\s+FROM\\s+PUBLIC\\s*,\\s*anon\\s*,\\s*authenticated\\b`,
      "i"
    )
    if (!rls.test(text)) violations.push(`${table} lacks ENABLE ROW LEVEL SECURITY`)
    if (!revoke.test(text)) violations.push(`${table} lacks REVOKE ALL .. FROM PUBLIC, anon, authenticated`)
  }
  return violations
}

test("pending migrations are additive, backward compatible and closed to API roles", () => {
  const manifest = appliedManifest()
  for (const file of migrationFiles()) {
    if (file in manifest || file in FORWARD_ONLY_EXCEPTIONS) continue
    const violations = forwardOnlyViolations(readFileSync(resolve(MIGRATIONS, file), "utf8"))
    assert.deepEqual(violations, [], `${file} breaks the forward-only policy`)
  }
})

test("the forward-only policy catches unsafe migration text", () => {
  const closedTable = `
    CREATE TABLE IF NOT EXISTS blumi_example (id TEXT PRIMARY KEY);
    ALTER TABLE blumi_example ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE blumi_example FROM PUBLIC, anon, authenticated;
  `
  assert.deepEqual(forwardOnlyViolations(closedTable), [])
  assert.deepEqual(forwardOnlyViolations("ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT NOT NULL DEFAULT '';"), [])
  assert.deepEqual(
    forwardOnlyViolations("CREATE OR REPLACE FUNCTION f() RETURNS void LANGUAGE sql AS $$\n  UPDATE t SET c = 1\n$$;"),
    []
  )

  const unsafe: string[] = [
    "DROP TABLE blumi_example;",
    "ALTER TABLE t DROP COLUMN c;",
    "TRUNCATE blumi_example;",
    "ALTER TABLE t RENAME COLUMN a TO b;",
    "ALTER TABLE t ALTER COLUMN c SET NOT NULL;",
    "ALTER TABLE t ALTER COLUMN c TYPE BIGINT;",
    "UPDATE t SET c = 1;",
    "DELETE FROM t;",
    "INSERT INTO t VALUES (1);",
    "DO $$ BEGIN\nUPDATE t SET c = 1;\nEND $$;",
    "ALTER TABLE t ADD COLUMN c TEXT NOT NULL;",
    "CREATE TABLE blumi_open (id TEXT);",
    "CREATE TABLE blumi_open (id TEXT); ALTER TABLE blumi_open ENABLE ROW LEVEL SECURITY;"
  ]
  for (const sql of unsafe) {
    assert.notDeepEqual(forwardOnlyViolations(sql), [], sql)
  }
})
