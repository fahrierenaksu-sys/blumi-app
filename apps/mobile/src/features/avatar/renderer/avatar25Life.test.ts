import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import {
  avatar25BlinkFrame,
  AVATAR25_BLINK_FRAME_NAMES,
  AVATAR25_BLINK_UNIFORM_FLOATS,
  BLINK_CLOSED,
  BLINK_HALF,
  BLINK_OPEN,
  breathCurve,
  compileBlink,
  redirectAvatar25BlinkUv,
  stepBreathWeight,
  writeAvatar25BlinkUniform,
  type CompiledBlink
} from "./avatar25Life"
import { compileView, PALETTE_STRIDE, writeAvatarPalette, type CompiledView, type PoseInput } from "./avatar25Pose"
import type { Avatar25Pose, Avatar25ViewName, Rig25, Rig25Mesh, Rig25View } from "./rigTypes"

const RIGS = {
  girl: JSON.parse(readFileSync(resolve(import.meta.dirname, "../rigs/girl/rig25.json"), "utf8")) as Rig25,
  boy: JSON.parse(readFileSync(resolve(import.meta.dirname, "../rigs/boy/rig25.json"), "utf8")) as Rig25
}
const VIEW_NAMES: Avatar25ViewName[] = ["front", "back"]
const TIMES = [0, 0.37, 1.9, 3.3, 12.71]

/** The same view as an export from before blinking and breathing existed. */
function withoutLife(view: Rig25View): Rig25View {
  const { breath: _breath, blink: _blink, ...rest } = view
  return rest
}

function pose(view: CompiledView, input: Partial<PoseInput> & { pose: Avatar25Pose }): Float32Array {
  const palette = new Float32Array(view.slotCount * PALETTE_STRIDE)
  writeAvatarPalette(view, { time: 0, walkCycles: 0, walkWeight: 0, waveTime: 0, reduceMotion: false, ...input }, palette)
  return palette
}

function slot(palette: Float32Array, index: number): number[] {
  return [...palette.subarray(index * PALETTE_STRIDE, (index + 1) * PALETTE_STRIDE)]
}

function skin(palette: Float32Array, index: number, x: number, y: number): [number, number] {
  const o = index * PALETTE_STRIDE
  return [palette[o] * x + palette[o + 1] * y + palette[o + 2], palette[o + 4] * x + palette[o + 5] * y + palette[o + 6]]
}

const isLowerBody = (name: string) => name === "hips" || /^(thigh|shin|foot)_/.test(name)

for (const [who, rig] of Object.entries(RIGS)) {
  for (const viewName of VIEW_NAMES) {
    const source = rig.views[viewName]
    const label = `${who} ${viewName}`

    test(`${label}: an export without blink and breath poses the same whatever the breath inputs are`, () => {
      const old = compileView(viewName, withoutLife(source))
      assert.equal(old.breath, null)
      assert.equal(old.blink, null)
      for (const name of ["stand", "sit", "wave", "walk"] as const) {
        for (const time of TIMES) {
          const plain = pose(old, { pose: name, time, walkWeight: name === "walk" ? 1 : 0, walkCycles: time })
          const driven = pose(old, { pose: name, time, walkWeight: name === "walk" ? 1 : 0, walkCycles: time, breathWeight: 1, breathPhase: 0.3, breathHold: 1 })
          assert.deepEqual(driven, plain, `${name} @${time}`)
        }
      }
    })

    test(`${label}: with breath weight 0 the palette is exactly the one of the export without breath`, () => {
      const old = compileView(viewName, withoutLife(source))
      const now = compileView(viewName, source)
      assert.notEqual(now.breath, null)
      for (const name of ["stand", "sit", "wave"] as const) {
        for (const time of TIMES) {
          const before = pose(old, { pose: name, time })
          assert.deepEqual(pose(now, { pose: name, time }), before, `${name} @${time}, no weight`)
          assert.deepEqual(pose(now, { pose: name, time, breathWeight: 0, breathPhase: 0.6 }), before, `${name} @${time}, weight 0`)
        }
      }
    })

    test(`${label}: a breath lifts the chest and what rides on it, and never moves the hips or legs`, () => {
      const view = compileView(viewName, source)
      const risePx = source.breath?.risePx ?? {}
      const chest = view.index.chest
      const head = view.index.head
      assert.ok((risePx.chest ?? 0) > 0)
      for (const name of ["stand", "sit"] as const) {
        for (const time of TIMES) {
          const out = pose(view, { pose: name, time, breathWeight: 1, breathHold: 0 })
          const full = pose(view, { pose: name, time, breathWeight: 1, breathHold: 1 })
          const half = pose(view, { pose: name, time, breathWeight: 0.5, breathHold: 1 })
          source.bones.forEach((bone, i) => {
            if (isLowerBody(bone.name)) assert.deepEqual(slot(full, i), slot(out, i), `${name} ${bone.name}`)
          })
          // the chest's own head is its pivot: it rises by exactly the rig's rise, half of it at half weight (bill px, y up)
          const [cx, cy] = [view.head[chest * 2], view.head[chest * 2 + 1]]
          const rise = skin(full, chest, cx, cy)[1] - skin(out, chest, cx, cy)[1]
          assert.ok(Math.abs(rise - risePx.chest) < 1e-3, `${name} chest rise ${rise}`)
          assert.ok(Math.abs(skin(half, chest, cx, cy)[1] - skin(out, chest, cx, cy)[1] - risePx.chest / 2) < 1e-3)
          // the head rides on the chest
          const [hx, hy] = [view.head[head * 2], view.head[head * 2 + 1]]
          const headRise = skin(full, head, hx, hy)[1] - skin(out, head, hx, hy)[1]
          assert.ok(headRise > risePx.chest * 0.7 && headRise < risePx.chest * 1.3, `${name} head rise ${headRise}`)
        }
      }
    })

    test(`${label}: with Reduce Motion the body is still: no rise, no sway, at any time`, () => {
      const view = compileView(viewName, source)
      const old = compileView(viewName, withoutLife(source))
      for (const name of ["stand", "sit"] as const) {
        const still = pose(view, { pose: name, time: 0, reduceMotion: true })
        for (const time of TIMES) {
          assert.deepEqual(pose(view, { pose: name, time, reduceMotion: true, breathWeight: 1, breathPhase: 0.4 }), still, `${name} @${time}`)
          assert.deepEqual(pose(view, { pose: name, time, reduceMotion: true, breathWeight: 1, breathHold: 1 }), still)
          assert.deepEqual(pose(old, { pose: name, time, reduceMotion: true }), still)
        }
      }
    })

    test(`${label}: breathing fades out of the retargeted walk and leaves the legs alone while it settles`, () => {
      const view = compileView(viewName, source)
      if (view.motion === null) return
      const striding = { pose: "walk" as const, time: 1.3, walkCycles: 0.37, walkWeight: 1 }
      assert.deepEqual(pose(view, { ...striding, breathWeight: 1, breathHold: 1 }), pose(view, striding))
      // settling after a walk: the standing idle is partly back, and so is the breath
      const settling = { pose: "stand" as const, time: 1.3, walkCycles: 0.37, walkWeight: 0.2 }
      const out = pose(view, { ...settling, breathWeight: 1, breathHold: 0 })
      const full = pose(view, { ...settling, breathWeight: 1, breathHold: 1 })
      source.bones.forEach((bone, i) => {
        if (isLowerBody(bone.name)) assert.deepEqual(slot(full, i), slot(out, i), bone.name)
      })
      const head = view.index.head
      const [hx, hy] = [view.head[head * 2], view.head[head * 2 + 1]]
      const headRise = skin(full, head, hx, hy)[1] - skin(out, head, hx, hy)[1]
      assert.ok(headRise > 0 && headRise <= (source.breath?.risePx.chest ?? 0) * 1.3, `head rise ${headRise}`)
    })
  }
}

test("one breath: an eased inhale, a longer eased exhale, repeating; the phase shifts it", () => {
  const period = 3.6, inhale = 0.42
  assert.ok(Math.abs(breathCurve(period, inhale, 0, 0)) < 1e-9)
  assert.ok(Math.abs(breathCurve(period, inhale, period * inhale, 0) - 1) < 1e-9)
  assert.ok(breathCurve(period, inhale, period * 0.9999, 0) < 1e-3)
  let previous = 0
  for (let u = 0.01; u <= 1; u += 0.01) {
    const b = breathCurve(period, inhale, period * u, 0)
    assert.ok(b >= 0 && b <= 1)
    if (u <= inhale) assert.ok(b >= previous - 1e-9, `rises at ${u}`)
    else if (u > inhale + 0.01) assert.ok(b <= previous + 1e-9, `falls at ${u}`)
    previous = b
  }
  for (const t of [0.2, 1.1, 2.9]) {
    assert.ok(Math.abs(breathCurve(period, inhale, t + period * 7, 0) - breathCurve(period, inhale, t, 0)) < 1e-6)
    assert.ok(Math.abs(breathCurve(period, inhale, t, 0.25) - breathCurve(period, inhale, t + period * 0.25, 0)) < 1e-9)
  }
  assert.notEqual(breathCurve(period, inhale, 1, 0.1), breathCurve(period, inhale, 1, 0.6))
})

test("the breath weight fades fully in or out in the rig's fade time and never pops", () => {
  const fadeS = 0.8, dt = 1 / 60
  let w = 0
  let frames = 0
  while (w < 1 && frames < 1000) {
    const next = stepBreathWeight(w, true, dt, fadeS)
    assert.ok(next - w <= dt / fadeS + 1e-9)
    w = next
    frames += 1
  }
  assert.equal(w, 1)
  assert.ok(Math.abs(frames * dt - fadeS) < 2 * dt, `${frames} frames`)
  assert.equal(stepBreathWeight(1, true, dt, fadeS), 1)
  while (w > 0) w = stepBreathWeight(w, false, dt, fadeS)
  assert.equal(w, 0)
  assert.equal(stepBreathWeight(0, false, dt, fadeS), 0)
  assert.equal(stepBreathWeight(0.3, true, dt, 0), 1)
  assert.equal(stepBreathWeight(0.3, false, dt, 0), 0)
})

/** Runs of equal frames over a scripted clock: [frame, start s, end s]. */
function blinkRuns(blink: CompiledBlink, seed: number, seconds: number, stepS = 0.001): [number, number, number][] {
  const runs: [number, number, number][] = []
  for (let i = 0; i * stepS < seconds; i++) {
    const t = i * stepS
    const frame = avatar25BlinkFrame(blink, t, seed)
    const last = runs[runs.length - 1]
    if (last && last[0] === frame) last[2] = t + stepS
    else runs.push([frame, t, t + stepS])
  }
  return runs
}

for (const [who, rig] of Object.entries(RIGS)) {
  test(`${who}: over ten minutes every blink plays the rig's frames in order, and the eyes stay open the rig's gap between blinks`, () => {
    const source = rig.views.front.blink
    assert.ok(source)
    const blink = compileBlink(rig.views.front)
    assert.ok(blink)
    const eps = 0.0025
    const runs = blinkRuns(blink, 0.618, 600)
    const duration = source.seq.reduce((sum, [, s]) => sum + s, 0)
    let blinks = 0
    let doubles = 0
    let i = runs[0][0] === BLINK_OPEN ? 1 : 0
    assert.equal(runs[0][0], BLINK_OPEN)
    while (i + source.seq.length <= runs.length) {
      // one blink: the rig's frames, each for its own time
      source.seq.forEach(([name, seconds], k) => {
        const [frame, start, end] = runs[i + k]
        assert.equal(AVATAR25_BLINK_FRAME_NAMES[frame], name, `blink ${blinks} step ${k}`)
        assert.ok(Math.abs(end - start - seconds) < eps, `blink ${blinks} ${name} lasted ${end - start}`)
      })
      blinks += 1
      const open: [number, number, number] | undefined = runs[i + source.seq.length]
      if (!open || open[2] >= 600) break
      assert.equal(open[0], BLINK_OPEN)
      const gap = open[2] - open[1]
      const quickSecond = Math.abs(gap - (source.doubleGapS ?? 0)) < eps
      if (quickSecond) doubles += 1
      // a quick second blink shortens the gap that follows it by itself and its own small gap
      else assert.ok(gap > source.gapS[0] - duration - (source.doubleGapS ?? 0) - eps && gap < source.gapS[1] + eps, `open for ${gap}`)
      i += source.seq.length + 1
    }
    const mean = (source.gapS[0] + source.gapS[1]) / 2 + duration
    assert.ok(blinks > 600 / mean * 0.9 && blinks < 600 / mean * 1.3, `${blinks} blinks`)
    assert.ok(doubles > 0 && doubles / blinks < (source.doubleP ?? 0) * 2.5, `${doubles} doubles of ${blinks}`)
    // without a quick second blink, a gap is never shorter than the rig's shortest
    const single = { ...blink, doubleP: 0 }
    const singleRuns = blinkRuns(single, 0.618, 120)
    for (const [frame, start, end] of singleRuns.slice(1, -1)) {
      if (frame === BLINK_OPEN) assert.ok(end - start > source.gapS[0] - eps && end - start < source.gapS[1] + eps, `open for ${end - start}`)
    }
  })
}

test("the blink schedule is a pure function of the clock and differs between avatars", () => {
  const blink = compileBlink(RIGS.girl.views.front)
  assert.ok(blink)
  const starts = (seed: number) => blinkRuns(blink, seed, 60, 0.005).filter(([frame]) => frame === BLINK_CLOSED).map(([, start]) => start.toFixed(2))
  assert.deepEqual(starts(0.25), starts(0.25))
  assert.notDeepEqual(starts(0.25), starts(0.75))
  assert.ok(starts(0.25).length >= 8)
  for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) assert.equal(avatar25BlinkFrame(blink, bad, 0.25), BLINK_OPEN)
})

/** uv bounds of one mesh range: [u0, v0, u1, v1]. */
function rangeUvBox(mesh: Rig25Mesh, range: Rig25Mesh["ranges"][number]): number[] {
  const box = [Infinity, Infinity, -Infinity, -Infinity]
  for (let i = range.start; i < range.start + range.count; i++) {
    const u = mesh.uv[mesh.index[i] * 2], v = mesh.uv[mesh.index[i] * 2 + 1]
    box[0] = Math.min(box[0], u); box[1] = Math.min(box[1], v); box[2] = Math.max(box[2], u); box[3] = Math.max(box[3], v)
  }
  return box
}
const overlaps = (a: number[], b: number[]) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]

for (const [who, rig] of Object.entries(RIGS)) {
  test(`${who}: eyes open is the drawing as it was; a blink frame moves only the head's eye texels, onto empty atlas space`, () => {
    const view = compileView("front", rig.views.front)
    const blink = view.blink
    assert.ok(blink)
    const mesh = rig.views.front.mesh
    const boxes = mesh.ranges.map((range) => ({ name: range.name, box: rangeUvBox(mesh, range) }))
    const head = boxes.find((entry) => entry.name === "head")
    assert.ok(head)
    const [u0, v0, u1, v1] = blink.rect
    // the shader works in 32-bit floats: probe a hair inside the border, not on it
    const inside: [number, number][] = [[u0 + 1e-5, v0 + 1e-5], [u1 - 1e-5, v1 - 1e-5], [(u0 + u1) / 2, (v0 + v1) / 2], [u0 + 1e-5, v1 - 1e-5]]
    const outside: [number, number][] = [[u0 - 1e-5, (v0 + v1) / 2], [u1 + 1e-5, (v0 + v1) / 2], [(u0 + u1) / 2, v0 - 1e-5], [(u0 + u1) / 2, v1 + 1e-5], [0, 0], [1, 1]]
    const block = new Float32Array(AVATAR25_BLINK_UNIFORM_FLOATS + 3)
    const at = 3

    // eyes open: nothing is redirected anywhere, so the frame is exactly what it was before blinks
    writeAvatar25BlinkUniform(blink, BLINK_OPEN, block, at)
    assert.deepEqual([...block.subarray(at)], new Array(AVATAR25_BLINK_UNIFORM_FLOATS).fill(0))
    for (const [u, v] of [...inside, ...outside]) assert.deepEqual(redirectAvatar25BlinkUv(block, at, u, v, 0), [u, v])

    // the redirected rect is the head's alone
    assert.ok(u0 >= head.box[0] && v0 >= head.box[1] && u1 <= head.box[2] && v1 <= head.box[3], "the eye rect lies on the head")
    for (const other of boxes) if (other.name !== "head") assert.equal(overlaps(blink.rect, other.box), false, other.name)

    for (const frame of [BLINK_HALF, BLINK_CLOSED]) {
      writeAvatar25BlinkUniform(blink, frame, block, at)
      const [du, dv] = [block[at + 4], block[at + 5]]
      assert.ok(du !== 0 || dv !== 0)
      for (const [u, v] of inside) {
        const [ru, rv] = redirectAvatar25BlinkUv(block, at, u, v, 0)
        assert.ok(Math.abs(ru - (u + du)) < 1e-6 && Math.abs(rv - (v + dv)) < 1e-6)
        // item pages (hair over the eyes) share the uv range and are never redirected
        assert.deepEqual(redirectAvatar25BlinkUv(block, at, u, v, 1), [u, v])
      }
      for (const [u, v] of outside) assert.deepEqual(redirectAvatar25BlinkUv(block, at, u, v, 0), [u, v])
      // the frame lives inside the page, where no part of the body is drawn from
      const target = [u0 + du, v0 + dv, u1 + du, v1 + dv]
      assert.ok(target[0] >= 0 && target[1] >= 0 && target[2] <= 1 && target[3] <= 1)
      for (const other of boxes) assert.equal(overlaps(target, other.box), false, `frame ${frame} over ${other.name}`)
    }
    const half = [blink.offsets[2], blink.offsets[3]], closed = [blink.offsets[4], blink.offsets[5]]
    assert.equal(overlaps([u0 + half[0], v0 + half[1], u1 + half[0], v1 + half[1]], [u0 + closed[0], v0 + closed[1], u1 + closed[0], v1 + closed[1]]), false)
  })

  test(`${who}: a worn hair's own eye copy is swapped for its cleared patch during a blink, on its page only`, () => {
    const source = rig.views.front
    const view = compileView("front", source)
    const blink = view.blink
    assert.ok(blink)
    const patches = source.blink?.items ?? []
    // the girl's pageboy hair holds a copy of her far eye (the closed blink read as a wink without its patch)
    if (who === "girl") assert.ok(patches.some((patch) => patch.item === "hair_ink_pageboy_star"))
    const block = new Float32Array(AVATAR25_BLINK_UNIFORM_FLOATS)
    writeAvatar25BlinkUniform(blink, BLINK_OPEN, block, 0)
    assert.deepEqual([...block], new Array(AVATAR25_BLINK_UNIFORM_FLOATS).fill(0))
    for (const [k, patch] of patches.entries()) {
      const item = source.items[patch.item]
      assert.ok(item, patch.item)
      assert.equal(item.page, patch.page)
      const [pw, ph] = source.pageSize
      const [x, y, w, h] = patch.rect
      const pad = patch.pad ?? 0
      const rect = [(x - pad) / pw, (y - pad) / ph, (x + w + pad) / pw, (y + h + pad) / ph]
      const boxes = item.mesh.ranges.map((range) => ({ name: range.name, box: rangeUvBox(item.mesh, range) }))
      const head = boxes.filter((entry) => item.mesh.ranges.find((r) => r.name === entry.name)?.layer === "head")
      assert.ok(head.some((entry) => rect[0] >= entry.box[0] && rect[1] >= entry.box[1] && rect[2] <= entry.box[2] && rect[3] <= entry.box[3]), "the patch rect lies on the item's head part")
      const target = [rect[0] + patch.offset[0] / pw, rect[1] + patch.offset[1] / ph, rect[2] + patch.offset[0] / pw, rect[3] + patch.offset[1] / ph]
      // the patch lives where no worn item on that page draws from
      for (const other of Object.values(source.items)) {
        if (other.page !== patch.page) continue
        for (const range of other.mesh.ranges) assert.equal(overlaps(target, rangeUvBox(other.mesh, range)), false, `patch over ${range.name}`)
      }
      const mid: [number, number] = [(rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2]
      for (const frame of [BLINK_HALF, BLINK_CLOSED]) {
        writeAvatar25BlinkUniform(blink, frame, block, 0)
        const [ru, rv] = redirectAvatar25BlinkUv(block, 0, mid[0], mid[1], patch.page)
        assert.ok(Math.abs(ru - (mid[0] + patch.offset[0] / pw)) < 1e-6 && Math.abs(rv - (mid[1] + patch.offset[1] / ph)) < 1e-6, `patch ${k} frame ${frame}`)
        // the same uv on another page, or just outside the rect, stays where it is
        assert.deepEqual(redirectAvatar25BlinkUv(block, 0, mid[0], mid[1], patch.page + 1), [mid[0], mid[1]])
        assert.deepEqual(redirectAvatar25BlinkUv(block, 0, rect[0] - 1e-5, mid[1], patch.page), [rect[0] - 1e-5, mid[1]])
      }
    }
  })

  test(`${who}: the back view has no eyes, so it never redirects`, () => {
    const back = compileView("back", rig.views.back)
    assert.equal(back.blink, null)
    const block = new Float32Array(AVATAR25_BLINK_UNIFORM_FLOATS).fill(9)
    writeAvatar25BlinkUniform(back.blink, BLINK_CLOSED, block, 0)
    assert.deepEqual([...block], new Array(AVATAR25_BLINK_UNIFORM_FLOATS).fill(0))
    assert.deepEqual(redirectAvatar25BlinkUv(block, 0, 0.4, 0.7, 0), [0.4, 0.7])
  })
}

test("a blink without its page, or with nothing to play, is no blink", () => {
  const front = RIGS.girl.views.front
  assert.ok(front.blink)
  assert.equal(compileBlink({ ...front, blink: { ...front.blink, seq: [] } }), null)
  assert.equal(compileBlink({ ...front, blink: { ...front.blink, page: 1 } }), null)
  assert.equal(compileBlink(withoutLife(front)), null)
})
