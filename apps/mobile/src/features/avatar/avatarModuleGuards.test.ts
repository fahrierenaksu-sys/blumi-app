import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import test from "node:test"

/**
 * Release-safety guards for the 2.5D avatar module (plan §2.1 step 3, §3.6 D2/D4/D6/D7): no build flag or dev link
 * reaches it, nothing imports the experiment, the Workbench or a candidate path, and only the GPU files touch
 * react-native-webgpu, so every pure module (pose, resolver, stills) loads in Node.
 */
const ROOT = import.meta.dirname
const GPU_FILES = new Set(["renderer/Avatar25Canvas.tsx", "renderer/avatar25Gpu.ts"])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx|mjs)$/.test(entry.name) && !/\.test\.(ts|mjs)$/.test(entry.name) ? [path] : []
  })
}

const files = sourceFiles(ROOT).map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, "utf8") }))

test("the avatar module reads no build flag and carries no dev link or dev setter", () => {
  assert.ok(files.length > 10)
  for (const { path, text } of files) {
    assert.doesNotMatch(text, /process\.env/, `${path} reads an env flag`)
    assert.doesNotMatch(text, /blumi:\/\/dev|mini-room-qa/, `${path} names a dev link`)
    assert.doesNotMatch(text, /setDev[A-Z]|DevOverride|DevQa/, `${path} has a dev switch`)
  }
})

test("nothing in the avatar module imports the experiment, the Workbench or a candidate path", () => {
  for (const { path, text } of files) {
    const imports = [...text.matchAll(/(?:from\s+|require\()\s*["']([^"']+)["']/g)].map((match) => match[1]!)
    for (const target of imports) {
      assert.doesNotMatch(target, /experimental|BlumiArtWorkbench|candidate\/|room-avatar-25d|\/Users\//, `${path} imports ${target}`)
    }
  }
})

test("only the GPU files import react-native-webgpu, and only components draw with the canvas", () => {
  for (const { path, text } of files) {
    if (/["']react-native-webgpu["']/.test(text)) assert.ok(GPU_FILES.has(path), `${path} imports react-native-webgpu`)
    if (/["'][./]+(?:renderer\/)?avatar25Gpu["']/.test(text)) assert.equal(path, "renderer/Avatar25Canvas.tsx", `${path} imports avatar25Gpu`)
    if (/["'][./]+(?:renderer\/)?Avatar25Canvas["']/.test(text)) assert.match(path, /^components\/.*\.tsx$/, `${path} imports the canvas`)
  }
})

test("every canvas comes out of the live budget: each component that mounts it takes a slot, nothing else mounts it", () => {
  const drawers = files.filter(({ text }) => /["'][./]+(?:renderer\/)?Avatar25Canvas["']/.test(text))
  assert.ok(drawers.some(({ path }) => path === "components/AvatarLive.tsx"), "AvatarLive draws with the canvas")
  for (const { path, text } of drawers) {
    assert.match(text, /["']\.\/useAvatarLiveSlot["']/, `${path} mounts the canvas without the live budget`)
    assert.match(text, /useAvatarLiveSlot\(/, `${path} never asks the live budget`)
  }
  // outside the avatar module nobody reaches the canvas: rooms and screens draw through AvatarLive / AvatarHero
  const appSource = join(ROOT, "../..")
  for (const path of sourceFiles(appSource)) {
    if (path.startsWith(ROOT)) continue
    assert.doesNotMatch(readFileSync(path, "utf8"), /avatar\/renderer\/Avatar25Canvas["']/, `${relative(appSource, path)} imports the canvas`)
  }
})

test("a live avatar (AvatarLive, AvatarHero) is mounted only by room surfaces; everything else shows baked stills", () => {
  // lead decision 2026-10-11 (plan 2.2b): live canvases only in My Room, the room editor, RoomSetup and MiniRoom
  const ROOM_SURFACES = /^features\/(?:roomV2|roomWorld|miniRoom)\//
  const appSource = join(ROOT, "../..")
  const mounters: string[] = []
  for (const path of sourceFiles(appSource)) {
    if (path.startsWith(ROOT)) continue
    if (!/components\/Avatar(?:Live|Hero)["']/.test(readFileSync(path, "utf8"))) continue
    const where = relative(appSource, path)
    mounters.push(where)
    assert.match(where, ROOM_SURFACES, `${where} mounts a live avatar outside the rooms`)
  }
  assert.ok(mounters.length > 0, "the rooms still draw the live avatar")
})
