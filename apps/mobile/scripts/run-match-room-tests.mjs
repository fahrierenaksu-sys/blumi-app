import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repositoryRoot = resolve(workspaceRoot, "../..")
// Keep emitted files at the same repository depth as `src` so runtime JSON and
// art-manifest imports that intentionally resolve from the repository root keep
// their production path semantics during focused tests.
const outputDirectory = mkdtempSync(join(workspaceRoot, ".blumi-match-room-tests-"))
const nodeMajorVersion = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10)
const coverageArguments = nodeMajorVersion >= 22
  ? ["--experimental-test-coverage"]
  : []
const sourceFiles = [
  "src/features/miniRoom/sharedRoomDecor.ts",
  "src/features/miniRoom/sharedRoomDecor.test.ts",
  "src/features/matches/matchRoomModel.ts",
  "src/features/matches/matchRoomResolvers.ts",
  "src/features/matches/matchRoomModel.test.ts",
  "src/features/avatarV2/avatarV2.types.ts",
  "src/config/env.ts",
  "src/config/env.test.ts",
  "src/features/roomV2/roomV2.types.ts",
  "src/features/roomV2/roomV2.mock.ts",
  "src/features/roomV2/roomV2Camera.ts",
  "src/features/roomV2/roomV2Camera.test.ts",
  "src/features/roomV2/myRoomLayoutMetrics.ts",
  "src/features/roomV2/myRoomLayoutMetrics.test.ts",
  "src/features/roomV2/myRoomConsolePresentation.test.ts",
  "src/features/roomV2/roomV2AvatarMotion.ts",
  "src/features/roomV2/roomV2AvatarMotion.test.ts",
  "src/features/roomV2/roomV2RenderSurface.ts",
  "src/features/roomV2/roomV2RenderSurface.test.ts",
  "src/features/roomV2/roomV3Contracts.ts",
  "src/features/roomV2/roomV3Contracts.test.ts",
  "src/features/roomV2/roomV3ProductionPlan.ts",
  "src/features/roomV2/roomV3ProductionPlan.test.ts",
  "src/features/roomV2/roomV3CatalogManifest.ts",
  "src/features/roomV2/roomV3CatalogManifest.test.ts",
  "src/features/roomV2/roomV3CollectionCoverage.ts",
  "src/features/roomV2/roomV3CollectionCoverage.test.ts",
  "src/features/roomV2/roomV3FurnitureCandidateGate.ts",
  "src/features/roomV2/roomV3FurnitureCandidateGate.test.ts",
  "src/features/roomV2/roomV3UniversalCoreInventory.ts",
  "src/features/roomV2/roomV3UniversalCoreArtifactRegistry.ts",
  "src/features/roomV2/roomV3UniversalCoreEvidenceManifest.ts",
  "src/features/roomV2/roomV3UniversalCoreEvidenceManifest.test.ts",
  "src/features/roomV2/roomV3UniversalCoreStaticRuntimeEvidence.ts",
  "src/features/roomV2/roomV3UniversalCorePilotFurniture.ts",
  "src/features/roomV2/roomV3UniversalCorePilotFurniture.test.ts",
  "src/features/roomV2/roomV3UniversalCoreSurfacePilotFurniture.ts",
  "src/features/roomV2/roomV3UniversalCoreCandidateIds.ts",
  "src/features/roomV2/roomV3PhysicalScaleContract.ts",
  "src/features/roomV2/roomV3PhysicalScaleContract.test.ts",
  "src/features/roomV2/roomV3UniversalCoreSurfacePilotFurniture.test.ts",
  "src/features/roomV2/roomV3CocoaPilotFurniture.ts",
  "src/features/roomV2/roomV3CocoaPilotFurniture.test.ts",
  "src/features/roomV2/roomV3UniversalCoreRuntimeFurniture.ts",
  "src/features/roomV2/roomV3UniversalCoreRuntimeFurniture.test.ts",
  "src/features/roomV2/roomV3UniversalCoreQaPreview.ts",
  "src/features/roomV2/roomV3UniversalCoreQaCatalog.ts",
  "src/features/roomV2/roomV3UniversalCoreQaCatalog.test.ts",
  "src/features/roomV2/roomV3Focus12CandidateIds.ts",
  "src/features/roomV2/roomV3FurnitureFocus12Draft.ts",
  "src/features/roomV2/roomV3FurnitureFocus12Draft.test.ts",
  "src/features/roomV2/roomV3Focus12QaCatalog.ts",
  "src/features/roomV2/roomV3Focus12QaCatalog.test.ts",
  "src/features/roomV2/roomV3QaFurnitureCatalogRuntime.ts",
  "src/features/roomV2/roomV3QaFurnitureCatalogRuntime.test.ts",
  "src/features/roomV2/roomV3UniversalCoreQaRuntimeEvidence.ts",
  "src/features/roomV2/roomV3UniversalCoreQaRuntimeEvidence.test.ts",
  "src/features/roomV2/roomV2QaOwnership.ts",
  "src/features/roomV2/roomV2QaOwnership.test.ts",
  "src/features/roomV2/roomV2ProviderRuntime.ts",
  "src/features/roomV2/roomV2ProviderRuntime.test.ts",
  "src/features/roomV2/roomV3UniversalCorePromotion.ts",
  "src/features/roomV2/roomV3UniversalCorePromotion.test.ts",
  "src/features/roomV2/roomV3ShellProductionContract.ts",
  "src/features/roomV2/roomV3ShellProductionContract.test.ts",
  "src/features/roomV2/roomV3ShellPromotion.ts",
  "src/features/roomV2/roomV3ShellPromotion.test.ts",
  "src/features/roomV2/roomV2DecorActions.ts",
  "src/features/roomV2/roomV2DecorActions.test.ts",
  "src/features/roomV2/roomV2EditorPresentation.ts",
  "src/features/roomV2/roomV2EditorPresentation.test.ts",
  "src/features/roomV2/roomV2ExactRotation.ts",
  "src/features/roomV2/roomV2ExactRotation.test.ts",
  "src/features/roomV2/roomV2Persistence.ts",
  "src/features/roomV2/roomV2Persistence.test.ts",
  "src/features/roomV2/roomV2EditGate.ts",
  "src/features/roomV2/roomV2EditGate.test.ts",
  "src/features/roomV2/roomV2EditorPlacementCommitControl.test.ts",
  "src/features/roomV2/roomV2Selectors.ts",
  "src/features/roomV2/roomV2Selectors.test.ts",
  "src/features/roomV2/roomV2PlacementSurface.ts",
  "src/features/roomV2/roomV2PlacementSurface.test.ts",
  "src/features/roomV2/roomV2DraftPlacementCandidates.ts",
  "src/features/roomV2/roomV2DraftPlacementCandidates.test.ts",
  "src/features/roomWorld/roomWorldGeometry.ts",
  "src/features/roomWorld/roomWorldGeometry.test.ts",
  "src/features/roomWorld/roomWorldRuntime.ts",
  "src/features/roomWorld/roomWorldRuntime.test.ts",
  "src/features/roomWorld/myRoomInteractionModel.ts",
  "src/features/roomWorld/myRoomInteractionModel.test.ts",
  "src/features/roomWorld/roomWorldRoomV2Projection.ts",
  "src/features/roomWorld/roomWorldRoomV2Projection.test.ts"
]

try {
  execFileSync("npm", ["run", "build"], {
    cwd: resolve(repositoryRoot, "packages/domain"),
    stdio: "inherit"
  })

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
      "--resolveJsonModule",
      "--outDir",
      outputDirectory,
      "--rootDir",
      "src",
      "--esModuleInterop",
      "--skipLibCheck"
    ],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        NODE_PATH: [
          resolve(workspaceRoot, "node_modules"),
          resolve(repositoryRoot, "node_modules"),
          process.env.NODE_PATH
        ].filter(Boolean).join(":")
      },
      stdio: "inherit"
    }
  )

  execFileSync(
    process.execPath,
    [
      ...coverageArguments,
      "--test",
      join(outputDirectory, "features/miniRoom/sharedRoomDecor.test.js"),
      join(outputDirectory, "features/matches/matchRoomModel.test.js"),
      join(outputDirectory, "config/env.test.js"),
      join(outputDirectory, "features/roomV2/roomV2Camera.test.js"),
      join(outputDirectory, "features/roomV2/myRoomLayoutMetrics.test.js"),
      join(outputDirectory, "features/roomV2/myRoomConsolePresentation.test.js"),
      join(outputDirectory, "features/roomV2/roomV2AvatarMotion.test.js"),
      join(outputDirectory, "features/roomV2/roomV2RenderSurface.test.js"),
      join(outputDirectory, "features/roomV2/roomV3Contracts.test.js"),
      join(outputDirectory, "features/roomV2/roomV3ProductionPlan.test.js"),
      join(outputDirectory, "features/roomV2/roomV3CatalogManifest.test.js"),
      join(outputDirectory, "features/roomV2/roomV3CollectionCoverage.test.js"),
      join(outputDirectory, "features/roomV2/roomV3FurnitureCandidateGate.test.js"),
      join(outputDirectory, "features/roomV2/roomV3PhysicalScaleContract.test.js"),
      join(outputDirectory, "features/roomV2/roomV3UniversalCoreRuntimeFurniture.test.js"),
      join(outputDirectory, "features/roomV2/roomV3UniversalCorePilotFurniture.test.js"),
      join(outputDirectory, "features/roomV2/roomV3UniversalCoreQaCatalog.test.js"),
      join(outputDirectory, "features/roomV2/roomV3FurnitureFocus12Draft.test.js"),
      join(outputDirectory, "features/roomV2/roomV3Focus12QaCatalog.test.js"),
      join(outputDirectory, "features/roomV2/roomV3QaFurnitureCatalogRuntime.test.js"),
      join(outputDirectory, "features/roomV2/roomV3UniversalCoreQaRuntimeEvidence.test.js"),
      join(outputDirectory, "features/roomV2/roomV2QaOwnership.test.js"),
      join(outputDirectory, "features/roomV2/roomV2ProviderRuntime.test.js"),
      join(outputDirectory, "features/roomV2/roomV3UniversalCoreSurfacePilotFurniture.test.js"),
      join(outputDirectory, "features/roomV2/roomV3CocoaPilotFurniture.test.js"),
      join(outputDirectory, "features/roomV2/roomV3UniversalCoreEvidenceManifest.test.js"),
      join(outputDirectory, "features/roomV2/roomV3UniversalCorePromotion.test.js"),
      join(outputDirectory, "features/roomV2/roomV3ShellProductionContract.test.js"),
      join(outputDirectory, "features/roomV2/roomV3ShellPromotion.test.js"),
      join(outputDirectory, "features/roomV2/roomV2DecorActions.test.js"),
      join(outputDirectory, "features/roomV2/roomV2EditorPresentation.test.js"),
      join(outputDirectory, "features/roomV2/roomV2ExactRotation.test.js"),
      join(outputDirectory, "features/roomV2/roomV2Persistence.test.js"),
      join(outputDirectory, "features/roomV2/roomV2EditGate.test.js"),
      join(outputDirectory, "features/roomV2/roomV2EditorPlacementCommitControl.test.js"),
      join(outputDirectory, "features/roomV2/roomV2Selectors.test.js"),
      join(outputDirectory, "features/roomV2/roomV2PlacementSurface.test.js"),
      join(outputDirectory, "features/roomV2/roomV2DraftPlacementCandidates.test.js"),
      join(outputDirectory, "features/roomWorld/roomWorldGeometry.test.js"),
      join(outputDirectory, "features/roomWorld/roomWorldRuntime.test.js"),
      join(outputDirectory, "features/roomWorld/myRoomInteractionModel.test.js"),
      join(outputDirectory, "features/roomWorld/roomWorldRoomV2Projection.test.js")
    ],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        NODE_PATH: [
          resolve(workspaceRoot, "node_modules"),
          resolve(repositoryRoot, "node_modules"),
          process.env.NODE_PATH
        ].filter(Boolean).join(":")
      },
      stdio: "inherit"
    }
  )
} finally {
  rmSync(outputDirectory, { recursive: true, force: true })
}
