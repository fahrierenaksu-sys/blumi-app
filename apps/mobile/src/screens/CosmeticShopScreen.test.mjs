import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

const source = readFileSync(new URL("./CosmeticShopScreen.tsx", import.meta.url), "utf8")
const file = ts.createSourceFile("CosmeticShopScreen.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const layoutSource = readFileSync(new URL("../features/shop/shopThumbnailLayout.ts", import.meta.url), "utf8")
const layout = runInNewContext(ts.transpileModule(`${layoutSource.replace(/export /g, "")}\ngetShopThumbnailLayout`, {
  compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: {} })
const jsx = (type, props) => ({ type, props })
const bounds = [512, 768, 169, 403, 174, 194]
const flatten = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))

// Execute the real leaf render before any layout/effect callback. This proves
// render geometry, not native image decode, React scheduling or paint timing.
function renderThumbnail(props) {
  const declaration = file.statements.find((entry) => ts.isFunctionDeclaration(entry) && entry.name?.text === "AvatarProductThumbnail")
  assert.ok(declaration)
  const code = ts.transpileModule(`${declaration.getText(file)}\nAvatarProductThumbnail(input)`, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  return runInNewContext(code, {
    exports: {},
    require: () => ({ jsx, jsxs: jsx }), input: props,
    useState: (initial) => [initial, () => {}],
    getShopProductThumbnailBounds: () => bounds,
    getShopThumbnailLayout: layout,
    getMaleRigLayerThumbnailPresentation: () => ({ top: -20, scale: 1.5 }),
    styles: { productWearableImage: { width: "100%", height: "100%" }, productWearableRigLayer: { width: "100%", height: "100%" } },
    StyleSheet: { absoluteFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } },
    View: "View", ExpoImage: "ExpoImage"
  })
}

test("first and repeated Shop mounts draw padded artwork at final bounds without onLayout", () => {
  for (const width of [66, 85, 115, 300]) {
    for (const isRigLayerSource of [false, true]) {
      const props = { item: { id: "avatar_v2_bottom_default", type: "bottom" }, source: 1, selected: false, isRigLayerSource, width, height: 64, transitionMs: 120 }
      const expected = layout(bounds, width, props.height)
      const first = renderThumbnail(props)
      const repeated = renderThumbnail(props)
      for (const tree of [first, repeated]) {
        const image = tree.props.children
        const style = flatten(image.props.style)
        for (const key of ["width", "height", "left", "top"]) assert.equal(style[key], expected[key], key)
        assert.equal(tree.props.onLayout, undefined, "thumbnail geometry must not wait for a layout callback")
        assert.equal(image.props.transition, 0, "static thumbnail must not fade in after decoding")
      }
    }
  }
})

test("card passes its inner content dimensions to the thumbnail including padding and border", () => {
  const declaration = file.statements.find((entry) => ts.isVariableStatement(entry) && entry.declarationList.declarations.some((node) => node.name.getText(file) === "ShopProductCard"))
  const component = declaration.declarationList.declarations[0].initializer.arguments[0]
  const code = ts.transpileModule(`const renderCard = ${component.getText(file)}; renderCard(input)`, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  for (const [cardWidth, cardPadding, thumbHeight] of [[88, 7, 44], [119, 9, 64], [330, 10, 70]]) {
    const tree = runInNewContext(code, {
      exports: {},
      require: () => ({ jsx, jsxs: jsx }),
      input: { product: { avatarItem: { id: "top", type: "top" }, sourceItemId: "top", previewType: "avatar", title: "Top", priceCoins: null, owned: false }, cardWidth, cardPadding, thumbHeight, selectedCompact: true, inventoryVerified: true },
      useEffect: () => {}, useCallback: (fn) => fn,
      getShopCopy: () => ({}), getShopProductPresentation: () => ({}),
      getShopProductThumbnailSource: () => 1, RIG_LAYER_THUMBNAIL_ITEM_IDS: new Set(),
      getAvatarAutomationSlug: (id) => id, styles: {},
      Pressable: "Pressable", View: "View", Text: "Text", AvatarProductThumbnail: "AvatarProductThumbnail"
    })
    const thumbnail = tree.props.children[0].props.children[0]
    assert.equal(thumbnail.props.width, cardWidth - cardPadding * 2 - 2)
    assert.equal(thumbnail.props.height, thumbHeight)
  }
})

test("selecting a Shop card hands the product to the live preview without speculative image work", () => {
  const declaration = file.statements.find((entry) => ts.isVariableStatement(entry) && entry.declarationList.declarations.some((node) => node.name.getText(file) === "ShopProductCard"))
  assert.ok(declaration)
  const component = declaration.declarationList.declarations[0].initializer.arguments[0]
  const code = ts.transpileModule(`const renderCard = ${component.getText(file)}; renderCard(input)`, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const selected = []
  let speculativeRequests = 0
  const product = { id: "top", avatarItem: { id: "top", type: "top" }, sourceItemId: "top", previewType: "avatar", title: "Top", priceCoins: null, owned: false }
  for (const selectedCard of [false, true]) {
    const tree = runInNewContext(code, {
      exports: {}, require: () => ({ jsx, jsxs: jsx }),
      input: { product, cardWidth: 119, cardPadding: 9, thumbHeight: 64, selected: selectedCard, selectedCompact: true, onSelectProduct: (item) => selected.push(item) },
      useEffect: (effect) => effect(), useCallback: (fn) => fn,
      getShopCopy: () => ({}), getShopProductPresentation: () => ({}),
      getShopProductThumbnailSource: () => 1, RIG_LAYER_THUMBNAIL_ITEM_IDS: new Set(),
      getAvatarAutomationSlug: (id) => id, styles: {},
      Ionicons: "Ionicons", uiTheme: { colors: { primary: "pink" } },
      ExpoImage: { prefetch: () => { speculativeRequests += 1 } },
      Pressable: "Pressable", View: "View", Text: "Text", AvatarProductThumbnail: "AvatarProductThumbnail"
    })
    tree.props.onPress()
  }
  assert.deepEqual(selected, [product, product])
  assert.equal(speculativeRequests, 0)
})

test("selected Shop previews request only added avatar layers or the furniture render source", () => {
  assert.match(source, /getShopPreviewAddedAssets/)
  assert.match(source, /publishSelectedShopPreviewWarmup/)
  assert.match(
    source,
    /getShopPreviewAddedAssets\(currentAvatar, product\.avatarItem\)\.map\(\(asset\) => asset\.source\)/
  )
  assert.match(source, /product\.roomItem\.asset\.source/)
  assert.match(source, /navigation\.addListener\("blur"[\s\S]*?publishSelectedShopPreviewWarmup\(\[\]\)/)
})

function findFunction(sourceFile, name) {
  return sourceFile.statements.find((entry) =>
    ts.isFunctionDeclaration(entry) && entry.name?.text === name
  )
}

function runShopPolicy(input) {
  const presentationModel = ts.createSourceFile(
    "shopPresentationModel.ts",
    readFileSync(new URL("../features/shop/shopPresentationModel.ts", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const shouldRenderShopContent = findFunction(presentationModel, "shouldRenderShopContent")
  const policy = findFunction(file, "getShopSurfacePolicy")
  assert.ok(policy, "the Shop screen must define its inventory/render policy")
  assert.ok(shouldRenderShopContent)
  const code = ts.transpileModule(
    `${shouldRenderShopContent.getText(presentationModel)}\n${policy.getText(file)}\ngetShopSurfacePolicy(input)`,
    { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }
  ).outputText
  return runInNewContext(code, { input, exports: {} })
}

test("production Shop shows its stable catalog while server inventory hydrates but keeps actions closed", () => {
  const policy = runShopPolicy({
    requiresServerInventory: true,
    isConnected: true,
    isReady: false,
    hydrationStatus: "loading",
    state: "loading",
    productCount: 24
  })

  assert.deepEqual({ ...policy }, {
    showShopContent: true,
    inventoryVerified: false,
    canPerformShopActions: false
  })
})

test("production Shop does not expose actions after inventory failure or before its first snapshot", () => {
  for (const state of ["loading", "error", "offline"]) {
    const policy = runShopPolicy({
      requiresServerInventory: true,
      isConnected: state !== "offline",
      isReady: false,
      hydrationStatus: state === "error" ? "failed" : "loading",
      state,
      productCount: 24
    })
    assert.equal(policy.showShopContent, true, `${state} should retain the static catalog shell`)
    assert.equal(policy.inventoryVerified, false, `${state} is not an ownership proof`)
    assert.equal(policy.canPerformShopActions, false, `${state} must keep mutations closed`)
  }
})

test("production Shop enables ownership and actions only after a connected server snapshot", () => {
  const ready = runShopPolicy({
    requiresServerInventory: true,
    isConnected: true,
    isReady: true,
    hydrationStatus: "ready",
    state: "ready",
    productCount: 24
  })
  assert.equal(ready.inventoryVerified, true)
  assert.equal(ready.canPerformShopActions, true)

  const disconnected = runShopPolicy({
    requiresServerInventory: true,
    isConnected: false,
    isReady: true,
    hydrationStatus: "ready",
    state: "offline",
    productCount: 24
  })
  assert.equal(disconnected.inventoryVerified, true)
  assert.equal(disconnected.canPerformShopActions, false)
})

test("unverified product presentation masks ownership and price without changing preview identity", () => {
  const mask = findFunction(file, "maskUnverifiedProductOwnership")
  assert.ok(mask, "unverified Shop products need a neutral presentation")
  const code = ts.transpileModule(`${mask.getText(file)}\nmaskUnverifiedProductOwnership(input.product, false, input.label)`, {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const product = {
    id: "avatar:top-1", title: "Top 1", owned: true, priceCoins: 80,
    actionType: "avatarEquip", stateLabel: "Owned", actionLabel: "Wear now",
    sourceItemId: "top-1", sectionId: "avatar", previewType: "avatar",
    avatarItem: { id: "top-1", type: "top" }
  }
  const safe = runInNewContext(code, { input: { product, label: "Mağazan hazırlanıyor" } })

  assert.equal(safe.id, product.id)
  assert.equal(safe.avatarItem, product.avatarItem)
  assert.equal(safe.owned, false)
  assert.equal(safe.priceCoins, null)
  assert.equal(safe.actionType, "disabled")
  assert.equal(safe.stateLabel, "Mağazan hazırlanıyor")
  assert.equal(safe.actionLabel, "Mağazan hazırlanıyor")
})

test("Shop screen wires the inventory policy into rendering, cards, and mutation handlers", () => {
  const declarations = []
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.push(node)
    ts.forEachChild(node, visit)
  }
  visit(file)

  const policy = declarations.find((entry) => entry.name.text === "shopSurfacePolicy")
  assert.ok(policy)
  assert.ok(ts.isCallExpression(policy.initializer))
  assert.equal(policy.initializer.expression.getText(file), "getShopSurfacePolicy")
  assert.match(policy.initializer.getText(file), /requiresServerInventory/)
  assert.match(policy.initializer.getText(file), /hydrationStatus: inventoryStore\.hydrationStatus/)

  const applyHandler = declarations.find((entry) => entry.name.text === "handleApplyCombination")
  const primaryHandler = declarations.find((entry) => entry.name.text === "handlePrimaryAction")
  assert.match(applyHandler.initializer.getText(file), /!inventoryVerified/)
  assert.match(primaryHandler.initializer.getText(file), /!canPerformShopActions/)

  const screenText = file.getText()
  assert.match(screenText, /inventoryVerified && product\.owned/)
  assert.match(screenText, /inventoryVerified\s*\?\s*formatCoins\(inventoryStore\.inventory\.coins/)
  assert.match(screenText, /primaryActionDisabled=\{\s*!inventoryVerified/)
  assert.match(screenText, /!inventoryVerified && shopPresentationState === "error"/)
})

test("unverified catalog cards show neutral pending status, not ownership or price", () => {
  const declaration = file.statements
    .flatMap((entry) => ts.isVariableStatement(entry) ? entry.declarationList.declarations : [])
    .find((entry) => ts.isIdentifier(entry.name) && entry.name.text === "ShopProductCard")
  assert.ok(declaration)
  const component = declaration.initializer.arguments[0]
  const code = ts.transpileModule(`const renderCard = ${component.getText(file)}; renderCard(input)`, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const tree = runInNewContext(code, {
    exports: {}, require: () => ({ jsx, jsxs: jsx }),
    input: {
      product: { id: "avatar:top", sourceItemId: "top", previewType: "avatar", title: "Top", priceCoins: 90, owned: true },
      selected: false, selectedCompact: true, inventoryVerified: false,
      pendingInventoryLabel: "Mağazan hazırlanıyor", cardWidth: 120,
      cardPadding: 8, thumbHeight: 60, locale: "tr"
    },
    useCallback: (callback) => callback,
    getShopCopy: () => ({ owned: "Owned", readyToPlace: "Ready" }),
    getShopProductPresentation: () => ({ stateLabel: "Owned" }),
    getAvatarAutomationSlug: () => "top",
    styles: { productCard: "card", productCardCompact: "compact", productMetaPill: "meta", productMetaPillOwned: { ownership: "owned" } },
    Pressable: "Pressable", View: "View", Text: "Text", Ionicons: "Icon"
  })

  assert.equal(tree.props.accessibilityLabel, "Top, Mağazan hazırlanıyor")
  const metaPill = tree.props.children[2]
  assert.equal(flatten(metaPill.props.style).ownership, undefined)
  assert.equal(metaPill.props.children[0], null)
  assert.equal(metaPill.props.children[1].props.children, "Mağazan hazırlanıyor")
})
