import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repositoryRoot = resolve(workspaceRoot, "../..")
const outputDirectory = mkdtempSync(join(tmpdir(), "blumi-runtime-fixes-"))
const sourceFiles = [
  "src/features/avatarV2/avatarEquipSave.ts",
  "src/features/avatarV2/avatarEquipSave.test.ts",
  "src/features/avatarV2/avatarEquipLifecycle.ts",
  "src/features/avatarV2/avatarEquipLifecycle.test.ts",
  "src/features/miniRoom/scene/miniRoomMovementLifecycle.ts",
  "src/features/miniRoom/scene/miniRoomMovementLifecycle.test.ts",
  "src/features/miniRoom/scene/miniRoomReducedMotion.ts",
  "src/features/miniRoom/scene/miniRoomReducedMotion.test.ts"
]

try {
  execFileSync(
    process.execPath,
    [
      resolve(workspaceRoot, "../../node_modules/typescript/bin/tsc"),
      "--ignoreConfig",
      "--ignoreDeprecations", "6.0",
      "--types", "node",
      ...sourceFiles,
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
    {
      cwd: workspaceRoot,
      env: { ...process.env, NODE_PATH: join(repositoryRoot, "node_modules") },
      stdio: "inherit"
    }
  )

  execFileSync(
    process.execPath,
    [
      "--test",
      join(outputDirectory, "features/avatarV2/avatarEquipSave.test.js"),
      join(outputDirectory, "features/avatarV2/avatarEquipLifecycle.test.js"),
      join(outputDirectory, "features/miniRoom/scene/miniRoomMovementLifecycle.test.js"),
      join(outputDirectory, "features/miniRoom/scene/miniRoomReducedMotion.test.js")
    ],
    {
      cwd: workspaceRoot,
      env: { ...process.env, NODE_PATH: join(repositoryRoot, "node_modules") },
      stdio: "inherit"
    }
  )
} finally {
  rmSync(outputDirectory, { recursive: true, force: true })
}
