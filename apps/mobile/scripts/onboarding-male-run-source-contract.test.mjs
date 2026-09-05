import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import sharp from "sharp"

const SESSION_ROOT = path.resolve("src/features/session")
const SOURCE_ROOT = path.join(
  SESSION_ROOT,
  "assets/onboarding-runners-v11-remodeled-runtime"
)

async function visibleBottom(filePath) {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  for (let y = info.height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] > 16) return y
    }
  }
  throw new Error(`No visible pixels in ${filePath}`)
}

test("approved male run binds six remodeled poses twice on the shared cadence", async () => {
  const approvedCatalog = await readFile(
    path.join(SESSION_ROOT, "onboardingRunApprovedAssetCatalog.ts"),
    "utf8"
  )
  const boundMaleFrames = [
    ...approvedCatalog.matchAll(
      /onboarding-runners-v11-remodeled-runtime\/(blumi_intro_run_male_f\d{2}\.png)/g
    )
  ].map((match) => match[1])

  assert.deepEqual(
    boundMaleFrames,
    Array.from({ length: 6 }, (_, index) => index + 1).flatMap((frame) => {
      const file = `blumi_intro_run_male_f${String(frame).padStart(2, "0")}.png`
      return [file, file]
    }),
    "each remodeled male pose must be held for two ticks like the female cycle"
  )
})

test("male run ships six transparent normalized source poses", async () => {
  const files = Array.from(
    { length: 6 },
    (_, index) => `blumi_intro_run_male_f${String(index + 1).padStart(2, "0")}.png`
  )
  const measuredBottoms = await Promise.all(
    files.map((file) =>
      visibleBottom(path.join(SOURCE_ROOT, file))
    )
  )

  assert.equal(measuredBottoms.length, 6)

  const runner = await readFile(path.join(SESSION_ROOT, "OnboardingRunner.tsx"), "utf8")
  assert.match(
    runner,
    /chaser:\s*\[13, 13, 22, 22, 16, 16, 5, 5, 17, 17, 15, 15\]/,
    "male frames must use the female pose cadence's registered baselines"
  )
})
