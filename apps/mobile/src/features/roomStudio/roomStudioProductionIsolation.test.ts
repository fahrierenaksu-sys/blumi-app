import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import test from "node:test"
import ts from "typescript"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"

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

function collectJsxAttributes(fileName: string, tagName: string): Record<string, unknown>[] {
  const text = readFileSync(resolve(process.cwd(), fileName), "utf8")
  const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const elements: Record<string, unknown>[] = []
  const evaluate = (expression: ts.Expression): unknown => {
    if (ts.isStringLiteral(expression)) return expression.text
    if (expression.kind === ts.SyntaxKind.FalseKeyword) return false
    if (expression.kind === ts.SyntaxKind.TrueKeyword) return true
    if (ts.isArrayLiteralExpression(expression)) return expression.elements.map(evaluate)
    if (ts.isIdentifier(expression)) {
      for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
        const bindings = statement.importClause?.namedBindings
        if (!bindings || !ts.isNamedImports(bindings)) continue
        const binding = bindings.elements.find((item) => item.name.text === expression.text)
        if (!binding) continue
        const modulePath = resolve(
          process.cwd(), dirname(fileName), `${statement.moduleSpecifier.text}.tsx`
        )
        const exports = loadSourceWithFakeReact<Record<string, unknown>>(
          modulePath, createFakeReactRuntime(), { inertUnknown: true }
        )
        return exports[(binding.propertyName ?? binding.name).text]
      }
    }
    throw new Error(`Cannot evaluate room isolation prop: ${expression.getText(sourceFile)}`)
  }
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(sourceFile) === tagName
    ) {
      const attributes: Record<string, unknown> = {}
      for (const property of node.attributes.properties) {
        if (ts.isJsxSpreadAttribute(property)) {
          throw new Error("Room provider spread props require an explicit isolation check")
        }
        if (ts.isJsxAttribute(property) && [
          "storageNamespace", "isQaRuntimeAuthorized", "qaOnlyOwnedRoomItemIds", "isVNextRuntimeProof"
        ].includes(property.name.getText(sourceFile))) {
          const initializer = property.initializer
          const value = !initializer
            ? true
            : ts.isStringLiteral(initializer)
              ? initializer.text
              : ts.isJsxExpression(initializer) && initializer.expression
                ? evaluate(initializer.expression)
                : undefined
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
    assert.equal(props.storageNamespace, "production")
    assert.equal(props.isQaRuntimeAuthorized, false)
    assert.equal(props.isVNextRuntimeProof, false)
    assert.ok(Array.isArray(props.qaOnlyOwnedRoomItemIds))
    assert.equal(props.qaOnlyOwnedRoomItemIds.length, 0)
  }
})
