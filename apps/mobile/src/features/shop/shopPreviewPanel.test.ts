import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

const root = resolve(process.cwd())
const panelSource = readFileSync(
  resolve(root, "src/features/shop/ShopPreviewPanel.tsx"),
  "utf8"
)
const stylesSource = readFileSync(
  resolve(root, "src/features/shop/shopPreviewStyles.ts"),
  "utf8"
)
const screenSource = readFileSync(
  resolve(root, "src/screens/CosmeticShopScreen.tsx"),
  "utf8"
)
const previewSelectionSource = readFileSync(
  resolve(root, "src/features/shop/screen/useShopPreviewSelection.ts"),
  "utf8"
)
const previewModelSource = readFileSync(
  resolve(root, "src/features/shop/screen/useShopPreviewModel.ts"),
  "utf8"
)
// Negative guards cover the screen and every module it was decomposed into.
const screenSurfaceSource = [
  screenSource,
  ...readdirSync(resolve(root, "src/features/shop/screen"))
    .filter((fileName) => /\.tsx?$/.test(fileName) && !/\.test\.tsx?$/.test(fileName))
    .sort()
    .map((fileName) => readFileSync(resolve(root, "src/features/shop/screen", fileName), "utf8"))
].join("\n")
const navigatorSource = readFileSync(
  resolve(root, "src/navigation/RootNavigator.tsx"),
  "utf8"
)
const copySource = readFileSync(
  resolve(root, "src/features/shop/shopCopy.ts"),
  "utf8"
)
const screenFile = ts.createSourceFile("CosmeticShopScreen.tsx", screenSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const panelFile = ts.createSourceFile("ShopPreviewPanel.tsx", panelSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

function findOne<T extends ts.Node>(file: ts.SourceFile, predicate: (node: ts.Node) => node is T): T {
  const matches: T[] = []
  function visit(node: ts.Node): void {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(file)
  assert.equal(matches.length, 1, "expected one live Shop preview binding")
  return matches[0]
}

function jsxAttributeExpression(file: ts.SourceFile, component: string, name: string): string {
  const element = findOne(file, (node): node is ts.JsxOpeningElement | ts.JsxSelfClosingElement =>
    (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(file) === component
  )
  const attribute = element.attributes.properties.find((entry): entry is ts.JsxAttribute =>
    ts.isJsxAttribute(entry) && entry.name.getText(file) === name
  )
  assert.ok(attribute?.initializer && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression)
  return attribute.initializer.expression.getText(file)
}

function panelVariableExpression(name: string): string {
  const declaration = findOne(panelFile, (node): node is ts.VariableDeclaration =>
    ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name
  )
  assert.ok(declaration.initializer)
  return declaration.initializer.getText(panelFile)
}

function panelActionTextExpression(): string {
  const text = findOne(panelFile, (node): node is ts.JsxElement => {
    if (!ts.isJsxElement(node) || node.openingElement.tagName.getText(panelFile) !== "Text") return false
    const style = node.openingElement.attributes.properties.find((entry): entry is ts.JsxAttribute =>
      ts.isJsxAttribute(entry) && entry.name.getText(panelFile) === "style"
    )
    return !!style?.initializer && ts.isJsxExpression(style.initializer) &&
      style.initializer.expression?.getText(panelFile) === "styles.avatarHeroActionText"
  })
  const expression = text.children.find((child): child is ts.JsxExpression =>
    ts.isJsxExpression(child) && !!child.expression
  )
  assert.ok(expression?.expression)
  return expression.expression.getText(panelFile)
}

function evaluate(expression: string, bindings: Record<string, unknown>): unknown {
  const compiled = ts.transpileModule(`(${expression})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  }).outputText
  return runInNewContext(compiled, bindings)
}

test("shop preview presentation lives outside the screen monolith", () => {
  assert.match(panelSource, /export function ShopPreviewPanel\(/)
  assert.match(panelSource, /testID="shop-selected-product-preview"/)
  assert.match(panelSource, /ShopAvatarLivePreview/)
  assert.match(panelSource, /ShopRoomItemPreview/)
  assert.doesNotMatch(panelSource, /roomVNextRuntimeMode/)
  assert.match(panelSource, /from "\.\/shopPreviewStyles"/)
  assert.match(stylesSource, /export const shopPreviewStyles/)
  assert.match(screenSource, /from "\.\.\/features\/shop\/ShopPreviewPanel"/)
  assert.doesNotMatch(screenSurfaceSource, /ROOM_VNEXT_RUNTIME_MODE/)
  assert.doesNotMatch(screenSurfaceSource, /function SelectedProductPreview/)
  assert.doesNotMatch(screenSurfaceSource, /function ShopAvatarLivePreview/)
  assert.match(previewSelectionSource, /previewAvatarShopItem/)
  assert.match(screenSource, /onRemovePreview=\{handleRemoveAvatarPreview\}/)
  assert.match(screenSource, /useShopPreviewSelection\(/)
  assert.match(previewSelectionSource, /isAvatarShopItemPreviewing/)
  assert.match(previewModelSource, /isAvatarShopItemPreviewing/)
  assert.match(screenSource, /copy\.combination\.applyLook/)
  assert.match(copySource, /applyLook:\s*"Kombini uygula"/)
})

test("Shop action keeps inventory gating and combination labels through the actual preview binding", () => {
  const labelExpression = jsxAttributeExpression(screenFile, "ShopPreviewPanel", "primaryActionLabel")
  const disabledExpression = jsxAttributeExpression(screenFile, "ShopPreviewPanel", "primaryActionDisabled")
  const actionLabelExpression = panelVariableExpression("actionLabel")
  const disabledInPanelExpression = panelVariableExpression("disabled")
  const unlockExpression = panelVariableExpression("isAvatarUnlock")
  const visibleTextExpression = panelActionTextExpression()
  const copy = {
    combination: { buyLook: "Buy look", applyLook: "Apply look", priceNeedsRefresh: "Refresh price" },
    unlock: "Unlock", saving: "Saving"
  }
  const cases = [
    { mode: "avatar", verified: false, multi: false, items: 1, purchases: 1, total: 100, changes: true, expected: "Preparing Shop", disabled: true },
    { mode: "avatar", verified: true, multi: true, items: 2, purchases: 2, total: 200, changes: true, expected: "Buy look", disabled: false },
    { mode: "avatar", verified: true, multi: true, items: 2, purchases: 0, total: 0, changes: true, expected: "Apply look", disabled: false },
    { mode: "avatar", verified: true, multi: true, items: 2, purchases: 1, total: null, changes: true, expected: "Refresh price", disabled: true },
    { mode: "avatar", verified: true, multi: false, items: 1, purchases: 1, total: 100, changes: true, expected: "Unlock", disabled: false },
    { mode: "home", verified: true, multi: false, items: 0, purchases: 0, total: 0, changes: true, expected: "Place item", disabled: false }
  ] as const

  for (const scenario of cases) {
    const product = scenario.mode === "avatar"
      ? { actionType: "avatarUnlock", priceCoins: 100 }
      : { actionType: "roomPlace", priceCoins: 0 }
    const screenBindings = {
      inventoryVerified: scenario.verified,
      inventoryGateLabel: "Preparing Shop",
      shopMode: scenario.mode,
      multiItemApplyEnabled: scenario.multi,
      combinationItems: Array.from({ length: scenario.items }),
      combinationSummary: { purchaseCount: scenario.purchases, total: scenario.total },
      hasCombinationChanges: scenario.changes,
      copy
    }
    const primaryActionLabel = evaluate(labelExpression, screenBindings)
    const primaryActionDisabled = evaluate(disabledExpression, screenBindings)
    const panelBindings = {
      primaryActionLabel,
      primaryActionDisabled,
      product,
      supportsCombinationAction: scenario.verified && scenario.multi,
      combinationSummary: screenBindings.combinationSummary,
      presentation: { actionLabel: "Place item" },
      isPurchasing: false,
      isActionAvailable: true,
      copy
    }
    const actionLabel = evaluate(actionLabelExpression, panelBindings)
    const disabled = evaluate(disabledInPanelExpression, panelBindings)
    const isAvatarUnlock = evaluate(unlockExpression, panelBindings)
    const visibleText = evaluate(visibleTextExpression, {
      ...panelBindings, actionLabel, isAvatarUnlock
    })
    assert.equal(visibleText, scenario.expected, `${scenario.mode}: visible action label`)
    assert.equal(disabled, scenario.disabled, `${scenario.mode}: action availability`)
  }
})

test("avatar remains visible before explicit product selection", () => {
  assert.match(panelSource, /testID="shop-avatar-default-preview"/)
  assert.match(panelSource, /ShopAvatarLivePreview avatar=\{previewAvatar\}/)
  assert.match(screenSource, /<ShopPreviewPanel/)
  assert.doesNotMatch(screenSurfaceSource, /shopMode === "avatar" \|\| selectedProduct/)
})

test("home preview shows the room before product selection without a purchase action", () => {
  assert.match(panelSource, /testID="shop-room-default-preview"/)
  assert.match(panelSource, /mode === "home"/)
  assert.match(panelSource, /<ShopRoomItemPreview item=\{undefined\} scene=\{roomPreviewScene\}/)
  assert.match(screenSource, /mode=\{shopMode\}/)
  assert.doesNotMatch(screenSurfaceSource, /roomProducts\[0\]\?\.roomItem/)
})

test("shop preview keeps one approved hierarchy across supported phone sizes", () => {
  assert.doesNotMatch(screenSurfaceSource, /height\s*<\s*880/)
  assert.doesNotMatch(screenSurfaceSource, /width\s*<\s*390/)
  assert.doesNotMatch(panelSource, /compact:\s*boolean/)
  assert.match(panelSource, /layoutMetrics:/)
  assert.match(screenSource, /getShopLayoutMetrics/)
})

test("avatar preview uses one clear unlock action without beta-like chrome or a floor shadow", () => {
  assert.doesNotMatch(panelSource, /copy\.liveTryOn/)
  assert.doesNotMatch(panelSource, /shopAvatarFloorShadow/)
  assert.doesNotMatch(stylesSource, /avatarHeroHintPill/)
  assert.doesNotMatch(stylesSource, /shopAvatarFloorShadow/)
  assert.match(panelSource, /styles\.avatarHeroActionContent/)
  assert.match(panelSource, /styles\.avatarHeroPricePill/)
  assert.match(panelSource, /styles\.avatarHeroTopPanel/)
  assert.match(panelSource, /testID="shop-preview-remove-preview"/)
  assert.match(panelSource, /onRemovePreview/)
  assert.match(stylesSource, /avatarHeroTopPanel:\s*\{[\s\S]*?minHeight:\s*64[\s\S]*?borderRadius:\s*18/)
  assert.match(stylesSource, /avatarHeroAction:\s*\{[\s\S]*?minHeight:\s*44[\s\S]*?borderRadius:\s*18/)
  assert.match(stylesSource, /shopAvatarFrame:\s*\{\s*marginBottom:\s*0/)
  assert.match(copySource, /unlock:\s*"Aç"/)
})

test("shop scroll viewport ends above the floating bottom navigation", () => {
  assert.match(
    screenSource,
    /marginBottom:\s*viewportMetrics\.bottomContentInset/
  )
  assert.match(screenSource, /paddingBottom:\s*4/)
})

test("room VNext QA stays isolated from the approved Shop presentation", () => {
  // The approved Shop tab page is rendered by the main-tab page factory.
  const mainTabPageSource = readFileSync(
    resolve(root, "src/navigation/mainTabPager/renderMainTabPage.tsx"),
    "utf8"
  )
  assert.match(mainTabPageSource, /roomFurnitureCatalog=\{undefined\}/)
  assert.match(mainTabPageSource, /qaOnlyOwnedRoomItemIds=\{\[\]\}/)
  assert.match(mainTabPageSource, /isRoomCatalogQaPreview=\{false\}/)
  assert.match(mainTabPageSource, /initialShopMode=\{undefined\}/)
  assert.doesNotMatch(mainTabPageSource, /ROOM_V3_QA_INTERACTION_CATALOG/)
  assert.doesNotMatch(navigatorSource, /ROOM_V3_QA_INTERACTION_CATALOG/)
})
