// Counts the asset files that app code require()s, the way Metro bundles them:
// identical bytes are stored once. Library assets (icon fonts, navigation
// icons, Inter) are not visible to this scan.
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
 * @returns {{ distinctFiles: number, totalBytes: number, missing: string[] }}
 */
export function measureRequiredAppAssets(root = mobileRoot) {
  const bytesByHash = new Map()
  const missing = []
  const entries = [join(root, "src"), join(root, "App.tsx"), join(root, "index.js")]
  for (const entry of entries) {
    if (!existsSync(entry)) continue
    const files = statSync(entry).isDirectory() ? sourceFiles(entry) : [entry]
    for (const file of files) {
      const source = readFileSync(file, "utf8")
      for (const match of source.matchAll(ASSET_REQUIRE)) {
        if (!match[1].startsWith(".")) continue
        const assetPath = resolve(dirname(file), match[1])
        if (!existsSync(assetPath)) {
          missing.push(`${relative(root, file)} -> ${match[1]}`)
          continue
        }
        const bytes = readFileSync(assetPath)
        bytesByHash.set(createHash("sha256").update(bytes).digest("hex"), bytes.length)
      }
    }
  }
  let totalBytes = 0
  for (const size of bytesByHash.values()) totalBytes += size
  return { distinctFiles: bytesByHash.size, totalBytes, missing }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { distinctFiles, totalBytes, missing } = measureRequiredAppAssets()
  process.stdout.write(
    `${JSON.stringify({ distinctFiles, totalMiB: Number((totalBytes / 1048576).toFixed(2)), missing: missing.length })}\n`
  )
}
