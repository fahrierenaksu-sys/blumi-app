// Counts the asset files that app code require()s, the way Metro bundles them:
// identical bytes are stored once, and for one platform a platform file
// (`x.ios.ts`, `x.native.ts`) replaces its plain twin `x.ts` while other
// platforms' files are left out. Without a platform every source file counts.
// Library assets (icon fonts, navigation icons, Inter) are not visible to this scan.
//
// Used by mobile-bundled-asset-bytes.test.mjs and, by hand, for release
// reports: `node scripts/mobileBundledAssets.mjs` prints the count and bytes.
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, extname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"])
// Images, fonts, packed GPU textures (.zip) and JSON data (rigs, calibration).
const ASSET_REQUIRE = /require\(\s*["']([^"']+\.(?:png|jpe?g|webp|gif|ttf|otf|zip|json))["']\s*\)/g
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/
const PLATFORM_SUFFIX = /\.(ios|android|native|web)$/

/** Every release is an iOS TestFlight build (docs/release/OTA_AND_TESTFLIGHT.md); no Android or web build ships. */
export const SHIPPED_PLATFORMS = ["ios"]

function platformVariants(platform) {
  return platform === "web" ? [platform] : [platform, "native"]
}

/** Whether Metro bundles this source file for `platform` (any platform when none is given). */
function isBundledFor(file, platform) {
  if (!platform) return true
  const stem = file.slice(0, -extname(file).length)
  const suffix = stem.match(PLATFORM_SUFFIX)
  if (suffix) return platformVariants(platform).includes(suffix[1])
  return !platformVariants(platform).some((variant) =>
    [...SOURCE_EXTENSIONS].some((extension) => existsSync(`${stem}.${variant}${extension}`))
  )
}

function* sourceFiles(directory) {
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      yield* sourceFiles(path)
    } else if (SOURCE_EXTENSIONS.has(extname(entry)) && !TEST_FILE.test(entry)) {
      yield path
    }
  }
}

/**
 * @param {string} [root]
 * @param {"ios" | "android" | "web"} [platform] the bundle to measure; omitted = every source file
 * @returns {{ distinctFiles: number, totalBytes: number, missing: string[], files: string[] }}
 */
export function measureRequiredAppAssets(root = mobileRoot, platform = undefined) {
  const bytesByHash = new Map()
  const missing = []
  const files = new Set()
  const entries = [join(root, "src"), join(root, "App.tsx"), join(root, "index.js")]
  for (const entry of entries) {
    if (!existsSync(entry)) continue
    for (const file of sourcesOf(entry)) {
      if (!isBundledFor(file, platform)) continue
      const source = readFileSync(file, "utf8")
      for (const match of source.matchAll(ASSET_REQUIRE)) {
        if (!match[1].startsWith(".")) continue
        const assetPath = resolve(dirname(file), match[1])
        if (!existsSync(assetPath)) {
          missing.push(`${relative(root, file)} -> ${match[1]}`)
          continue
        }
        const bytes = readFileSync(assetPath)
        files.add(relative(root, assetPath))
        bytesByHash.set(createHash("sha256").update(bytes).digest("hex"), bytes.length)
      }
    }
  }
  let totalBytes = 0
  for (const size of bytesByHash.values()) totalBytes += size
  return { distinctFiles: bytesByHash.size, totalBytes, missing, files: [...files].sort() }
}

function sourcesOf(entry) {
  return statSync(entry).isDirectory() ? sourceFiles(entry) : [entry]
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const MiB = (bytes) => Number((bytes / 1048576).toFixed(2))
  const report = {}
  for (const platform of [undefined, "ios", "android"]) {
    const { distinctFiles, totalBytes, missing } = measureRequiredAppAssets(mobileRoot, platform)
    report[platform ?? "allSources"] = { distinctFiles, totalMiB: MiB(totalBytes), missing: missing.length }
  }
  process.stdout.write(`${JSON.stringify(report)}\n`)
}
