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
  resolveShowcaseLayers,
  type AvatarItemRules,
  type AvatarStillManifest,
  type AvatarStillLayer,
  type AvatarStillRect,
  type AvatarStillRigId
} from "@blumi/domain"
import { resolveRoomArtPackDir } from "../rooms/roomSnapshotRenderer"
import { drawFallbackPortrait } from "./avatarPortraitFallback"

/**
 * Small pictures of a user's current 2.5D chibi on their avatar circle colour, drawn from the server's art pack
 * (`dist/art/avatar/<rig>/{showcase,bust}`, written by scripts/build-art-pack.mjs) with the same layer resolvers the
 * app uses: the front (showcase) figure in the `push` crop when the whole look has front art, otherwise the baked
 * 3/4 head-and-shoulders bust. Used as the sender picture of chat and room invite pushes. Nothing is stored:
 * a portrait is rendered on demand and kept in a small in-memory cache keyed by what it shows.
 */
export const AVATAR_PORTRAIT_RENDERER_VERSION = "avatar-portrait-v3"
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

/** Which art drew it: the front showcase figure, the 3/4 bust still, or the fixed code-drawn bust. */
export type AvatarPortraitView = "showcase" | "bust" | "fixed"

export interface AvatarPortrait {
  body: Buffer
  mimeType: "image/png"
  level: AvatarPortraitLevel
  view: AvatarPortraitView
}

/** One drawable candidate: layers on a canvas, and the window of that canvas that becomes the picture. */
interface PortraitPlan {
  readonly view: "showcase" | "bust"
  readonly layers: readonly AvatarStillLayer[]
  readonly space: { readonly width: number; readonly height: number }
  readonly window: AvatarStillRect
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
  /** The baked-still manifest that names the layers of a look; the built one unless a test supplies another. */
  manifest?: AvatarStillManifest
  /** The item facts a loadout is coerced with; the live catalog unless a test injects its fixture. */
  avatarRules?: AvatarItemRules
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
      // for an art reason: the look (front figure, then 3/4 bust), then that body's starter the same way, then the
      // fixed bust of the body.
      const { rig, plans: lookPlans } = portraitPlans(loadout, options.manifest, options.avatarRules)
      const attempts: readonly (readonly [AvatarPortraitLevel, PortraitPlan])[] = [
        ...lookPlans.map((plan) => ["look", plan] as const),
        ...portraitPlans(STARTER_LOADOUTS[rig], options.manifest, options.avatarRules).plans.map((plan) => ["starter", plan] as const)
      ]
      if (art) {
        for (const [level, plan] of attempts) {
          try {
            const body = await drawCached([plan.view, plan.layers, plan.window], background, () => drawPortrait(art, plan, background))
            return { body, mimeType: "image/png", level, view: plan.view }
          } catch {
            // Try the next candidate; nothing about the look is logged.
          }
        }
      }
      const body = await drawCached(["fixed", rig], background, () => drawFallbackPortrait(rig, background, AVATAR_PORTRAIT_SIZE))
      return { body, mimeType: "image/png", level: "fixed", view: "fixed" }
    }
  }
}

/**
 * The candidates for one loadout, best first: the front figure in the `push` crop when the whole look has front art,
 * then the 3/4 bust of the same look (the resolver's fallback is the whole 3/4 figure, never a mix).
 */
function portraitPlans(
  loadout: unknown,
  manifest: AvatarStillManifest | undefined,
  rules: AvatarItemRules | undefined
): { readonly rig: AvatarStillRigId; readonly plans: readonly PortraitPlan[] } {
  const bust = resolveAvatarStillLayers(loadout, "bust", { manifest, rules })
  const bustPlan: PortraitPlan = {
    view: "bust",
    layers: bust.layers,
    space: bust.space,
    window: [0, 0, bust.space.width, bust.space.height]
  }
  const front = resolveShowcaseLayers(loadout, "push", manifest, {}, rules)
  if (front.kind === "fallback" || !isWindowInside(front.windows?.push, front.space)) return { rig: bust.rig, plans: [bustPlan] }
  return { rig: bust.rig, plans: [{ view: "showcase", layers: front.layers, space: front.space, window: front.windows.push }, bustPlan] }
}

/** Whether the manifest has front art for the whole of this look (so its push picture must be the front figure). */
function hasFrontArt(
  loadout: unknown,
  manifest: AvatarStillManifest | undefined,
  rules: AvatarItemRules | undefined
): boolean {
  return resolveShowcaseLayers(loadout, "push", manifest, {}, rules).kind === "showcase"
}

/** A crop window must be four finite numbers inside the canvas; a malformed front base falls back to the next source. */
function isWindowInside(
  window: readonly number[] | undefined,
  space: { readonly width: number; readonly height: number }
): window is readonly [number, number, number, number] {
  if (!Array.isArray(window) || window.length !== 4 || !window.every((value) => Number.isFinite(value))) return false
  const [x, y, width, height] = window as readonly number[]
  return width! > 0 && height! > 0 && x! >= 0 && y! >= 0 && x! + width! <= space.width && y! + height! <= space.height
}

async function drawPortrait(
  art: { dir: string; files: ReadonlySet<string> },
  plan: PortraitPlan,
  background: string
): Promise<Buffer> {
  if (plan.layers.length === 0) throw new Error("Avatar portrait has no layers.")
  const composites: OverlayOptions[] = await Promise.all(plan.layers.map(async ({ asset, rect, source }) => {
    const path = `avatar/${asset}.webp`
    if (!art.files.has(path)) throw new Error("Avatar portrait layer is missing from the art pack.")
    // a part of a shared sheet (a composed leg): cut it out, then place it like any layer
    const input = source
      ? await sharp(join(art.dir, path)).extract({ left: source.rect[0], top: source.rect[1], width: source.rect[2], height: source.rect[3] }).toBuffer()
      : join(art.dir, path)
    return { input, left: rect[0], top: rect[1] }
  }))
  const figure = await sharp({
    create: { width: plan.space.width, height: plan.space.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite(composites).png().toBuffer()
  const [left, top, width, height] = plan.window
  const head = await sharp(figure)
    .extract({ left, top, width, height })
    .resize(AVATAR_PORTRAIT_SIZE, AVATAR_PORTRAIT_SIZE, { kernel: "lanczos3", fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  return sharp({
    create: { width: AVATAR_PORTRAIT_SIZE, height: AVATAR_PORTRAIT_SIZE, channels: 3, background }
  })
    .composite([{ input: head, left: 0, top: 0 }])
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toBuffer()
}

/**
 * A short content hash of the avatar art in the pack (the manifest's avatar entries, sorted), so /ready can show
 * which art a running server draws pushes from. Null when the pack has no avatar art. Contains no IDs or user data.
 */
export function computeAvatarArtPackHash(dir = resolveRoomArtPackDir()): string | null {
  try {
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { files?: Record<string, unknown> }
    const entries = Object.entries(manifest.files ?? {})
      .filter(([path]) => path.startsWith("avatar/"))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    if (entries.length === 0) return null
    return createHash("sha256").update(JSON.stringify(entries)).digest("hex").slice(0, 16)
  } catch {
    return null
  }
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
  rendererOrDefault?: AvatarPortraitRenderer | null,
  options: { readonly manifest?: AvatarStillManifest } = {}
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
      // A default look the manifest has front art for must draw the front figure: a stale pack would otherwise send the
      // 3/4 bust while the app shows the front one, with /ready still green.
      if (hasFrontArt(loadout, options.manifest, undefined) && result.view !== "showcase") {
        throw Object.assign(new Error("Default portrait is not the front figure."), { name: "MissingFrontArt" })
      }
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
