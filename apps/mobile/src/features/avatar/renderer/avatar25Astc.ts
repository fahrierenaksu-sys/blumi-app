/**
 * GPU texture compression for the 2.5D avatar pages (ASTC 4x4), pure logic: no react-native imports, so Node tests run it.
 *
 * The blobs are DERIVED from the approved PNG pages by tools/avatar25d/compress_pages.py (`export_rig.py --astc`)
 * and listed in <rig>/astc/manifest.json with their own sha256 and the sha256 of every source PNG. The feature is ON
 * (owner decision 2026-10-10, a code constant). It is used only where the GPU has `texture-compression-astc` and a blob
 * matching the page set exists; anything else keeps the PNG path untouched.
 */

export const AVATAR25_ASTC_FEATURE = "texture-compression-astc"
export const AVATAR25_ASTC_FORMAT = "astc-4x4-unorm"
const ASTC_BLOCK_BYTES = 16
const ASTC_BLOCK_SIZE = 4

export interface Avatar25AstcLevel { w: number; h: number; bw: number; bh: number }
/** The packed file on disk (avatar25PackedAstc.ts); it decodes to the blob that `sha256` and `fileBytes` describe. */
export interface Avatar25AstcPacking { encoding: string; bytes: number; sha256: string }
export interface Avatar25AstcSet {
  /** The bundled file: a packed blob. */
  file: string
  /** sha256 and size of the decoded ASTC blob, the bytes the GPU receives. */
  sha256: string
  fileBytes: number
  packed: Avatar25AstcPacking
  gpuBytes: number
  width: number
  height: number
  layers: number
  levels: Avatar25AstcLevel[]
  /** The PNG pages (array layers, in order) this blob was derived from. */
  pages: string[]
  sourceSha256: Record<string, string>
}
export interface Avatar25AstcManifest {
  version: number
  format: string
  block: [number, number]
  premultiplied: boolean
  preset: string
  encoder: { name: string; version: string }
  sets: Record<string, Avatar25AstcSet>
}
/** What a rig offers the renderer: its manifest and a reader that returns a set's decoded ASTC blob. */
export interface Avatar25AstcSource {
  manifest: Avatar25AstcManifest
  readBlob: (file: string) => Promise<ArrayBuffer>
}

/**
 * Compressed pages are a code constant (plan §3.6 D6): on, with the PNG pages as the fallback wherever the GPU lacks
 * `texture-compression-astc` or no blob covers a page set. No build flag, no runtime switch.
 */
export const AVATAR25_ASTC_ENABLED = true

/** Whether compressed pages are requested. */
export function isAvatar25AstcRequested(): boolean {
  return AVATAR25_ASTC_ENABLED
}

/** Whether the device must be created with the ASTC feature (only where the adapter has it; see Avatar25Canvas). */
export function shouldRequestAvatar25AstcFeature(): boolean {
  return AVATAR25_ASTC_ENABLED
}

/** `adapter.features` / `device.features` may be a Set-like or any iterable of names. */
export function hasGpuFeature(features: unknown, name: string): boolean {
  if (!features) return false
  const setLike = features as { has?: (n: string) => boolean }
  if (typeof setLike.has === "function") return setLike.has(name) === true
  const iterable = features as Iterable<string>
  if (typeof iterable[Symbol.iterator] === "function") return [...iterable].includes(name)
  return false
}

/**
 * The blob that holds every requested page (same names, any subset of its pages: an avatar loads only the pages its
 * worn items draw), with each page's index inside the blob; or null.
 */
export function findAvatar25AstcSet(
  manifest: Avatar25AstcManifest | undefined,
  pages: string[]
): { set: Avatar25AstcSet; pageIndices: number[] } | null {
  if (!manifest || manifest.format !== AVATAR25_ASTC_FORMAT || pages.length === 0) return null
  for (const set of Object.values(manifest.sets)) {
    const pageIndices = pages.map((name) => set.pages.indexOf(name))
    if (pageIndices.every((index) => index >= 0)) return { set, pageIndices }
  }
  return null
}

export type Avatar25PageSource = { kind: "png" } | { kind: "astc"; set: Avatar25AstcSet; pageIndices: number[] }

/** PNG unless compression is requested AND the GPU supports it AND a matching blob exists. */
export function chooseAvatar25PageSource(input: {
  requested: boolean
  featureAvailable: boolean
  source: Avatar25AstcSource | undefined
  pages: string[]
}): Avatar25PageSource {
  if (!input.requested || !input.featureAvailable) return { kind: "png" }
  const found = findAvatar25AstcSet(input.source?.manifest, input.pages)
  return found ? { kind: "astc", ...found } : { kind: "png" }
}

/** Texture-cache namespace: PNG and ASTC textures of one page set never share an entry. */
export function avatar25PageSourceNamespace(namespace: string, source: Avatar25PageSource): string {
  return source.kind === "astc" ? `${namespace}#astc4x4` : namespace
}

export interface Avatar25AstcUpload {
  mipLevel: number
  /** Array layer of the GPU texture (position among the requested pages). */
  layer: number
  byteOffset: number
  byteLength: number
  bytesPerRow: number
  rowsPerImage: number
  /** Block-aligned copy extent: width, height, 1 layer. */
  extent: [number, number, number]
}

const levelSlabBytes = (level: Avatar25AstcLevel) => level.bw * level.bh * ASTC_BLOCK_BYTES

/**
 * The writeTexture calls for the requested pages: one per (mip, page) with block-aligned rows
 * (bytesPerRow = ceil(w/4) * 16). The blob is mip-major, then page, so a page's slab is at levelStart + page * slab.
 */
export function avatar25AstcUploads(set: Avatar25AstcSet, pageIndices: number[]): Avatar25AstcUpload[] {
  const uploads: Avatar25AstcUpload[] = []
  let levelStart = 0
  set.levels.forEach((level, mipLevel) => {
    const slab = levelSlabBytes(level)
    pageIndices.forEach((pageIndex, layer) => {
      uploads.push({
        mipLevel,
        layer,
        byteOffset: levelStart + pageIndex * slab,
        byteLength: slab,
        bytesPerRow: level.bw * ASTC_BLOCK_BYTES,
        rowsPerImage: level.bh,
        extent: [level.bw * ASTC_BLOCK_SIZE, level.bh * ASTC_BLOCK_SIZE, 1]
      })
    })
    levelStart += set.layers * slab
  })
  return uploads
}

/** GPU bytes of a texture array holding `layerCount` pages of the blob (all mips). */
export function avatar25AstcGpuBytes(set: Avatar25AstcSet, layerCount: number): number {
  return set.levels.reduce((sum, level) => sum + layerCount * levelSlabBytes(level), 0)
}

/** Throws when a blob does not fit its manifest (wrong size or mip chain), so the caller falls back to PNG. */
export function assertAvatar25AstcBlob(set: Avatar25AstcSet, byteLength: number): void {
  const expected = avatar25AstcGpuBytes(set, set.layers)
  if (byteLength !== expected || byteLength !== set.fileBytes || expected !== set.gpuBytes) {
    throw new Error(`ASTC blob size mismatch: ${byteLength} bytes, expected ${expected}`)
  }
  const first = set.levels[0]
  if (!first || first.w !== set.width || first.h !== set.height) throw new Error("ASTC blob mip chain does not start at the page size")
}
