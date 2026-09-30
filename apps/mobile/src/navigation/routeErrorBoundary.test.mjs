import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

// Executes the real route layout against host elements. This proves which
// props each screen's boundary receives, not native rendering.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")

function loadRouteLayout() {
  const module = { exports: {} }
  const executable = ts.transpileModule(read("./RouteErrorBoundary.tsx"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText
  const element = (type, props) => ({ type, props })
  runInNewContext(executable, {
    module,
    exports: module.exports,
    require: (name) => {
      if (name === "react/jsx-runtime") return { jsx: element, jsxs: element }
      if (name === "../ui/errorBoundary") return { ErrorBoundary: "ErrorBoundary" }
      throw new Error(`Unexpected import ${name}`)
    }
  })
  return module.exports.renderRouteErrorBoundary
}

function createNavigation(canGoBack) {
  const calls = []
  return {
    calls,
    state: { canGoBack },
    canGoBack() { return this.state.canGoBack },
    goBack: () => { calls.push("goBack") }
  }
}

test("each route screen renders inside its own boundary named after the route", () => {
  const renderRouteErrorBoundary = loadRouteLayout()
  const navigation = createNavigation(true)
  const layout = renderRouteErrorBoundary({
    route: { key: "ChatThread-abc", name: "ChatThread", params: { partnerName: "Ada", partnerId: "user-2" } },
    navigation,
    options: {},
    theme: {},
    children: "scene"
  })
  assert.equal(layout.type, "ErrorBoundary")
  assert.equal(layout.props.routeName, "ChatThread")
  assert.equal(layout.props.children, "scene")
  // Nothing from route params reaches the boundary or its report.
  assert.deepEqual(Object.keys(layout.props).sort(), ["canGoBack", "children", "onBack", "routeName"])
  assert.doesNotMatch(JSON.stringify(layout.props), /Ada|user-2/)
})

test("back pops only when the stack can go back, reading the live navigation state", () => {
  const renderRouteErrorBoundary = loadRouteLayout()
  const navigation = createNavigation(true)
  const layout = renderRouteErrorBoundary({ route: { key: "k", name: "MyRoomEditor" }, navigation, children: "scene" })
  assert.equal(layout.props.canGoBack(), true)
  layout.props.onBack()
  assert.deepEqual(navigation.calls, ["goBack"])
  navigation.state.canGoBack = false
  assert.equal(layout.props.canGoBack(), false)
  layout.props.onBack()
  assert.deepEqual(navigation.calls, ["goBack"])
})

test("the root stack wraps every screen with the route boundary and keeps the app root boundary", () => {
  const navigator = read("./RootNavigator.tsx")
  const file = ts.createSourceFile("RootNavigator.tsx", navigator, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const layouts = []
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(file) === "Stack.Navigator") {
      for (const attribute of node.attributes.properties) {
        if (ts.isJsxAttribute(attribute) && attribute.name.getText(file) === "screenLayout") {
          layouts.push(attribute.initializer.expression.getText(file))
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  assert.deepEqual(layouts, ["renderRouteErrorBoundary"])
  // No screen opts out with its own layout.
  assert.doesNotMatch(navigator, /<Stack\.(Screen|Group)[^>]*\blayout=/)
  const app = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8")
  assert.match(app, /<ErrorBoundary>/)
})
