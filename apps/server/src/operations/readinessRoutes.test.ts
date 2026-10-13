import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { computeAvatarArtPackHash } from "../avatar/avatarPortrait"
import { createServer } from "../server"
import { readDeployedCommit } from "./deployedCommit"

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

test("health reports the deployed commit as a short SHA, or null when the deploy does not say", async () => {
  const withCommit = createServer({ logger: false, deployedCommit: "0123456789ab" })
  const withoutCommit = createServer({ logger: false, deployedCommit: null })
  try {
    assert.equal((await withCommit.inject("/health")).json().commit, "0123456789ab")
    assert.equal((await withoutCommit.inject("/health")).json().commit, null)
  } finally {
    await withCommit.close()
    await withoutCommit.close()
  }
})

test("the deployed commit comes from the deploy environment and is never arbitrary text", () => {
  const sha = "e5bcb2ede42319ec376002af38b85c703197ee03"
  assert.equal(readDeployedCommit({ RAILWAY_GIT_COMMIT_SHA: sha }), "e5bcb2ede423")
  assert.equal(readDeployedCommit({ BLUMI_BUILD_COMMIT_SHA: sha.toUpperCase() }), "e5bcb2ede423")
  assert.equal(readDeployedCommit({ RAILWAY_GIT_COMMIT_SHA: sha, BLUMI_BUILD_COMMIT_SHA: "abcdef0" }), "e5bcb2ede423")
  assert.equal(readDeployedCommit({}), null)
  assert.equal(readDeployedCommit({ RAILWAY_GIT_COMMIT_SHA: "" }), null)
  assert.equal(readDeployedCommit({ RAILWAY_GIT_COMMIT_SHA: "main branch, not a sha" }), null)
  assert.equal(readDeployedCommit({ RAILWAY_GIT_COMMIT_SHA: "abc" }), null)
})
