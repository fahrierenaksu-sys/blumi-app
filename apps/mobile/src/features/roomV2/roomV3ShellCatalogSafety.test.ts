import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

test("My Room runtime catalog is isolated from every draft and promotion shell path", () => {
  const mockSource = readFileSync(
    resolve(process.cwd(), "src/features/roomV2/roomV2.mock.ts"),
    "utf8"
  )

  assert.doesNotMatch(mockSource, /roomV3ShellPromotion/)
  assert.doesNotMatch(mockSource, /roomV3ShellProductionContract/)
  assert.doesNotMatch(mockSource, /resolveApprovedRoomV3Shells\(/)
  assert.doesNotMatch(mockSource, /ROOM_V3_SHELL_CANDIDATES/)
  assert.doesNotMatch(mockSource, /roomV3DraftPreview/)
  assert.doesNotMatch(mockSource, /IS_BLUMI_ROOM_V3_DRAFT_PREVIEW/)
  assert.doesNotMatch(mockSource, /mintGardenMasterDraft/)
  assert.match(
    mockSource,
    /export const ROOM_V2_SHELL_CATALOG: RoomShell\[\] = BASE_ROOM_V2_SHELL_CATALOG/
  )
})

test("obsolete shell preview modules and root runtime drafts stay removed", () => {
  const roomV2Root = resolve(process.cwd(), "src/features/roomV2")
  const runtimeRoot = resolve(roomV2Root, "assets/runtime")
  const rootShellAssets = readdirSync(runtimeRoot)
    .filter((name) => name.startsWith("room_") && /\.(png|webp)$/.test(name))

  assert.equal(existsSync(resolve(roomV2Root, "roomV3DraftPreview.ts")), false)
  assert.equal(existsSync(resolve(roomV2Root, "roomV3TechnicalMaster.ts")), false)
  assert.deepEqual(rootShellAssets, ["room_shell_blumi_world_v1.webp"])
})

test("the live room editor no longer depends on the legacy preview screen identity", () => {
  const screensRoot = resolve(process.cwd(), "src/screens")
  const navigatorSource = readFileSync(
    resolve(process.cwd(), "src/navigation/RootNavigator.tsx"),
    "utf8"
  )
  const deferredBundlesSource = readFileSync(
    resolve(process.cwd(), "src/navigation/deferredScreenBundles.tsx"),
    "utf8"
  )

  assert.equal(existsSync(resolve(screensRoot, "MyRoomV2PreviewScreen.tsx")), false)
  assert.equal(existsSync(resolve(screensRoot, "MyRoomEditorScreen.tsx")), true)
  assert.doesNotMatch(navigatorSource, /MyRoomV2Preview/)
  assert.doesNotMatch(deferredBundlesSource, /myRoomV2Preview|MyRoomV2Preview/)
  assert.match(navigatorSource, /MyRoomEditor/)
  assert.match(deferredBundlesSource, /myRoomEditorScreenBundle/)
})

test("failed shell generators stay removed while evidence-only verifiers remain", () => {
  const scriptsRoot = resolve(process.cwd(), "scripts")
  const obsoleteGenerators = [
    "paint-room-v3-shell-variants.py",
    "prepare-room-v3-shell-candidates.py",
    "recover-room-v3-shell-candidates.mjs"
  ]

  for (const scriptName of obsoleteGenerators) {
    assert.equal(existsSync(resolve(scriptsRoot, scriptName)), false)
  }
  assert.equal(existsSync(resolve(scriptsRoot, "verify-room-v3-shell-assets.mjs")), true)
  assert.equal(existsSync(resolve(scriptsRoot, "verify-room-v3-shell-geometry.py")), true)
})

test("six current shells are reachable only through the explicit development QA resolver", () => {
  const roomV2Root = resolve(process.cwd(), "src/features/roomV2")
  const qaCatalogSource = readFileSync(
    resolve(roomV2Root, "roomV3QaShellCatalog.ts"),
    "utf8"
  )
  const myRoomSource = readFileSync(
    resolve(process.cwd(), "src/screens/MyRoomScreen.tsx"),
    "utf8"
  )
  const editorSource = readFileSync(
    resolve(process.cwd(), "src/screens/MyRoomEditorScreen.tsx"),
    "utf8"
  )

  const v6Requires = qaCatalogSource.match(/room_v3_shell_[a-z0-9_]+_candidate_v6\.png/g) ?? []
  assert.equal(v6Requires.length, 4)
  assert.equal(new Set(v6Requires).size, 4)
  const v10Requires = qaCatalogSource.match(/room_v3_shell_[a-z0-9_]+_candidate_v10\.png/g) ?? []
  assert.equal(v10Requires.length, 2)
  assert.equal(new Set(v10Requires).size, 2)
  assert.doesNotMatch(qaCatalogSource, /candidate_v(?:2|3|4|5|7|8|9)\.png/)
  assert.match(qaCatalogSource, /sourceStatus: "candidate"/)
  assert.match(qaCatalogSource, /qaStatus: "pending"/)
  for (const source of [myRoomSource, editorSource]) {
    assert.match(source, /resolveRoomV3QaShellCatalogRuntime/)
    assert.match(source, /BLUMI_ROOM_V3_DRAFT_PREVIEW_FLAG/)
    assert.match(source, /ACTIVE_ROOM_SHELL_CATALOG/)
  }
})
