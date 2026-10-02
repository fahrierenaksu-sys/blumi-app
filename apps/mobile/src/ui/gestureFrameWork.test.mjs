import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { findPerFrameJsWork, listSourceFiles } from "../testing/gestureFrameWorkGuard.mjs"

// Tree-wide: drags, swipes and scrolls never schedule JS work on every frame.
// Any pager, sheet, card or editor gesture design is free otherwise.
const sourceRoot = fileURLToPath(new URL("..", import.meta.url))

test("per-frame gesture and scroll callbacks never cross to JS outside a threshold guard", () => {
  assert.deepEqual(findPerFrameJsWork(listSourceFiles(sourceRoot), sourceRoot), [])
})

test("the guard catches unguarded per-frame JS calls and allows threshold-guarded ones", () => {
  const directory = mkdtempSync(join(tmpdir(), "blumi-gesture-guard-"))
  try {
    const file = join(directory, "fixture.ts")
    writeFileSync(file, `
      const pan = Gesture.Pan()
        .onUpdate((event) => {
          scheduleOnRN(report, event.translationX)
          if (event.translationX > 80) scheduleOnRN(tick)
        })
        .onEnd(() => scheduleOnRN(finish))
      const scroll = useAnimatedScrollHandler({
        onScroll: (event) => { setOffset(event.contentOffset.y) }
      })
      const other = useAnimatedScrollHandler((event) => {
        offset.value = event.contentOffset.y
      })
    `)
    const violations = findPerFrameJsWork([file], directory)
    assert.deepEqual(violations, [
      "fixture.ts:4 .onUpdate -> scheduleOnRN",
      "fixture.ts:9 onScroll -> setOffset"
    ])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("the app root mounts the gesture handler root view", () => {
  const app = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8")
  assert.match(app, /<GestureHandlerRootView\b/)
})
