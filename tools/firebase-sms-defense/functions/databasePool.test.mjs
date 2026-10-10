import assert from "node:assert/strict"
import test from "node:test"
import { databasePoolOptions } from "./databasePool.mjs"

test("database TLS uses the pinned CA and preserves certificate/hostname verification", () => {
  const config = databasePoolOptions("postgresql://fixture:fixture@localhost/db?sslmode=verify-full")
  assert.equal(config.ssl.rejectUnauthorized, true)
  assert.match(config.ssl.ca, /BEGIN CERTIFICATE/)
  assert.equal(new URL(config.connectionString).searchParams.has("sslmode"), false)
  assert.equal(config.max, 1)
  for (const mode of ["require", "disable", "verify-ca", "no-verify"]) {
    assert.throws(() => databasePoolOptions(`postgresql://fixture:fixture@localhost/db?sslmode=${mode}`))
  }
  for (const option of ["ssl", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"]) {
    assert.throws(() => databasePoolOptions(`postgresql://fixture:fixture@localhost/db?${option}=fixture`))
  }
})
