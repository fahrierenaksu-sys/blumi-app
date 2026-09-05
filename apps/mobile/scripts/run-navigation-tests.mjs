import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outputDirectory = mkdtempSync(join(tmpdir(), "blumi-navigation-tests-"))
const nodeMajorVersion = Number(process.versions.node.split(".")[0])
const coverageArguments = nodeMajorVersion >= 22
  ? ["--experimental-test-coverage"]
  : []
const sourceFiles = [
  "src/navigation/rootNavigationModel.ts",
  "src/navigation/rootNavigationModel.test.ts",
  "src/navigation/linkedProfileResolutionModel.ts",
  "src/navigation/linkedProfileResolutionModel.test.ts",
  "src/features/lobby/lobbyInviteAttempt.ts",
  "src/features/lobby/lobbyInviteAttempt.test.ts",
  "src/features/shop/shopCatalogRuntime.ts",
  "src/features/shop/shopCatalogRuntime.test.ts"
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
      "--jsx",
      "react-jsx",
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
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_PATH: resolve(workspaceRoot, "../../node_modules")
      }
    }
  )

  execFileSync(
    process.execPath,
    [
      ...coverageArguments,
      "--test",
      join(outputDirectory, "navigation/rootNavigationModel.test.js"),
      join(outputDirectory, "navigation/linkedProfileResolutionModel.test.js"),
      join(outputDirectory, "features/lobby/lobbyInviteAttempt.test.js"),
      join(outputDirectory, "features/shop/shopCatalogRuntime.test.js")
    ],
    {
      cwd: workspaceRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_PATH: resolve(workspaceRoot, "../../node_modules")
      }
    }
  )
} finally {
  rmSync(outputDirectory, { recursive: true, force: true })
}
