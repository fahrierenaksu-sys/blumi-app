import { execFileSync, spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, rmSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repositoryRoot = resolve(workspaceRoot, "../..")
// Repository-relative JSON/art contracts must resolve exactly as they do from
// `src`; emitting beside `src` preserves that depth while keeping the run
// isolated and disposable.
const outputDirectory = mkdtempSync(join(workspaceRoot, ".blumi-avatar-v2-tests-"))
const nodeMajorVersion = Number(process.versions.node.split(".")[0])
const coverageArguments = nodeMajorVersion >= 22
  ? ["--experimental-test-coverage"]
  : []
const sourceFiles = [
  "src/features/avatarV2/avatarV2.types.ts",
  "src/features/avatarV2/qa/avatarQaInventory.ts",
  "src/features/avatarV2/qa/avatarQaInventory.test.ts",
  "src/features/avatarV2/wardrobeThumbnailPresentation.ts",
  "src/features/avatarV2/wardrobeCategoryModel.test.ts",
  "src/features/avatarV2/avatarBodyCompatibility.ts",
  "src/features/avatarV2/avatarBodyCompatibility.test.ts",
  "src/features/avatarV2/avatarV2Outfits.ts",
  "src/features/avatarV2/avatarV2Outfits.test.ts",
  "src/features/avatarV2/avatarV2EquippedState.test.ts",
  "src/features/avatarV2/avatarV2FeatureWardrobeAssets.test.ts",
  "src/features/avatarV2/avatarRoomCatalogMotionCoverage.test.ts",
  "src/features/avatarV2/avatarRoomCatalogRuntime.test.ts",
  "src/features/avatarV2/maleRigThumbnailPresentation.ts",
  "src/features/avatarV2/candidateAvatarSnapshot.test.ts",
  "src/features/miniRoom/partnerAvatarSnapshot.ts",
  "src/features/miniRoom/miniRoomPartnerIdentity.ts",
  "src/features/miniRoom/miniRoomPartnerIdentity.test.ts",
  "src/features/miniRoom/currentUserAvatarSnapshot.ts",
  "src/features/miniRoom/miniRoomAvatarMotion.ts",
  "src/features/miniRoom/miniRoomAvatarMotion.test.ts",
  "src/features/avatarV2/avatarV2Persistence.test.ts",
  "src/features/shop/shopAvatarDraft.test.ts",
  "src/features/shop/shopCapabilityPolicy.test.ts",
  "src/features/shop/shopCombinationState.test.ts",
  "src/features/shop/shopAssets.ts",
  "src/features/shop/shopAssets.test.ts",
  "src/features/shop/shopPresentationModel.ts",
  "src/features/shop/shopPresentationModel.test.ts",
  "src/features/shop/shopPurchaseCoordinator.ts",
  "src/features/shop/shopPurchaseCoordinator.test.ts",
  "src/features/shop/shopFormatters.ts",
  "src/features/shop/shopAvatarCategoryModel.ts",
  "src/features/shop/shopAvatarCategoryModel.test.ts",
  "src/features/shop/shopSelectionModel.ts",
  "src/features/shop/shopSelectionModel.test.ts",
  "src/features/shop/shopCheckoutModel.ts",
  "src/features/shop/shopCheckoutModel.test.ts"
]

const buildDomainWorkspace = () => {
  const npmResult = spawnSync("npm", ["run", "build", "-w", "@blumi/domain"], {
    cwd: repositoryRoot,
    stdio: "inherit"
  })
  if (!npmResult.error) {
    if (npmResult.status !== 0) throw new Error("@blumi/domain build failed")
    return
  }
  if (npmResult.error.code !== "ENOENT") throw npmResult.error
  execFileSync("pnpm", ["--filter", "@blumi/domain", "build"], {
    cwd: repositoryRoot,
    stdio: "inherit"
  })
}

try {
  buildDomainWorkspace()

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
      "--jsx",
      "react-native",
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
        NODE_PATH: join(repositoryRoot, "node_modules")
      },
      stdio: "inherit"
    }
  )

  cpSync(
    join(workspaceRoot, "src/features/avatarV2/assets"),
    join(outputDirectory, "features/avatarV2/assets"),
    { recursive: true }
  )
  cpSync(
    join(workspaceRoot, "src/features/roomV2/assets"),
    join(outputDirectory, "features/roomV2/assets"),
    { recursive: true }
  )

  execFileSync(
    resolve(repositoryRoot, "node_modules/.bin/tsx"),
    [
      "--test",
      resolve(workspaceRoot, "src/features/avatarV2/avatarEquipLifecycle.test.ts"),
      resolve(workspaceRoot, "src/features/avatarV2/avatarEquipSave.test.ts"),
      resolve(workspaceRoot, "src/features/avatarV2/myRoomAvatarSource.test.ts"),
      resolve(workspaceRoot, "src/features/avatarV2/retiredWardrobe.test.ts"),
      resolve(workspaceRoot, "src/features/avatarV2/avatarStarterCatalog.test.ts"),
      resolve(workspaceRoot, "src/features/avatarV2/wardrobe/wardrobeCatalogTransitionModel.test.ts"),
      resolve(workspaceRoot, "src/features/avatarV2/wardrobe/wardrobeIndicatorModel.test.ts"),
      resolve(workspaceRoot, "src/features/shop/shopListingModel.test.ts"),
      resolve(workspaceRoot, "src/features/avatarV2/room/roomAvatarLayerRenderModel.test.ts"),
      resolve(workspaceRoot, "src/features/roomV2/components/roomAvatarBodyMotionModel.test.ts"),
      resolve(workspaceRoot, "src/features/roomV2/components/roomAvatarTapTargetModel.test.ts"),
      resolve(workspaceRoot, "src/features/roomV2/components/roomFurnitureTapTargetModel.test.ts"),
      resolve(workspaceRoot, "src/features/avatarV2/components/avatarTryOnTransitionModel.test.ts"),
      resolve(workspaceRoot, "src/features/shop/screen/shopPurchaseFlightModel.test.ts"),
      resolve(workspaceRoot, "src/features/avatarV2/room/roomAvatarMotionAtlas.test.ts"),
      resolve(workspaceRoot, "scripts/mobile-ota-asset-budget.test.mjs")
    ],
    {
      cwd: workspaceRoot,
      stdio: "inherit"
    }
  )

  execFileSync(
    process.execPath,
    [
      ...coverageArguments,
      "--test",
      "--test-concurrency=1",
      join(outputDirectory, "features/avatarV2/avatarV2Outfits.test.js"),
      join(outputDirectory, "features/avatarV2/avatarV2EquippedState.test.js"),
      join(outputDirectory, "features/avatarV2/qa/avatarQaInventory.test.js"),
      join(outputDirectory, "features/avatarV2/wardrobeCategoryModel.test.js"),
      join(outputDirectory, "features/avatarV2/avatarBodyCompatibility.test.js"),
      join(outputDirectory, "features/avatarV2/avatarV2FeatureWardrobeAssets.test.js"),
      join(outputDirectory, "features/avatarV2/avatarRoomCatalogMotionCoverage.test.js"),
      join(outputDirectory, "features/avatarV2/avatarRoomCatalogRuntime.test.js"),
      join(outputDirectory, "features/avatarV2/candidateAvatarSnapshot.test.js"),
      join(outputDirectory, "features/miniRoom/miniRoomPartnerIdentity.test.js"),
      join(outputDirectory, "features/miniRoom/miniRoomAvatarMotion.test.js"),
      join(outputDirectory, "features/avatarV2/avatarV2Persistence.test.js"),
      join(outputDirectory, "features/shop/shopAvatarDraft.test.js"),
      join(outputDirectory, "features/shop/shopCapabilityPolicy.test.js"),
      join(outputDirectory, "features/shop/shopCombinationState.test.js"),
      join(outputDirectory, "features/shop/shopAssets.test.js"),
      join(outputDirectory, "features/shop/shopPresentationModel.test.js"),
      join(outputDirectory, "features/shop/shopPurchaseCoordinator.test.js"),
      join(outputDirectory, "features/shop/shopAvatarCategoryModel.test.js"),
      join(outputDirectory, "features/shop/shopSelectionModel.test.js"),
      join(outputDirectory, "features/shop/shopCheckoutModel.test.js")
    ],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        NODE_PATH: join(repositoryRoot, "node_modules")
      },
      stdio: "inherit"
    }
  )
} finally {
  rmSync(outputDirectory, { recursive: true, force: true })
}
