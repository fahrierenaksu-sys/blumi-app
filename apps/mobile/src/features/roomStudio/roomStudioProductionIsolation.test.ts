import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import ts from "typescript"

// Import boundaries for the QA bindings and the Metro routing of the QA
// screen are checked tree-wide in scripts/mobile-import-boundaries.test.mjs
// and scripts/homeStudioQaModuleRouting.test.mjs.

test("the isolated QA binding module binds no candidate or rejected-wave assets", () => {
  const source = readFileSync(resolve(
    process.cwd(),
    "src/features/roomStudio/roomStudioQaAssetBindings.ts"
  ), "utf8")
  assert.doesNotMatch(source, /full-wave|cute45|candidate:\/\//)
})

function collectJsxAttributes(fileName: string, tagName: string): Record<string, string>[] {
  const text = readFileSync(resolve(process.cwd(), fileName), "utf8")
  const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const elements: Record<string, string>[] = []
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(sourceFile) === tagName
    ) {
      const attributes: Record<string, string> = {}
      for (const property of node.attributes.properties) {
        if (ts.isJsxAttribute(property)) {
          const initializer = property.initializer
          const value = !initializer
            ? "true"
            : ts.isStringLiteral(initializer)
              ? JSON.stringify(initializer.text)
              : ts.isJsxExpression(initializer) && initializer.expression
                ? initializer.expression.getText(sourceFile).replace(/\s+/g, "")
                : initializer.getText(sourceFile)
          attributes[property.name.getText(sourceFile)] = value
        }
      }
      elements.push(attributes)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return elements
}

test("the app's room provider runs in the production namespace without QA ownership", () => {
  // The QA runtime and QA-only owned items are driven by these props
  // (behavior in roomV2ProviderRuntime.test.ts); the shipped navigator must
  // never enable them.
  const providers = collectJsxAttributes("src/navigation/RootNavigator.tsx", "RoomV2Provider")
  assert.ok(providers.length > 0, "RootNavigator renders the room provider")
  for (const props of providers) {
    assert.equal(props.storageNamespace, JSON.stringify("production"))
    assert.equal(props.isQaRuntimeAuthorized, "false")
    assert.equal(props.qaOnlyOwnedRoomItemIds, "[]")
  }
})
