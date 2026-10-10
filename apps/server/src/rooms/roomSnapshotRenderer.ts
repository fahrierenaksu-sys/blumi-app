import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import sharp, { type OverlayOptions } from "sharp"
import type { PersonalRoomDecor } from "./personalRoomDecorRepository"

/** v2 draws the calibrated 2.5D room from the server art pack; rows of any other version are hidden (service). */
export const ROOM_SNAPSHOT_RENDERER_VERSION = "room-snapshot-v2"
export const ROOM_SNAPSHOT_WIDTH = 600
export const ROOM_SNAPSHOT_HEIGHT = 342

export interface RoomSnapshotRenderResult {
  body: Buffer
  mimeType: "image/webp"
  rendererVersion: string
}

export interface RoomSnapshotRenderer {
  /** The version this renderer writes; snapshots of another version are never served. */
  readonly version?: string
  render(input: {
    decor: PersonalRoomDecor
    roomRevision: number
  }): Promise<RoomSnapshotRenderResult>
}

interface RoomDrawOp { path: string; left: number; top: number; width: number; height: number }
interface RoomDrawListModule {
  resolveRoomDrawList(
    placedItems: PersonalRoomDecor["placedItems"],
    hasFile: (path: string) => boolean
  ): { canvas: { width: number; height: number }; shellPath: string; ops: RoomDrawOp[]; skipped: number }
}
interface RoomArtPack {
  dir: string
  files: Readonly<Record<string, string>>
  drawList: RoomDrawListModule
}

/**
 * `dist/art`, written by `scripts/build-art-pack.mjs` in the server build: next to the compiled `rooms/` folder, or
 * the built pack when the server runs from source (`node --import tsx src/index.ts`, build the pack first).
 */
export function resolveRoomArtPackDir(): string {
  const candidates = [resolve(__dirname, "../art"), resolve(__dirname, "../../dist/art")]
  return candidates.find((dir) => existsSync(join(dir, "manifest.json"))) ?? candidates[0]!
}

export function loadRoomArtPack(dir = resolveRoomArtPackDir()): RoomArtPack {
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { files?: Record<string, string> }
  if (!manifest.files || typeof manifest.files !== "object") throw new Error("Room art pack manifest is invalid.")
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the bundled resolver is plain CommonJS
  const drawList = require(join(dir, "roomDrawList.cjs")) as RoomDrawListModule
  return { dir, files: manifest.files, drawList }
}

export function createRoomSnapshotRenderer(options: { artDir?: string } = {}): RoomSnapshotRenderer {
  let pack: RoomArtPack | null = null
  const getPack = () => (pack ??= loadRoomArtPack(options.artDir))
  return {
    version: ROOM_SNAPSHOT_RENDERER_VERSION,
    async render({ decor }) {
      const art = getPack()
      const list = art.drawList.resolveRoomDrawList(decor.placedItems, (path) => path in art.files)
      const scaleX = ROOM_SNAPSHOT_WIDTH / list.canvas.width
      const scaleY = ROOM_SNAPSHOT_HEIGHT / list.canvas.height
      const shell = await sharp(join(art.dir, list.shellPath))
        .resize(ROOM_SNAPSHOT_WIDTH, ROOM_SNAPSHOT_HEIGHT, { fit: "fill" })
        .ensureAlpha()
        .png()
        .toBuffer()
      const composites: OverlayOptions[] = []
      for (const drawOp of list.ops) {
        const overlay = await renderClippedLayer(join(art.dir, drawOp.path), {
          left: Math.round(drawOp.left * scaleX),
          top: Math.round(drawOp.top * scaleY),
          width: Math.max(1, Math.round(drawOp.width * scaleX)),
          height: Math.max(1, Math.round(drawOp.height * scaleY))
        })
        if (overlay) composites.push(overlay)
      }
      return {
        body: await sharp(shell).composite(composites).webp({ quality: 86 }).toBuffer(),
        mimeType: "image/webp",
        rendererVersion: ROOM_SNAPSHOT_RENDERER_VERSION
      }
    }
  }
}

/** One layer resized to its rect and cut to the picture (sharp refuses overlays that leave the base image). */
async function renderClippedLayer(
  path: string,
  rect: { left: number; top: number; width: number; height: number }
): Promise<OverlayOptions | null> {
  const x0 = Math.max(0, rect.left)
  const y0 = Math.max(0, rect.top)
  const x1 = Math.min(ROOM_SNAPSHOT_WIDTH, rect.left + rect.width)
  const y1 = Math.min(ROOM_SNAPSHOT_HEIGHT, rect.top + rect.height)
  if (x1 <= x0 || y1 <= y0) return null
  let image = sharp(path).resize(rect.width, rect.height, { fit: "fill" })
  if (x0 !== rect.left || y0 !== rect.top || x1 - x0 !== rect.width || y1 - y0 !== rect.height) {
    image = sharp(await image.png().toBuffer()).extract({
      left: x0 - rect.left,
      top: y0 - rect.top,
      width: x1 - x0,
      height: y1 - y0
    })
  }
  return { input: await image.png().toBuffer(), left: x0, top: y0 }
}

let selfCheckState: "unchecked" | "ok" | "failed" = "unchecked"

/** The last start-up self-check result, for the health detail. */
export function getRoomSnapshotSelfCheckState(): "unchecked" | "ok" | "failed" {
  return selfCheckState
}

/**
 * Start-up self-check: renders the default (empty) room once. Never throws; the result names only the error class,
 * so it can be logged and shown in the health detail without any user, room or item value.
 */
export async function checkRoomSnapshotRenderer(
  renderer: RoomSnapshotRenderer = createRoomSnapshotRenderer()
): Promise<{ ok: true } | { ok: false; errorType: string }> {
  try {
    const result = await renderer.render({
      decor: { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] },
      roomRevision: 0
    })
    selfCheckState = result.body.length > 0 ? "ok" : "failed"
    return result.body.length > 0 ? { ok: true } : { ok: false, errorType: "EmptyImage" }
  } catch (error) {
    selfCheckState = "failed"
    return { ok: false, errorType: error instanceof Error ? error.name : typeof error }
  }
}

export function createRoomSnapshotAssetKey(
  userId: string,
  roomRevision: number,
  rendererVersion = ROOM_SNAPSHOT_RENDERER_VERSION
): string {
  return createHash("sha256")
    .update(`${rendererVersion}:${userId}:${roomRevision}`)
    .digest("hex")
}
