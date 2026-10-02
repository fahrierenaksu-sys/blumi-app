import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outputDirectory = mkdtempSync(join(tmpdir(), "blumi-discovery-tests-"))
const nodeMajorVersion = Number(process.versions.node.split(".")[0])
const coverageArguments = nodeMajorVersion >= 22
  ? ["--experimental-test-coverage", "--test-coverage-exclude=**/packages/domain/dist/**"]
  : []
const sourceFiles = [
  "src/features/network/apiClient.ts",
  "src/features/network/apiClient.test.ts",
  "src/features/discovery/discoveryApi.ts",
  "src/features/discovery/discoveryApi.test.ts",
  "src/features/discovery/discoveryDecisionRetry.ts",
  "src/features/discovery/discoveryDecisionRetry.test.ts",
  "src/features/discovery/discoveryRefreshModel.test.ts",
  "src/features/discovery/discoveryFiltersModel.ts",
  "src/features/discovery/discoveryFiltersModel.test.ts",
  "src/features/discovery/discoveryFiltersSheetModel.ts",
  "src/features/discovery/discoveryFiltersSheetModel.test.ts",
  "src/features/discovery/discoveryFirstFrameAssetWarmup.ts",
  "src/features/discovery/discoveryFirstFrameAssetWarmup.test.ts",
  "src/features/discovery/discoveryStartupModel.ts",
  "src/features/discovery/discoveryStartupModel.test.ts",
  "src/features/discovery/discoveryDeckModel.ts",
  "src/features/discovery/discoveryDeckModel.test.ts",
  "src/features/discovery/matchResultNavigation.ts",
  "src/features/discovery/matchResultNavigation.test.ts",
  "src/features/discovery/discoveryLayoutMetrics.ts",
  "src/features/discovery/discoveryLayoutMetrics.test.ts",
  "src/features/discovery/discoveryErrorCopy.ts",
  "src/features/discovery/discoveryErrorCopy.test.ts",
  "src/features/discovery/discoverySurfaceCopy.ts",
  "src/features/discovery/discoveryHomeCopy.ts",
  "src/features/discovery/discoveryHomeCopy.test.ts",
  "src/features/discovery/discoveryCandidateModel.ts",
  "src/features/discovery/discoveryCandidateModel.test.ts",
  "src/features/discovery/discoverySchemas.ts",
  "src/features/discovery/discoverySchemas.test.ts",
  "src/features/discovery/discoveryQueryOptions.ts",
  "src/features/discovery/discoveryQueryOptions.test.ts",
  "src/features/discovery/discoveryWatchMutation.ts",
  "src/features/discovery/discoveryWatchMutation.test.ts",
  "src/features/discovery/lobbyPresentationModel.ts",
  "src/features/discovery/lobbyPresentationModel.test.ts",
  "src/features/discovery/discoveryCardFlipModel.ts",
  "src/features/discovery/discoveryCardFlipModel.test.ts",
  "src/features/discovery/profilePreviewCopy.ts",
  "src/features/discovery/profilePreviewHeroModel.ts",
  "src/features/discovery/discoveryShowcaseAuthorizationModel.ts",
  "src/features/discovery/discoveryShowcaseAuthorizationModel.test.ts",
  "src/features/discovery/profilePreviewHeroModel.test.ts",
  "src/features/discovery/roomShowcaseApi.ts",
  "src/features/discovery/roomShowcaseApi.test.ts",
  "src/features/discovery/screen/discoveryScreenModel.ts",
  "src/features/discovery/screen/discoveryScreenModel.test.ts",
  "src/features/lobby/pendingInviteModel.ts",
  "src/features/lobby/pendingInviteModel.test.ts",
  "src/features/demo/dummyProfiles.ts",
  "src/features/demo/dummyProfiles.test.ts",
  "src/features/demo/demoStore.ts",
  "src/features/demo/demoStore.test.ts",
  "src/features/matches/matchRoomModel.ts",
  "src/features/matches/discoveryMatchCreatedReporter.ts",
  "src/features/matches/discoveryMatchCreatedReporter.test.ts"
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
      env: {
        ...process.env,
        NODE_PATH: resolve(workspaceRoot, "../../node_modules")
      },
      stdio: "inherit"
    }
  )

  execFileSync(
    process.execPath,
    [
      ...coverageArguments,
      "--test",
      join(outputDirectory, "features/network/apiClient.test.js"),
      join(outputDirectory, "features/discovery/discoveryApi.test.js"),
      join(outputDirectory, "features/discovery/discoveryDecisionRetry.test.js"),
      join(outputDirectory, "features/discovery/discoveryRefreshModel.test.js"),
      join(outputDirectory, "features/discovery/discoveryFiltersModel.test.js"),
      join(outputDirectory, "features/discovery/discoveryFiltersSheetModel.test.js"),
      join(outputDirectory, "features/discovery/discoveryFirstFrameAssetWarmup.test.js"),
      join(outputDirectory, "features/discovery/discoveryDeckModel.test.js"),
      join(outputDirectory, "features/discovery/matchResultNavigation.test.js"),
      join(outputDirectory, "features/discovery/discoveryLayoutMetrics.test.js"),
      join(outputDirectory, "features/discovery/discoveryErrorCopy.test.js"),
      join(outputDirectory, "features/discovery/discoveryHomeCopy.test.js"),
      join(outputDirectory, "features/discovery/discoveryCandidateModel.test.js"),
      join(outputDirectory, "features/discovery/discoverySchemas.test.js"),
      join(outputDirectory, "features/discovery/discoveryQueryOptions.test.js"),
      join(outputDirectory, "features/discovery/discoveryStartupModel.test.js"),
      join(outputDirectory, "features/discovery/discoveryWatchMutation.test.js"),
      join(outputDirectory, "features/discovery/lobbyPresentationModel.test.js"),
      join(outputDirectory, "features/discovery/discoveryCardFlipModel.test.js"),
      join(outputDirectory, "features/discovery/profilePreviewHeroModel.test.js"),
      join(outputDirectory, "features/discovery/discoveryShowcaseAuthorizationModel.test.js"),
      join(outputDirectory, "features/discovery/roomShowcaseApi.test.js"),
      join(outputDirectory, "features/discovery/screen/discoveryScreenModel.test.js"),
      join(outputDirectory, "features/lobby/pendingInviteModel.test.js"),
      join(outputDirectory, "features/demo/dummyProfiles.test.js"),
      join(outputDirectory, "features/demo/demoStore.test.js"),
      join(outputDirectory, "features/matches/discoveryMatchCreatedReporter.test.js")
    ],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        NODE_PATH: resolve(workspaceRoot, "../../node_modules")
      },
      stdio: "inherit"
    }
  )

  execFileSync(
    process.execPath,
    [
      "--test",
      resolve(workspaceRoot, "src/features/discovery/DiscoveryStartupBoundary.test.mjs")
    ],
    {
      cwd: workspaceRoot,
      stdio: "inherit"
    }
  )

  // Hook tests load their module graph through tsx with native modules stubbed.
  execFileSync(
    process.execPath,
    [
      "--import", "tsx",
      "--test",
      "src/features/discovery/screen/useDiscoveryDecisions.test.ts",
      "src/features/discovery/screen/useDiscoveryDeck.test.ts",
      "src/features/discovery/discoverySwipeModel.test.ts",
      "src/features/discovery/copyLocaleParity.test.ts",
      "src/ui/preparedDiscoveryLoadingScreen.test.ts"
    ],
    {
      cwd: workspaceRoot,
      stdio: "inherit"
    }
  )
} finally {
  rmSync(outputDirectory, { recursive: true, force: true })
}
