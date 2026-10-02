import assert from "node:assert/strict"
import { generateKeyPairSync, verify } from "node:crypto"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const forge = require("node-forge")
const certificates = require("@expo/code-signing-certificates")
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 1024,
  publicExponent: 3,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" }
})
const keys = {
  privateKey: forge.pki.privateKeyFromPem(privateKey),
  publicKey: forge.pki.publicKeyFromPem(publicKey)
}
const message = "Blumi node-forge mitigation regression"
const digest = forge.md.sha256.create().update(message).digest().getBytes()
const { asn1 } = forge
const oid = () => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false,
  asn1.oidToDer(forge.oids.sha256).getBytes())
const nullParameter = () => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, "")
const garbage = () => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, "garbage")

// Sign a deliberately malformed DigestInfo with a test key to exercise the
// vulnerable parser, not a private-key-free forgery or a production key.
function signatureFor(algorithm, extraOuter = []) {
  const info = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, algorithm),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, digest),
    ...extraOuter
  ])
  return keys.privateKey.sign(asn1.toDer(info).getBytes(), "NONE")
}

test("the lockfile and Expo certificate consumer resolve only the mitigated forge copy", () => {
  const lock = JSON.parse(readFileSync(new URL("../../package-lock.json", import.meta.url)))
  const copies = Object.keys(lock.packages).filter((path) => path.endsWith("/node-forge"))
  assert.deepEqual(copies, ["node_modules/node-forge"])
  assert.equal(require("node-forge/package.json").version, "1.4.0")
  assert.equal(createRequire(require.resolve("@expo/code-signing-certificates")).resolve("node-forge"),
    require.resolve("node-forge"))
})

for (const [name, algorithm] of [
  ["extra nested element (CVE-2026-85393)", () => [oid(), nullParameter(), garbage()]],
  ["garbage replacing optional NULL", () => [oid(), garbage()]],
  ["nonempty NULL", () => [oid(), asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, "garbage")]],
  ["constructed NULL", () => [oid(), asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, true, [garbage()])]]
]) {
  test(`RSA verification rejects ${name}`, () => {
    const signature = signatureFor(algorithm())
    assert.equal(verify("sha256", Buffer.from(message), publicKey, Buffer.from(signature, "binary")), false)
    assert.throws(() => keys.publicKey.verify(digest, signature), /valid RSASSA-PKCS1-v1_5 DigestInfo/)
  })
}

test("RSA verification still rejects extra outer DigestInfo elements", () => {
  assert.throws(() => keys.publicKey.verify(digest,
    signatureFor([oid(), nullParameter()], [garbage()])), /valid RSASSA-PKCS1-v1_5 DigestInfo/)
})

test("valid SHA-256 signatures with present or absent NULL parameters remain compatible", () => {
  for (const algorithm of [[oid()], [oid(), nullParameter()]]) {
    assert.equal(keys.publicKey.verify(digest, signatureFor(algorithm)), true)
  }
  const signature = keys.privateKey.sign(forge.md.sha256.create().update(message))
  assert.equal(keys.publicKey.verify(digest, signature), true)
  assert.equal(keys.publicKey.verify(forge.md.sha256.create().update("different message").digest().getBytes(), signature), false)
  assert.equal(verify("sha256", Buffer.from(message), publicKey, Buffer.from(signature, "binary")), true)
})

test("Expo update signing still produces a valid native-crypto-verifiable signature", () => {
  const signature = certificates.signBufferRSASHA256AndVerify(keys.privateKey,
    { publicKey: keys.publicKey }, Buffer.from(message))
  assert.equal(verify("sha256", Buffer.from(message), publicKey, Buffer.from(signature, "base64")), true)
})
