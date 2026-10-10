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
for (const [rig, body] of Object.entries(stillManifest.bodies ?? {})) {
  const bust = body?.layers?.bust ?? []
  if (bust.length === 0) fail(`no bust layers for ${rig}`)
  for (const layer of bust) sources.set(`avatar/${rig}/bust/${layer.key}.webp`, join(stillLayersRoot, rig, "bust", `${layer.key}.webp`))
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
