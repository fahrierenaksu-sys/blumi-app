import { useEffect, useRef, useState } from "react"
import { PixelRatio, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { useFrameCallback, useSharedValue, type SharedValue } from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { Canvas, GPUTextureUsage, type CanvasRef } from "react-native-webgpu"
import {
  AVATAR25_SAMPLE_COUNT,
  AVATAR25_UNIFORM_BLINK_OFFSET,
  AVATAR25_UNIFORM_FLOATS,
  AVATAR25_UNIFORM_PALETTE_OFFSET,
  createAvatar25GpuView,
  createAvatar25Shared,
  destroyAvatar25GpuView,
  drawAvatar25,
  getAvatar25TextureBytes,
  type Avatar25GpuShared,
  type Avatar25GpuView
} from "./avatar25Gpu"
import { avatar25HasMirrorCards, avatar25MirroredOnScreen, avatarVariant, pickAvatar25View, writeAvatarClipTransform, writeAvatarPalette } from "./avatar25Pose"
import type { AvatarRigId } from "../model/avatarRoomContract"
import { getAvatar25Rig } from "./avatar25Assets"
import { AVATAR25_ASTC_FEATURE, hasGpuFeature, shouldRequestAvatar25AstcFeature } from "./avatar25Astc"
import { avatar25BlinkFrame, BLINK_OPEN, writeAvatar25BlinkUniform } from "./avatar25Life"
import type { Avatar25Pose, Avatar25ViewName } from "./rigTypes"

export const AVATAR25_POSES: Avatar25Pose[] = ["stand", "walk", "sit", "wave"]
const VIEWS: Avatar25ViewName[] = ["front", "back"]

/** What the UI thread reads every frame to pose one avatar. */
export interface Avatar25Driver {
  /** Index into AVATAR25_POSES. */
  pose: SharedValue<number>
  /** Walk cycles covered (grows with distance walked, so planted feet don't slide). */
  walkCycles: SharedValue<number>
  /** 0..1 arm swing weight. */
  walkWeight: SharedValue<number>
  /** Frame timestamp (ms) the current wave began, or -1. */
  waveStartMs: SharedValue<number>
  /** 0..1 sit-down progress while the standing drawing still shows (knees bend first); absent = 0. */
  sitWeight?: SharedValue<number>
  /** 0..1 how much the avatar breathes now (avatar25Life `stepBreathWeight`); absent = no breathing rise. */
  breathWeight?: SharedValue<number>
  /** Seated: screen px (logical) her soles move down so they reach the floor (avatar25SeatedLegs); absent = 0. */
  sitLegDropPx?: SharedValue<number>
  /** Optional live facing for every instance: 0 front, 1 back; and 1 = mirrored. Switches without a rebuild. */
  view?: SharedValue<number>
  mirror?: SharedValue<number>
  /**
   * 1 when the renderer around this avatar flips it once more (`mirror` already compensates for that, so the drawing
   * on screen is mirrored only when `mirror` and this differ); absent = 0. Picks the mirror-card drawing.
   */
  outerMirror?: SharedValue<number>
}

export interface Avatar25Instance {
  key: string
  /** The drawn body (default the girl). */
  rig?: AvatarRigId
  /** Facing when the driver has no live facing. */
  view: Avatar25ViewName
  mirror: boolean
  itemIds: string[]
  /** Anchor (ground point, or the seated soles under the seat) as a fraction of the canvas. */
  anchorX: number
  anchorY: number
  /** Standing height of the drawn character in logical px. */
  heightPx: number
  /**
   * 0..1, this avatar's own place in the blink and breath rhythms (two avatars never blink or breathe in step).
   * Absent: taken from its position in `instances`.
   */
  lifeSeed?: number
  /**
   * false = never draw the mirror cards, the mirrored directions are the plain flip. A baked still under the canvas
   * (AvatarHero) is only ever that plain flip, so the live view must be too, or a one-sided marker swaps sides at the
   * cross-fade. Absent = true (rooms have no still underneath).
   */
  mirrorCards?: boolean
}

export interface Avatar25FrameStats {
  avatars: number
  drawCalls: number
  /** Mean UI-thread work per frame (encode + submit + present), ms. */
  workMs: number
  /** Mean interval between frames, ms (16.7 = 60 FPS). */
  frameMs: number
  /** Live avatar texture memory on the device (all canvases), MB. */
  textureMB: number
}

const STATS_EVERY = 60
/** Retargeted-walk pose buffer: θ, ρ per bone plus the hips offset (rigs have far fewer than 64 bones). */
const MOTION_SCRATCH_FLOATS = 130

/** Per-frame buffers, made once in the UI runtime and reused (queue.writeBuffer copies at call time). */
interface FrameBuffers { uniform: Float32Array; palette: Float32Array; clip: Float32Array; motion: Float32Array }

function frameBuffers(): FrameBuffers {
  "worklet"
  const g = globalThis as unknown as { __avatar25FrameBuffers?: FrameBuffers }
  // rebuilt when the uniform layout changed under a Fast Refresh (the UI runtime outlives the JS module)
  if (!g.__avatar25FrameBuffers || g.__avatar25FrameBuffers.uniform.length !== AVATAR25_UNIFORM_FLOATS) {
    const uniform = new Float32Array(AVATAR25_UNIFORM_FLOATS)
    g.__avatar25FrameBuffers = {
      uniform,
      palette: uniform.subarray(AVATAR25_UNIFORM_PALETTE_OFFSET),
      clip: uniform.subarray(6, 8),
      motion: new Float32Array(MOTION_SCRATCH_FLOATS)
    }
  }
  return g.__avatar25FrameBuffers
}

/** Rebuild GPU state only when the worn items or the placement change (facing and pose are live). */
function instancesKey(list: Avatar25Instance[]) {
  return list.map((i) => `${i.key}:${i.rig ?? "female"}:${i.itemIds.join(",")}:${i.anchorX}:${i.anchorY}:${i.heightPx}:${i.view}:${i.mirror}`).join("|")
}

/** The same array object until an instance really changes, so GPU state is rebuilt only then. */
function useStableInstances(list: Avatar25Instance[]): Avatar25Instance[] {
  const [state, setState] = useState(() => ({ key: instancesKey(list), list }))
  const key = instancesKey(list)
  if (key !== state.key) {
    const next = { key, list }
    setState(next)
    return next.list
  }
  return state.list
}

let sharedPromise: Promise<Avatar25GpuShared> | null = null

async function getShared(): Promise<Avatar25GpuShared> {
  sharedPromise ??= (async () => {
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) throw new Error("WebGPU adapter unavailable")
    // ASTC only where the adapter has it (the PNG pages otherwise)
    const wantAstc = shouldRequestAvatar25AstcFeature() && hasGpuFeature(adapter.features, AVATAR25_ASTC_FEATURE)
    const device = await adapter.requestDevice(wantAstc ? { requiredFeatures: [AVATAR25_ASTC_FEATURE as GPUFeatureName] } : undefined)
    const shared = createAvatar25Shared(device, navigator.gpu.getPreferredCanvasFormat())
    if (__DEV__) console.info(`[avatar25] gpu astc adapter=${hasGpuFeature(adapter.features, AVATAR25_ASTC_FEATURE)} device=${shared.astcAvailable}`)
    return shared
  })()
  return sharedPromise
}

/** Only GPU handles and plain data: this whole object is copied into the UI runtime. */
interface GpuState {
  device: GPUDevice
  pipeline: GPURenderPipeline
  context: GPUCanvasContext & { present: () => void }
  msaaView: GPUTextureView
  /** Logical size (dp) the anchors are measured in. */
  width: number
  height: number
  textureMB: number
  /**
   * Per instance: [front, back] GPU views, both resident so a turn never waits for a load; `mirrorViews` holds the
   * same two drawn for the mirrored directions, only where a worn item has mirror cards (else undefined: the plain
   * view is flipped).
   */
  avatars: { views: Avatar25GpuView[]; mirrorViews: (Avatar25GpuView | undefined)[]; instance: Avatar25Instance }[]
}

/**
 * Draws one or more 2.5D avatars into one transparent WebGPU surface. Posing and drawing run on the UI thread
 * in a Reanimated frame callback (one indexed draw per avatar); React renders only when the avatar set changes.
 */
export function Avatar25Canvas(props: {
  instances: Avatar25Instance[]
  driver: Avatar25Driver
  /** Per-instance walk-cycle offsets (spike: avatars out of phase). */
  phaseOffsets?: number[]
  reduceMotion?: boolean
  /**
   * The clock starts at the first drawn frame (time 0), so frame 0 is exactly the baked still (AvatarHero swaps
   * still → live without a jump). Unset: the shared frame clock, as in the room.
   */
  clockStartsAtMount?: boolean
  /** Caps the surface's pixel ratio (plan 2.2: 2x above 250 pt) to bound its memory. */
  maxPixelRatio?: number
  style?: StyleProp<ViewStyle>
  /**
   * Build everything (textures, buffers) but present nothing yet: the surface stays empty and transparent, and the
   * first frame after it turns false is fully drawn (MiniRoom: loads during the stage fade-in, shows at its end).
   */
  paused?: boolean
  onStats?: (stats: Avatar25FrameStats) => void
  onReady?: () => void
  onError?: (error: Error) => void
}) {
  const ref = useRef<CanvasRef>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [gpu, setGpu] = useState<GpuState | null>(null)
  const { onReady, onError } = props
  const maxPixelRatio = props.maxPixelRatio ?? Number.POSITIVE_INFINITY
  const instances = useStableInstances(props.instances)

  useEffect(() => {
    if (!size) return
    let cancelled = false
    let built: { shared: Avatar25GpuShared; views: Avatar25GpuView[]; msaa: GPUTexture } | null = null
    ;(async () => {
      const shared = await getShared()
      const context = ref.current?.getContext("webgpu")
      if (!context || cancelled) return
      const ratio = Math.min(PixelRatio.get(), maxPixelRatio)
      const widthPx = Math.max(1, Math.round(size.width * ratio))
      const heightPx = Math.max(1, Math.round(size.height * ratio))
      const canvas = context.canvas as unknown as { width: number; height: number }
      canvas.width = widthPx
      canvas.height = heightPx
      context.configure({ device: shared.device, format: shared.format, alphaMode: "premultiplied" })
      const msaa = shared.device.createTexture({
        size: [widthPx, heightPx],
        format: shared.format,
        sampleCount: AVATAR25_SAMPLE_COUNT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT
      })
      const avatars = await Promise.all(instances.map(async (instance) => {
        const rig = getAvatar25Rig(instance.rig)
        const hasCards = (view: Avatar25ViewName) => avatar25HasMirrorCards(rig.rig, view, instance.itemIds, instance.mirrorCards !== false)
        const create = (view: Avatar25ViewName, mirrored: boolean) =>
          createAvatar25GpuView(shared, rig.rig, view, instance.itemIds, rig.readTextureBytes, rig.id, rig.astc, mirrored, hasCards(view))
        return {
          instance,
          // the plain view of a carded avatar holds the cards' overflow page too: one page set, one texture array
          views: await Promise.all(VIEWS.map((view) => create(view, false))),
          // a second drawing only for the directions whose worn items carry mirror cards
          mirrorViews: await Promise.all(VIEWS.map((view) => hasCards(view) ? create(view, true) : undefined))
        }
      }))
      built = { shared, views: avatars.flatMap((a) => [...a.views, ...a.mirrorViews.filter((v): v is Avatar25GpuView => v !== undefined)]), msaa }
      if (cancelled) return
      const textureMB = (await getAvatar25TextureBytes(shared)) / 1e6
      if (cancelled) return
      setGpu({
        device: shared.device,
        pipeline: shared.pipeline,
        context,
        msaaView: msaa.createView(),
        width: size.width,
        height: size.height,
        textureMB,
        avatars
      })
      onReady?.()
    })().catch((error: unknown) => {
      if (!cancelled) onError?.(error instanceof Error ? error : new Error(String(error)))
    })
    return () => {
      cancelled = true
      // the avatar left (or changed): its buffers go, and its pages once no other avatar uses them
      if (built) {
        const { shared, views, msaa } = built
        for (const view of views) destroyAvatar25GpuView(shared, view)
        msaa.destroy()
      }
    }
  }, [instances, maxPixelRatio, onError, onReady, size])

  const stats = useSharedValue({ frames: 0, work: 0, interval: 0, calls: 0 })
  const { driver, onStats } = props
  const phaseOffsets = props.phaseOffsets ?? []
  const reduceMotion = props.reduceMotion ?? false
  const hasStats = Boolean(onStats)
  const clockFromMount = props.clockStartsAtMount ?? false
  const clockStartMs = useSharedValue(-1)
  const paused = props.paused ?? false

  useFrameCallback((info) => {
    "worklet"
    if (!gpu || paused) return
    const t0 = performance.now()
    const { device, pipeline } = gpu
    const texture = gpu.context.getCurrentTexture()
    const encoder = device.createCommandEncoder()
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: gpu.msaaView,
        resolveTarget: texture.createView(),
        loadOp: "clear",
        storeOp: "discard",
        clearValue: [0, 0, 0, 0]
      }]
    })
    pass.setPipeline(pipeline)
    const poseName = AVATAR25_POSES[driver.pose.value] ?? "stand"
    if (clockFromMount && clockStartMs.value < 0) clockStartMs.value = info.timestamp
    const time = clockFromMount ? (info.timestamp - clockStartMs.value) / 1000 : info.timestamp / 1000
    const waveStart = driver.waveStartMs.value
    const walkWeight = driver.walkWeight.value
    const sitWeight = driver.sitWeight ? driver.sitWeight.value : 0
    const sitLegDropPx = driver.sitLegDropPx ? driver.sitLegDropPx.value : 0
    const breathWeight = driver.breathWeight ? driver.breathWeight.value : 0
    const buffers = frameBuffers()
    const data = buffers.uniform
    let calls = 0
    for (let a = 0; a < gpu.avatars.length; a++) {
      const { views, mirrorViews, instance } = gpu.avatars[a]
      const viewIndex = driver.view ? driver.view.value : instance.view === "back" ? 1 : 0
      const mirror = driver.mirror ? driver.mirror.value === 1 : instance.mirror
      // the mirror cards are drawn for the mirror the viewer sees: the flip here, undone by a flip outside, shows none
      const mirroredOnScreen = avatar25MirroredOnScreen(mirror, driver.outerMirror ? driver.outerMirror.value === 1 : false)
      const view = pickAvatar25View(views, mirrorViews, viewIndex, mirroredOnScreen)
      const compiled = view.view
      const lifeSeed = instance.lifeSeed ?? a * 0.37
      const frame = writeAvatarPalette(compiled, {
        pose: poseName,
        time: time + a * 0.37,
        walkCycles: driver.walkCycles.value + (phaseOffsets[a] ?? 0),
        walkWeight,
        sitWeight,
        waveTime: waveStart >= 0 ? (info.timestamp - waveStart) / 1000 : 0,
        reduceMotion,
        sitLegDrop: instance.heightPx > 0 ? sitLegDropPx * compiled.height / instance.heightPx : 0,
        breathWeight,
        breathPhase: lifeSeed
      }, buffers.palette, buffers.clip, buffers.motion)
      // blink: each avatar's own schedule, a pure function of this frame's clock (so it runs on through walking,
      // sitting and turning away); only the front drawing has eyes, so the back view writes "eyes open"
      const blink = compiled.blink
      const blinkFrame = blink === null ? BLINK_OPEN : avatar25BlinkFrame(blink, time, lifeSeed)
      writeAvatar25BlinkUniform(blink, blinkFrame, data, AVATAR25_UNIFORM_BLINK_OFFSET)
      writeAvatarClipTransform(compiled, poseName, {
        mirror,
        anchorX: instance.anchorX,
        anchorY: instance.anchorY,
        heightPx: instance.heightPx
      }, gpu.width, gpu.height, data)
      data[4] = compiled.ground[0]
      data[5] = compiled.ground[1]
      calls += drawAvatar25(device, pass, view, data, avatarVariant(compiled, poseName, walkWeight, frame, sitWeight))
    }
    pass.end()
    device.queue.submit([encoder.finish()])
    gpu.context.present()
    if (!hasStats) return
    const s = stats.value
    s.frames += 1
    s.work += performance.now() - t0
    s.interval += info.timeSincePreviousFrame ?? 16.7
    s.calls = calls
    if (s.frames >= STATS_EVERY) {
      const out = {
        avatars: gpu.avatars.length,
        drawCalls: s.calls,
        workMs: s.work / s.frames,
        frameMs: s.interval / s.frames,
        textureMB: gpu.textureMB
      }
      s.frames = 0; s.work = 0; s.interval = 0
      if (onStats) scheduleOnRN(onStats, out)
    }
    stats.value = s
  })

  return (
    <View
      pointerEvents="none"
      style={[styles.fill, props.style]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout
        if (!size || size.width !== width || size.height !== height) setSize({ width, height })
      }}
    >
      {size ? <Canvas ref={ref} style={styles.fill} opaque={false} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { width: "100%", height: "100%" }
})
