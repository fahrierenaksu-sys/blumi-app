import { X509Certificate } from "node:crypto"
import cbor from "cbor"
import { smsRequestHash, type SmsDeviceProofVerifier } from "./firebaseSmsDeviceGate"

export function createSmsDeviceProofVerifier(options: {
  appleTeamId: string; bundleId: string; androidCertificateHashes: string[];
  decodePlayIntegrity: (token: string) => Promise<unknown>
}): SmsDeviceProofVerifier {
  if (!/^[A-Z0-9]{10}$/.test(options.appleTeamId) || options.bundleId !== "com.blumi.mobile" ||
    options.androidCertificateHashes.length === 0 ||
    !options.androidCertificateHashes.every(value => /^[A-Za-z0-9_-]{43}$/.test(value))) {
    throw new Error("Invalid SMS attestation configuration")
  }
  return async input => {
    if (input.platform === "android") {
      const raw = await options.decodePlayIntegrity(input.proof)
      if (!isRecord(raw) || !isRecord(raw.tokenPayloadExternal)) throw new Error("SMS proof rejected")
      const value = raw.tokenPayloadExternal
      const request = value.requestDetails, app = value.appIntegrity, device = value.deviceIntegrity, account = value.accountDetails
      if (!isRecord(request) || !isRecord(app) || !isRecord(device) || !isRecord(account)) throw new Error("SMS proof rejected")
      const timestamp = Number(request.timestampMillis)
      if (request.requestPackageName !== options.bundleId || request.requestHash !== smsRequestHash(input.payload) ||
        !Number.isSafeInteger(timestamp) || timestamp < input.now - 120_000 || timestamp > input.now + 30_000 ||
        app.appRecognitionVerdict !== "PLAY_RECOGNIZED" || app.packageName !== options.bundleId ||
        !Array.isArray(app.certificateSha256Digest) || !app.certificateSha256Digest.some(cert => options.androidCertificateHashes.includes(cert)) ||
        account.appLicensingVerdict !== "LICENSED" || !Array.isArray(device.deviceRecognitionVerdict) ||
        !device.deviceRecognitionVerdict.includes("MEETS_DEVICE_INTEGRITY")) throw new Error("SMS proof rejected")
      return { publicKey: null, signCount: 0 }
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input.proof)) throw new Error("SMS proof rejected")
    const bytes = Buffer.from(input.proof, "base64")
    if (!bytes.length || bytes.length > 98_000 || bytes.toString("base64") !== input.proof) throw new Error("SMS proof rejected")
    const decoded = cbor.decodeAllSync(bytes, { max_depth: 16 })
    if (decoded.length !== 1 || !isRecord(decoded[0])) throw new Error("SMS proof rejected")
    const { verifyAttestation, verifyAssertion } = await import("node-app-attest")
    if (input.publicKey) {
      if (!Buffer.isBuffer(decoded[0].authenticatorData) || decoded[0].authenticatorData.length !== 37 ||
        !Buffer.isBuffer(decoded[0].signature) || decoded[0].signature.length > 80) throw new Error("SMS proof rejected")
      const result = verifyAssertion({ assertion: bytes, payload: input.payload, publicKey: input.publicKey,
        bundleIdentifier: options.bundleId, teamIdentifier: options.appleTeamId, signCount: input.signCount })
      return { publicKey: input.publicKey, signCount: result.signCount as number }
    }
    const statement = decoded[0].attStmt
    if (!isRecord(statement) || !Array.isArray(statement.x5c) || statement.x5c.length !== 2) throw new Error("SMS proof rejected")
    // The library verifies the Apple-pinned certificate signatures, app identity,
    // nonce, key ID, credential ID and production AAGUID. Also enforce validity
    // dates and CA roles, which its certificate signature checks do not cover.
    const certificates = statement.x5c.map(bytes => new X509Certificate(bytes as Buffer))
    if (certificates.some(cert => Date.parse(cert.validFrom) > input.now || Date.parse(cert.validTo) <= input.now) ||
      certificates[0]!.ca || !certificates[1]!.ca || !certificates[0]!.checkIssued(certificates[1]!)) {
      throw new Error("SMS proof rejected")
    }
    const result = verifyAttestation({ attestation: bytes, challenge: input.payload, keyId: input.installationId,
      bundleIdentifier: options.bundleId, teamIdentifier: options.appleTeamId, allowDevelopmentEnvironment: false })
    if (result.environment !== "production" || typeof result.publicKey !== "string") throw new Error("SMS proof rejected")
    return { publicKey: result.publicKey, signCount: 0 }
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
