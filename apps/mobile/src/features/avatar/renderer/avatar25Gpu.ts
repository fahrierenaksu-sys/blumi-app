/**
 * WebGPU renderer for the 2.5D avatar (react-native-webgpu / Dawn → Metal). GPU skinning: each vertex carries
 * 4 slot indices + weights; the per-avatar uniform holds the slot palette (2×3 affines) written every frame.
 * One avatar = one vertex buffer, one index buffer (a painter's-order range per pose / walk frame) and one
 * texture array (page 0 body, then item pages), so it draws with ONE drawIndexed call.
 * Textures are premultiplied on upload and fully mip-mapped; 4× MSAA with a per-sample alpha test (lab: alphaTest 0.5).
 * Imports react-native-webgpu: only Avatar25Canvas uses it (pure modules never import this file).
 */
import { GPUBufferUsage, GPUTextureUsage } from "react-native-webgpu"
import type { Avatar25ViewName, Rig25 } from "./rigTypes"
import { AVATAR25_VERTEX_STRIDE, compileAvatar, PALETTE_STRIDE, type CompiledAvatar } from "./avatar25Pose"
import { AVATAR25_BLINK_ITEMS, AVATAR25_BLINK_UNIFORM_FLOATS } from "./avatar25Life"
import {
  assertAvatar25AstcBlob,
  AVATAR25_ASTC_FEATURE,
  avatar25AstcGpuBytes,
  avatar25AstcUploads,
  avatar25PageSourceNamespace,
  chooseAvatar25PageSource,
  hasGpuFeature,
  isAvatar25AstcRequested,
  type Avatar25AstcSet,
  type Avatar25AstcSource,
  type Avatar25PageSource
} from "./avatar25Astc"

export const AVATAR25_SAMPLE_COUNT = 4
const MAX_SLOTS = 32
/** Where the blink block (avatar25Life.ts `writeAvatar25BlinkUniform`) and the palette start in the uniform. */
export const AVATAR25_UNIFORM_BLINK_OFFSET = 8
export const AVATAR25_UNIFORM_PALETTE_OFFSET = AVATAR25_UNIFORM_BLINK_OFFSET + AVATAR25_BLINK_UNIFORM_FLOATS
/** xform (vec4) + ground.xy / clip.zw (vec4) + blink block (head rect, head offset / on, 2 × item rect + item offset / page / on: 6 vec4) + palette (MAX_SLOTS × 2 vec4). */
export const AVATAR25_UNIFORM_FLOATS = AVATAR25_UNIFORM_PALETTE_OFFSET + MAX_SLOTS * PALETTE_STRIDE

// the WGSL struct below holds exactly this many item patches (blinkItemRect0/1): a change fails to type-check here
const SHADER_BLINK_ITEMS: typeof AVATAR25_BLINK_ITEMS = 2
void SHADER_BLINK_ITEMS

const SHADER = /* wgsl */ `
struct U {
  xform: vec4f,   // clip = bill * xform.xy + xform.zw
  ground: vec4f,  // xy: sheet ground point; z/w: near/far folded-arm clip line (bill px y), -1e9 = off
  blinkRect: vec4f,  // page-0 uv of the eye rect a blink frame replaces: xy min, zw max
  blink: vec4f,      // xy: uv offset to the blink frame shown; z: 1 while one shows, 0 = eyes open (nothing changes)
  // worn items (hair) holding their own copy of the open eyes: rect (uv) and (offset.xy, page, on), see avatar25Life.ts
  blinkItemRect0: vec4f,
  blinkItem0: vec4f,
  blinkItemRect1: vec4f,
  blinkItem1: vec4f,
  palette: array<vec4f, ${MAX_SLOTS * 2}>,
};
@group(0) @binding(0) var<uniform> u: U;
@group(1) @binding(0) var tex: texture_2d_array<f32>;
@group(1) @binding(1) var samp: sampler;

struct VOut {
  @builtin(position) pos: vec4f,
  // per-sample interpolation: the fragment shader runs once per MSAA sample, so the alpha test below is
  // supersampled (smooth silhouettes, 4 levels) instead of one jagged cut per pixel
  @location(0) @interpolate(perspective, sample) uv: vec2f,
  @location(1) @interpolate(perspective, sample) billY: f32,
  @location(2) @interpolate(flat) page: u32,
  @location(3) @interpolate(flat) arm: u32,
  // a composed leg (avatar25Pose legPlan): the shoes' leg drawing at the same vertex gates this fragment
  @location(4) @interpolate(perspective, sample) maskUv: vec2f,
  @location(5) @interpolate(flat) maskPage: u32,
  @location(6) @interpolate(flat) masked: u32,
};

fn skin(i: u32, p: vec2f) -> vec2f {
  let r0 = u.palette[i * 2u];
  let r1 = u.palette[i * 2u + 1u];
  return vec2f(r0.x * p.x + r0.y * p.y + r0.z, r1.x * p.x + r1.y * p.y + r1.z);
}

@vertex fn vs(
  @location(0) pos: vec2f, @location(1) uv: vec2f, @location(2) j: vec4u, @location(3) w: vec4f, @location(4) extra: vec4u,
  @location(5) maskUv: vec2f
) -> VOut {
  let p = vec2f(pos.x - u.ground.x, -(pos.y - u.ground.y));
  let q = skin(j.x, p) * w.x + skin(j.y, p) * w.y + skin(j.z, p) * w.z + skin(j.w, p) * w.w;
  var o: VOut;
  o.pos = vec4f(q * u.xform.xy + u.xform.zw, 0.0, 1.0);
  o.uv = uv;
  o.billY = q.y;
  o.page = extra.x;
  o.arm = extra.y;
  o.maskPage = extra.z;
  o.masked = extra.w;
  o.maskUv = maskUv;
  return o;
}

@fragment fn fs(i: VOut) -> @location(0) vec4f {
  // sampled before any branch: uniform control flow for the implicit derivatives
  let gx = dpdx(i.uv);
  let gy = dpdy(i.uv);
  let mgx = dpdx(i.maskUv);
  let mgy = dpdy(i.maskUv);
  var c = textureSample(tex, samp, i.uv, i.page);
  // blink: while a frame shows, the eye rect of the body page reads the frame packed elsewhere in that page, an
  // exact replace (alpha included). The uv's own gradients keep the mip level, so the jump never changes it.
  // Eyes open (blink.z = 0): the sample above is the result, exactly as before blinks existed.
  // A worn hair with its own copy of the open eyes reads, in its eye rect, a copy of itself with those pixels cleared.
  var off = vec2f(0.0);
  var moved = false;
  if (u.blink.z > 0.5 && i.page == 0u && all(i.uv >= u.blinkRect.xy) && all(i.uv <= u.blinkRect.zw)) {
    off = u.blink.xy; moved = true;
  } else if (u.blinkItem0.w > 0.5 && i.page == u32(u.blinkItem0.z + 0.5) && all(i.uv >= u.blinkItemRect0.xy) && all(i.uv <= u.blinkItemRect0.zw)) {
    off = u.blinkItem0.xy; moved = true;
  } else if (u.blinkItem1.w > 0.5 && i.page == u32(u.blinkItem1.z + 0.5) && all(i.uv >= u.blinkItemRect1.xy) && all(i.uv <= u.blinkItemRect1.zw)) {
    off = u.blinkItem1.xy; moved = true;
  }
  if (moved) {
    c = textureSampleGrad(tex, samp, i.uv + off, i.page, gx, gy);
  }
  if ((i.arm == 1u && i.billY < u.ground.z) || (i.arm == 2u && i.billY < u.ground.w)) { discard; }
  // composed leg: drawn only where the shoes' own leg drawing is drawn too (the same 0.5 test, so the AND of both)
  if (i.masked == 1u && textureSampleGrad(tex, samp, i.maskUv, i.maskPage, mgx, mgy).a < 0.5) { discard; }
  // alpha test, as the lab draws every layer (three.js alphaTest 0.5): two pieces cut from one drawing meet
  // exactly on their 0.5 contour, so no background shows through their seam (blending their soft edges let it
  // through as a light dotted line); the edge smoothing comes from the per-sample test instead
  if (c.a < 0.5) { discard; }
  return vec4f(c.rgb / c.a, 1.0);
}
`

const MIP_SHADER = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  let p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VOut;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.uv = vec2f((p[i].x + 1.0) * 0.5, (1.0 - p[i].y) * 0.5);
  return o;
}
@fragment fn fs(i: VOut) -> @location(0) vec4f { return textureSample(src, samp, i.uv); }
`

export interface Avatar25GpuShared {
  device: GPUDevice
  format: GPUTextureFormat
  pipeline: GPURenderPipeline
  sampler: GPUSampler
  /** The device was created with `texture-compression-astc` (only requested when the adapter has it). */
  astcAvailable: boolean
  /** Texture arrays by page set, shared by every avatar on the device and freed when the last one leaves. */
  textureCache: Map<string, { promise: Promise<{ bindGroup: GPUBindGroup; texture: GPUTexture; bytes: number }>; refs: number }>
}

/** One avatar's GPU state for one view. Plain object of GPU handles: passes into worklets (registered serializable). */
export interface Avatar25GpuView {
  /** Texture cache key (JS thread only: release on unmount). */
  textureKey: string
  /** Only what the UI thread needs; the CPU-side vertex/index arrays stay on the JS thread. */
  view: CompiledAvatar["view"]
  variants: number[]
  vertex: GPUBuffer
  index: GPUBuffer
  textureBindGroup: GPUBindGroup
  uniform: GPUBuffer
  uniformBindGroup: GPUBindGroup
}

export function createAvatar25Shared(device: GPUDevice, format: GPUTextureFormat): Avatar25GpuShared {
  const module = device.createShaderModule({ code: SHADER })
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module,
      entryPoint: "vs",
      buffers: [{
        arrayStride: AVATAR25_VERTEX_STRIDE,
        attributes: [
          { shaderLocation: 0, offset: 0, format: "float32x2" },
          { shaderLocation: 1, offset: 8, format: "float32x2" },
          { shaderLocation: 2, offset: 16, format: "uint8x4" },
          { shaderLocation: 3, offset: 20, format: "unorm8x4" },
          { shaderLocation: 4, offset: 24, format: "uint8x4" },
          { shaderLocation: 5, offset: 28, format: "unorm16x2" }
        ]
      }]
    },
    fragment: {
      module,
      entryPoint: "fs",
      targets: [{
        format,
        blend: {
          color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" }
        }
      }]
    },
    primitive: { topology: "triangle-list", cullMode: "none" },
    multisample: { count: AVATAR25_SAMPLE_COUNT }
  })
  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
    maxAnisotropy: 4,
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge"
  })
  return { device, format, pipeline, sampler, astcAvailable: hasGpuFeature(device.features, AVATAR25_ASTC_FEATURE), textureCache: new Map() }
}

function mipCount(w: number, h: number) {
  return Math.floor(Math.log2(Math.max(w, h))) + 1
}

function generateMips(device: GPUDevice, texture: GPUTexture, layers: number) {
  const module = device.createShaderModule({ code: MIP_SHADER })
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vs" },
    fragment: { module, entryPoint: "fs", targets: [{ format: texture.format }] }
  })
  const sampler = device.createSampler({ minFilter: "linear", magFilter: "linear" })
  const encoder = device.createCommandEncoder()
  const single = (layer: number, level: number) =>
    texture.createView({ dimension: "2d", baseArrayLayer: layer, arrayLayerCount: 1, baseMipLevel: level, mipLevelCount: 1 })
  for (let layer = 0; layer < layers; layer++) {
    for (let level = 1; level < texture.mipLevelCount; level++) {
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: single(layer, level - 1) }, { binding: 1, resource: sampler }]
      })
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: single(layer, level), loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] }]
      })
      pass.setPipeline(pipeline)
      pass.setBindGroup(0, bindGroup)
      pass.draw(3)
      pass.end()
    }
  }
  device.queue.submit([encoder.finish()])
}

/** The texture cache key of one rig's page set. */
export function avatar25PagesKey(pages: string[], namespace = ""): string {
  return `${namespace}:${pages.join("|")}`
}

/** Which upload path a page set takes right now: ASTC only when requested, supported and a matching blob exists. */
export function resolveAvatar25PageSource(shared: Avatar25GpuShared, pages: string[], astc?: Avatar25AstcSource): Avatar25PageSource {
  return chooseAvatar25PageSource({ requested: isAvatar25AstcRequested(), featureAvailable: shared.astcAvailable, source: astc, pages })
}

type PageTexture = { bindGroup: GPUBindGroup; texture: GPUTexture; bytes: number; format: GPUTextureFormat }

function createPageBindGroup(shared: Avatar25GpuShared, texture: GPUTexture): GPUBindGroup {
  return shared.device.createBindGroup({
    layout: shared.pipeline.getBindGroupLayout(1),
    entries: [
      { binding: 0, resource: texture.createView({ dimension: "2d-array" }) },
      { binding: 1, resource: shared.sampler }
    ]
  })
}

/** Today's path: decoded PNGs → one premultiplied RGBA8 texture array, mips built by a render pass. */
async function uploadPngPages(shared: Avatar25GpuShared, pages: string[], readBytes: (name: string) => Promise<ArrayBuffer>): Promise<PageTexture> {
  const bitmaps = await Promise.all(pages.map(async (name) => createImageBitmap(await readBytes(name))))
  const { device } = shared
  const { width, height } = bitmaps[0]
  const mipLevelCount = mipCount(width, height)
  const texture = device.createTexture({
    size: [width, height, bitmaps.length],
    format: "rgba8unorm",
    mipLevelCount,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
  })
  bitmaps.forEach((bitmap, layer) => {
    device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture, origin: [0, 0, layer], premultipliedAlpha: true },
      [width, height]
    )
    // the upload copied the pixels (Dawn WriteTexture): drop the decoded CPU copy now, not at the next GC
    bitmap.close()
  })
  generateMips(device, texture, bitmaps.length)
  const bindGroup = createPageBindGroup(shared, texture)
  // RGBA8 plus the full mip chain (×4/3)
  return { bindGroup, texture, bytes: Math.round(width * height * 4 * bitmaps.length * 4 / 3), format: "rgba8unorm" }
}

/**
 * The compressed path: a baked ASTC 4x4 blob (premultiplied, mips included) → one texture array, block-aligned
 * writeTexture per (mip, page). Compressed formats cannot be render targets, so no mip-generation pass runs.
 */
async function uploadAstcPages(shared: Avatar25GpuShared, set: Avatar25AstcSet, pageIndices: number[], astc: Avatar25AstcSource): Promise<PageTexture> {
  const blob = await astc.readBlob(set.file)
  assertAvatar25AstcBlob(set, blob.byteLength)
  const { device } = shared
  const texture = device.createTexture({
    size: [set.width, set.height, pageIndices.length],
    format: "astc-4x4-unorm" as GPUTextureFormat,
    mipLevelCount: set.levels.length,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
  })
  for (const up of avatar25AstcUploads(set, pageIndices)) {
    // a copy of exactly this mip's bytes: never rely on a typed-array byteOffset surviving the binding
    device.queue.writeTexture(
      { texture, mipLevel: up.mipLevel, origin: [0, 0, up.layer] },
      blob.slice(up.byteOffset, up.byteOffset + up.byteLength),
      { bytesPerRow: up.bytesPerRow, rowsPerImage: up.rowsPerImage },
      up.extent
    )
  }
  return { bindGroup: createPageBindGroup(shared, texture), texture, bytes: avatar25AstcGpuBytes(set, pageIndices.length), format: "astc-4x4-unorm" as GPUTextureFormat }
}

declare const __DEV__: boolean | undefined

/** Pages (decoded PNGs, or the baked ASTC blob) → one premultiplied, mip-mapped texture array, cached by page set and ref-counted. */
export function acquireAvatar25Pages(
  shared: Avatar25GpuShared,
  pages: string[],
  readBytes: (name: string) => Promise<ArrayBuffer>,
  /** The rig the pages belong to: rigs share page file names, so the cache keys them apart. */
  namespace = "",
  /** The rig's compressed blobs; absent or unused = the PNG path, exactly as before. */
  astc?: Avatar25AstcSource
): Promise<GPUBindGroup> {
  const source = resolveAvatar25PageSource(shared, pages, astc)
  const key = avatar25PagesKey(pages, avatar25PageSourceNamespace(namespace, source))
  const cached = shared.textureCache.get(key)
  if (cached) {
    cached.refs += 1
    return cached.promise.then((entry) => entry.bindGroup)
  }
  const promise = (async () => {
    let entry: PageTexture
    if (source.kind === "astc" && astc) {
      try {
        entry = await uploadAstcPages(shared, source.set, source.pageIndices, astc)
      } catch (error) {
        // counts only: no paths or ids
        console.warn(`[avatar25] ASTC upload failed (${error instanceof Error ? error.message.slice(0, 80) : "error"}); using PNG pages`)
        entry = await uploadPngPages(shared, pages, readBytes)
      }
    } else {
      entry = await uploadPngPages(shared, pages, readBytes)
    }
    if (typeof __DEV__ !== "undefined" && __DEV__) console.info(`[avatar25] pages ${entry.format} ${(entry.bytes / 1e6).toFixed(2)} MB`)
    return entry
  })()
  shared.textureCache.set(key, { promise, refs: 1 })
  promise.catch(() => shared.textureCache.delete(key))
  return promise.then((entry) => entry.bindGroup)
}

/** One avatar view stops using its pages; the texture is destroyed when no avatar uses it any more. */
export function releaseAvatar25Pages(shared: Avatar25GpuShared, key: string): void {
  const cached = shared.textureCache.get(key)
  if (!cached) return
  cached.refs -= 1
  if (cached.refs > 0) return
  shared.textureCache.delete(key)
  cached.promise.then((entry) => entry.texture.destroy(), () => undefined)
}

/** Bytes of all live avatar textures on this device (mip chains included). */
export async function getAvatar25TextureBytes(shared: Avatar25GpuShared): Promise<number> {
  const entries = await Promise.all([...shared.textureCache.values()].map((entry) => entry.promise))
  return entries.reduce((sum, entry) => sum + entry.bytes, 0)
}

/** Frees one avatar view's buffers and its hold on the shared pages. */
export function destroyAvatar25GpuView(shared: Avatar25GpuShared, gpu: Avatar25GpuView): void {
  gpu.vertex.destroy()
  gpu.index.destroy()
  gpu.uniform.destroy()
  releaseAvatar25Pages(shared, gpu.textureKey)
}

export async function createAvatar25GpuView(
  shared: Avatar25GpuShared,
  rig: Rig25,
  viewName: Avatar25ViewName,
  itemIds: string[],
  readBytes: (name: string) => Promise<ArrayBuffer>,
  /** The rig id (texture cache namespace). */
  namespace = "",
  /** The rig's compressed blobs (see avatar25Astc.ts); absent = PNG pages. */
  astc?: Avatar25AstcSource,
  /** Build the mirrored direction's drawing (worn items' mirror cards); the transform still flips it. */
  mirrored = false,
  /** Load the mirror cards' overflow page too (the plain view of an avatar that also has the mirrored one): one page set. */
  withCardPages = mirrored
): Promise<Avatar25GpuView> {
  const { device } = shared
  const compiled = compileAvatar(rig, viewName, itemIds, mirrored, withCardPages)
  const vertex = device.createBuffer({ size: compiled.vertexData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST })
  device.queue.writeBuffer(vertex, 0, compiled.vertexData)
  const index = device.createBuffer({ size: Math.max(4, compiled.indexData.byteLength), usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST })
  device.queue.writeBuffer(index, 0, compiled.indexData)
  const textureBindGroup = await acquireAvatar25Pages(shared, compiled.pages, readBytes, namespace, astc)
  const uniform = device.createBuffer({ size: AVATAR25_UNIFORM_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  const uniformBindGroup = device.createBindGroup({
    layout: shared.pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniform } }]
  })
  return {
    textureKey: avatar25PagesKey(compiled.pages, avatar25PageSourceNamespace(namespace, resolveAvatar25PageSource(shared, compiled.pages, astc))),
    view: compiled.view,
    variants: compiled.variants,
    vertex,
    index,
    textureBindGroup,
    uniform,
    uniformBindGroup
  }
}

/**
 * Record one avatar into an open render pass (UI thread): one uniform write and ONE indexed draw.
 * `uniformData` is [xform(4), ground(2), clip(2), blink(AVATAR25_BLINK_UNIFORM_FLOATS), palette…] already filled by the caller.
 */
export function drawAvatar25(
  device: GPUDevice,
  pass: GPURenderPassEncoder,
  gpu: Avatar25GpuView,
  uniformData: Float32Array,
  variant: number
): number {
  "worklet"
  const count = gpu.variants[variant * 2 + 1]
  if (!count) return 0
  device.queue.writeBuffer(gpu.uniform, 0, uniformData)
  pass.setBindGroup(0, gpu.uniformBindGroup)
  pass.setBindGroup(1, gpu.textureBindGroup)
  pass.setVertexBuffer(0, gpu.vertex)
  pass.setIndexBuffer(gpu.index, "uint32")
  pass.drawIndexed(count, 1, gpu.variants[variant * 2])
  return 1
}
