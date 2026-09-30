import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { isAbsolute, relative, resolve } from "node:path"
import test from "node:test"

// Metro asset IDs are represented by absolute file paths in Node.
for (const extension of [".png", ".webp", ".jpg", ".jpeg"]) {
  require.extensions[extension] = (module, filename) => {
    module.exports = filename
  }
}

const {
  BLUMI_R1_RELEASE_CATALOG,
  ASSET_PROMOTION_RECEIPT_SCHEMA_VERSION,
  ECONOMY_CATALOG,
  isRetiredAvatarItemId,
  resolveR1PublishedEconomyCatalog
} =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("@blumi/domain") as typeof import("@blumi/domain")
const { AVATAR_V2_CATALOG } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("../avatarV2/avatarV2Catalog") as typeof import("../avatarV2/avatarV2Catalog")
const { DEFAULT_AVATAR_ROOM_PROJECTION_MAP } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("../avatarV2/room/avatarRoomProjection") as typeof import("../avatarV2/room/avatarRoomProjection")
const { ROOM_AVATAR_CATALOG } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("../avatarV2/room/avatarRoomCatalog") as typeof import("../avatarV2/room/avatarRoomCatalog")
const { ROOM_V2_FURNITURE_CATALOG } =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("../roomV2/roomV2Catalog") as typeof import("../roomV2/roomV2Catalog")
const {
  getAvatarItemPreviewSource,
  getRoomProductThumbnailSource,
  getShopProductThumbnailSource
} =
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  require("./shopAssets") as typeof import("./shopAssets")

const repositoryRoot = resolve(__dirname, "../../../../..")
const releaseCatalog = BLUMI_R1_RELEASE_CATALOG
const publishedItems = releaseCatalog.publishedItems
const heldPatterns = releaseCatalog.heldScopes.flatMap((scope) =>
  scope.itemIdPatterns.map((pattern) => ({ scope: scope.scope, pattern: new RegExp(pattern) }))
)
const paidItems = ECONOMY_CATALOG.filter((item) => item.ownedByDefault !== true)

function sha256(repositoryPath: string): string {
  return createHash("sha256").update(readFileSync(resolve(repositoryRoot, repositoryPath))).digest("hex")
}

function heldScopeFor(itemId: string): string | undefined {
  return heldPatterns.find(({ pattern }) => pattern.test(itemId))?.scope
}

function collectAssetFiles(value: unknown, files: Set<string>, seen = new Set<unknown>()): void {
  if (typeof value === "string") {
    if (isAbsolute(value) && /\.(?:png|webp|jpe?g)$/i.test(value)) files.add(value)
    return
  }
  if (!value || typeof value !== "object" || seen.has(value)) return
  seen.add(value)
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    collectAssetFiles(child, files, seen)
  }
}

function collectAvatarItemFiles(itemId: string, files: Set<string>): void {
  collectAssetFiles(AVATAR_V2_CATALOG.find((item) => item.id === itemId)?.assets, files)
  collectAssetFiles(getShopProductThumbnailSource(itemId), files)
  collectAssetFiles(getAvatarItemPreviewSource(itemId), files)
  const projection = DEFAULT_AVATAR_ROOM_PROJECTION_MAP[itemId] ?? {}
  for (const [slot, value] of Object.entries(projection)) {
    if (slot === "bodyPreset") continue
    for (const roomItemId of Array.isArray(value) ? value : [value]) {
      if (typeof roomItemId !== "string" || roomItemId === "") continue
      const roomItem = ROOM_AVATAR_CATALOG.find((item) => item.id === roomItemId)
      assert.ok(roomItem, `${itemId} projects to the unavailable room layer ${roomItemId}`)
      collectAssetFiles(roomItem, files)
    }
  }
}

/**
 * The runtime files the app resolves for one Shop product: Shop thumbnail and
 * preview, AvatarV2 layer, and every Room/MiniRoom layer and motion frame
 * (including items the purchase grants), or the furniture sprites.
 */
function resolveRuntimeAssetPaths(item: (typeof ECONOMY_CATALOG)[number]): string[] {
  const files = new Set<string>()
  if (item.type === "avatar") {
    collectAvatarItemFiles(item.itemId, files)
    for (const grantedItemId of item.grantedItemIds ?? []) {
      collectAvatarItemFiles(grantedItemId, files)
    }
  } else {
    collectAssetFiles(ROOM_V2_FURNITURE_CATALOG.find((furniture) => furniture.id === item.itemId), files)
    collectAssetFiles(getRoomProductThumbnailSource(item.itemId), files)
  }
  return [...files].map((file) => relative(repositoryRoot, file)).sort()
}

function describeExpectedAssets(item: (typeof ECONOMY_CATALOG)[number]): string {
  return JSON.stringify(
    resolveRuntimeAssetPaths(item).map((path) => ({ path, sha256: sha256(path) })),
    null,
    2
  )
}

test("published release items are unique, sellable economy items outside every held scope", () => {
  const ids = publishedItems.map((item) => item.itemId)
  assert.equal(new Set(ids).size, ids.length, "published item IDs must be unique")

  for (const published of publishedItems) {
    const economyItem = ECONOMY_CATALOG.find((item) => item.itemId === published.itemId)
    assert.ok(economyItem, `${published.itemId} is not in ECONOMY_CATALOG`)
    assert.equal(published.itemType, economyItem.type, `${published.itemId} has the wrong itemType`)
    assert.notEqual(economyItem.ownedByDefault, true, `${published.itemId} is a starter item and needs no receipt`)
    assert.equal(heldScopeFor(published.itemId), undefined, `${published.itemId} matches a held scope`)
    assert.equal(isRetiredAvatarItemId(published.itemId), false, `${published.itemId} is retired and cannot be sold`)

    const { receipt } = published
    assert.equal(receipt.schemaVersion, ASSET_PROMOTION_RECEIPT_SCHEMA_VERSION)
    assert.match(receipt.receiptId, /\S/)
    assert.match(receipt.sourceCommit, /^[0-9a-f]{40}$/)
    assert.match(receipt.independentReviewer, /\S/)
    assert.doesNotMatch(receipt.independentReviewer, /@/, "reviewer must not be an email address")
    assert.match(receipt.reviewedAt, /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(receipt.assets.length > 0, `${published.itemId} binds no runtime asset`)
  }
})

test("every paid economy item is published, retired, or explicitly held", () => {
  const publishedIds = new Set(publishedItems.map((item) => item.itemId))
  for (const item of paidItems) {
    if (publishedIds.has(item.itemId)) continue
    if (item.type === "avatar" && isRetiredAvatarItemId(item.itemId)) continue
    if (heldScopeFor(item.itemId)) continue
    assert.fail(
      `${item.itemId} is a paid ${item.type} item that production Shop and economy would silently drop. ` +
      "Add an owner-approved receipt for it to packages/domain/src/release/blumiR1ReleaseCatalog.json " +
      "(publishedItems) with these runtime assets, or add it to a held scope:\n" +
      describeExpectedAssets(item)
    )
  }
})

test("published items are visible in the Shop and render in the Room", () => {
  for (const published of publishedItems) {
    if (published.itemType === "avatar") {
      const avatarItem = AVATAR_V2_CATALOG.find((item) => item.id === published.itemId)
      assert.ok(avatarItem, `${published.itemId} has no AvatarV2 catalog entry`)
      assert.notEqual(avatarItem.hiddenFromShop, true, `${published.itemId} is hidden from the Shop`)
      assert.ok(getShopProductThumbnailSource(published.itemId), `${published.itemId} has no Shop thumbnail`)
      assert.ok(DEFAULT_AVATAR_ROOM_PROJECTION_MAP[published.itemId], `${published.itemId} has no Room projection`)
    } else {
      assert.ok(
        ROOM_V2_FURNITURE_CATALOG.some((furniture) => furniture.id === published.itemId),
        `${published.itemId} has no Room V2 furniture entry`
      )
      assert.ok(getRoomProductThumbnailSource(published.itemId), `${published.itemId} has no Shop thumbnail`)
    }
  }
})

test("each receipt binds exactly the runtime assets the app resolves, with matching bytes", () => {
  for (const published of publishedItems) {
    const economyItem = ECONOMY_CATALOG.find((item) => item.itemId === published.itemId)
    assert.ok(economyItem)
    const boundPaths = published.receipt.assets.map((asset) => asset.path)
    assert.equal(new Set(boundPaths).size, boundPaths.length, `${published.itemId} binds a path twice`)
    assert.deepEqual(
      [...boundPaths].sort(),
      resolveRuntimeAssetPaths(economyItem),
      `${published.itemId} receipt assets drifted from the runtime resolvers. Expected:\n` +
        describeExpectedAssets(economyItem)
    )
    for (const asset of published.receipt.assets) {
      assert.ok(existsSync(resolve(repositoryRoot, asset.path)), `${asset.path} is missing`)
      assert.equal(sha256(asset.path), asset.sha256, `${asset.path} bytes differ from ${published.itemId}'s receipt`)
    }
  }
})

test("each receipt's evidence manifest exists with the recorded SHA-256", () => {
  const manifests = new Map<string, string>()
  for (const { receipt } of publishedItems) {
    manifests.set(receipt.evidence.manifestPath, receipt.evidence.manifestSha256)
  }
  for (const [manifestPath, manifestSha256] of manifests) {
    assert.ok(existsSync(resolve(repositoryRoot, manifestPath)), `${manifestPath} is missing`)
    assert.equal(sha256(manifestPath), manifestSha256, `${manifestPath} changed after its receipts were issued`)
  }
})

test("the production projection sells every published item and no held or retired item", () => {
  const projectedIds = new Set(resolveR1PublishedEconomyCatalog(ECONOMY_CATALOG).map((item) => item.itemId))
  for (const published of publishedItems) {
    assert.ok(projectedIds.has(published.itemId), published.itemId)
  }
  for (const item of paidItems) {
    if (heldScopeFor(item.itemId) || isRetiredAvatarItemId(item.itemId)) {
      assert.equal(projectedIds.has(item.itemId), false, item.itemId)
    }
  }
})

function readGit(args: readonly string[]): string | null {
  try {
    return execFileSync("git", [...args], {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"]
    })
  } catch {
    return null
  }
}

function gitBlobId(repositoryPath: string): string {
  const bytes = readFileSync(resolve(repositoryRoot, repositoryPath))
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")
}

test("each receipt's source commit holds the same asset bytes", (context) => {
  const pathsByCommit = new Map<string, Set<string>>()
  for (const { receipt } of publishedItems) {
    const paths = pathsByCommit.get(receipt.sourceCommit) ?? new Set<string>()
    for (const asset of receipt.assets) paths.add(asset.path)
    pathsByCommit.set(receipt.sourceCommit, paths)
  }
  for (const [sourceCommit, paths] of pathsByCommit) {
    if (readGit(["cat-file", "-e", `${sourceCommit}^{commit}`]) === null) {
      // Shallow clones and source archives do not carry the receipt commit.
      context.skip(`source commit ${sourceCommit} is not available in this clone`)
      return
    }
    const listing = readGit(["ls-tree", "-r", sourceCommit, "--", ...paths])
    assert.ok(listing !== null, `git ls-tree failed for ${sourceCommit}`)
    const blobByPath = new Map(
      listing.split("\n").filter(Boolean).map((line) => {
        const [meta, path] = line.split("\t")
        return [path, meta.split(" ")[2]] as const
      })
    )
    for (const path of paths) {
      assert.equal(blobByPath.get(path), gitBlobId(path), `${path} differs from ${sourceCommit}`)
    }
  }
})
