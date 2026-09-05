import assert from "node:assert/strict"
import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const componentPath = resolve(
  mobileRoot,
  "src/features/session/RegisterWorldHero.tsx"
)
const registerPath = resolve(mobileRoot, "src/screens/RegisterScreen.tsx")
const assetPath = resolve(
  mobileRoot,
  "src/features/session/assets/register-world-hero-v1-runtime/blumi_register_world_hero_v1.png"
)

test("register world hero is a premium transparent landscape asset", async () => {
  assert.equal(existsSync(assetPath), true)
  assert.ok(statSync(assetPath).size > 100_000)
  const metadata = await sharp(assetPath).metadata()
  assert.equal(metadata.width, 1024)
  assert.equal(metadata.height, 632)
  assert.equal(metadata.hasAlpha, true)

  const { data, info } = await sharp(assetPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let visibleEdgePixels = 0
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3]
      if (
        alpha > 8 &&
        (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1)
      ) visibleEdgePixels += 1
    }
  }
  assert.equal(visibleEdgePixels, 0)
})

test("register uses one native-driven hero without sprite-frame seams", () => {
  const component = readFileSync(componentPath, "utf8")
  const register = readFileSync(registerPath, "utf8")

  assert.match(component, /useReducedMotionPreference/)
  assert.match(component, /AppState/)
  assert.match(component, /Animated\.loop/)
  assert.match(component, /useNativeDriver: true/)
  assert.match(component, /resizeMode="contain"/)
  assert.doesNotMatch(component, /setTimeout|requestAnimationFrame/)
  assert.match(register, /RegisterWorldHero/)
  assert.doesNotMatch(register, /RegisterDancePair/)
})
