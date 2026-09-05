import assert from "node:assert/strict"
import test from "node:test"
import {
  createAdminTokenService,
  mintAdminToken
} from "./adminTokenService"

const keys = [
  { keyId: "old", secret: Buffer.alloc(32, 1) },
  { keyId: "active", secret: Buffer.alloc(32, 2) }
]
const now = new Date("2026-07-14T12:00:00.000Z")

test("scoped short-lived admin tokens verify across a rotating keyring", () => {
  const token = mintAdminToken({
    key: keys[1]!,
    operatorId: "moderator-eren",
    tokenId: "token-123",
    scopes: ["reports:read"],
    now,
    ttlSeconds: 600
  })
  const service = createAdminTokenService({ keys })
  assert.deepEqual(service.verify(token, new Date(now.getTime() + 30_000)), {
    operatorId: "moderator-eren",
    tokenId: "token-123",
    scopes: ["reports:read"],
    expiresAt: "2026-07-14T12:10:00.000Z"
  })
})

test("admin tokens fail closed for expiry, unknown keys, tampering, and malformed input", () => {
  const service = createAdminTokenService({ keys })
  const valid = mintAdminToken({
    key: keys[0]!, operatorId: "ops", tokenId: "jti", scopes: ["reports:resolve"],
    now, ttlSeconds: 60
  })
  assert.equal(service.verify(valid, new Date(now.getTime() + 61_000)), null)
  assert.equal(service.verify(`${valid.slice(0, -1)}x`, now), null)
  const parts = valid.split(".")
  const unknownHeader = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT", kid: "missing" })).toString("base64url")
  assert.equal(service.verify([unknownHeader, parts[1], parts[2]].join("."), now), null)
  assert.equal(service.verify("broken", now), null)
})

test("minting rejects excessive lifetime and invalid identity or scopes", () => {
  assert.throws(() => mintAdminToken({
    key: keys[1]!, operatorId: "ops", tokenId: "jti", scopes: ["reports:read"],
    now, ttlSeconds: 901
  }), /15 minutes/)
  assert.throws(() => mintAdminToken({
    key: keys[1]!, operatorId: "", tokenId: "jti", scopes: ["reports:read"],
    now, ttlSeconds: 60
  }), /operator/)
})
