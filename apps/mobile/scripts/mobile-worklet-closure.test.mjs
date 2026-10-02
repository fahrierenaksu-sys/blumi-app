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
      if (init?.type === "CallExpression" && init.callee.type === "Identifier" && init.callee.name === "useCallback") {
        init = init.arguments[0]
      } else if (init?.type === "CallExpression" && init.callee.type === "Identifier" && init.callee.name === "useMemo") {
        // useMemo holds what its factory returns: a function only when the
        // factory's expression body is one.
        const factory = init.arguments[0]
        init = factory?.type === "ArrowFunctionExpression" && factory.body.type !== "BlockStatement"
          ? factory.body
          : undefined
      }
      result = isFunctionNode(init) ? (hasWorkletDirective(init) ? "worklet" : "plain") : "unknown"
      path.stop()
    }
  })
  return result
}

// Functions that only hand a JS function back to the JS thread.
const JS_HANDOFF_CALLEES = new Set(["scheduleOnRN", "runOnJS"])

// How a worklet uses the names it received through this.__closure:
// `called` names are called directly; `used` names are read any other way
// (aliased, passed on, stored) except as the function handed to
// scheduleOnRN/runOnJS. A plain function read through an alias
// (`const config = _temp; config(x)`) crashes exactly like a direct call.
function findClosureUses(code) {
  const called = new Set()
  const used = new Set()
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
    ReferencedIdentifier(path) {
      const name = path.node.name
      // Only references that resolve to the closure itself (a nested
      // worklet's factory parameters shadow the same names).
      const binding = path.scope.getBinding(name)
      const init = binding?.path.isVariableDeclarator() ? binding.path.node.init : undefined
      if (!(init?.type === "MemberExpression" && init.object.type === "ThisExpression" &&
        init.property.name === "__closure")) return
      const parent = path.parentPath
      if (parent.isCallExpression() && parent.node.callee === path.node) {
        called.add(name)
        return
      }
      if (parent.isCallExpression() && parent.node.arguments[0] === path.node &&
        parent.node.callee.type === "Identifier" && JS_HANDOFF_CALLEES.has(parent.node.callee.name)) {
        return
      }
      // Rebuilding a nested worklet's factory passes its captured names on;
      // that worklet's own code is checked separately.
      if (parent.isObjectProperty() && parent.node.value === path.node &&
        parent.parentPath.parentPath?.isCallExpression() &&
        /Factory$/.test(parent.parentPath.parentPath.node.callee.id?.name ?? "")) {
        return
      }
      used.add(name)
    }
  })
  const fromClosure = (name) => closureNames.has(name) && !name.startsWith("_worklet_")
  return {
    called: [...called].filter(fromClosure),
    used: [...used].filter((name) => fromClosure(name) && !called.has(name))
  }
}

// Kept for the probe test below: names a worklet calls from its closure.
function findClosureCalls(code) {
  return findClosureUses(code).called
}

// Top-level functions of the compiled module (what Metro actually ships).
// The React Compiler hoists functions that capture nothing to module scope
// as `_temp`, `_temp2`, … even when they sit inside a worklet; the Worklets
// plugin then sees a plain function, not a worklet. A worklet function
// declaration compiles to a factory call, so a remaining function
// declaration or function expression is plain.
function classifyCompiledTopLevel(compiled) {
  const kinds = new Map()
  for (const statement of parse(compiled, { sourceType: "module" }).program.body) {
    if (statement.type === "FunctionDeclaration" && statement.id) {
      kinds.set(statement.id.name, "plain")
    } else if (statement.type === "VariableDeclaration") {
      for (const declarator of statement.declarations) {
        if (declarator.id.type !== "Identifier") continue
        if (isFunctionNode(declarator.init)) kinds.set(declarator.id.name, "plain")
      }
    }
  }
  return kinds
}

function classifyClosureName(file, compiledKinds, name) {
  // Only names the compiler or the plugins introduced are judged by the
  // compiled module; everything else is judged by the source as written.
  if (/^_temp\d*$/.test(name) && compiledKinds.has(name)) return compiledKinds.get(name)
  const fromSource = classifyName(file, name)
  if (fromSource !== "unknown") return fromSource
  return compiledKinds.get(name) ?? "unknown"
}

const files = listCandidateFiles(srcRoot)
// Metro (@expo/metro-config's babel transformer) tells babel-preset-expo to
// run the React Compiler before the worklets plugin when app.json turns it
// on, so the check compiles with the caller a device build uses.
const supportsReactCompiler =
  JSON.parse(readFileSync(join(mobileRoot, "app.json"), "utf8")).expo.experiments?.reactCompiler === true

function compileLikeMetro(file, options) {
  return babel.transformFileSync(file, {
    cwd: mobileRoot,
    configFile: join(mobileRoot, "babel.config.js"),
    caller: {
      name: "metro",
      bundler: "metro",
      platform: "ios",
      engine: "hermes",
      isDev: options.isDev,
      isServer: false,
      isNodeModule: false,
      isHMREnabled: true,
      projectRoot: mobileRoot,
      supportsReactCompiler: options.supportsReactCompiler ? true : undefined
    },
    sourceMaps: false
  }).code
}

function newReport() {
  return { failures: [], unknownCalls: [], workletCount: 0, classifiedCalls: 0 }
}

function checkWorklets(file, compiled, report) {
  const compiledKinds = classifyCompiledTopLevel(compiled)
  for (const code of extractWorkletCodes(compiled)) {
    report.workletCount += 1
    const name = code.match(/^function\s+([\w$]+)/)?.[1] ?? "<anonymous>"
    const where = `${relative(srcRoot, file).split(sep).join("/")} ${name}`
    for (const problem of findUnboundNames(code)) report.failures.push(`${where}: ${problem}`)
    const { called, used } = findClosureUses(code)
    for (const callee of called) {
      const kind = classifyClosureName(file, compiledKinds, callee)
      if (kind === "worklet" || kind === "ui-safe") report.classifiedCalls += 1
      if (kind === "plain") report.failures.push(`${where}: calls non-worklet function '${callee}' on the UI thread`)
      if (kind === "unknown") report.unknownCalls.push(`${where}: '${callee}'`)
    }
    for (const value of used) {
      if (classifyClosureName(file, compiledKinds, value) === "plain") {
        report.failures.push(`${where}: uses non-worklet function '${value}' on the UI thread`)
      }
    }
  }
  return report
}

test("worklet code shipped to the UI thread has every name it uses", () => {
  assert.ok(files.length > 5, `expected to find the app's animation files, found ${files.length}`)
  const report = newReport()
  for (const file of files) {
    // A device dev build (the 2026-10-02 crash) and a release bundle compile
    // worklets the same way; dev only adds React Refresh and stack details.
    checkWorklets(file, compileLikeMetro(file, { isDev: true, supportsReactCompiler }), report)
  }
  const { failures, unknownCalls, workletCount, classifiedCalls } = report
  assert.ok(workletCount > 10, `expected many worklets, found ${workletCount}`)
  assert.ok(classifiedCalls > 10, `expected the checker to classify worklet calls, classified ${classifiedCalls}`)
  assert.deepEqual(failures, [], "pass the value through the closure (use it in the body) or a parameter; mark called functions 'worklet' or use scheduleOnRN")
  assert.deepEqual(unknownCalls, [], "a worklet calls a closure function whose origin the checker cannot classify; mark it 'worklet' or extend the checker")
})

// The 2026-10-02 My Room crash: with the React Compiler on, a capture-free
// helper declared inside a worklet was hoisted to a module-level `_temp`,
// reached the UI thread as a plain JS function through an alias
// (`const config = _temp`) and threw "Tried to synchronously call a Remote
// Function. Called "_temp"" on the first floor tap.
test("the checker flags a compiler-hoisted helper that a worklet calls through an alias", () => {
  const directory = mkdtempSync(join(tmpdir(), "blumi-worklet-compiler-probe-"))
  try {
    const probe = join(directory, "useProbeWalk.ts")
    writeFileSync(probe, [
      "import { useCallback } from \"react\"",
      "import { useSharedValue, withSequence, withTiming } from \"react-native-reanimated\"",
      "import { runOnUISync } from \"react-native-worklets\"",
      "",
      "export function useProbeWalk() {",
      "  const progress = useSharedValue(0)",
      "  return useCallback((durations: readonly number[]) => {",
      "    runOnUISync(() => {",
      "      \"worklet\"",
      "      const config = (duration: number) => ({ duration })",
      "      progress.value = withSequence(...durations.map((duration, index) => withTiming(index + 1, config(duration))))",
      "    })",
      "  }, [progress])",
      "}",
      ""
    ].join("\n"))
    const compiled = checkWorklets(probe, compileLikeMetro(probe, { isDev: true, supportsReactCompiler: true }), newReport())
    assert.ok(compiled.workletCount > 0)
    assert.ok(
      compiled.failures.some((failure) => /non-worklet function '_temp\d*'/.test(failure)),
      `expected the hoisted helper to be flagged, got ${JSON.stringify(compiled.failures)}`
    )
    const plain = checkWorklets(probe, compileLikeMetro(probe, { isDev: true, supportsReactCompiler: false }), newReport())
    assert.deepEqual(plain.failures, [])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
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
