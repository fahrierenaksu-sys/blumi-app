import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import sharp from "sharp"

const MOBILE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const SESSION_ROOT = path.join(MOBILE_ROOT, "src/features/session")
const ASSET_ROOT = path.join(
  SESSION_ROOT,
  "assets/onboarding-runners-v11-remodeled-runtime"
)
const FRAME_FILES = Array.from(
  { length: 6 },
  (_, index) => `blumi_intro_run_male_f${String(index + 1).padStart(2, "0")}.png`
)

async function inspectFrame(fileName) {
  const filePath = path.join(ASSET_ROOT, fileName)
  const encoded = await readFile(filePath)
  const { data, info } = await sharp(encoded)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let minX = info.width
  let minY = info.height
  let maxX = -1
  let maxY = -1
  let transparentPixels = 0

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * 4 + 3]
      if (alpha <= 16) {
        transparentPixels += 1
        continue
      }
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  assert.ok(maxX >= minX && maxY >= minY, `${fileName} must contain a visible runner`)
  return {
    width: info.width,
    height: info.height,
    visibleHeight: maxY - minY + 1,
    centerX: (minX + maxX) / 2,
    bottom: maxY,
    transparentPixels,
    cornerAlpha: [
      data[3],
      data[(info.width - 1) * 4 + 3],
      data[(info.height - 1) * info.width * 4 + 3],
      data[(info.width * info.height - 1) * 4 + 3]
    ],
    hash: createHash("sha256").update(encoded).digest("hex")
  }
}

test("v11 remodeled male run ships six distinct transparent registered poses", async () => {
  const frames = await Promise.all(FRAME_FILES.map(inspectFrame))

  for (const [index, frame] of frames.entries()) {
    assert.deepEqual([frame.width, frame.height], [256, 384], FRAME_FILES[index])
    assert.equal(frame.visibleHeight, 258, FRAME_FILES[index])
    assert.ok(Math.abs(frame.centerX - 130) <= 0.5, FRAME_FILES[index])
    assert.equal(frame.bottom, 360, FRAME_FILES[index])
    assert.deepEqual(frame.cornerAlpha, [0, 0, 0, 0], FRAME_FILES[index])
    assert.ok(frame.transparentPixels > 0, `${FRAME_FILES[index]} must not retain the baked background`)
  }
  assert.equal(new Set(frames.map(({ hash }) => hash)).size, 6)
})

test("approved male catalog holds each remodeled pose for two female-equivalent ticks", async () => {
  const catalog = await readFile(
    path.join(SESSION_ROOT, "onboardingRunApprovedAssetCatalog.ts"),
    "utf8"
  )
  const boundFrames = [
    ...catalog.matchAll(
      /onboarding-runners-v11-remodeled-runtime\/(blumi_intro_run_male_f\d{2}\.png)/g
    )
  ].map((match) => match[1])
  const expectedFrames = FRAME_FILES.flatMap((fileName) => [fileName, fileName])

  assert.deepEqual(boundFrames, expectedFrames)
})

test("female and remodeled male are driven by one shared 720 ms frame clock", async () => {
  const hero = await readFile(path.join(SESSION_ROOT, "OnboardingWorldHero.tsx"), "utf8")
  const runner = await readFile(path.join(SESSION_ROOT, "OnboardingRunner.tsx"), "utf8")

  assert.match(runner, /RUNNER_FRAME_DURATION_MS = 60/)
  assert.match(runner, /ONBOARDING_RUNNER_FRAME_COUNT = 12/)
  assert.doesNotMatch(runner, /CHASER_RUNNER_(?:FRAME_COUNT|LOOP_DURATION_MS|FRAME_CLOCK_POSITIONS)/)
  assert.match(hero, /const runnerFrameClock = useRef\(new Animated\.Value\(0\)\)\.current/)
  assert.equal((hero.match(/sharedFrameClock=\{runnerFrameClock\}/g) ?? []).length, 2)
  assert.equal((hero.match(/Animated\.loop\(/g) ?? []).length, 1)
  assert.match(hero, /duration: RUNNER_FRAME_DURATION_MS \* ONBOARDING_RUNNER_FRAME_COUNT/)
})
