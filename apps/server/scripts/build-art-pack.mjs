// Builds dist/art: the server's own copy of every file the room showcase renderer and the push portrait renderer can
// name (room shell and furniture layers, the baked 2.5D avatar bust layers), a sha256 manifest, and the pure room
// draw-list resolver bundled from the app's calibration (esbuild, a dependency of tsx). At run time the
// server reads only dist/art, never apps/mobile. The build FAILS on a missing file or a copy whose hash differs.
// `--check` verifies an existing dist/art against the sources without writing.
import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const roomV2Root = resolve(serverRoot, "../mobile/src/features/roomV2")
const stillLayersRoot = resolve(serverRoot, "../mobile/src/features/avatar/stills/layers")
const stillManifestPath = resolve(serverRoot, "../../packages/domain/src/avatar/avatarStillManifest.json")
const showcaseAllowlistPath = resolve(serverRoot, "../../tools/avatar25d/showcase-allowlist.json")
const outDir = resolve(serverRoot, "dist/art")
const require = createRequire(import.meta.url)
const check = process.argv.includes("--check")

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")
const fail = (message) => {
  console.error(`build-art-pack: ${message}`)
  process.exit(1)
}

const bundlePath = join(outDir, "roomDrawList.cjs")
if (!check) {
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  await require("esbuild").build({
    entryPoints: [resolve(serverRoot, "art/roomDrawList.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    outfile: bundlePath,
    logLevel: "error",
    plugins: [{
      // an image `require` in the app's asset tables becomes its path under roomV2/ (its art-pack path)
      name: "art-path",
      setup(build) {
        build.onLoad({ filter: /\.(png|webp)$/ }, (args) => ({
          contents: `module.exports = ${JSON.stringify(relative(roomV2Root, args.path).split("\\").join("/"))}`,
          loader: "js"
        }))
      }
    }]
  })
}
if (!existsSync(bundlePath)) fail("dist/art/roomDrawList.cjs is missing; run the build")
const drawList = require(bundlePath)

// pack path -> source path; the shell plus every layer a drawable piece can name
const sources = new Map([[drawList.ROOM_SHELL_ART_PATH, join(roomV2Root, "assets/runtime/room_shell_blumi_world_v1.webp")]])
for (const itemId of drawList.listDrawableRoomItemIds()) {
  const paths = drawList.listRoomItemArtPaths(itemId)
  if (paths.length === 0) fail(`no art for ${itemId}`)
  for (const path of paths) sources.set(path, join(roomV2Root, path))
}

// every bust layer the still manifest can name: avatar/<rig>/bust/<key>.webp (the portrait renderer's paths)
const stillManifest = JSON.parse(readFileSync(stillManifestPath, "utf8"))
// A body the showcase allowlist approved must have its front art in the manifest: say so here, not as a silent 3/4 push.
const showcaseAllowlist = existsSync(showcaseAllowlistPath) ? JSON.parse(readFileSync(showcaseAllowlistPath, "utf8")) : { bodies: {} }
for (const [rig, approved] of Object.entries(showcaseAllowlist.bodies ?? {})) {
  const body = stillManifest.bodies?.[rig]
  if (!body?.showcaseBase) fail(`front art missing: the showcase allowlist approves ${rig}, but the still manifest has no showcaseBase for it (run tools/avatar25d/bake-showcase.mjs, then bake-stills.mjs)`)
  const missing = Object.keys(approved.items ?? {}).filter((id) => !body.items?.[id]?.showcase)
  if (missing.length > 0) fail(`front art missing: ${missing.length} allowlisted ${rig} item(s) have no showcase layer in the still manifest (run bake-showcase.mjs, then bake-stills.mjs)`)
}
for (const [rig, body] of Object.entries(stillManifest.bodies ?? {})) {
  const bust = body?.layers?.bust ?? []
  if (bust.length === 0) fail(`no bust layers for ${rig}`)
  for (const layer of bust) sources.set(`avatar/${rig}/bust/${layer.key}.webp`, join(stillLayersRoot, rig, "bust", `${layer.key}.webp`))
  // the front (showcase) layers the push picture draws, once a body has front art: the base plus each item's layers
  // (front, hair back, and the body under the item with its erase mask applied).
  // A body without `showcaseBase` has none yet, and its pushes draw the 3/4 bust.
  if (!body?.showcaseBase) continue
  const showcaseKeys = new Set([body.showcaseBase.key])
  for (const item of Object.values(body.items ?? {})) {
    if (item?.showcase?.key) showcaseKeys.add(item.showcase.key)
    if (item?.showcase?.back?.key) showcaseKeys.add(item.showcase.back.key)
    if (item?.showcase?.under?.key) showcaseKeys.add(item.showcase.under.key)
  }
  for (const key of showcaseKeys) sources.set(`avatar/${rig}/showcase/${key}.webp`, join(stillLayersRoot, rig, "showcase", `${key}.webp`))
}

const files = {}
for (const [path, source] of [...sources].sort(([a], [b]) => a.localeCompare(b))) {
  if (!existsSync(source)) fail(`missing ${path}`)
  const target = join(outDir, path)
  if (!check) {
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(source, target)
  }
  const expected = sha256(source)
  if (!existsSync(target) || sha256(target) !== expected) fail(`hash differs for ${path}`)
  files[path] = expected
}
const manifest = { version: 1, renderer: "room-snapshot-v2", files }
if (check) {
  const current = JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf8"))
  if (JSON.stringify(current.files) !== JSON.stringify(files)) fail("manifest.json differs from the sources")
} else {
  writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`)
}
console.log(`build-art-pack: ${Object.keys(files).length} files ${check ? "verified" : "written"}`)
