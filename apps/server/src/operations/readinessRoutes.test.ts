import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { computeAvatarArtPackHash } from "../avatar/avatarPortrait"
import { createServer } from "../server"

test("liveness stays healthy while failed DB readiness and new work return unavailable", async () => {
  let accepting = true
  let databaseHealthy = false
  const app = createServer({ logger: false, isAccepting: () => accepting,
    checkReadiness: async () => { if (!databaseHealthy) throw new Error("database unavailable") } })
  try {
    assert.equal((await app.inject("/live")).statusCode, 200)
    assert.equal((await app.inject("/health")).statusCode, 200)
    assert.equal((await app.inject("/ready")).statusCode, 503)
    databaseHealthy = true
    assert.equal((await app.inject("/ready")).statusCode, 200)
    accepting = false
    assert.equal((await app.inject("/ready")).statusCode, 503)
    assert.equal((await app.inject("/v1/users/me")).statusCode, 503)
    assert.equal((await app.inject("/live")).statusCode, 200)
  } finally { await app.close() }
})

test("readiness completes within its timeout when database query stalls", async () => {
  const app = createServer({ logger: false, readinessTimeoutMs: 10, checkReadiness: () => new Promise(() => {}) })
  try {
    assert.equal((await app.inject("/ready")).statusCode, 503)
  } finally { await app.close() }
})

test("ready shows the art-pack hash without changing readiness gating", async () => {
  let databaseHealthy = false
  const app = createServer({ logger: false, avatarArtPackHash: () => "abc123def4567890",
    checkReadiness: async () => { if (!databaseHealthy) throw new Error("database unavailable") } })
  try {
    const notReady = await app.inject("/ready")
    assert.equal(notReady.statusCode, 503)
    databaseHealthy = true
    const ready = await app.inject("/ready")
    assert.equal(ready.statusCode, 200)
    assert.deepEqual(ready.json(), { ok: true, service: "blumi-server", artPackHash: "abc123def4567890" })
  } finally { await app.close() }
})

test("art-pack hash follows the avatar art and ignores everything else", async () => {
  const dir = mkdtempSync(join(tmpdir(), "artpack-"))
  try {
    const write = (files: Record<string, string>) => writeFileSync(join(dir, "manifest.json"), JSON.stringify({ files }))
    write({ "rooms/a.webp": "r1" })
    assert.equal(computeAvatarArtPackHash(dir), null)
    write({ "avatar/x.webp": "h1", "rooms/a.webp": "r1" })
    const first = computeAvatarArtPackHash(dir)
    assert.match(first!, /^[0-9a-f]{16}$/)
    write({ "rooms/a.webp": "r2", "avatar/x.webp": "h1" })
    assert.equal(computeAvatarArtPackHash(dir), first)
    write({ "avatar/x.webp": "h2", "rooms/a.webp": "r1" })
    assert.notEqual(computeAvatarArtPackHash(dir), first)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
