// Compiles every production file that can contain worklets with the app's
// real Babel config (babel-preset-expo + the Reanimated/Worklets plugin) and
// checks the code string each worklet ships to the UI thread. A name that is
// not bound there throws "Property '<name>' doesn't exist" on the device only:
// node tests run the original JavaScript and cannot see it (this is how the
// main-tab pager crashed on 2026-09-30).
import assert from "node:assert/strict"
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { createRequire } from "node:module"
import { dirname, join, relative, resolve, sep } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const babel = require("@babel/core")
const { parse } = require("@babel/parser")
const traverse = require("@babel/traverse").default

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const srcRoot = join(mobileRoot, "src")

// Globals that exist on the Worklets UI runtime. Keep this list short and
// standard; anything app-specific must reach a worklet through its closure.
const UI_RUNTIME_GLOBALS = new Set([
  "Array", "Boolean", "Date", "Error", "Infinity", "JSON", "Map", "Math",
  "NaN", "Number", "Object", "Promise", "RangeError", "RegExp", "Set",
  "String", "Symbol", "TypeError", "WeakMap", "WeakSet", "console",
  "global", "globalThis", "isFinite", "isNaN", "parseFloat", "parseInt", "undefined",
  "_WORKLET", "__DEV__", "_log", "arguments", "requestAnimationFrame",
  "performance", "setTimeout", "clearTimeout", "queueMicrotask"
])

function listCandidateFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...listCandidateFiles(fullPath))
    else if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.test\.(?:ts|tsx)$/.test(entry.name)) {
      const text = readFileSync(fullPath, "utf8")
      if (/["']worklet["']|react-native-reanimated|react-native-gesture-handler|react-native-worklets/.test(text)) {
        files.push(fullPath)
      }
    }
  }
  return files
}

function extractWorkletCodes(compiled) {
  const codes = []
  const pattern = /_init_data\s*=\s*\{\s*code:\s*("(?:[^"\\]|\\.)*")/g
  for (const match of compiled.matchAll(pattern)) codes.push(JSON.parse(match[1]))
  return codes
}

function findUnboundNames(code) {
  const problems = []
  const ast = parse(code, { sourceType: "script", plugins: [] })
  traverse(ast, {
    Program(programPath) {
      const top = programPath.get("body")[0]
      // Default parameters are evaluated before the body destructures
      // this.__closure, so a default may only use other parameters, globals
      // and literals.
      if (top?.isFunctionDeclaration()) {
        const bodyNames = new Set(
          Object.entries(top.scope.bindings)
            .filter(([, binding]) => binding.kind !== "param")
            .map(([name]) => name)
        )
        for (const param of top.get("params")) {
          if (!param.isAssignmentPattern()) continue
          const names = []
          const right = param.get("right")
          if (right.isIdentifier()) names.push(right.node.name)
          right.traverse({ ReferencedIdentifier: (idPath) => { names.push(idPath.node.name) } })
          for (const name of names) {
            if (bodyNames.has(name)) problems.push(`default parameter uses '${name}' before the closure is read`)
          }
        }
      }
    },
    ReferencedIdentifier(path) {
      const name = path.node.name
      if (path.scope.hasBinding(name, true)) return
      if (UI_RUNTIME_GLOBALS.has(name)) return
      problems.push(`'${name}' is not bound on the UI thread`)
    }
  })
  return problems
}

// Packages whose exports are safe to call from a worklet (UI-thread APIs).
const UI_SAFE_PACKAGES = new Set([
  "react-native-reanimated",
  "react-native-worklets",
  "react-native-gesture-handler"
])

function hasWorkletDirective(fnNode) {
  return fnNode?.body?.type === "BlockStatement" &&
    (fnNode.body.directives ?? []).some((directive) => directive.value.value === "worklet")
}

function isFunctionNode(node) {
  return node?.type === "ArrowFunctionExpression" || node?.type === "FunctionExpression"
}

const sourceCache = new Map()
function parseSource(file) {
  if (!sourceCache.has(file)) {
    sourceCache.set(file, parse(readFileSync(file, "utf8"), {
      sourceType: "module",
      plugins: ["typescript", "jsx"]
    }))
  }
  return sourceCache.get(file)
}

function resolveModuleFile(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier)
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    try { if (readdirSync(dirname(candidate)).includes(candidate.split(sep).pop())) return candidate } catch { /* keep looking */ }
  }
  return undefined
}

// How a top-level or hook-level name in `file` behaves when a worklet calls it:
// "worklet", "ui-safe" (a UI-thread library API), "plain" or "unknown".
function classifyName(file, name, seen = new Set()) {
  const key = `${file}#${name}`
  if (seen.has(key)) return "unknown"
  seen.add(key)
  let result = "unknown"
  traverse(parseSource(file), {
    ImportDeclaration(path) {
      const specifier = path.node.specifiers.find((spec) => spec.local.name === name)
      if (!specifier) return
      const source = path.node.source.value
      if ([...UI_SAFE_PACKAGES].some((pkg) => source === pkg || source.startsWith(`${pkg}/`))) {
        result = "ui-safe"
      } else if (source.startsWith(".")) {
        const target = resolveModuleFile(file, source)
        const imported = specifier.imported?.name ?? specifier.local.name
        result = target ? classifyName(target, imported, seen) : "unknown"
      } else {
        result = "plain"
      }
      path.stop()
    },
    FunctionDeclaration(path) {
      if (path.node.id?.name !== name) return
      result = hasWorkletDirective(path.node) ? "worklet" : "plain"
      path.stop()
    },
    VariableDeclarator(path) {
      if (path.node.id?.type !== "Identifier" || path.node.id.name !== name) return
      let init = path.node.init
      if (init?.type === "CallExpression" && init.callee.type === "Identifier" &&
        ["useCallback", "useMemo"].includes(init.callee.name)) {
        init = init.arguments[0]
        if (init?.type === "ArrowFunctionExpression" && init.callee === undefined && init.body.type !== "BlockStatement" && isFunctionNode(init.body)) {
          init = init.body
        }
      }
      result = isFunctionNode(init) ? (hasWorkletDirective(init) ? "worklet" : "plain") : "unknown"
      path.stop()
    }
  })
  return result
}

// Names a worklet calls that it received through this.__closure.
function findClosureCalls(code) {
  const called = new Set()
  const closureNames = new Set()
  traverse(parse(code, { sourceType: "script" }), {
    VariableDeclarator(path) {
      const init = path.node.init
      if (init?.type === "MemberExpression" && init.object.type === "ThisExpression" &&
        init.property.name === "__closure" && path.node.id.type === "ObjectPattern") {
        for (const property of path.node.id.properties) {
          if (property.value?.type === "Identifier") closureNames.add(property.value.name)
        }
      }
    },
    CallExpression(path) {
      if (path.node.callee.type === "Identifier") called.add(path.node.callee.name)
    }
  })
  return [...called].filter((name) => closureNames.has(name) && !name.startsWith("_worklet_"))
}

const files = listCandidateFiles(srcRoot)
// Metro tells babel-preset-expo to run the React Compiler before the worklets
// plugin when app.json turns it on; compile the same way here, because the
// compiler rewrites the components that hold worklets.
const supportsReactCompiler =
  JSON.parse(readFileSync(join(mobileRoot, "app.json"), "utf8")).expo.experiments?.reactCompiler === true

test("worklet code shipped to the UI thread has every name it uses", () => {
  assert.ok(files.length > 5, `expected to find the app's animation files, found ${files.length}`)
  const failures = []
  const unknownCalls = []
  let workletCount = 0
  let classifiedCalls = 0
  for (const file of files) {
    const compiled = babel.transformFileSync(file, {
      cwd: mobileRoot,
      configFile: join(mobileRoot, "babel.config.js"),
      caller: { name: "metro", bundler: "metro", platform: "ios", supportsReactCompiler },
      sourceMaps: false
    }).code
    for (const code of extractWorkletCodes(compiled)) {
      workletCount += 1
      const name = code.match(/^function\s+([\w$]+)/)?.[1] ?? "<anonymous>"
      const where = `${relative(srcRoot, file).split(sep).join("/")} ${name}`
      for (const problem of findUnboundNames(code)) failures.push(`${where}: ${problem}`)
      for (const callee of findClosureCalls(code)) {
        const kind = classifyName(file, callee)
        if (kind === "worklet" || kind === "ui-safe") classifiedCalls += 1
        if (kind === "plain") failures.push(`${where}: calls non-worklet function '${callee}' on the UI thread`)
        if (kind === "unknown") unknownCalls.push(`${where}: '${callee}'`)
      }
    }
  }
  assert.ok(workletCount > 10, `expected many worklets, found ${workletCount}`)
  assert.ok(classifiedCalls > 10, `expected the checker to classify worklet calls, classified ${classifiedCalls}`)
  assert.deepEqual(failures, [], "pass the value through the closure (use it in the body) or a parameter; mark called functions 'worklet' or use scheduleOnRN")
  assert.deepEqual(unknownCalls, [], "a worklet calls a closure function whose origin the checker cannot classify; mark it 'worklet' or extend the checker")
})

test("the checker catches a default parameter that names an imported constant", () => {
  const code =
    "function rubberBand(overscroll,dimension,coefficient=COEFFICIENT){const{COEFFICIENT}=this.__closure;return overscroll*coefficient;}"
  assert.deepEqual(findUnboundNames(code), ["default parameter uses 'COEFFICIENT' before the closure is read"])
  assert.deepEqual(
    findUnboundNames("function f(x){return x+MISSING_CONSTANT;}"),
    ["'MISSING_CONSTANT' is not bound on the UI thread"]
  )
  assert.deepEqual(findUnboundNames("function f(x){const{A}=this.__closure;return Math.max(x,A);}"), [])
})

test("the checker flags a worklet that calls a plain function from another module", () => {
  const directory = mkdtempSync(join(tmpdir(), "blumi-worklet-probe-"))
  try {
    writeFileSync(join(directory, "plainHelper.ts"), "export function plainHelper(v: number) { return v * 2 }\n")
    writeFileSync(join(directory, "workletHelper.ts"), "export function workletHelper(v: number) {\n  \"worklet\"\n  return v * 2\n}\n")
    const probe = join(directory, "probe.ts")
    writeFileSync(probe, [
      "import { withSpring } from \"react-native-reanimated\"",
      "import { plainHelper } from \"./plainHelper\"",
      "import { workletHelper } from \"./workletHelper\"",
      ""
    ].join("\n"))
    assert.equal(classifyName(probe, "plainHelper"), "plain")
    assert.equal(classifyName(probe, "workletHelper"), "worklet")
    assert.equal(classifyName(probe, "withSpring"), "ui-safe")
    const code = "function w(x){const{plainHelper,workletHelper,withSpring}=this.__closure;return withSpring(workletHelper(plainHelper(x)));}"
    assert.deepEqual(findClosureCalls(code).sort(), ["plainHelper", "withSpring", "workletHelper"])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
