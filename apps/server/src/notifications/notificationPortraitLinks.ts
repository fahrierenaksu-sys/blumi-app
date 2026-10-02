import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto"
import { deflateRawSync, inflateRawSync } from "node:zlib"
import { isAcceptedAvatarLoadout, type AvatarLoadout } from "@blumi/contracts"

/**
 * Links to a push sender's chibi picture. The link carries what the picture
 * shows (the avatar loadout and its circle colour) and an expiry, sealed with
 * AES-256-GCM: the token is random-looking (a fresh IV per link), names no
 * user, and cannot be forged or altered. The server stores nothing and can
 * redraw the picture after a restart.
 */
export const NOTIFICATION_PORTRAIT_PATH_PREFIX = "/v1/notification-portraits/"
export const NOTIFICATION_PORTRAIT_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** Upper bound on an accepted token (a loadout seals to far less). */
export const MAX_NOTIFICATION_PORTRAIT_TOKEN_LENGTH = 1024
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/
const IV_BYTES = 12
const TAG_BYTES = 16
const KEY_INFO = "blumi-notification-portrait-link-v1"

export interface NotificationPortraitContent {
  loadout: AvatarLoadout
  background: string
}

export interface NotificationPortraitLinks {
  /** Absolute URL, or undefined when the server has no public origin configured. */
  createUrl(content: NotificationPortraitContent, now: Date): string | undefined
  /** The content of a valid, unexpired token; null for anything else. */
  open(token: string, now: Date): NotificationPortraitContent | null
}

export function createNotificationPortraitLinks(options: {
  /** At least 32 characters. */
  secret: string
  /** `https://host` the phone fetches pictures from. */
  publicOrigin?: string
  ttlMs?: number
}): NotificationPortraitLinks {
  if (options.secret.length < 32) throw new Error("Notification portrait links need a secret of at least 32 characters.")
  const key = Buffer.from(hkdfSync("sha256", options.secret, "blumi", KEY_INFO, 32))
  const ttlMs = options.ttlMs ?? NOTIFICATION_PORTRAIT_LINK_TTL_MS
  const origin = normalizeOrigin(options.publicOrigin)

  return {
    createUrl(content, now) {
      if (!origin) return undefined
      const payload = deflateRawSync(Buffer.from(JSON.stringify({
        l: content.loadout,
        b: content.background,
        e: Math.floor((now.getTime() + ttlMs) / 1000)
      })))
      const iv = randomBytes(IV_BYTES)
      const cipher = createCipheriv("aes-256-gcm", key, iv)
      const sealed = Buffer.concat([iv, cipher.update(payload), cipher.final(), cipher.getAuthTag()])
      return `${origin}${NOTIFICATION_PORTRAIT_PATH_PREFIX}${sealed.toString("base64url")}`
    },
    open(token, now) {
      if (typeof token !== "string" || token.length > MAX_NOTIFICATION_PORTRAIT_TOKEN_LENGTH || !TOKEN_PATTERN.test(token)) return null
      const sealed = Buffer.from(token, "base64url")
      if (sealed.length <= IV_BYTES + TAG_BYTES) return null
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, sealed.subarray(0, IV_BYTES))
        decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES))
        const payload = Buffer.concat([decipher.update(sealed.subarray(IV_BYTES, sealed.length - TAG_BYTES)), decipher.final()])
        const value = JSON.parse(inflateRawSync(payload, { maxOutputLength: 16 * 1024 }).toString("utf8")) as { l?: unknown; b?: unknown; e?: unknown }
        if (typeof value.e !== "number" || value.e * 1000 <= now.getTime()) return null
        if (typeof value.b !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(value.b)) return null
        if (!isAcceptedAvatarLoadout(value.l)) return null
        return { loadout: value.l, background: value.b }
      } catch {
        return null
      }
    }
  }
}

/**
 * Where phones fetch pictures: BLUMI_PUBLIC_API_ORIGIN, else the domain
 * Railway gives the service (RAILWAY_PUBLIC_DOMAIN, set by Railway itself).
 */
export function resolvePublicApiOrigin(env: NodeJS.ProcessEnv): string | undefined {
  const explicit = env.BLUMI_PUBLIC_API_ORIGIN?.trim()
  if (explicit) return normalizeOrigin(explicit)
  const railwayDomain = env.RAILWAY_PUBLIC_DOMAIN?.trim()
  return railwayDomain ? normalizeOrigin(`https://${railwayDomain}`) : undefined
}

function normalizeOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined
  let url: URL
  try { url = new URL(value) } catch { throw new Error("The public API origin must be an absolute URL.") }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("The public API origin must use https.")
  }
  return url.origin
}
