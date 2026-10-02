// Every touch target and text field in the app has a VoiceOver role and name.
// Scans every non-test .tsx under apps/mobile/src. An element that spreads
// props ({...props}) counts as compliant: its caller supplies them.
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

function listTsxSources(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...listTsxSources(fullPath))
    else if (entry.name.endsWith(".tsx") && !/\.test\.tsx$/.test(entry.name)) files.push(fullPath)
  }
  return files
}

function inspect(sourceFile, path, failures) {
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const required = REQUIRED_ATTRIBUTES[node.tagName.getText(sourceFile)]
      const properties = node.attributes.properties
      if (required && !properties.some(ts.isJsxSpreadAttribute)) {
        const names = new Set(properties.filter(ts.isJsxAttribute).map((attribute) => attribute.name.getText(sourceFile)))
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
        for (const name of required) {
          if (!names.has(name)) failures.push(`${path}:${line} ${node.tagName.getText(sourceFile)} missing ${name}`)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

test("every Pressable, TextInput and FieldInput exposes an accessible role and name", () => {
  const failures = []
  const files = listTsxSources(srcRoot)
  assert.ok(files.length > 50, "the scan found too few .tsx files")
  for (const file of files) {
    const path = relative(srcRoot, file).split(sep).join("/")
    const sourceFile = ts.createSourceFile(path, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    inspect(sourceFile, path, failures)
  }
  assert.deepEqual(failures, [], "add accessibilityRole/accessibilityLabel")
})
