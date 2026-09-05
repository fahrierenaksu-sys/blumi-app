import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outputDirectory = mkdtempSync(join(tmpdir(), "blumi-room-persistence-"))
const nodeMajorVersion = Number(process.versions.node.split(".")[0])
const coverageArguments = nodeMajorVersion >= 22
  ? ["--experimental-test-coverage"]
  : []
const sourceFiles = [
  "src/features/network/apiClient.ts",
  "src/features/roomV2/roomV2.types.ts",
  "src/features/roomV2/roomV2EditorSession.ts",
  "src/features/roomV2/roomV2EditorSession.test.ts",
  "src/features/roomV2/roomV2EditorConfirmedSave.ts",
  "src/features/roomV2/roomV2EditorConfirmedSave.test.ts",
  "src/features/roomV2/roomStarterModel.ts",
  "src/features/roomV2/roomStarterModel.test.ts",
  "src/features/roomV2/roomV2Persistence.ts",
  "src/features/roomV2/roomV2PersistenceErrorCopy.ts",
  "src/features/roomV2/roomV2PersistenceErrorCopy.test.ts",
  "src/features/roomV2/personalRoomDecorApi.ts",
  "src/features/roomV2/personalRoomDecorApi.test.ts",
  "src/features/roomV2/personalRoomDecorSyncModel.ts",
  "src/features/roomV2/personalRoomDecorSyncModel.test.ts"
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
      "--target", "ES2022",
      "--module", "commonjs",
      "--moduleResolution", "node",
      "--outDir", outputDirectory,
      "--rootDir", "src",
      "--esModuleInterop",
      "--resolveJsonModule",
      "--skipLibCheck"
    ],
    { cwd: workspaceRoot, stdio: "inherit" }
  )
  execFileSync(
    process.execPath,
    [
      ...coverageArguments,
      "--test",
      join(
        outputDirectory,
        "features/roomV2/roomV2PersistenceErrorCopy.test.js"
      ),
      join(
        outputDirectory,
        "features/roomV2/personalRoomDecorApi.test.js"
      ),
      join(
        outputDirectory,
        "features/roomV2/personalRoomDecorSyncModel.test.js"
      ),
      join(
        outputDirectory,
        "features/roomV2/roomStarterModel.test.js"
      ),
      join(
        outputDirectory,
        "features/roomV2/roomV2EditorSession.test.js"
      ),
      join(
        outputDirectory,
        "features/roomV2/roomV2EditorConfirmedSave.test.js"
      )
    ],
    { cwd: workspaceRoot, stdio: "inherit" }
  )
} finally {
  rmSync(outputDirectory, { recursive: true, force: true })
}
