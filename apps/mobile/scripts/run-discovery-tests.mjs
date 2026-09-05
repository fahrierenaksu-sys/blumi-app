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
  "src/features/discovery/discoveryRefreshModel.test.ts",
  "src/features/discovery/discoveryFiltersModel.ts",
  "src/features/discovery/discoveryFiltersModel.test.ts",
  "src/features/discovery/discoveryDeckModel.ts",
  "src/features/discovery/discoveryDeckModel.test.ts",
  "src/features/discovery/discoveryLayoutMetrics.ts",
  "src/features/discovery/discoveryLayoutMetrics.test.ts",
  "src/features/discovery/discoveryErrorCopy.ts",
  "src/features/discovery/discoveryErrorCopy.test.ts",
  "src/features/discovery/discoverySurfaceCopy.ts",
  "src/features/discovery/discoverySurfaceCopy.test.ts",
  "src/features/discovery/discoveryCandidateModel.ts",
  "src/features/discovery/discoveryCandidateModel.test.ts",
  "src/features/discovery/discoverySchemas.ts",
  "src/features/discovery/discoverySchemas.test.ts",
  "src/features/discovery/discoveryQueryOptions.ts",
  "src/features/discovery/discoveryQueryOptions.test.ts",
  "src/features/discovery/lobbyPresentationModel.ts",
  "src/features/discovery/lobbyPresentationModel.test.ts",
  "src/features/demo/dummyProfiles.ts",
  "src/features/demo/dummyProfiles.test.ts",
  "src/features/matches/matchRoomModel.ts"
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
      join(outputDirectory, "features/discovery/discoveryRefreshModel.test.js"),
      join(outputDirectory, "features/discovery/discoveryFiltersModel.test.js"),
      join(outputDirectory, "features/discovery/discoveryDeckModel.test.js"),
      join(outputDirectory, "features/discovery/discoveryLayoutMetrics.test.js"),
      join(outputDirectory, "features/discovery/discoveryErrorCopy.test.js"),
      join(outputDirectory, "features/discovery/discoverySurfaceCopy.test.js"),
      join(outputDirectory, "features/discovery/discoveryCandidateModel.test.js"),
      join(outputDirectory, "features/discovery/discoverySchemas.test.js"),
      join(outputDirectory, "features/discovery/discoveryQueryOptions.test.js"),
      join(outputDirectory, "features/discovery/lobbyPresentationModel.test.js"),
      join(outputDirectory, "features/demo/dummyProfiles.test.js")
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
      resolve(workspaceRoot, "scripts/mobile-discovery-refresh-contract.test.mjs"),
      resolve(workspaceRoot, "scripts/mobile-discovery-presentation-contract.test.mjs"),
      resolve(workspaceRoot, "scripts/mobile-discovery-swipe-runtime.test.mjs")
    ],
    {
      cwd: workspaceRoot,
      stdio: "inherit"
    }
  )
} finally {
  rmSync(outputDirectory, { recursive: true, force: true })
}
