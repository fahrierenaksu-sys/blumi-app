import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import sharp, { type OverlayOptions } from "sharp"
import type { AvatarLoadout } from "@blumi/contracts"

/**
 * Small pictures of a user's current chibi (head and shoulders on their avatar
 * circle colour), drawn from the app's own layered runtime PNGs in the app's
 * layer order. Used as the sender picture of chat and room invite pushes.
 * Nothing is stored: a portrait is rendered on demand and kept in a small
 * in-memory cache keyed by what it shows.
 */
export const AVATAR_PORTRAIT_RENDERER_VERSION = "avatar-portrait-v1"
/** Output edge in pixels (square PNG; iOS draws it as a circle). */
export const AVATAR_PORTRAIT_SIZE = 192

/** The shared rig canvas every room avatar layer is authored on. */
const LAYER_CANVAS_WIDTH = 256
const LAYER_CANVAS_HEIGHT = 384
/**
 * Head-and-shoulders window on the rig canvas: the head and the top of the
 * outfit, centred on the body's centre line.
 */
const PORTRAIT_WINDOW = { left: 36, top: 78, size: 184 } as const
const DEFAULT_CACHE_BYTES = 8 * 1024 * 1024

/** One still layer from the app's resolver (apps/mobile/.../avatarPortraitLayers.ts). */
export interface AvatarPortraitStillLayer {
  type: string
  source: unknown
  crop?: {
    canvasWidth: number
    canvasHeight: number
    x: number
    y: number
    width: number
    height: number
    atlasX: number
    atlasY: number
  }
}

export interface AvatarPortraitLayerSource {
  resolveAvatarPortraitStillLayers(loadout: AvatarLoadout): AvatarPortraitStillLayer[]
  resolveAvatarPortraitBackground(seed: string): string
}

export interface AvatarPortrait {
  body: Buffer
  mimeType: "image/png"
}

export interface AvatarPortraitRenderer {
  /** The circle colour the app shows behind this person's chibi. */
  backgroundFor(seed: string): string
  render(input: { loadout: AvatarLoadout; background: string }): Promise<AvatarPortrait>
}

const repositoryRoot = resolve(__dirname, "../../../..")
/** Written by scripts/build-avatar-portrait-layers.mjs as part of the server build. */
export const BUNDLED_PORTRAIT_LAYERS_PATH = resolve(__dirname, "../../dist/generated/avatarPortraitLayers.cjs")

/**
 * The app's portrait layer resolver, bundled at build time. Null when the
 * bundle is missing (a dev server started without a build): pushes then go
 * out without a picture.
 */
export function loadBundledAvatarPortraitLayers(path = BUNDLED_PORTRAIT_LAYERS_PATH): AvatarPortraitLayerSource | null {
  if (!existsSync(path)) return null
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loaded = require(path) as Partial<AvatarPortraitLayerSource>
  return typeof loaded.resolveAvatarPortraitStillLayers === "function" &&
    typeof loaded.resolveAvatarPortraitBackground === "function"
    ? loaded as AvatarPortraitLayerSource
    : null
}

export function createAvatarPortraitRenderer(options: {
  layers: AvatarPortraitLayerSource
  /** Root that layer `source` paths are relative to (the repository). */
  assetRoot?: string
  maxCacheBytes?: number
}): AvatarPortraitRenderer {
  const assetRoot = options.assetRoot ?? repositoryRoot
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

  const assetPath = (source: unknown): string => {
    if (typeof source !== "string" || source.length === 0) {
      throw new Error("Avatar portrait layer has no image file.")
    }
    const path = resolve(assetRoot, source)
    if (!path.startsWith(assetRoot)) throw new Error("Avatar portrait layer is outside the asset root.")
    return path
  }

  return {
    backgroundFor(seed) {
      return options.layers.resolveAvatarPortraitBackground(seed)
    },
    async render({ loadout, background }) {
      if (!/^#[0-9A-Fa-f]{6}$/.test(background)) throw new Error("Avatar portrait background is invalid.")
      const layers = options.layers.resolveAvatarPortraitStillLayers(loadout)
      const key = createHash("sha256")
        .update(JSON.stringify([AVATAR_PORTRAIT_RENDERER_VERSION, background.toUpperCase(), layers]))
        .digest("hex")
      const cached = cache.get(key)
      if (cached) {
        // Refresh recency: Map iteration order is insertion order.
        cache.delete(key)
        cache.set(key, cached)
        return { body: cached, mimeType: "image/png" }
      }
      let pending = inFlight.get(key)
      if (!pending) {
        pending = drawPortrait(layers.map((layer) => ({ ...layer, path: assetPath(layer.source) })), background)
          .finally(() => inFlight.delete(key))
        inFlight.set(key, pending)
      }
      const body = await pending
      if (!cache.has(key)) remember(key, body)
      return { body, mimeType: "image/png" }
    }
  }
}

async function drawPortrait(
  layers: Array<AvatarPortraitStillLayer & { path: string }>,
  background: string
): Promise<Buffer> {
  const composites: OverlayOptions[] = []
  for (const layer of layers) {
    composites.push({ input: await layerOnRigCanvas(layer), left: 0, top: 0 })
  }
  const figure = await sharp({
    create: { width: LAYER_CANVAS_WIDTH, height: LAYER_CANVAS_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite(composites).png().toBuffer()
  const head = await sharp(figure)
    .extract({ left: PORTRAIT_WINDOW.left, top: PORTRAIT_WINDOW.top, width: PORTRAIT_WINDOW.size, height: PORTRAIT_WINDOW.size })
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

/** One layer as a full rig-canvas image, whether it is a file or an atlas crop. */
async function layerOnRigCanvas(layer: AvatarPortraitStillLayer & { path: string }): Promise<Buffer> {
  const crop = layer.crop
  if (!crop) {
    return sharp(layer.path)
      .resize(LAYER_CANVAS_WIDTH, LAYER_CANVAS_HEIGHT, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .png()
      .toBuffer()
  }
  const piece = await sharp(layer.path)
    .extract({ left: crop.atlasX, top: crop.atlasY, width: crop.width, height: crop.height })
    .ensureAlpha()
    .png()
    .toBuffer()
  const frame = await sharp({
    create: { width: crop.canvasWidth, height: crop.canvasHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite([{ input: piece, left: crop.x, top: crop.y }]).png().toBuffer()
  return sharp(frame)
    .resize(LAYER_CANVAS_WIDTH, LAYER_CANVAS_HEIGHT, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
}
