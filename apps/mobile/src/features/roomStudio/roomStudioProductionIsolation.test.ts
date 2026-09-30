import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const PRODUCTION_ENTRYPOINTS = [
  "App.tsx",
  "src/navigation/RootNavigator.tsx",
  "src/navigation/deferredScreenBundles.tsx",
  "src/screens/MyRoomScreen.tsx",
  "src/screens/MyRoomEditorScreen.tsx",
  "src/features/roomV2/roomV2ProductionAssets.ts",
  "src/features/roomV2/roomV2Catalog.ts"
] as const

test("production dependency roots do not import Home Studio QA bitmap bindings", () => {
  // MyRoomEditorScreen composes the production modules in features/roomV2/editor.
  const editorModules = readdirSync(resolve(process.cwd(), "src/features/roomV2/editor"))
    .filter((fileName) => /\.tsx?$/.test(fileName) && !/\.test\.tsx?$/.test(fileName))
    .map((fileName) => `src/features/roomV2/editor/${fileName}`)
  assert.ok(editorModules.length > 0)
  for (const relativePath of [...PRODUCTION_ENTRYPOINTS, ...editorModules]) {
    const source = readFileSync(resolve(process.cwd(), relativePath), "utf8")
    assert.doesNotMatch(source, /roomStudioQaAssetBindings/)
    assert.doesNotMatch(source, /roomStudio\/assets\/qa/)
  }
})

test("Metro resolves the QA screen out of release-like graphs", () => {
  const deferredSource = readFileSync(resolve(
    process.cwd(),
    "src/navigation/deferredScreenBundles.tsx"
  ), "utf8")
  const metroSource = readFileSync(resolve(process.cwd(), "metro.config.js"), "utf8")
  const routingSource = readFileSync(resolve(
    process.cwd(),
    "scripts/homeStudioQaModuleRouting.cjs"
  ), "utf8")
  assert.match(deferredSource, /@blumi\/home-studio-qa/)
  assert.doesNotMatch(deferredSource, /HomeStudioScreen\.tsx/)
  assert.match(metroSource, /resolveHomeStudioQaModulePath/)
  assert.match(metroSource, /resolveHomeStudioQaModuleDirectory/)
  assert.match(metroSource, /extraNodeModules/)
  assert.match(routingSource, /homeStudioQaStub\.tsx/)
  assert.match(routingSource, /homeStudioQaStubModule/)
  assert.match(routingSource, /homeStudioQaLiveModule/)
})

test("isolated QA binding module binds exactly the sixteen reviewed PNGs", () => {
  const source = readFileSync(resolve(
    process.cwd(),
    "src/features/roomStudio/roomStudioQaAssetBindings.ts"
  ), "utf8")
  const requires = [...source.matchAll(/require\("\.\/assets\/qa\/[^\"]+\.png"\)/g)]
  assert.equal(requires.length, 16)
  assert.doesNotMatch(source, /full-wave|cute45|candidate:\/\//)
})

test("Home Studio cannot bypass the visual approval flag", () => {
  const source = readFileSync(resolve(
    process.cwd(),
    "src/screens/HomeStudioScreen.tsx"
  ), "utf8")
  assert.match(source, /BLUMI_HOME_STUDIO_VISUAL_REVIEW_APPROVED_FLAG\s*===\s*"1"/)
  assert.doesNotMatch(source, /visualReviewApproved:\s*true/)
})
