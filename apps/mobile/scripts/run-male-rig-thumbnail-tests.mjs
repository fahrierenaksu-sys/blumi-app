import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outputDirectory = mkdtempSync(join(tmpdir(), "blumi-male-rig-thumbnail-"))

try {
  execFileSync(
    process.execPath,
    [
      resolve(workspaceRoot, "../../node_modules/typescript/bin/tsc"),
      "--ignoreConfig",
      "--ignoreDeprecations", "6.0",
      "--types", "node",
      "src/features/avatarV2/avatarV2.types.ts",
      "src/features/avatarV2/avatarBodyCompatibility.ts",
      "src/features/avatarV2/maleRigThumbnailPresentation.ts",
      "src/features/avatarV2/maleRigThumbnailPresentation.test.ts",
      "--target",
      "ES2022",
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--outDir",
      outputDirectory,
      "--rootDir",
      "src",
      "--esModuleInterop",
      "--resolveJsonModule",
      "--skipLibCheck"
    ],
    { cwd: workspaceRoot, stdio: "inherit" }
  )
  execFileSync(
    process.execPath,
    [
      "--test",
      join(outputDirectory, "features/avatarV2/maleRigThumbnailPresentation.test.js")
    ],
    { cwd: workspaceRoot, stdio: "inherit" }
  )
} finally {
  rmSync(outputDirectory, { recursive: true, force: true })
}
