import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

const source = readFileSync(new URL("./ShopPreviewPanel.tsx", import.meta.url), "utf8")
const file = ts.createSourceFile("ShopPreviewPanel.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const declaration = file.statements.find((entry) => ts.isFunctionDeclaration(entry) && entry.name?.text === "CombinationRow")
assert.ok(declaration)
const jsx = (type, props) => ({ type, props })
const code = ts.transpileModule(`${declaration.getText(file)}\nCombinationRow(input)`, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText

function renderRow(item, imageSource, selected = true) {
  return runInNewContext(code, {
    exports: {}, require: () => ({ jsx, jsxs: jsx }),
    input: { item, locale: "tr", selected },
    getShopCopy: () => ({ combination: { itemUnavailable: "Unavailable", priceNeedsRefresh: "—" }, owned: "Owned", coins: "Coins" }),
    getShopProductThumbnailSource: (id) => id === item.id ? imageSource : undefined,
    getShopProductThumbnailBounds: () => [100, 100, 15, 15, 70, 70],
    getShopThumbnailLayout: () => ({ width: 34, height: 34, left: 0, top: 0 }),
    formatCoins: (value) => String(value),
    styles: { combinationRow: {}, combinationRowSelected: {}, combinationThumbnail: {}, combinationRowCopy: {}, combinationItemTitle: {}, combinationItemPrice: {} },
    uiTheme: { colors: { primary: "pink" } },
    Pressable: "Pressable", View: "View", Text: "Text", Ionicons: "Ionicons", ExpoImage: "ExpoImage"
  })
}

test("selected combination thumbnail renders immediately through the Shop card cache", () => {
  const item = { id: "avatar_v2_shoes_coral_wave", title: "Coral Wave", price: 450, owned: false }
  const row = renderRow(item, 123)
  assert.equal(row.type, "Pressable", "combination row is not hidden behind an entrance animation")
  const image = row.props.children[0].props.children
  assert.equal(image.type, "ExpoImage")
  assert.equal(image.props.source, 123)
  assert.equal(image.props.contentFit, "contain")
  assert.equal(image.props.cachePolicy, "memory-disk")
  assert.equal(image.props.priority, "high")
  assert.equal(image.props.transition, 0)
  assert.deepEqual({ ...image.props.style }, { position: "absolute", width: 34, height: 34, left: 0, top: 0 })
})

test("visible secondary combination thumbnails keep layout/cache but yield priority to the selected product", () => {
  const item = { id: "avatar_v2_shirt_soft_lilac", title: "Soft Lilac", price: 320, owned: false }
  const row = renderRow(item, 456, false)
  const image = row.props.children[0].props.children

  assert.equal(image.type, "ExpoImage")
  assert.equal(image.props.priority, "normal")
  assert.equal(image.props.cachePolicy, "memory-disk")
  assert.equal(image.props.transition, 0)
  assert.deepEqual({ ...image.props.style }, { position: "absolute", width: 34, height: 34, left: 0, top: 0 })
})

function loadTypeScriptExports(relativePath) {
  const moduleSource = readFileSync(new URL(relativePath, import.meta.url), "utf8")
  const compiled = ts.transpileModule(moduleSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText
  const module = { exports: {} }
  runInNewContext(compiled, { module, exports: module.exports })
  return module.exports
}

test("Shop first-page thumbnail count follows the real viewport helper and does not mount later pages", () => {
  const { getShopLayoutMetrics } = loadTypeScriptExports("./shopLayoutMetrics.ts")
  const { getCombinationPage, getCombinationPageSize } = loadTypeScriptExports("./shopCombinationViewport.ts")
  const expectedRows = new Map([
    ["320x568", 1],
    ["375x667", 2],
    ["390x844", 4],
    ["402x874", 4],
    ["440x956", 4]
  ])
  const items = Array.from({ length: 4 }, (_, index) => ({ id: `piece-${index}` }))

  for (const [width, height] of [[320, 568], [375, 667], [390, 844], [402, 874], [440, 956]]) {
    const metrics = getShopLayoutMetrics({ width, height })
    const pageSize = getCombinationPageSize(metrics.preview.avatarStageHeight, 1, items.length)
    const firstPage = getCombinationPage(items, pageSize, 0)

    assert.equal(pageSize, expectedRows.get(`${width}x${height}`))
    assert.equal(firstPage.items.length, pageSize)
    assert.equal(firstPage.page, 0)
  }

  assert.match(source, /page\.items\.map\(\(item\) => <CombinationRow key=\{item\.id\}/)
})

test("combination without a thumbnail retains its existing icon fallback", () => {
  const row = renderRow({ id: "missing", title: null, price: null, owned: false }, undefined)
  assert.equal(row.props.children[0].props.children.type, "Ionicons")
})
