import { createHmac, timingSafeEqual } from "node:crypto"

export const ADMIN_SCOPES = ["reports:read", "reports:resolve", "account-recovery:read", "account-recovery:resolve"] as const

export type AdminScope = (typeof ADMIN_SCOPES)[number]

export interface AdminSigningKey {
  readonly keyId: string
  readonly secret: Buffer
}

export interface AdminPrincipal {
  readonly operatorId: string
  readonly tokenId: string
  readonly scopes: readonly AdminScope[]
  readonly expiresAt: string
}

export interface AdminTokenService {
  verify(token: string, now?: Date): AdminPrincipal | null
}

interface TokenHeader {
  alg: "HS256"
  typ: "JWT"
  kid: string
}

interface TokenClaims {
  iss: "blumi-admin"
  aud: "blumi-admin-api"
  sub: string
  jti: string
  iat: number
  nbf: number
  exp: number
  scopes: AdminScope[]
}

const MAX_TOKEN_LENGTH = 8_192
const MAX_IDENTITY_LENGTH = 128
const DEFAULT_MAX_TTL_SECONDS = 15 * 60
const DEFAULT_CLOCK_SKEW_SECONDS = 30
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const IDENTITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/

export function createAdminTokenService(options: Readonly<{
  keys: readonly AdminSigningKey[]
  maxTtlSeconds?: number
  clockSkewSeconds?: number
}>): AdminTokenService {
  const maxTtlSeconds = options.maxTtlSeconds ?? DEFAULT_MAX_TTL_SECONDS
  const clockSkewSeconds = options.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS
  if (
    !Number.isInteger(maxTtlSeconds) ||
    maxTtlSeconds <= 0 ||
    maxTtlSeconds > DEFAULT_MAX_TTL_SECONDS
  ) throw new Error("Admin token maximum lifetime cannot exceed 15 minutes.")
  if (!Number.isInteger(clockSkewSeconds) || clockSkewSeconds < 0) {
    throw new Error("Admin token clock skew must be a non-negative integer.")
  }
  const keyring = createKeyring(options.keys)

  return Object.freeze({
    verify(token: string, now = new Date()): AdminPrincipal | null {
      if (!token || token.length > MAX_TOKEN_LENGTH) return null
      const segments = token.split(".")
      if (segments.length !== 3) return null
      const [encodedHeader, encodedClaims, encodedSignature] = segments
      if (!encodedHeader || !encodedClaims || !encodedSignature) return null

      const header = decodeJson(encodedHeader)
      if (!isValidHeader(header)) return null
      const key = keyring.get(header.kid)
      if (!key) return null

      const expectedSignature = sign(`${encodedHeader}.${encodedClaims}`, key.secret)
      const providedSignature = decodeBase64Url(encodedSignature)
      if (
        !providedSignature ||
        providedSignature.length !== expectedSignature.length ||
        !timingSafeEqual(providedSignature, expectedSignature)
      ) return null

      const claims = decodeJson(encodedClaims)
      const nowSeconds = Math.floor(now.getTime() / 1_000)
      if (!isValidClaims(claims, nowSeconds, maxTtlSeconds, clockSkewSeconds)) {
        return null
      }

      return Object.freeze({
        operatorId: claims.sub,
        tokenId: claims.jti,
        scopes: Object.freeze([...claims.scopes]),
        expiresAt: new Date(claims.exp * 1_000).toISOString()
      })
    }
  })
}

export function mintAdminToken(options: Readonly<{
  key: AdminSigningKey
  operatorId: string
  tokenId: string
  scopes: readonly AdminScope[]
  now?: Date
  ttlSeconds: number
}>): string {
  validateSigningKey(options.key)
  const operatorId = validateIdentity(options.operatorId, "operator")
  const tokenId = validateIdentity(options.tokenId, "token ID")
  const scopes = validateScopes(options.scopes)
  if (!Number.isInteger(options.ttlSeconds) || options.ttlSeconds <= 0) {
    throw new Error("Admin token lifetime must be a positive number of seconds.")
  }
  if (options.ttlSeconds > DEFAULT_MAX_TTL_SECONDS) {
    throw new Error("Admin token lifetime cannot exceed 15 minutes.")
  }

  const issuedAt = Math.floor((options.now ?? new Date()).getTime() / 1_000)
  const header: TokenHeader = { alg: "HS256", typ: "JWT", kid: options.key.keyId }
  const claims: TokenClaims = {
    iss: "blumi-admin",
    aud: "blumi-admin-api",
    sub: operatorId,
    jti: tokenId,
    iat: issuedAt,
    nbf: issuedAt,
    exp: issuedAt + options.ttlSeconds,
    scopes
  }
  const encodedHeader = encodeJson(header)
  const encodedClaims = encodeJson(claims)
  const payload = `${encodedHeader}.${encodedClaims}`
  return `${payload}.${sign(payload, options.key.secret).toString("base64url")}`
}

function createKeyring(
  keys: readonly AdminSigningKey[]
): ReadonlyMap<string, AdminSigningKey> {
  if (keys.length === 0) throw new Error("At least one admin signing key is required.")
  const entries = keys.map((key) => {
    validateSigningKey(key)
    return [
      key.keyId,
      Object.freeze({ keyId: key.keyId, secret: Buffer.from(key.secret) })
    ] as const
  })
  const keyring = new Map(entries)
  if (keyring.size !== entries.length) throw new Error("Admin signing key IDs must be unique.")
  return keyring
}

function validateSigningKey(key: AdminSigningKey): void {
  if (!KEY_ID_PATTERN.test(key.keyId)) throw new Error("Admin signing key ID is invalid.")
  if (!Buffer.isBuffer(key.secret) || key.secret.length < 32) {
    throw new Error("Admin signing secrets must contain at least 32 bytes.")
  }
}

function validateIdentity(value: string, label: string): string {
  const normalized = value.trim()
  if (
    !normalized ||
    normalized.length > MAX_IDENTITY_LENGTH ||
    !IDENTITY_PATTERN.test(normalized)
  ) {
    throw new Error(`Admin ${label} identity is invalid.`)
  }
  return normalized
}

function validateScopes(scopes: readonly AdminScope[]): AdminScope[] {
  const unique = [...new Set(scopes)]
  if (unique.length === 0 || unique.some((scope) => !ADMIN_SCOPES.includes(scope))) {
    throw new Error("Admin token scopes are invalid.")
  }
  return unique
}

function isValidHeader(value: unknown): value is TokenHeader {
  if (!isRecord(value)) return false
  return value.alg === "HS256" && value.typ === "JWT" &&
    typeof value.kid === "string" && KEY_ID_PATTERN.test(value.kid)
}

function isValidClaims(
  value: unknown,
  nowSeconds: number,
  maxTtlSeconds: number,
  clockSkewSeconds: number
): value is TokenClaims {
  if (!isRecord(value)) return false
  if (value.iss !== "blumi-admin" || value.aud !== "blumi-admin-api") return false
  if (!isValidIdentity(value.sub) || !isValidIdentity(value.jti)) return false
  if (
    !Number.isSafeInteger(value.iat) ||
    !Number.isSafeInteger(value.nbf) ||
    !Number.isSafeInteger(value.exp)
  ) return false
  const { iat, nbf, exp } = value as { iat: number; nbf: number; exp: number }
  if (nbf < iat || exp <= nbf || exp - iat > maxTtlSeconds) return false
  if (iat > nowSeconds + clockSkewSeconds || nbf > nowSeconds + clockSkewSeconds) return false
  if (nowSeconds >= exp) return false
  if (!Array.isArray(value.scopes)) return false
  const scopes = value.scopes
  if (scopes.length === 0 || new Set(scopes).size !== scopes.length) return false
  return scopes.every(
    (scope): scope is AdminScope =>
      typeof scope === "string" && ADMIN_SCOPES.includes(scope as AdminScope)
  )
}

function isValidIdentity(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value &&
    value.length > 0 && value.length <= MAX_IDENTITY_LENGTH &&
    IDENTITY_PATTERN.test(value)
}

function sign(payload: string, secret: Buffer): Buffer {
  return createHmac("sha256", secret).update(payload).digest()
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}

function decodeJson(value: string): unknown {
  const decoded = decodeBase64Url(value)
  if (!decoded) return null
  try {
    return JSON.parse(decoded.toString("utf8")) as unknown
  } catch {
    return null
  }
}

function decodeBase64Url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    const decoded = Buffer.from(value, "base64url")
    return decoded.toString("base64url") === value ? decoded : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
