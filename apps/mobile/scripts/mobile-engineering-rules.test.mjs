// Ratchet guards for the rules in docs/quality/ENGINEERING_RULES.md.
// Known debt is listed explicitly and may only shrink. A failure here means a
// change added new debt: fix the code, or, if the exception is justified,
// update the allowlist in the same change and explain why in the commit.
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, relative, resolve, sep } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const ts = createRequire(import.meta.url)("typescript")

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const srcRoot = join(mobileRoot, "src")

function listProductionSources(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...listProductionSources(fullPath))
    else if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.test\.(?:ts|tsx)$/.test(entry.name)) files.push(fullPath)
  }
  return files
}

const sources = listProductionSources(srcRoot).map((file) => ({
  path: relative(srcRoot, file).split(sep).join("/"),
  text: readFileSync(file, "utf8")
}))

test("HTTP goes through the shared request client, never a raw fetch", () => {
  const offenders = sources.filter(({ text }) => /(?<![\w.])fetch\(/.test(text)).map(({ path }) => path)
  assert.deepEqual(offenders, [], "use requestJson (deadline, abort, error mapping) instead of fetch()")
})

// An injected `fetcher` called directly skips requestJson's deadline and
// cancellation: room invite send/accept/cancel could stay busy forever
// (2026-10-01). Listed files call their fetcher inside a requestJson wrapper.
const FETCHER_INSIDE_REQUEST_JSON = new Set([
  "features/network/apiClient.ts",
  "features/inventory/economyApi.ts"
])

test("injected fetchers run only inside requestJson", () => {
  const offenders = sources
    .filter(({ text }) => /await fetcher\(/.test(text))
    .map(({ path }) => path)
    .filter((path) => !FETCHER_INSIDE_REQUEST_JSON.has(path))
  assert.deepEqual(offenders, [], "pass the fetcher to requestJson instead of calling it directly")
})

// Per-frame JS loops. Animation must run on the UI or native thread, not in
// JS timers. Existing entries are known debt (see ENGINEERING_RULES.md).
const FRAME_LOOP_DEBT = new Set([
  "features/roomV2/editor/useRoomEditorStageLayout.ts"
])

test("no new requestAnimationFrame or setInterval loops in production code", () => {
  const offenders = sources
    .filter(({ text }) => /requestAnimationFrame\(|setInterval\(/.test(text))
    .map(({ path }) => path)
    .filter((path) => !FRAME_LOOP_DEBT.has(path))
  assert.deepEqual(offenders, [], "run motion on the UI or native thread, not JS timers")
})

// LayoutAnimation re-lays out a whole subtree on the JS side, so keyboard and
// panel motion jumped and could not be interrupted. Motion animates transform
// and opacity on the UI thread. Existing entries are known debt.
const LAYOUT_ANIMATION_DEBT = new Set([
  "screens/InboxScreen.tsx"
])

test("no new LayoutAnimation in production code", () => {
  const offenders = sources
    .filter(({ text }) => /\bLayoutAnimation\b/.test(text))
    .map(({ path }) => path)
    .filter((path) => !LAYOUT_ANIMATION_DEBT.has(path))
  assert.deepEqual(offenders, [], "animate transform/opacity with Reanimated instead of LayoutAnimation")
})

// Only the shared reduced-motion source may talk to AccessibilityInfo for
// reduce-motion; everything else uses the shared store/hook.
const REDUCE_MOTION_SOURCES = new Set(["ui/motion.ts"])

test("reduce-motion is read from the shared store only", () => {
  const offenders = sources
    .filter(({ text }) => /AccessibilityInfo\.(?:isReduceMotionEnabled|addEventListener\(\s*["']reduceMotionChanged)/.test(text))
    .map(({ path }) => path)
    .filter((path) => !REDUCE_MOTION_SOURCES.has(path))
  assert.deepEqual(offenders, [], "use the shared reduced-motion hook from ui/motion (useMotion / useReducedMotion)")
})

// Only the shared reduce-transparency source may name the OS query or event;
// every glass surface reads the shared store/hook.
const REDUCE_TRANSPARENCY_SOURCES = new Set(["ui/reduceTransparency.ts", "ui/reduceTransparencyStore.ts"])

test("reduce-transparency is read from the shared store only", () => {
  const offenders = sources
    .filter(({ text }) => /isReduceTransparencyEnabled|reduceTransparencyChanged/.test(text))
    .map(({ path }) => path)
    .filter((path) => !REDUCE_TRANSPARENCY_SOURCES.has(path))
  assert.deepEqual(offenders, [], "use the shared reduce-transparency hook from ui/reduceTransparency")
})

// JS-driven Animated values run every frame on the JS thread.
test("Animated never runs on the JS driver", () => {
  const offenders = sources.filter(({ text }) => /useNativeDriver:\s*false/.test(text)).map(({ path }) => path)
  assert.deepEqual(offenders, [], "animate transform/opacity with the native driver or Reanimated")
})

// Per-frame UI-thread callbacks (useFrameCallback, gesture onUpdate/onChange,
// useAnimatedReaction reactions) may hop to JS only when a value changed:
// an unguarded scheduleOnRN/runOnJS there renders React on every frame.
// A hop counts as guarded when an enclosing `if` compares values (or calls a
// `...Changed` helper), or an earlier `if (<comparison>) return` in an
// enclosing block of the callback.
const JS_HOP = /^(?:scheduleOnRN|runOnJS)$/
const COMPARISON_OPERATORS = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken
])

function isComparison(node) {
  let found = false
  const visit = (child) => {
    if (found) return
    if (ts.isBinaryExpression(child) && COMPARISON_OPERATORS.has(child.operatorToken.kind)) found = true
    else if (ts.isCallExpression(child) && /changed/i.test(child.expression.getText())) found = true
    else if (ts.isPrefixUnaryExpression(child) && child.operator === ts.SyntaxKind.ExclamationToken && ts.isCallExpression(child.operand) && /^should/.test(child.operand.expression.getText())) found = true
    else ts.forEachChild(child, visit)
  }
  visit(node)
  return found
}

function isEarlyReturnGuard(statement) {
  return ts.isIfStatement(statement) &&
    isComparison(statement.expression) &&
    (ts.isReturnStatement(statement.thenStatement) ||
      (ts.isBlock(statement.thenStatement) && statement.thenStatement.statements.some(ts.isReturnStatement)))
}

function isGuarded(call, callback) {
  let child = call
  for (let node = call.parent; node && child !== callback; child = node, node = node.parent) {
    if (ts.isIfStatement(node) && child === node.thenStatement && isComparison(node.expression)) return true
    if (ts.isBlock(node)) {
      const index = node.statements.indexOf(child)
      if (node.statements.slice(0, index).some(isEarlyReturnGuard)) return true
    }
  }
  return false
}

function resolveCallback(node, sourceFile) {
  if (!node) return undefined
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return node
  if (!ts.isIdentifier(node)) return undefined
  let found
  const visit = (child) => {
    if (found) return
    if (ts.isVariableDeclaration(child) && ts.isIdentifier(child.name) && child.name.text === node.text && child.initializer) {
      const init = child.initializer
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) found = init
      else if (ts.isCallExpression(init) && /^use(?:Callback|Event|EffectEvent)$/.test(init.expression.getText())) {
        found = resolveCallback(init.arguments[0], sourceFile)
      }
    } else if (ts.isFunctionDeclaration(child) && child.name?.text === node.text) found = child
    else ts.forEachChild(child, visit)
  }
  visit(sourceFile)
  return found
}

function perFrameCallbacks(sourceFile, usesGestureHandler) {
  const callbacks = []
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      let kind
      let argument
      if (ts.isIdentifier(callee) && callee.text === "useFrameCallback") [kind, argument] = ["useFrameCallback", node.arguments[0]]
      else if (ts.isIdentifier(callee) && callee.text === "useAnimatedReaction") [kind, argument] = ["useAnimatedReaction", node.arguments[1]]
      else if (usesGestureHandler && ts.isPropertyAccessExpression(callee) && /^(?:onUpdate|onChange|onTouchesMove)$/.test(callee.name.text)) {
        [kind, argument] = [callee.name.text, node.arguments[0]]
      }
      const callback = kind ? resolveCallback(argument, sourceFile) : undefined
      if (callback) callbacks.push({ kind, callback, line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1 })
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return callbacks
}

test("per-frame UI-thread callbacks hop to JS only when a value changed", () => {
  const offenders = []
  let checked = 0
  for (const { path, text } of sources) {
    if (!/useFrameCallback|useAnimatedReaction|react-native-gesture-handler/.test(text)) continue
    const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    for (const { kind, callback, line } of perFrameCallbacks(sourceFile, text.includes("react-native-gesture-handler"))) {
      checked += 1
      const visit = (node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && JS_HOP.test(node.expression.text) && !isGuarded(node, callback)) {
          offenders.push(`${path}:${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1} (${kind} at line ${line})`)
        }
        ts.forEachChild(node, visit)
      }
      visit(callback)
    }
  }
  assert.ok(checked > 0, "the scan found no per-frame callbacks; the detector is broken")
  assert.deepEqual(offenders, [], "compare with the previous value before scheduleOnRN/runOnJS, or keep the work on the UI thread")
})

// A worklet's default parameters are not captured by the worklet transform,
// so a default that names a variable or import is undefined on the UI thread
// and crashes there (it passes under node tests). Resolve defaults in the body.
test("worklets never use identifiers in default parameters", () => {
  const offenders = []
  const signature = /(?:function\s+\w+|\bconst\s+\w+\s*=\s*)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*(?::[^{=]*)?(?:=>)?\s*\{\s*["']worklet["']/g
  for (const { path, text } of sources) {
    if (!/["']worklet["']/.test(text)) continue
    for (const match of text.matchAll(signature)) {
      for (const initializer of match[1].matchAll(/=\s*([A-Za-z_$][\w$.]*)/g)) {
        if (["true", "false", "null", "undefined"].includes(initializer[1])) continue
        offenders.push(`${path}:${text.slice(0, match.index).split("\n").length} default = ${initializer[1]}`)
      }
    }
  }
  assert.deepEqual(offenders, [], "move the default into the worklet body")
})

const MAX_EXHAUSTIVE_DEPS_SUPPRESSIONS = 0

test("react-hooks/exhaustive-deps suppressions do not grow", () => {
  const count = sources.reduce(
    (total, { text }) => total + (text.match(/eslint-disable(?:-next-line|-line)?\s+react-hooks\/exhaustive-deps/g) ?? []).length,
    0
  )
  assert.ok(
    count <= MAX_EXHAUSTIVE_DEPS_SUPPRESSIONS,
    `${count} suppressions > ${MAX_EXHAUSTIVE_DEPS_SUPPRESSIONS}; fix the dependency list instead`
  )
})

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
}

// PanResponder handlers spread onto a Pressable never fire on a device (the
// room editor and room setup drags shipped dead twice), and a JS PanResponder
// runs every move on the JS thread. Drags use Gesture Handler with worklet
// callbacks. Comments that mention the old implementation are fine.
test("no production source uses PanResponder; drags use Gesture Handler", () => {
  const offenders = sources
    .filter(({ text }) => /\b(?:PanResponder|panHandlers|GestureResponderHandlers)\b/.test(stripComments(text)))
    .map(({ path }) => path)
  assert.deepEqual(offenders, [], "use a Gesture Handler gesture with GestureDetector")
})

// A bare `beforeRemove` listener that calls preventDefault lets the iOS swipe
// pop the native page while JS keeps the route (2026-09-30, room editor).
// Unsaved-exit guards use usePreventRemove, which native-stack forwards as
// preventNativeDismiss. Listed files are known debt and may only shrink.
const BEFORE_REMOVE_PREVENT_DEFAULT_DEBT = new Set([
  // Blocks leaving the Shop while a combination is not in its editing phase.
  // Same desync class; move it to usePreventRemove.
  "features/shop/screen/useShopCombinationSession.ts"
])

test("exit guards use usePreventRemove, not beforeRemove + preventDefault", () => {
  const offenders = sources
    .filter(({ text }) => {
      const code = stripComments(text)
      return /addListener\(\s*["']beforeRemove["']/.test(code) && /\.preventDefault\(\)/.test(code)
    })
    .map(({ path }) => path)
    .filter((path) => !BEFORE_REMOVE_PREVENT_DEFAULT_DEBT.has(path))
  assert.deepEqual(offenders, [], "use usePreventRemove for unsaved-exit guards")
})

function extractCallArgument(text, openParenIndex) {
  let depth = 0
  for (let index = openParenIndex; index < text.length; index += 1) {
    const character = text[index]
    if (character === "(") depth += 1
    else if (character === ")") {
      depth -= 1
      if (depth === 0) return text.slice(openParenIndex + 1, index)
    }
  }
  return text.slice(openParenIndex + 1)
}

// Gesture frames run on the UI thread. A React state setter called from an
// onUpdate/onChange body renders React per frame (drag jank); JS hears about
// frames only through scheduleOnRN (cell changes, release).
test("gesture frame callbacks never call React state setters directly", () => {
  const offenders = []
  for (const { path, text } of sources) {
    const code = stripComments(text)
    for (const match of code.matchAll(/\.(?:onUpdate|onChange)\(\s*(?=\(|function\b|\w+\s*=>)/g)) {
      const body = extractCallArgument(code, match.index + match[0].indexOf("("))
      const withoutScheduled = body.replace(/scheduleOnRN\([^)]*\)/g, "")
      if (/(?<![\w.$])set[A-Z]\w*\(/.test(withoutScheduled)) {
        offenders.push(`${path}:${code.slice(0, match.index).split("\n").length}`)
      }
    }
  }
  assert.deepEqual(offenders, [], "reach JS from a gesture frame only through scheduleOnRN")
})

// FONT-1: fonts are embedded at build time by the expo-font config plugin, so
// text never renders in the system font first. A fontFamily that is not
// embedded silently falls back to the system font on a release build. iOS
// resolves an embedded font by its own family or PostScript name and Android
// by its file name, so each embedded file must carry its file name as both
// (scripts/embed_inter_fonts.py) and must be the only face in its family.
function readTrueTypeNames(buffer) {
  const tableCount = buffer.readUInt16BE(4)
  for (let index = 0; index < tableCount; index += 1) {
    const record = 12 + index * 16
    if (buffer.toString("latin1", record, record + 4) !== "name") continue
    const table = buffer.readUInt32BE(record + 8)
    const count = buffer.readUInt16BE(table + 2)
    const strings = table + buffer.readUInt16BE(table + 4)
    const names = new Map()
    for (let entry = 0; entry < count; entry += 1) {
      const at = table + 6 + entry * 12
      if (buffer.readUInt16BE(at) !== 3) continue
      const nameId = buffer.readUInt16BE(at + 6)
      const length = buffer.readUInt16BE(at + 8)
      const offset = strings + buffer.readUInt16BE(at + 10)
      names.set(nameId, Buffer.from(buffer.subarray(offset, offset + length)).swap16().toString("utf16le"))
    }
    return names
  }
  return new Map()
}

test("every app font is embedded at build time under the name the styles use", () => {
  const appJson = JSON.parse(readFileSync(join(mobileRoot, "app.json"), "utf8"))
  const fontPlugin = appJson.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-font")
  assert.ok(fontPlugin?.[1]?.fonts?.length, "configure expo-font with the fonts option")
  const embedded = new Set()
  for (const fontPath of fontPlugin[1].fonts) {
    const family = fontPath.split("/").pop().replace(/\.(?:ttf|otf)$/, "")
    const names = readTrueTypeNames(readFileSync(join(mobileRoot, fontPath)))
    assert.equal(names.get(1), family, `${fontPath}: family name must equal the file name`)
    assert.equal(names.get(6), family, `${fontPath}: PostScript name must equal the file name`)
    assert.equal(names.has(16), false, `${fontPath}: a typographic family would regroup the weights on iOS`)
    embedded.add(family)
  }
  const used = new Set()
  for (const { text } of sources) {
    for (const match of text.matchAll(/fontFamily:\s*["']([^"']+)["']/g)) used.add(match[1])
  }
  const missing = [...used].filter((family) => !embedded.has(family))
  assert.deepEqual(missing, [], "embed the font with the expo-font plugin in app.json before using it")
})
