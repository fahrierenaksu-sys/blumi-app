import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import sharp, { type OverlayOptions } from "sharp"
import type { AvatarLoadout } from "@blumi/contracts"
import {
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  pickAvatarSwatch,
  resolveAvatarStillLayers,
  type AvatarStillResolved,
  type AvatarStillRigId
} from "@blumi/domain"
import { resolveRoomArtPackDir } from "../rooms/roomSnapshotRenderer"
import { drawFallbackPortrait } from "./avatarPortraitFallback"

/**
 * Small pictures of a user's current 2.5D chibi (the baked head-and-shoulders still on their avatar circle colour),
 * drawn from the server's art pack (`dist/art/avatar/<rig>/bust`, written by scripts/build-art-pack.mjs) with the
 * same layer resolver the app uses. Used as the sender picture of chat and room invite pushes. Nothing is stored:
 * a portrait is rendered on demand and kept in a small in-memory cache keyed by what it shows.
 */
export const AVATAR_PORTRAIT_RENDERER_VERSION = "avatar-portrait-v2"
/** Output edge in pixels (square PNG; iOS draws it as a circle). */
export const AVATAR_PORTRAIT_SIZE = 192

const DEFAULT_CACHE_BYTES = 8 * 1024 * 1024
const HEX_COLOUR = /^#[0-9A-Fa-f]{6}$/
const STARTER_LOADOUTS: Readonly<Record<AvatarStillRigId, unknown>> = {
  female: DEFAULT_FEMALE_AVATAR_LOADOUT,
  male: DEFAULT_MALE_AVATAR_LOADOUT
}

/** Which level of the chain drew the picture: the person's look, their body's starter, or the fixed bust. */
export type AvatarPortraitLevel = "look" | "starter" | "fixed"

export interface AvatarPortrait {
  body: Buffer
  mimeType: "image/png"
  level: AvatarPortraitLevel
}

export interface AvatarPortraitRenderer {
  /** The circle colour the app shows behind this person's chibi. */
  backgroundFor(seed: string): string
  render(input: { loadout: AvatarLoadout; background: string }): Promise<AvatarPortrait>
}

/**
 * The art pack files the portrait can name, or null when the pack has no avatar layers (a server never built) or its
 * manifest cannot be read. Never throws, so a damaged pack cannot stop the server from starting.
 */
export function loadAvatarPortraitArt(dir = resolveRoomArtPackDir()): { dir: string; files: ReadonlySet<string> } | null {
  try {
    const manifestPath = join(dir, "manifest.json")
    if (!existsSync(manifestPath)) return null
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { files?: Record<string, string> }
    const files = new Set(Object.keys(manifest.files ?? {}).filter((path) => path.startsWith("avatar/")))
    return files.size > 0 ? { dir, files } : null
  } catch {
    return null
  }
}

export function createAvatarPortraitRenderer(options: {
  /** Null when the server has no art pack: every picture is then the fixed bust of the body. */
  art: { dir: string; files: ReadonlySet<string> } | null
  maxCacheBytes?: number
}): AvatarPortraitRenderer {
  const { art } = options
  const maxCacheBytes = options.maxCacheBytes ?? DEFAULT_CACHE_BYTES
  const cache = new Map<string, Buffer>()
  let cachedBytes = 0
  const inFlight = new Map<string, Promise<Buffer>>()

  const remember = (key: string, body: Buffer) => {
    if (body.length > maxCacheBytes) return
    cache.set(key, body)
    cachedBytes += body.length
    for (const [oldestKey, oldest] of cache) {
      if (cachedBytes <= maxCacheBytes) break
      cache.delete(oldestKey)
      cachedBytes -= oldest.length
    }
  }

  const drawCached = async (cacheInput: unknown, background: string, draw: () => Promise<Buffer>): Promise<Buffer> => {
    const key = createHash("sha256")
      .update(JSON.stringify([AVATAR_PORTRAIT_RENDERER_VERSION, background.toUpperCase(), AVATAR_PORTRAIT_SIZE, cacheInput]))
      .digest("hex")
    const cached = cache.get(key)
    if (cached) {
      // Refresh recency: Map iteration order is insertion order.
      cache.delete(key)
      cache.set(key, cached)
      return cached
    }
    let pending = inFlight.get(key)
    if (!pending) {
      pending = draw().finally(() => inFlight.delete(key))
      inFlight.set(key, pending)
    }
    const body = await pending
    if (!cache.has(key)) remember(key, body)
    return body
  }

  return {
    backgroundFor(seed) {
      return pickAvatarSwatch(seed).bg
    },
    async render({ loadout, background }) {
      if (!HEX_COLOUR.test(background)) throw new Error("Avatar portrait background is invalid.")
      // Total: the loadout is coerced and unknown items draw as the body's starter pieces. A valid link never fails
      // for an art reason: look, then that body's starter, then the fixed bust of the body.
      const still = resolveAvatarStillLayers(loadout, "bust")
      const starter = resolveAvatarStillLayers(STARTER_LOADOUTS[still.rig], "bust")
      const attempts: readonly (readonly [AvatarPortraitLevel, AvatarStillResolved])[] = [["look", still], ["starter", starter]]
      if (art) {
        for (const [level, attempt] of attempts) {
          try {
            return { body: await drawCached(attempt.layers, background, () => drawPortrait(art, attempt, background)), mimeType: "image/png", level }
          } catch {
            // Try the next level; nothing about the look is logged.
          }
        }
      }
      const body = await drawCached(["fixed", still.rig], background, () => drawFallbackPortrait(still.rig, background, AVATAR_PORTRAIT_SIZE))
      return { body, mimeType: "image/png", level: "fixed" }
    }
  }
}

async function drawPortrait(
  art: { dir: string; files: ReadonlySet<string> },
  still: AvatarStillResolved,
  background: string
): Promise<Buffer> {
  if (still.layers.length === 0) throw new Error("Avatar portrait has no layers.")
  const composites: OverlayOptions[] = still.layers.map(({ asset, rect }) => {
    const path = `avatar/${asset}.webp`
    if (!art.files.has(path)) throw new Error("Avatar portrait layer is missing from the art pack.")
    return { input: join(art.dir, path), left: rect[0], top: rect[1] }
  })
  const figure = await sharp({
    create: { width: still.space.width, height: still.space.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite(composites).png().toBuffer()
  const head = await sharp(figure)
    .resize(AVATAR_PORTRAIT_SIZE, AVATAR_PORTRAIT_SIZE, { kernel: "lanczos3" })
    .png()
    .toBuffer()
  return sharp({
    create: { width: AVATAR_PORTRAIT_SIZE, height: AVATAR_PORTRAIT_SIZE, channels: 3, background }
  })
    .composite([{ input: head, left: 0, top: 0 }])
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toBuffer()
}

let selfCheckState: "unchecked" | "ok" | "failed" = "unchecked"

/** The last start-up self-check result, for the health detail. */
export function getAvatarPortraitSelfCheckState(): "unchecked" | "ok" | "failed" {
  return selfCheckState
}

/**
 * Start-up self-check: renders both default portraits once. Never throws; the result names only the error class, so
 * it can be logged and shown in the health detail without any user or loadout value.
 */
export async function checkAvatarPortraitRenderer(
  rendererOrDefault?: AvatarPortraitRenderer | null
): Promise<{ ok: true } | { ok: false; errorType: string }> {
  try {
    // Built inside the try: whatever goes wrong while building it is a failed check, not a start-up crash.
    const renderer = rendererOrDefault === undefined ? createDefaultAvatarPortraitRenderer() : rendererOrDefault
    if (!renderer) throw Object.assign(new Error("Avatar portrait art pack is missing."), { name: "MissingArtPack" })
    for (const loadout of Object.values(STARTER_LOADOUTS)) {
      const result = await renderer.render({ loadout: loadout as AvatarLoadout, background: "#FFFFFF" })
      if (result.body.length === 0) throw Object.assign(new Error("Empty portrait."), { name: "EmptyImage" })
      // Pictures still go out from the fixed bust, but a default look that needs it means the art pack is not usable.
      if (result.level !== "look") throw Object.assign(new Error("Default portrait used a fallback."), { name: "FallbackPortrait" })
    }
    selfCheckState = "ok"
    return { ok: true }
  } catch (error) {
    selfCheckState = "failed"
    return { ok: false, errorType: error instanceof Error ? error.name : typeof error }
  }
}

/** The renderer over the built art pack; without the pack it draws only the fixed busts, so pictures never stop. */
export function createDefaultAvatarPortraitRenderer(): AvatarPortraitRenderer {
  return createAvatarPortraitRenderer({ art: loadAvatarPortraitArt() })
}
