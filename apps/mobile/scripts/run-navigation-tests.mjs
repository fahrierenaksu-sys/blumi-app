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
  "src/navigation/bottomNavReturnPreview.ts",
  "src/navigation/bottomNavReturnPreview.test.ts",
  "src/navigation/rootNavigationChromeStore.ts",
  "src/navigation/rootNavigationChromeStore.test.ts",
  "src/navigation/mainTabSwitchStress.test.ts",
  "src/navigation/linkedProfileResolutionModel.ts",
  "src/navigation/linkedProfileResolutionModel.test.ts",
  "src/navigation/pendingDeepLink.ts",
  "src/navigation/pendingDeepLink.test.ts",
  "src/features/lobby/lobbyInviteAttempt.ts",
  "src/features/lobby/lobbyInviteAttempt.test.ts",
  "src/features/shop/shopCatalogRuntime.ts",
  "src/features/shop/shopCatalogRuntime.test.ts",
  "src/features/matches/matchResultPresentation.ts",
  "src/features/matches/matchResultPresentation.test.ts"
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
      join(outputDirectory, "navigation/rootNavigationChromeStore.test.js"),
      join(outputDirectory, "navigation/mainTabSwitchStress.test.js"),
      join(outputDirectory, "navigation/linkedProfileResolutionModel.test.js"),
      join(outputDirectory, "navigation/pendingDeepLink.test.js"),
      join(outputDirectory, "features/lobby/lobbyInviteAttempt.test.js"),
      join(outputDirectory, "features/shop/shopCatalogRuntime.test.js"),
      join(outputDirectory, "features/matches/matchResultPresentation.test.js"),
      resolve(workspaceRoot, "src/screens/matchFlowNavigation.test.mjs"),
      resolve(workspaceRoot, "scripts/mobile-lobby-invite-fail-closed.test.mjs"),
      resolve(workspaceRoot, "scripts/mobile-core-flow-presentation-contract.test.mjs"),
      resolve(workspaceRoot, "src/navigation/rootNavigatorConcerns.test.mjs")
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
