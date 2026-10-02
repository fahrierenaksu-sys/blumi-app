// Release guard: EAS Update refuses an update with more than 1,000 assets, and
// develop OTAs stop working when the iOS bundle crosses it
// (docs/quality/OTA_ASSET_BUDGET_2026-10-02.md). Metro bundles every image
// and font that app code require()s, storing identical bytes once, so the
// distinct files required from apps/mobile source are an upper bound for the
// app's own share of the bundle. Library assets (icon fonts, navigation icons,
// Inter) are not visible to this scan and get a fixed allowance.
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, extname, join, relative, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const EAS_UPDATE_ASSET_LIMIT = 1000
/** Headroom kept below the EAS limit so new art does not silently stop OTAs. */
const REQUIRED_HEADROOM = 50
/** iOS assets that come from packages (44 in `npx expo export` on 2026-10-02). */
const PACKAGE_ASSET_ALLOWANCE = 60

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"])
const ASSET_REQUIRE = /require\(\s*["']([^"']+\.(?:png|jpe?g|webp|gif|ttf|otf))["']\s*\)/g

function* sourceFiles(directory) {
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      yield* sourceFiles(path)
    } else if (SOURCE_EXTENSIONS.has(extname(entry)) && !/\.test\.[cm]?[jt]sx?$/.test(entry)) {
      yield path
    }
  }
}

function requiredAppAssets() {
  const files = new Map()
  const roots = [join(mobileRoot, "src"), join(mobileRoot, "App.tsx"), join(mobileRoot, "index.js")]
  for (const root of roots) {
    if (!existsSync(root)) continue
    const paths = statSync(root).isDirectory() ? sourceFiles(root) : [root]
    for (const file of paths) {
      const source = readFileSync(file, "utf8")
      for (const match of source.matchAll(ASSET_REQUIRE)) {
        if (!match[1].startsWith(".")) continue
        const assetPath = resolve(dirname(file), match[1])
        assert.ok(existsSync(assetPath), `${relative(mobileRoot, file)} requires a missing asset ${match[1]}`)
        files.set(assetPath, createHash("sha256").update(readFileSync(assetPath)).digest("hex"))
      }
    }
  }
  return files
}

test("the iOS bundle stays under the EAS Update asset limit with headroom", () => {
  const assets = requiredAppAssets()
  const distinct = new Set(assets.values()).size
  const estimate = distinct + PACKAGE_ASSET_ALLOWANCE
  assert.ok(
    estimate <= EAS_UPDATE_ASSET_LIMIT - REQUIRED_HEADROOM,
    `App code requires ${distinct} distinct asset files (+${PACKAGE_ASSET_ALLOWANCE} from packages = ${estimate}). ` +
      `EAS Update accepts at most ${EAS_UPDATE_ASSET_LIMIT} per update; keep at least ${REQUIRED_HEADROOM} spare. ` +
      "Pack new room motion frames with scripts/build-room-motion-atlases.mjs."
  )
})
