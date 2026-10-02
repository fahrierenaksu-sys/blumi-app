import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import YAML from "yaml"
import {
  ARCHIVE_NAME, backupConfiguration, connectionEnvironment, createBackupFrom, decryptBackup,
  decryptFile, encryptFile, failureCategory, restoreAndSmoke
} from "./ci-db-backup.mjs"

const root = new URL("../../", import.meta.url)
const script = new URL("./ci-db-backup.mjs", import.meta.url).pathname
const SECRET_NAMES = ["BLUMI_BACKUP_DATABASE_URL", "BLUMI_BACKUP_ENCRYPTION_KEY"]
const REF = "nkqcbxufbhfibrgvajim"
const POOLER = `postgresql://blumi_backup.${REF}:s3cr3t-pa55@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`
const workflows = {
  backup: YAML.parse(readFileSync(new URL(".github/workflows/db-backup.yml", root), "utf8")),
  restore: YAML.parse(readFileSync(new URL(".github/workflows/db-restore-proof.yml", root), "utf8"))
}
const steps = (workflow) => Object.values(workflow.jobs).flatMap((job) => job.steps)

function stringsWithPaths(value, path = []) {
  if (typeof value === "string") return [[path, value]]
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => stringsWithPaths(child, [...path, key]))
  }
  return []
}

test("the backup runs daily and on demand, and the restore proof only on demand", () => {
  const { on } = workflows.backup
  assert.equal(on.schedule.length, 1)
  assert.match(on.schedule[0].cron, /^\d{1,2} \d{1,2} \* \* \*$/)
  assert.ok("workflow_dispatch" in on)
  assert.deepEqual(Object.keys(workflows.restore.on), ["workflow_dispatch"])
})

test("secrets reach the workflows only through step env entries of the same name", () => {
  for (const [name, workflow] of Object.entries(workflows)) {
    const references = stringsWithPaths(workflow).filter(([, text]) => /secrets\./.test(text))
    assert.ok(references.length > 0, name)
    for (const [path, text] of references) {
      assert.equal(path[0], "jobs", `${name}: ${path.join(".")}`)
      assert.equal(path[2], "steps", `${name}: ${path.join(".")}`)
      assert.equal(path[4], "env", `${name}: secret outside a step env at ${path.join(".")}`)
      assert.equal(text, `\${{ secrets.${path[5]} }}`, `${name}: ${path.join(".")}`)
      assert.ok(SECRET_NAMES.includes(path[5]), `${name}: unexpected secret ${path[5]}`)
    }
  }
})

test("secret-bearing steps run only the backup script, and no run script names a secret or traces", () => {
  for (const [name, workflow] of Object.entries(workflows)) {
    for (const step of steps(workflow)) {
      const carriesSecret = Object.values(step.env ?? {}).some((value) => /secrets\./.test(String(value)))
      if (carriesSecret) {
        assert.equal(step.uses, undefined, `${name}: an action receives a secret`)
        assert.match(step.run, /^node scripts\/automation\/ci-db-backup\.mjs [\w "$/.-]+$/, `${name}: ${step.name}`)
      }
      if (step.run) {
        for (const secret of SECRET_NAMES) assert.ok(!step.run.includes(secret), `${name}: ${step.name} names ${secret}`)
        assert.doesNotMatch(step.run, /set -[a-z]*x|printenv|\benv\s*($|\|)|\$\{\{\s*secrets/m, `${name}: ${step.name}`)
      }
    }
  }
})

test("work after the configuration check runs only when the secrets are present", () => {
  for (const [name, workflow] of Object.entries(workflows)) {
    const list = steps(workflow)
    const check = list.findIndex((step) => step.id === "configured")
    assert.ok(check > 0, name)
    assert.match(list[check].run, /ci-db-backup\.mjs config /)
    for (const step of list.slice(check + 1)) {
      if (step.name === "Delete the decrypted archive") continue
      assert.match(String(step.if), /steps\.configured\.outputs\.enabled == 'true'/, `${name}: ${step.name ?? step.uses}`)
    }
  }
})

test("only the encrypted archive and its manifest are uploaded, privately and with short retention", () => {
  const uploads = steps(workflows.backup).filter((step) => String(step.uses).startsWith("actions/upload-artifact@"))
  assert.equal(uploads.length, 1)
  const upload = uploads[0].with
  assert.ok(upload["retention-days"] >= 1 && upload["retention-days"] <= 30)
  assert.equal(upload["if-no-files-found"], "error")
  const paths = upload.path.trim().split("\n").map((line) => line.trim())
  assert.deepEqual(paths.map((path) => path.split("/").pop()).sort(), [ARCHIVE_NAME, "blumi-public.manifest.json"])
  assert.deepEqual(workflows.backup.permissions, { contents: "read" })
  for (const step of steps(workflows.backup).filter((step) => String(step.uses).startsWith("actions/checkout@"))) {
    assert.equal(step.with?.["persist-credentials"], false)
  }
})

test("both workflows use PostgreSQL 17 tools and restore only into a throwaway container", () => {
  for (const workflow of Object.values(workflows)) {
    assert.match(Object.values(workflow.jobs)[0].env.BLUMI_PG17_BIN, /\/17\/bin$/)
  }
  const restoreJob = Object.values(workflows.restore.jobs)[0]
  assert.equal(restoreJob.services.postgres.image, "postgres:17")
  assert.equal(restoreJob.env.BLUMI_RESTORE_PGHOST, "localhost")
  assert.ok(!stringsWithPaths(workflows.restore).some(([, text]) => /DATABASE_URL/.test(text)))
})

test("the connection must be the expected project, over TLS, in a read-only session", () => {
  const env = connectionEnvironment(POOLER, REF)
  assert.equal(env.PGUSER, `blumi_backup.${REF}`)
  assert.equal(env.PGSSLMODE, "require")
  assert.match(env.PGOPTIONS, /default_transaction_read_only=on/)
  assert.ok(connectionEnvironment(`postgresql://postgres:pw@db.${REF}.supabase.co:5432/postgres`, REF))
  const refused = [
    POOLER.replace(REF, "aaaaaaaaaaaaaaaaaaaa"), POOLER.replace(":5432", ":6543"), POOLER.replace(":s3cr3t-pa55", ""),
    `${POOLER}?sslmode=disable`, POOLER.replace("aws-1-eu-west-1.pooler.supabase.com", "evil.example.com"),
    `postgresql://blumi_backup.${REF}:pw@localhost:5432/postgres`, "not a url", undefined
  ]
  for (const value of refused) {
    assert.throws(() => connectionEnvironment(value, REF), (error) => {
      assert.match(error.message, /refused/)
      assert.ok(!error.message.includes("s3cr3t") && !error.message.includes("pooler.supabase.com"))
      return true
    })
  }
  assert.throws(() => connectionEnvironment(POOLER, ""), /refused/)
})

test("missing secrets turn the job into a no-op, and half a configuration fails", () => {
  assert.equal(backupConfiguration({}).enabled, false)
  assert.equal(backupConfiguration({ BLUMI_BACKUP_DATABASE_URL: "", BLUMI_BACKUP_ENCRYPTION_KEY: "" }).enabled, false)
  assert.equal(backupConfiguration({ BLUMI_BACKUP_DATABASE_URL: "x", BLUMI_BACKUP_ENCRYPTION_KEY: "y" }).enabled, true)
  assert.throws(() => backupConfiguration({ BLUMI_BACKUP_ENCRYPTION_KEY: "y" }), /BLUMI_BACKUP_DATABASE_URL is missing/)
  assert.equal(backupConfiguration({ BLUMI_BACKUP_ENCRYPTION_KEY: "y" }, "restore").enabled, true)
  assert.equal(backupConfiguration({}, "restore").enabled, false)
})

test("the CLI reports configuration through GitHub outputs without printing secret values", () => {
  const directory = mkdtempSync(join(tmpdir(), "blumi-ci-backup-"))
  try {
    const output = join(directory, "output")
    const run = (env) => spawnSync(process.execPath, [script, "config", "backup"], {
      env: { PATH: process.env.PATH, GITHUB_OUTPUT: output, ...env }, encoding: "utf8"
    })
    writeFileSync(output, "")
    const off = run({})
    assert.equal(off.status, 0)
    assert.match(off.stdout, /::notice .*off/)
    assert.equal(readFileSync(output, "utf8"), "enabled=false\n")
    writeFileSync(output, "")
    const on = run({ BLUMI_BACKUP_DATABASE_URL: POOLER, BLUMI_BACKUP_ENCRYPTION_KEY: "key-value-that-must-not-print" })
    assert.equal(on.status, 0)
    assert.equal(readFileSync(output, "utf8"), "enabled=true\n")
    const half = run({ BLUMI_BACKUP_DATABASE_URL: POOLER })
    assert.equal(half.status, 1)
    for (const result of [off, on, half]) {
      const text = result.stdout + result.stderr
      assert.ok(!text.includes("s3cr3t") && !text.includes("key-value-that-must-not-print"))
    }
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test("client errors are reduced to a category that never repeats their text", () => {
  const stderr = `pg_dump: error: connection to server at "aws-1.pooler.supabase.com" failed: FATAL: password authentication failed for user "blumi_backup.${REF}"`
  const category = failureCategory(stderr)
  assert.match(category, /authentication/)
  assert.ok(!category.includes(REF) && !category.includes("supabase"))
  assert.match(failureCategory('ERROR: secret row "+905551112233"'), /withheld/)
})

const gpgAvailable = spawnSync("gpg", ["--version"]).status === 0
test("archives are encrypted with the passphrase and refuse a wrong one", { skip: !gpgAvailable && "gpg is not installed" }, () => {
  const directory = mkdtempSync(join(tmpdir(), "blumi-ci-gpg-"))
  try {
    process.env.GNUPGHOME = directory
    const plain = join(directory, "plain"); const sealed = join(directory, "sealed"); const opened = join(directory, "opened")
    writeFileSync(plain, "PGDMP private payload")
    const key = "correct horse battery staple 1234"
    assert.throws(() => encryptFile(plain, sealed, "short"), /at least 24/)
    encryptFile(plain, sealed, key)
    assert.ok(!readFileSync(sealed).includes("private payload"))
    assert.throws(() => decryptFile(sealed, opened, "wrong horse battery staple 1234"), /gpg decrypt failed/)
    decryptFile(sealed, opened, key)
    assert.equal(readFileSync(opened, "utf8"), "PGDMP private payload")
  } finally {
    delete process.env.GNUPGHOME
    rmSync(directory, { recursive: true, force: true })
  }
})

// Full dump → encrypt → verify → decrypt → restore → count on a disposable
// local cluster. Runs where PostgreSQL server tools are on PATH and the user
// is not root (CI's verify job); initdb refuses root.
const pgBin = spawnSync("pg_config", ["--bindir"], { encoding: "utf8" }).stdout?.trim()
const canCluster = Boolean(pgBin) && process.getuid?.() !== 0 && gpgAvailable
test("a backup restores into a fresh database with the same counts", { skip: !canCluster && "needs non-root PostgreSQL server tools and gpg", timeout: 120_000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), "blumi-ci-restore-"))
  const data = join(directory, "data"); const port = "55491"
  const pg = (command, args) => {
    const result = spawnSync(join(pgBin, command), args, { encoding: "utf8" })
    assert.equal(result.status, 0, `${command}: ${result.stderr}`)
    return result.stdout
  }
  let started = false
  try {
    process.env.GNUPGHOME = directory
    pg("initdb", ["-D", data, "-U", "blumi", "--auth-local=trust", "--auth-host=reject", "--no-locale", "-E", "UTF8"])
    pg("pg_ctl", ["-D", data, "-l", join(directory, "log"), "-o", `-F -k ${directory} -h '' -p ${port}`, "-w", "start"])
    started = true
    const connection = { PGHOST: directory, PGPORT: port, PGUSER: "blumi", PGDATABASE: "postgres", PGOPTIONS: "-c default_transaction_read_only=on" }
    pg("psql", ["-h", directory, "-p", port, "-U", "blumi", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `
      CREATE TABLE blumi_migrations (id TEXT PRIMARY KEY, checksum CHAR(64));
      INSERT INTO blumi_migrations VALUES ('001_a.sql', NULL), ('002_b.sql', NULL);
      CREATE TABLE blumi_accounts (id serial PRIMARY KEY);
      ALTER TABLE blumi_accounts ENABLE ROW LEVEL SECURITY;
      INSERT INTO blumi_accounts DEFAULT VALUES; INSERT INTO blumi_accounts DEFAULT VALUES; INSERT INTO blumi_accounts DEFAULT VALUES;`])
    const major = Number(/\d+/.exec(pg("pg_dump", ["--version"]).replace(/^\D+/, ""))[0])
    const key = "a long passphrase for the test only"
    const out = join(directory, "artifact")
    const manifest = await createBackupFrom({ outDir: out, connection, passphrase: key, pgBin, expectedMajor: major })
    assert.equal(manifest.encryptedFile, ARCHIVE_NAME)
    assert.match(manifest.encryptedSha256, /^[0-9a-f]{64}$/)
    await assert.rejects(createBackupFrom({ outDir: join(directory, "other"), connection, passphrase: key, pgBin, expectedMajor: major + 1 }), /pg_dump \d+ is required/)

    const dump = join(directory, "restored.dump")
    await decryptBackup({ inDir: out, outFile: dump, passphrase: key, pgBin })
    const restoreConnection = { PGHOST: directory, PGPORT: port, PGUSER: "blumi", PGDATABASE: "postgres" }
    const result = restoreAndSmoke({ archive: dump, connection: restoreConnection, pgBin })
    assert.deepEqual(result, { tables: 2, ledgerRows: 2, latestMigration: "002_b.sql", tableRows: { blumi_accounts: 3, blumi_migrations: 2 } })

    writeFileSync(join(out, ARCHIVE_NAME), "tampered")
    await assert.rejects(decryptBackup({ inDir: out, outFile: dump, passphrase: key, pgBin }), /does not match its manifest/)
  } finally {
    delete process.env.GNUPGHOME
    if (started) spawnSync(join(pgBin, "pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"])
    rmSync(directory, { recursive: true, force: true })
  }
})
