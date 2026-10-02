/**
 * Test-only: finds JS-thread work scheduled from per-frame gesture and scroll
 * callbacks. Gesture `.onUpdate`, `.onChange` and `.onTouchesMove` callbacks
 * and `useAnimatedScrollHandler` `onScroll` bodies run on the UI thread every
 * frame; calling `scheduleOnRN`, `runOnJS` or a React `setX` setter there
 * crosses to JS on every frame (the recurring drag/scroll jank class). Such a
 * call is allowed only inside a conditional (an `if`, `?:`, `&&` or `||`), so
 * it fires on a threshold crossing instead of every frame.
 *
 * Never import this from production code.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import ts from "typescript"

const PER_FRAME_GESTURE_METHODS = new Set(["onUpdate", "onChange", "onTouchesMove"])
const JS_CROSSING_CALL = /^(scheduleOnRN|runOnJS|set[A-Z]\w*)$/

export function listSourceFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      if (entry === "node_modules" || entry === "testing") continue
      files.push(...listSourceFiles(path))
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) && !entry.endsWith(".d.ts")) {
      files.push(path)
    }
  }
  return files
}

function isGestureChain(expression) {
  let current = expression
  while (current) {
    if (ts.isCallExpression(current)) current = current.expression
    else if (ts.isPropertyAccessExpression(current)) {
      if (ts.isIdentifier(current.expression) && current.expression.text === "Gesture") return true
      current = current.expression
    } else return false
  }
  return false
}

function perFrameCallbacks(sourceFile) {
  const callbacks = []
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      if (
        ts.isPropertyAccessExpression(callee) &&
        PER_FRAME_GESTURE_METHODS.has(callee.name.text) &&
        isGestureChain(callee.expression)
      ) {
        if (node.arguments[0]) callbacks.push({ name: `.${callee.name.text}`, node: node.arguments[0] })
      }
      if (ts.isIdentifier(callee) && callee.text === "useAnimatedScrollHandler" && node.arguments[0]) {
        const handler = node.arguments[0]
        if (ts.isObjectLiteralExpression(handler)) {
          for (const property of handler.properties) {
            if (property.name && ts.isIdentifier(property.name) && property.name.text === "onScroll") {
              callbacks.push({ name: "onScroll", node: ts.isPropertyAssignment(property) ? property.initializer : property })
            }
          }
        } else {
          callbacks.push({ name: "onScroll", node: handler })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return callbacks
}

function returnsEarly(statement) {
  if (!ts.isIfStatement(statement)) return false
  const branch = statement.thenStatement
  return ts.isReturnStatement(branch) ||
    (ts.isBlock(branch) && branch.statements.some((inner) => ts.isReturnStatement(inner)))
}

function isConditional(node, boundary) {
  let child = node
  for (let current = node.parent; current && current !== boundary; child = current, current = current.parent) {
    if (ts.isIfStatement(current) || ts.isConditionalExpression(current)) return true
    // An earlier `if (...) return` in the same block guards what follows it.
    if (ts.isBlock(current)) {
      const index = current.statements.indexOf(child)
      if (current.statements.slice(0, index).some(returnsEarly)) return true
    }
    if (
      ts.isBinaryExpression(current) &&
      [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken]
        .includes(current.operatorToken.kind)
    ) return true
  }
  return false
}

/** Returns "file:line callback -> call" for every unguarded per-frame JS crossing. */
export function findPerFrameJsWork(files, root) {
  const violations = []
  for (const file of files) {
    const text = readFileSync(file, "utf8")
    if (!/onUpdate|onChange|onTouchesMove|useAnimatedScrollHandler/.test(text)) continue
    const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    for (const callback of perFrameCallbacks(sourceFile)) {
      const visit = (node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && JS_CROSSING_CALL.test(node.expression.text)) {
          if (!isConditional(node, callback.node)) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
            violations.push(`${relative(root, file)}:${line + 1} ${callback.name} -> ${node.expression.text}`)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(callback.node)
    }
  }
  return violations
}
