import assert from "node:assert/strict"
import { createHash, generateKeyPairSync, sign } from "node:crypto"
import cbor from "cbor"
import test from "node:test"
import { createSmsDeviceProofVerifier } from "./firebaseSmsDeviceProof"
import { smsDevicePayload, smsRequestHash } from "./firebaseSmsDeviceGate"

const payload = smsDevicePayload("fixture-project", "ios", "a".repeat(43) + "=", "b".repeat(43), "+12025550101")
const certificate = "c".repeat(43)
const input = { platform: "ios" as const, installationId: "a".repeat(43) + "=", payload,
  proof: "", publicKey: null as string | null, signCount: 0, now: Date.now() }
function verifier(decode: (token: string) => Promise<unknown> = async () => ({})) {
  return createSmsDeviceProofVerifier({ appleTeamId: "ABCDEFGHIJ", bundleId: "com.blumi.mobile",
    androidCertificateHashes: [certificate], decodePlayIntegrity: decode })
}

test("iOS assertions verify a real signature, exact payload, app identity and increasing counter", async () => {
  const key = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
  const publicKey = key.publicKey.export({ format: "pem", type: "spki" }).toString()
  const auth = Buffer.alloc(37)
  createHash("sha256").update("ABCDEFGHIJ.com.blumi.mobile").digest().copy(auth)
  auth[32] = 1
  auth.writeUInt32BE(1, 33)
  const nonce = createHash("sha256").update(Buffer.concat([auth, createHash("sha256").update(payload).digest()])).digest()
  const signature = sign("sha256", nonce, key.privateKey)
  const proof = cbor.encode({ authenticatorData: auth, signature }).toString("base64")
  const verify = verifier()
  assert.deepEqual(await verify({ ...input, publicKey, proof }), { publicKey, signCount: 1 })
  await assert.rejects(verify({ ...input, publicKey, proof, payload: payload + "modified" }))
  await assert.rejects(verify({ ...input, publicKey, proof, signCount: 1 }))
  const other = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
  await assert.rejects(verify({ ...input, publicKey: other.publicKey.export({ format: "pem", type: "spki" }).toString(), proof }))
  await assert.rejects(verify({ ...input, publicKey, proof: Buffer.concat([Buffer.from(proof, "base64"), cbor.encode({})]).toString("base64") }))
})

test("unsigned or malformed iOS registration never creates an attested installation", async () => {
  for (const proof of ["", "invalid", cbor.encode({}).toString("base64"),
    cbor.encode({ attStmt: { x5c: [Buffer.from("bad"), Buffer.from("bad")] } }).toString("base64")]) {
    await assert.rejects(verifier()({ ...input, proof }))
  }
})

test("Android requires the decoded Google verdict to bind app, license, device, request hash and freshness", async () => {
  const request = { requestPackageName: "com.blumi.mobile", requestHash: smsRequestHash(payload), timestampMillis: String(input.now) }
  const app = { appRecognitionVerdict: "PLAY_RECOGNIZED", packageName: "com.blumi.mobile", certificateSha256Digest: [certificate] }
  const device = { deviceRecognitionVerdict: ["MEETS_DEVICE_INTEGRITY"] }
  const account = { appLicensingVerdict: "LICENSED" }
  const valid = { requestDetails: request, appIntegrity: app, deviceIntegrity: device, accountDetails: account }
  const android = { ...input, platform: "android" as const, proof: "fixture-google-token" }
  assert.deepEqual(await verifier(async () => ({ tokenPayloadExternal: valid }))(android), { publicKey: null, signCount: 0 })
  for (const change of [
    { requestDetails: { ...request, requestHash: "other" } },
    { requestDetails: { ...request, requestPackageName: "other" } },
    { requestDetails: { ...request, timestampMillis: String(input.now - 121000) } },
    { requestDetails: { ...request, timestampMillis: String(input.now + 31000) } },
    { appIntegrity: { ...app, appRecognitionVerdict: "UNRECOGNIZED_VERSION" } },
    { appIntegrity: { ...app, certificateSha256Digest: ["wrong"] } },
    { deviceIntegrity: { deviceRecognitionVerdict: ["MEETS_BASIC_INTEGRITY"] } },
    { accountDetails: { appLicensingVerdict: "UNLICENSED" } }
  ]) {
    await assert.rejects(verifier(async () => ({ tokenPayloadExternal: { ...valid, ...change } }))(android))
  }
  await assert.rejects(verifier(async () => { throw new Error("provider unavailable") })(android))
})
