/**
 * Lossless packing of the 2.5D avatar ASTC blobs on disk (pure logic: no react-native imports, so Node tests run it).
 *
 * A baked ASTC 4x4 blob is mostly one repeated 16-byte block: the transparent "void extent" block around the art
 * (84-89% of every blob on 2026-10-14). The packed file stores that block once plus only the other blocks, so the app
 * ships about a sixth of the bytes and rebuilds the exact blob before the GPU upload. Written by
 * tools/avatar25d/compress_pages.py; avatar25Astc.test.ts proves each decoded blob hashes to the manifest's sha256.
 *
 * Layout (little-endian):
 *   magic "BSA1" | u32 blobBytes | u32 runCount | fill block (16 bytes)
 *   runCount x (u32 firstBlock, u32 blockCount)   ascending, non-overlapping runs of blocks that differ from the fill
 *   the blocks of every run, back to back
 */

export const AVATAR25_PACKED_ASTC_ENCODING = "sparse-astc-v1"

const MAGIC = [0x42, 0x53, 0x41, 0x31] // "BSA1"
const BLOCK_BYTES = 16
const HEADER_BYTES = 4 + 4 + 4 + BLOCK_BYTES
const RUN_BYTES = 8

function fail(reason: string): never {
  throw new Error(`Packed ASTC blob is corrupt: ${reason}`)
}

/** Fills `out` with one repeated block in log2(n) native copies. */
function fillWithBlock(out: Uint8Array, block: Uint8Array): void {
  if (out.length === 0) return
  out.set(block, 0)
  let filled = BLOCK_BYTES
  while (filled < out.length) {
    const length = Math.min(filled, out.length - filled)
    out.copyWithin(filled, 0, length)
    filled += length
  }
}

interface PackedHeader {
  blobBytes: number
  runCount: number
  fill: Uint8Array
}

function readHeader(bytes: Uint8Array, view: DataView): PackedHeader {
  if (bytes.length < HEADER_BYTES) fail("shorter than its header")
  if (MAGIC.some((value, index) => bytes[index] !== value)) fail("wrong magic")
  const blobBytes = view.getUint32(4, true)
  const runCount = view.getUint32(8, true)
  if (blobBytes % BLOCK_BYTES !== 0) fail(`blob size ${blobBytes} is not whole blocks`)
  return { blobBytes, runCount, fill: bytes.subarray(12, HEADER_BYTES) }
}

/** Rebuilds the exact ASTC blob from a packed file. Throws on any structural inconsistency. */
export function decodeAvatar25PackedAstc(packed: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(packed)
  const view = new DataView(packed)
  const { blobBytes, runCount, fill } = readHeader(bytes, view)
  const blockCount = blobBytes / BLOCK_BYTES
  const payloadStart = HEADER_BYTES + runCount * RUN_BYTES
  if (payloadStart > bytes.length) fail("run table runs past the end")

  const out = new Uint8Array(blobBytes)
  fillWithBlock(out, fill)
  let payload = payloadStart
  let nextFreeBlock = 0
  for (let run = 0; run < runCount; run += 1) {
    const at = HEADER_BYTES + run * RUN_BYTES
    const first = view.getUint32(at, true)
    const count = view.getUint32(at + 4, true)
    if (count === 0 || first < nextFreeBlock || first + count > blockCount) fail(`run ${run} is out of order or out of range`)
    const length = count * BLOCK_BYTES
    if (payload + length > bytes.length) fail(`run ${run} has no bytes`)
    out.set(bytes.subarray(payload, payload + length), first * BLOCK_BYTES)
    payload += length
    nextFreeBlock = first + count
  }
  if (payload !== bytes.length) fail(`${bytes.length - payload} trailing bytes`)
  return out.buffer
}
