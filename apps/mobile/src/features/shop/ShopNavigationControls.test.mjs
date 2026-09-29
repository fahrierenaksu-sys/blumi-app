import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

const source = readFileSync(new URL("./ShopNavigationControls.tsx", import.meta.url), "utf8")
const file = ts.createSourceFile("ShopNavigationControls.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const declaration = file.statements.find((entry) => ts.isVariableStatement(entry) && entry.declarationList.declarations.some((node) => node.name.getText(file) === "ShopModeDock"))
const component = declaration.declarationList.declarations[0].initializer.arguments[0]
const jsx = (type, props) => ({ type, props })
const code = ts.transpileModule(`const renderDock = ${component.getText(file)}; renderDock(input)`, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText

test("pink selector exists in first render for either mode, repeated mounts, rotation and Reduce Motion", () => {
  for (const activeMode of ["avatar", "home"]) {
    for (const width of [292, 365, 812]) {
      for (const reducedMotion of [true, false]) {
        for (let mount = 0; mount < 2; mount++) {
          const tree = runInNewContext(code, {
            exports: {},
            require: () => ({ jsx, jsxs: jsx }),
            input: { activeMode, width, counts: { avatar: 10, home: 10 } },
            useRef: (current) => ({ current }), useState: (initial) => [initial, () => {}], useEffect: () => {},
            useReducedMotion: () => reducedMotion, getShopCopy: () => ({}),
            Animated: { View: "AnimatedView", Value: class {
              constructor(value) { this.value = value }
              interpolate({ inputRange, outputRange }) { return outputRange[inputRange.indexOf(this.value)] }
            } },
            View: "View", SHOP_MODE_OPTIONS: [], styles: {}
          })
          const indicator = tree.props.children[0]
          assert.ok(indicator, "pink indicator must exist before onLayout")
          const style = Object.assign({}, ...indicator.props.style.filter(Boolean))
          assert.equal(style.width, (width - 8) / 2)
          assert.equal(style.transform[0].translateX, activeMode === "avatar" ? 0 : (width - 8) / 2)
          assert.equal(tree.props.onLayout, undefined)
        }
      }
    }
  }
})
