import assert from "node:assert/strict"
import test from "node:test"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import vm from "node:vm"
import ts from "typescript"
import { getErrorBoundaryCopy } from "./errorBoundaryCopy"

// Execute the real class against minimal host elements. These tests prove its
// recovery state/copy, not native layout or a mounted React tree.
function boundaryFixture(locale: "tr" | "en", reportingEnabled: boolean) {
  const relative = "src/ui/errorBoundary.tsx"
  const file = existsSync(resolve(relative)) ? resolve(relative) : resolve("apps/mobile", relative)
  const source = readFileSync(file, "utf8")
  const element = (type: unknown, props: unknown) => ({ type, props })
  const exports: Record<string, any> = {}
  let reports = 0
  const context = vm.createContext({ exports, console: { error: () => {} },
    require: (name: string) => {
      if (name === "react/jsx-runtime") return { jsx: element, jsxs: element }
      if (name === "react") return { Component: class {
        props: unknown
        state: Record<string, unknown> = {}
        constructor(props: unknown) { this.props = props }
        setState(next: Record<string, unknown>) { this.state = { ...this.state, ...next } }
      } }
      if (name === "react-native") return { View: "View", Text: "Text", Pressable: "Pressable",
        StyleSheet: { create: (value: unknown) => value } }
      if (name === "@expo/vector-icons/Ionicons") return { default: "Ionicons" }
      if (name === "./theme") return { uiTheme: { colors: {}, spacing: {}, radius: {}, shadow: {}, font: {} } }
      if (name === "../observability/crashReporting") return {
        captureAppException: () => { if (reportingEnabled) reports += 1 }
      }
      if (name === "../features/session/appLocale") return { getAppLocale: () => locale }
      if (name === "./errorBoundaryCopy") return { getErrorBoundaryCopy }
      throw new Error(`Unexpected import ${name}`)
    }
  })
  vm.runInContext(ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX
  } }).outputText, context)
  return { Boundary: exports.ErrorBoundary, reports: () => reports }
}

for (const locale of ["tr", "en"] as const) {
  for (const reporting of [true, false]) {
    test(`${locale}: reporting ${reporting ? "enabled" : "disabled"} never changes recovery promises`, () => {
      const fixture = boundaryFixture(locale, reporting)
      const boundary = new fixture.Boundary({ children: "child" })
      assert.equal(boundary.render(), "child")
      const error = new Error("private diagnostic")
      boundary.setState(fixture.Boundary.getDerivedStateFromError(error))
      boundary.componentDidCatch(error, { componentStack: "synthetic" })
      const first = JSON.stringify(boundary.render())
      assert.match(first, locale === "tr" ? /Tekrar dene/ : /Try again/)
      assert.doesNotMatch(first, /private diagnostic|We saved|Your vibe is safe/)
      assert.equal(fixture.reports(), reporting ? 1 : 0)
      boundary.handleRecover()
      assert.equal(boundary.render(), "child")
      boundary.setState(fixture.Boundary.getDerivedStateFromError(error))
      const repeated = JSON.stringify(boundary.render())
      assert.doesNotMatch(repeated, /Pressable/)
      assert.match(repeated, locale === "tr" ? /kapatıp yeniden aç/ : /close and reopen/)
      boundary.handleRecover()
      assert.equal(boundary.state.hasError, true)
    })
  }
}
