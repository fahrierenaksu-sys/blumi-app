// Every touch target and text field in the app has a VoiceOver role and name.
// Scans every non-test .tsx under apps/mobile/src.
//
// Prop spreads are resolved, never trusted:
// - a component that spreads its own rest props onto a control forwards the
//   control's duty to its callers, so every use of that wrapper is checked
//   (minus what the wrapper sets itself);
// - a spread of a local, static object literal counts its keys;
// - any other spread must still name the attributes explicitly, or be listed
//   in SPREAD_EXEMPTIONS with a reason.
import assert from "node:assert/strict"
import test from "node:test"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const srcRoot = join(mobileRoot, "src")

const REQUIRED_ATTRIBUTES = {
  Pressable: ["accessibilityRole", "accessibilityLabel"],
  TextInput: ["accessibilityLabel"],
  FieldInput: ["accessibilityLabel"]
}

/**
 * Spreads the scan cannot resolve, as `path:line Tag` → reason. Each entry
 * must still match a real unresolved spread (stale entries fail).
 */
const SPREAD_EXEMPTIONS = new Map([])

function listTsxSources(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...listTsxSources(fullPath))
    else if (entry.name.endsWith(".tsx") && !/\.test\.tsx$/.test(entry.name)) files.push(fullPath)
  }
  return files
}

const lineOf = (sourceFile, node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1

/** `const X = Animated.createAnimatedComponent(Pressable)`: X is a Pressable too. */
function localControlAliases(sourceFile, required) {
  const aliases = {}
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer)) {
      const callee = node.initializer.expression.getText(sourceFile)
      const [argument] = node.initializer.arguments
      if (/(^|\.)createAnimatedComponent$/.test(callee) && argument && required[argument.getText(sourceFile)]) {
        aliases[node.name.text] = argument.getText(sourceFile)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return aliases
}

/** The function a JSX element is rendered by, with its name. */
function enclosingComponent(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) && current.name) return { fn: current, name: current.name.text }
    if ((ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      ts.isVariableDeclaration(current.parent) && ts.isIdentifier(current.parent.name)) {
      return { fn: current, name: current.parent.name.text }
    }
  }
  return null
}

/** True when `name` is the rest element of the component's destructured props. */
function isForwardedRestProps(component, name) {
  const [props] = component.fn.parameters
  if (!props || !ts.isObjectBindingPattern(props.name)) return false
  return props.name.elements.some((element) => element.dotDotDotToken && ts.isIdentifier(element.name) && element.name.text === name)
}

/** Keys of a spread of a local `const x = { ... }` literal, or null when unknown. */
function staticSpreadKeys(sourceFile, spread) {
  if (!ts.isIdentifier(spread.expression)) return null
  const name = spread.expression.text
  let keys = null
  const visit = (node) => {
    if (keys) return
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name &&
      ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.Const) &&
      node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      const properties = node.initializer.properties
      if (properties.every((property) => (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) && !ts.isComputedPropertyName(property.name))) {
        keys = properties.map((property) => property.name.getText(sourceFile))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return keys
}

/**
 * One pass over a file. Returns failures, unresolved spreads, and wrappers
 * that forward a control's duty to their callers.
 */
function inspectSource(sourceFile, path, required) {
  const failures = []
  const unresolvedSpreads = []
  const forwarders = {}
  const tags = { ...required }
  for (const [alias, base] of Object.entries(localControlAliases(sourceFile, required))) tags[alias] = required[base]
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sourceFile)
      const duty = tags[tag]
      if (duty) checkElement(node, tag, duty)
    }
    ts.forEachChild(node, visit)
  }
  const checkElement = (node, tag, duty) => {
    const properties = node.attributes.properties
    const names = new Set(properties.filter(ts.isJsxAttribute).map((attribute) => attribute.name.getText(sourceFile)))
    // A read-only TextInput only draws text (an animated number); it is no field.
    if (tag !== "Pressable" && duty === REQUIRED_ATTRIBUTES.TextInput && names.has("editable") &&
      properties.some((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === "editable" &&
        attribute.initializer?.getText(sourceFile) === "{false}")) return
    let forwardedTo = null
    let hasUnresolvedSpread = false
    for (const spread of properties.filter(ts.isJsxSpreadAttribute)) {
      const keys = staticSpreadKeys(sourceFile, spread)
      if (keys) { for (const key of keys) names.add(key); continue }
      const component = enclosingComponent(node)
      if (component && ts.isIdentifier(spread.expression) && isForwardedRestProps(component, spread.expression.text)) {
        forwardedTo = component.name
        continue
      }
      hasUnresolvedSpread = true
      unresolvedSpreads.push({ key: `${path}:${lineOf(sourceFile, node)} ${tag}`, explicit: duty.every((name) => names.has(name)) })
    }
    const missing = duty.filter((name) => !names.has(name))
    if (missing.length === 0) return
    if (forwardedTo) {
      forwarders[forwardedTo] = [...new Set([...(forwarders[forwardedTo] ?? []), ...missing])]
      return
    }
    if (hasUnresolvedSpread) return // reported once, as an unresolved spread
    for (const name of missing) failures.push(`${path}:${lineOf(sourceFile, node)} ${tag} missing ${name}`)
  }
  visit(sourceFile)
  return { failures, unresolvedSpreads, forwarders }
}

/** Checks every source until no new forwarding wrapper turns up. */
function scanSources(sources, exemptions = SPREAD_EXEMPTIONS) {
  let required = { ...REQUIRED_ATTRIBUTES }
  for (;;) {
    const failures = []
    const unresolved = []
    let grew = false
    for (const { path, text } of sources) {
      const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const result = inspectSource(sourceFile, path, required)
      failures.push(...result.failures)
      unresolved.push(...result.unresolvedSpreads)
      for (const [name, duty] of Object.entries(result.forwarders)) {
        if (!required[name] || duty.some((attribute) => !required[name].includes(attribute))) {
          required = { ...required, [name]: [...new Set([...(required[name] ?? []), ...duty])] }
          grew = true
        }
      }
    }
    if (grew) continue
    for (const spread of unresolved) {
      if (!spread.explicit && !exemptions.has(spread.key)) failures.push(`${spread.key} spreads props the scan cannot resolve; name the attributes or add a SPREAD_EXEMPTIONS reason`)
    }
    const unresolvedKeys = new Set(unresolved.map((spread) => spread.key))
    for (const key of exemptions.keys()) {
      if (!unresolvedKeys.has(key)) failures.push(`${key} is a stale SPREAD_EXEMPTIONS entry`)
    }
    return { failures, required }
  }
}

const fixture = (path, text) => ({ path, text })

test("a wrapper that spreads its rest props onto a Pressable makes every caller name the control", () => {
  const { failures, required } = scanSources([
    fixture("ui/Tap.tsx", "export function Tap({ onPress, ...rest }) { return <Pressable {...rest} onPress={onPress} /> }"),
    fixture("ui/Labelled.tsx", "export const Labelled = ({ ...rest }) => <Tap accessibilityRole=\"button\" {...rest} />"),
    fixture("screens/A.tsx", "export const A = () => <><Tap accessibilityRole=\"button\" accessibilityLabel=\"Ok\" /><Tap onPress={go} /><Labelled accessibilityLabel=\"Ok\" /><Labelled /></>")
  ], new Map())
  assert.deepEqual(required.Tap, ["accessibilityRole", "accessibilityLabel"])
  assert.deepEqual(required.Labelled, ["accessibilityLabel"], "what a wrapper sets itself is not asked of its callers")
  assert.deepEqual(failures, [
    "screens/A.tsx:1 Tap missing accessibilityRole",
    "screens/A.tsx:1 Tap missing accessibilityLabel",
    "screens/A.tsx:1 Labelled missing accessibilityLabel"
  ])
})

test("a spread of a local static object counts its keys; other spreads need names or a reason", () => {
  const a11y = "const a11y = { accessibilityRole: \"button\", accessibilityLabel: \"Ok\" }\n"
  const { failures } = scanSources([
    fixture("a.tsx", `${a11y}export const A = () => <Pressable {...a11y} />`),
    fixture("b.tsx", "const half = { accessibilityRole: \"button\" }\nexport const B = () => <Pressable {...half} />"),
    fixture("c.tsx", "export const C = (props) => <Pressable {...props.extra} />"),
    fixture("d.tsx", "export const D = (props) => <Pressable {...props.extra} accessibilityRole=\"button\" accessibilityLabel=\"Ok\" />"),
    fixture("e.tsx", "export const E = (props) => <Pressable {...props.extra} />")
  ], new Map([["e.tsx:1 Pressable", "synthetic reason"], ["gone.tsx:1 Pressable", "synthetic stale"]]))
  assert.deepEqual(failures, [
    "b.tsx:2 Pressable missing accessibilityLabel",
    "c.tsx:1 Pressable spreads props the scan cannot resolve; name the attributes or add a SPREAD_EXEMPTIONS reason",
    "gone.tsx:1 Pressable is a stale SPREAD_EXEMPTIONS entry"
  ])
})

test("an animated alias of Pressable is checked like Pressable", () => {
  const { failures } = scanSources([
    fixture("a.tsx", "const AnimatedPressable = Animated.createAnimatedComponent(Pressable)\nexport const A = () => <AnimatedPressable onPress={go} />")
  ], new Map())
  assert.deepEqual(failures, ["a.tsx:2 AnimatedPressable missing accessibilityRole", "a.tsx:2 AnimatedPressable missing accessibilityLabel"])
})

test("every Pressable, TextInput and FieldInput exposes an accessible role and name", () => {
  const files = listTsxSources(srcRoot)
  assert.ok(files.length > 50, "the scan found too few .tsx files")
  const sources = files.map((file) => ({ path: relative(srcRoot, file).split(sep).join("/"), text: readFileSync(file, "utf8") }))
  const { failures, required } = scanSources(sources)
  assert.ok(required.PressableScale && required.GesturePressableScale, "the shared press wrappers are checked at their call sites")
  assert.deepEqual(failures, [], "add accessibilityRole/accessibilityLabel")
})
