import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

// The Shop card never shows ownership or a price before the server inventory
// snapshot is verified. Purchase gating itself is behavior-tested in
// features/shop/screen/useShopPurchaseActions.test.ts and shopScreenModel.test.ts.
const cardSource = readFileSync(new URL("../features/shop/screen/ShopProductCard.tsx", import.meta.url), "utf8")
const cardFile = ts.createSourceFile("ShopProductCard.tsx", cardSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const jsx = (type, props) => ({ type, props })
const flatten = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))

test("unverified catalog cards show neutral pending status, not ownership or price", () => {
  const declaration = cardFile.statements
    .flatMap((entry) => ts.isVariableStatement(entry) ? entry.declarationList.declarations : [])
    .find((entry) => ts.isIdentifier(entry.name) && entry.name.text === "ShopProductCard")
  assert.ok(declaration)
  const component = declaration.initializer.arguments[0]
  const code = ts.transpileModule(`const renderCard = ${component.getText(cardFile)}; renderCard(input)`, {
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
    PressableScale: "PressableScale", ShopCardSelectionRing: "Ring", ShopCardViewingBadge: "Badge", View: "View", Text: "Text", Ionicons: "Icon"
  })

  assert.equal(tree.props.accessibilityLabel, "Top, Mağazan hazırlanıyor")
  const metaPill = tree.props.children[2]
  assert.equal(flatten(metaPill.props.style).ownership, undefined)
  assert.equal(metaPill.props.children[0], null)
  assert.equal(metaPill.props.children[1].props.children, "Mağazan hazırlanıyor")
})
