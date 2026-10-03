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
    useScrollSafePress: (callback) => callback,
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

test("a worn card shows a labelled X that removes it without selecting the card", () => {
  const declaration = cardFile.statements
    .flatMap((entry) => ts.isVariableStatement(entry) ? entry.declarationList.declarations : [])
    .find((entry) => ts.isIdentifier(entry.name) && entry.name.text === "ShopProductCard")
  const component = declaration.initializer.arguments[0]
  const code = ts.transpileModule(`const renderCard = ${component.getText(cardFile)}; renderCard(input)`, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const product = { id: "avatar:glasses", sourceItemId: "glasses", previewType: "avatar", title: "Kalp gözlük", priceCoins: 90, owned: true }
  const render = (removeAction, calls, dragBlocked = false) => runInNewContext(code, {
    exports: {}, require: () => ({ jsx, jsxs: jsx }),
    input: {
      product, selected: false, selectedCompact: true, inventoryVerified: true, pendingInventoryLabel: "",
      cardWidth: 90, cardPadding: 6, thumbHeight: 60, locale: "tr", removeAction,
      onSelectProduct: () => calls.push("select"), onRemoveProduct: (item) => calls.push(`remove:${item.id}`)
    },
    useCallback: (callback) => callback,
    useScrollSafePress: (callback) => (event) => {
      if (!dragBlocked || !event?.nativeEvent?.changedTouches?.length) callback(event)
    },
    getShopCopy: () => ({ ownedCompact: "Sende", removeFromAvatar: (title) => `${title}: avatardan çıkar` }),
    getShopProductPresentation: () => ({ stateLabel: "Sende" }),
    getAvatarAutomationSlug: () => "glasses", formatCoins: String,
    styles: {}, uiTheme: { colors: { successInk: "green" } },
    PressableScale: "PressableScale", ShopCardSelectionRing: "Ring", ShopCardViewingBadge: "Badge",
    ShopCardRemoveButton: "RemoveButton", View: "View", Text: "Text", Ionicons: "Icon", AvatarProductThumbnail: "Thumb"
  })

  const calls = []
  const tree = render("unequip", calls)
  const removeButton = tree.props.children.find((child) => child?.type === "RemoveButton")
  assert.ok(removeButton, "the X renders on the card")
  assert.equal(removeButton.props.accessibilityLabel, "Kalp gözlük: avatardan çıkar")
  removeButton.props.onPress()
  assert.deepEqual(calls, ["remove:avatar:glasses"], "the X never selects or buys")
  // VoiceOver reads the card as one element: the X is also a named card action.
  assert.deepEqual(JSON.parse(JSON.stringify(tree.props.accessibilityActions)), [{ name: "remove", label: "Kalp gözlük: avatardan çıkar" }])
  tree.props.onAccessibilityAction({ nativeEvent: { actionName: "remove" } })
  assert.deepEqual(calls, ["remove:avatar:glasses", "remove:avatar:glasses"])

  for (const hidden of ["none", undefined]) {
    const plain = render(hidden, [])
    assert.equal(plain.props.children.some((child) => child?.type === "RemoveButton"), false)
    assert.equal(plain.props.accessibilityActions, undefined)
  }

  const dragCalls = []
  const guarded = render("unequip", dragCalls, true)
  const touch = { nativeEvent: { changedTouches: [{}] } }
  guarded.props.onPress(touch)
  guarded.props.children.find((child) => child?.type === "RemoveButton").props.onPress(touch)
  assert.deepEqual(dragCalls, [], "both selection and the nested X honor the shelf's drag guard")
  guarded.props.onPress({ nativeEvent: {} })
  guarded.props.onAccessibilityAction({ nativeEvent: { actionName: "remove" } })
  assert.deepEqual(dragCalls, ["select", "remove:avatar:glasses"], "accessibility still selects and removes after a drag")
})
