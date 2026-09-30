import assert from "node:assert/strict"
import test from "node:test"
import { connectionEnvironment } from "./local-backup.mjs"

const approved = "postgresql://postgres.nkqcbxufbhfibrgvajim:placeholder@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
test("backup credentials use libpq environment and force a read-only TLS session", () => {
  const env = connectionEnvironment(approved)
  assert.equal(env.PGSSLMODE, "require")
  assert.match(env.PGOPTIONS, /default_transaction_read_only=on/)
  assert.equal(env.PGPASSWORD, "placeholder")
})
test("backup refuses another project, host, database, missing password and weaker TLS", () => {
  for (const value of [approved.replace("nkqcbxufbhfibrgvajim", "other"), approved.replace("aws-1-eu-west-1.pooler.supabase.com", "localhost"), approved.replace("/postgres", "/other"), approved.replace(":placeholder", ""), approved + "?sslmode=disable"]) {
    assert.throws(() => connectionEnvironment(value), /refused/)
  }
})
