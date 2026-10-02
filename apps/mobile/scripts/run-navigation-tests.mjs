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
  "src/navigation/mainTabPager/mainTabPagerConfig.ts",
  "src/navigation/mainTabPager/mainTabPagerModel.ts",
  "src/navigation/mainTabPager/mainTabPagerModel.test.ts",
  "src/navigation/mainTabPager/mainTabPagerRouter.ts",
  "src/navigation/mainTabPager/mainTabPagerRouter.test.ts",
  "src/navigation/mainTabPager/mainTabPageFocus.ts",
  "src/navigation/mainTabPager/mainTabPagerController.ts",
  "src/navigation/mainTabPager/mainTabPageFocus.test.ts",
  "src/features/appUpdates/otaUpdatePolicy.ts",
  "src/features/appUpdates/otaUpdatePolicy.test.ts",
  "src/ui/mainTabPagerEdgeHandoffModel.ts",
  "src/ui/mainTabPagerEdgeHandoffModel.test.ts",
  "src/features/roomV2/roomOwnerLabel.ts",
  "src/features/roomV2/roomOwnerLabel.test.ts",
  "src/navigation/linkedProfileResolutionModel.ts",
  "src/navigation/linkedProfileResolutionModel.test.ts",
  "src/navigation/pendingDeepLink.ts",
  "src/navigation/pendingDeepLink.test.ts",
  "src/navigation/blockedPartnerChatExit.ts",
  "src/navigation/blockedPartnerChatExit.test.ts",
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
      join(outputDirectory, "navigation/mainTabPager/mainTabPagerModel.test.js"),
      join(outputDirectory, "navigation/mainTabPager/mainTabPagerRouter.test.js"),
      join(outputDirectory, "navigation/mainTabPager/mainTabPageFocus.test.js"),
      join(outputDirectory, "features/appUpdates/otaUpdatePolicy.test.js"),
      join(outputDirectory, "ui/mainTabPagerEdgeHandoffModel.test.js"),
      join(outputDirectory, "features/roomV2/roomOwnerLabel.test.js"),
      join(outputDirectory, "navigation/linkedProfileResolutionModel.test.js"),
      join(outputDirectory, "navigation/pendingDeepLink.test.js"),
      join(outputDirectory, "navigation/blockedPartnerChatExit.test.js"),
      join(outputDirectory, "features/lobby/lobbyInviteAttempt.test.js"),
      join(outputDirectory, "features/shop/shopCatalogRuntime.test.js"),
      join(outputDirectory, "features/matches/matchResultPresentation.test.js"),
      resolve(workspaceRoot, "src/screens/matchFlowNavigation.test.mjs"),
      resolve(workspaceRoot, "src/navigation/rootNavigatorConcerns.test.mjs"),
      resolve(workspaceRoot, "src/navigation/routeParamsSerialisable.test.mjs"),
      resolve(workspaceRoot, "src/ui/gestureFrameWork.test.mjs"),
      resolve(workspaceRoot, "src/navigation/routeErrorBoundary.test.mjs")
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

  // Hook lifecycle tests read production sources through the hook harness.
  execFileSync(
    process.execPath,
    [
      "--import", "tsx",
      "--test",
      "src/navigation/linkedProfileScreenLifecycle.test.ts",
      "src/navigation/globalRealtimeSessionLifecycle.test.ts",
      "src/navigation/mainTabRenderIsolation.test.ts",
      "src/ui/springPressScale.test.ts",
      "src/navigation/useNotificationResponseRouting.test.ts"
    ],
    { cwd: workspaceRoot, stdio: "inherit" }
  )
} finally {
  rmSync(outputDirectory, { recursive: true, force: true })
}
