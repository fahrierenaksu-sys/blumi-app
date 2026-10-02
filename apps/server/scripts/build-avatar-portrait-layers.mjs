// Bundles the app's avatar portrait layer resolver for the server, so push
// notification pictures use exactly the layers and order the app draws.
// Image imports become repository-relative paths; the server reads the files
// from the checkout (Railway builds and runs from the full repository, as the
// room snapshot renderer already does).
import { build } from "esbuild"
import { mkdirSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repositoryRoot = resolve(workspaceRoot, "../..")
const entry = resolve(repositoryRoot, "apps/mobile/src/features/avatarV2/room/avatarPortraitLayers.ts")

export async function bundleAvatarPortraitLayers(outfile) {
  mkdirSync(dirname(outfile), { recursive: true })
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    logLevel: "warning",
    legalComments: "none",
    plugins: [{
      name: "blumi-image-paths",
      setup(pluginBuild) {
        pluginBuild.onLoad({ filter: /\.(png|webp)$/ }, (args) => ({
          contents: `module.exports = ${JSON.stringify(relative(repositoryRoot, args.path).split("\\").join("/"))}`,
          loader: "js"
        }))
      }
    }]
  })
  return outfile
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await bundleAvatarPortraitLayers(resolve(workspaceRoot, "dist/generated/avatarPortraitLayers.cjs"))
}
