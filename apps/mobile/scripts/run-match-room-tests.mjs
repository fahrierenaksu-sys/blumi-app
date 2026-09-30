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
  "src/features/miniRoom/scene/miniRoomPresentation.ts",
  "src/features/miniRoom/scene/miniRoomPresentation.test.ts",
  "src/features/miniRoom/roomEntryReplayGate.ts",
  "src/features/miniRoom/roomEntryReplayGate.test.ts",
  "src/features/miniRoom/scene/miniRoomMovementLifecycle.ts",
  "src/features/miniRoom/scene/miniRoomMovementLifecycle.test.ts",
  "src/features/miniRoom/scene/miniRoomMovementRun.ts",
  "src/features/miniRoom/scene/miniRoomMovementRun.test.ts",
  "src/features/miniRoom/scene/miniRoomReducedMotion.ts",
  "src/features/miniRoom/scene/miniRoomReducedMotion.test.ts",
  "src/features/miniRoom/scene/miniRoomSpeechQueue.ts",
  "src/features/miniRoom/scene/miniRoomSpeechQueue.test.ts",
  "src/features/miniRoom/scene/miniRoomLayout.ts",
  "src/features/miniRoom/scene/miniRoomLayout.test.ts",
  "src/features/miniRoom/scene/miniRoomStatusNotice.ts",
  "src/features/miniRoom/scene/miniRoomStatusNotice.test.ts",
  "src/features/miniRoom/roomChatHistoryModel.ts",
  "src/features/miniRoom/roomChatHistoryModel.test.ts",
  "src/features/matches/matchRoomModel.ts",
  "src/features/matches/matchRoomResolvers.ts",
  "src/features/matches/matchRoomModel.test.ts",
  "src/features/avatarV2/avatarV2.types.ts",
  "src/config/env.ts",
  "src/config/env.test.ts",
  "src/features/roomV2/roomV2.types.ts",
  "src/features/roomV2/roomV2Catalog.ts",
  "src/features/roomV2/roomV2Catalog.test.ts",
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
  "src/features/roomV2/roomV3UniversalCoreArtifactRegistry.ts",
  "src/features/roomV2/roomV3UniversalCorePilotFurniture.ts",
  "src/features/roomV2/roomV3UniversalCorePilotFurniture.test.ts",
  "src/features/roomV2/roomV3UniversalCoreSurfacePilotFurniture.ts",
  "src/features/roomV2/roomV3UniversalCoreCandidateIds.ts",
  "src/features/roomV2/roomV3PhysicalScaleContract.ts",
  "src/features/roomV2/roomV3PhysicalScaleContract.test.ts",
  "src/features/roomV2/roomV3UniversalCoreSurfacePilotFurniture.test.ts",
  "src/features/roomV2/roomV3CocoaPilotFurniture.ts",
  "src/features/roomV2/roomV3CocoaPilotFurniture.test.ts",
  "src/features/roomV2/roomV3Focus12CandidateIds.ts",
  "src/features/roomV2/roomV2QaOwnership.ts",
  "src/features/roomV2/roomV2QaOwnership.test.ts",
  "src/features/roomV2/roomV2ProviderRuntime.ts",
  "src/features/roomV2/roomV2ProviderRuntime.test.ts",
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
  "src/features/roomV2/myRoomCopy.ts",
  "src/features/roomV2/myRoomCopy.test.ts",
  "src/features/roomV2/editor/roomEditorTestFixtures.ts",
  "src/features/roomV2/editor/roomEditorPlacementModel.ts",
  "src/features/roomV2/editor/roomEditorPlacementModel.test.ts",
  "src/features/roomV2/editor/roomEditorDragModel.ts",
  "src/features/roomV2/editor/roomEditorDragModel.test.ts",
  "src/features/roomV2/editor/roomEditorPresentationModel.ts",
  "src/features/roomV2/editor/roomEditorPresentationModel.test.ts",
  "src/features/roomV2/editor/roomEditorDockModel.ts",
  "src/features/roomV2/editor/roomEditorDockModel.test.ts",
  "src/features/roomV2/roomSetupLayoutModel.ts",
  "src/features/roomV2/roomSetupLayoutModel.test.ts",
  "src/features/roomV2/roomV2Accessibility.ts",
  "src/features/roomV2/roomV2Accessibility.test.ts",
  "src/features/roomV2/roomV2ExistingDecorEditGate.ts",
  "src/features/roomV2/roomV2ExistingDecorEditGate.test.ts",
  "src/features/roomV2/roomV2FloorPlacement.ts",
  "src/features/roomV2/roomV2FloorPlacement.test.ts",
  "src/features/roomV2/roomV3PilotScaleSpec.ts",
  "src/features/roomV2/roomV3PilotScaleSpec.test.ts",
  "src/features/roomV2/roomV3QaRuntimeGate.ts",
  "src/features/roomV2/roomV3QaRuntimeGate.test.ts",
  "src/features/roomV2/roomV3QaShellCatalogRuntime.ts",
  "src/features/roomV2/roomV3QaShellCatalogRuntime.test.ts",
  "src/features/roomV2/roomV3ShellCatalogSafety.test.ts",
  "src/features/roomV2/roomVNextCandidateIdAdapter.ts",
  "src/features/roomV2/roomVNextCandidateIdAdapter.test.ts",
  "src/features/roomV2/roomVNextContracts.ts",
  "src/features/roomV2/roomVNextContracts.test.ts",
  "src/features/roomV2/roomVNextRuntimeGate.ts",
  "src/features/roomV2/roomVNextRuntimeGate.test.ts",
  "src/features/roomWorld/roomWorldGeometry.ts",
  "src/features/roomWorld/roomWorldGeometry.test.ts",
  "src/features/roomWorld/roomWorldRuntime.ts",
  "src/features/roomWorld/roomWorldRuntime.test.ts",
  "src/features/roomWorld/myRoomInteractionModel.ts",
  "src/features/roomWorld/myRoomInteractionModel.test.ts",
  "src/features/roomWorld/roomWorldRoomV2Projection.ts",
  "src/features/roomWorld/roomWorldRoomV2Projection.test.ts",
  "src/features/roomStudio/roomStudioAssetManifest.ts",
  "src/features/roomStudio/roomStudioAssetManifest.test.ts",
  "src/features/roomStudio/roomStudioPersistence.ts",
  "src/features/roomStudio/roomStudioPersistence.test.ts",
  "src/features/roomStudio/roomStudioPlacement.ts",
  "src/features/roomStudio/roomStudioPlacement.test.ts",
  "src/features/roomStudio/roomStudioPresentation.ts",
  "src/features/roomStudio/roomStudioPresentation.test.ts",
  "src/features/roomStudio/roomStudioProductionIsolation.test.ts",
  "src/features/roomStudio/roomStudioQaCatalog.ts",
  "src/features/roomStudio/roomStudioQaCatalog.test.ts",
  "src/features/roomStudio/roomStudioRecipes.ts",
  "src/features/roomStudio/roomStudioRecipes.test.ts",
  "src/features/roomStudio/roomStudioRuntimeGate.ts",
  "src/features/roomStudio/roomStudioRuntimeGate.test.ts",
  "src/features/roomStudio/roomStudioSession.ts",
  "src/features/roomStudio/roomStudioSession.test.ts",
  "src/features/roomStudio/roomStudioThemeMatrix.ts",
  "src/features/roomStudio/roomStudioThemeMatrix.test.ts"
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
      join(outputDirectory, "features/miniRoom/scene/miniRoomPresentation.test.js"),
      join(outputDirectory, "features/miniRoom/roomEntryReplayGate.test.js"),
      join(outputDirectory, "features/miniRoom/scene/miniRoomMovementLifecycle.test.js"),
      join(outputDirectory, "features/miniRoom/scene/miniRoomMovementRun.test.js"),
      join(outputDirectory, "features/miniRoom/scene/miniRoomReducedMotion.test.js"),
      join(outputDirectory, "features/miniRoom/scene/miniRoomSpeechQueue.test.js"),
      join(outputDirectory, "features/miniRoom/scene/miniRoomLayout.test.js"),
      join(outputDirectory, "features/miniRoom/scene/miniRoomStatusNotice.test.js"),
      join(outputDirectory, "features/miniRoom/roomChatHistoryModel.test.js"),
      join(outputDirectory, "features/matches/matchRoomModel.test.js"),
      join(outputDirectory, "config/env.test.js"),
      join(outputDirectory, "features/roomV2/roomV2Catalog.test.js"),
      join(outputDirectory, "features/roomV2/roomV2Camera.test.js"),
      join(outputDirectory, "features/roomV2/myRoomLayoutMetrics.test.js"),
      join(outputDirectory, "features/roomV2/myRoomConsolePresentation.test.js"),
      join(outputDirectory, "features/roomV2/roomV2AvatarMotion.test.js"),
      join(outputDirectory, "features/roomV2/roomV2RenderSurface.test.js"),
      join(outputDirectory, "features/roomV2/roomV3Contracts.test.js"),
      join(outputDirectory, "features/roomV2/roomV3ProductionPlan.test.js"),
      join(outputDirectory, "features/roomV2/roomV3CatalogManifest.test.js"),
      join(outputDirectory, "features/roomV2/roomV3PhysicalScaleContract.test.js"),
      join(outputDirectory, "features/roomV2/roomV3UniversalCorePilotFurniture.test.js"),
      join(outputDirectory, "features/roomV2/roomV2QaOwnership.test.js"),
      join(outputDirectory, "features/roomV2/roomV2ProviderRuntime.test.js"),
      join(outputDirectory, "features/roomV2/roomV3UniversalCoreSurfacePilotFurniture.test.js"),
      join(outputDirectory, "features/roomV2/roomV3CocoaPilotFurniture.test.js"),
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
      join(outputDirectory, "features/roomV2/myRoomCopy.test.js"),
      join(outputDirectory, "features/roomV2/editor/roomEditorPlacementModel.test.js"),
      join(outputDirectory, "features/roomV2/editor/roomEditorDragModel.test.js"),
      join(outputDirectory, "features/roomV2/editor/roomEditorPresentationModel.test.js"),
      join(outputDirectory, "features/roomV2/editor/roomEditorDockModel.test.js"),
      join(outputDirectory, "features/roomV2/roomSetupLayoutModel.test.js"),
      join(outputDirectory, "features/roomV2/roomV2Accessibility.test.js"),
      join(outputDirectory, "features/roomV2/roomV2ExistingDecorEditGate.test.js"),
      join(outputDirectory, "features/roomV2/roomV2FloorPlacement.test.js"),
      join(outputDirectory, "features/roomV2/roomV3PilotScaleSpec.test.js"),
      join(outputDirectory, "features/roomV2/roomV3QaRuntimeGate.test.js"),
      join(outputDirectory, "features/roomV2/roomV3QaShellCatalogRuntime.test.js"),
      join(outputDirectory, "features/roomV2/roomV3ShellCatalogSafety.test.js"),
      join(outputDirectory, "features/roomV2/roomVNextCandidateIdAdapter.test.js"),
      join(outputDirectory, "features/roomV2/roomVNextContracts.test.js"),
      join(outputDirectory, "features/roomV2/roomVNextRuntimeGate.test.js"),
      join(outputDirectory, "features/roomWorld/roomWorldGeometry.test.js"),
      join(outputDirectory, "features/roomWorld/roomWorldRuntime.test.js"),
      join(outputDirectory, "features/roomWorld/myRoomInteractionModel.test.js"),
      join(outputDirectory, "features/roomWorld/roomWorldRoomV2Projection.test.js"),
      join(outputDirectory, "features/roomStudio/roomStudioAssetManifest.test.js"),
      join(outputDirectory, "features/roomStudio/roomStudioPersistence.test.js"),
      join(outputDirectory, "features/roomStudio/roomStudioPlacement.test.js"),
      join(outputDirectory, "features/roomStudio/roomStudioPresentation.test.js"),
      join(outputDirectory, "features/roomStudio/roomStudioProductionIsolation.test.js"),
      join(outputDirectory, "features/roomStudio/roomStudioQaCatalog.test.js"),
      join(outputDirectory, "features/roomStudio/roomStudioRecipes.test.js"),
      join(outputDirectory, "features/roomStudio/roomStudioRuntimeGate.test.js"),
      join(outputDirectory, "features/roomStudio/roomStudioSession.test.js"),
      join(outputDirectory, "features/roomStudio/roomStudioThemeMatrix.test.js")
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
      "--test",
      resolve(workspaceRoot, "scripts/run-match-room-tests.test.mjs"),
      resolve(workspaceRoot, "scripts/homeStudioQaModuleRouting.test.mjs"),
      resolve(workspaceRoot, "scripts/room-v3-runtime-alpha.test.mjs"),
      resolve(workspaceRoot, "scripts/normalize-room-v3-shell-candidate.test.mjs")
    ],
    {
      cwd: workspaceRoot,
      stdio: "inherit"
    }
  )

  // Hook lifecycle tests read production sources through the hook harness.
  execFileSync(
    process.execPath,
    [
      "--import", "tsx",
      "--test",
      "src/features/miniRoom/scene/avatarBubblePopLifecycle.test.ts",
      "src/features/miniRoom/scene/miniRoomSceneStoreLifecycle.test.ts"
    ],
    { cwd: workspaceRoot, stdio: "inherit" }
  )
} finally {
  rmSync(outputDirectory, { recursive: true, force: true })
}
