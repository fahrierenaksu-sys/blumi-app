import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import test from "node:test"

const require = createRequire(import.meta.url)
const braces = require("braces")
const micromatch = require("micromatch")
const guarded = { name: "RangeError", message: "Brace nesting exceeds safety limit" }

test("every installed lockfile copy is the reviewed version and rejects deep recursion", () => {
  const lock = JSON.parse(readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8"))
  const copies = Object.entries(lock.packages).filter(([path]) => path.endsWith("node_modules/braces"))
  assert.ok(copies.length > 0)
  for (const [path, metadata] of copies) {
    assert.equal(metadata.version, "3.0.3", "a different version needs a new mitigation review")
    const installed = require(new URL(`../../${path}`, import.meta.url).pathname)
    assert.equal(require(new URL(`../../${path}/package.json`, import.meta.url).pathname).version, "3.0.3")
    const deep = "{".repeat(4_000) + "a,b" + "}".repeat(4_000)
    for (const api of [installed, installed.parse, installed.compile, installed.expand, installed.stringify]) {
      assert.throws(() => api(deep), guarded)
    }
  }
})

test("deep brace and parenthesis patterns fail with a bounded error before recursive processing", () => {
  for (const [open, close] of [["{", "}"], ["(", ")"]]) {
    const pattern = open.repeat(4_000) + "a,b" + close.repeat(4_000)
    // This remains under the package's character limit and formerly overflowed.
    for (const api of [braces, braces.parse, braces.compile, braces.expand, braces.stringify]) {
      assert.throws(() => api(pattern), guarded)
    }
  }
  assert.throws(() => braces.parse("{".repeat(4_000)), guarded)
  assert.throws(() => micromatch.braces("{".repeat(4_000) + "a,b" + "}".repeat(4_000)), guarded)
})

test("public AST operations cannot bypass the depth guard with supplied or cyclic trees", () => {
  const nestedAst = () => {
    const root = { type: "root", nodes: [] }
    let node = root
    for (let i = 0; i < 4_000; i++) {
      const child = { type: "brace", nodes: [], parent: node }
      node.nodes.push(child)
      node = child
    }
    node.nodes.push({ type: "text", value: "leaf" })
    return root
  }
  for (const api of [braces.compile, braces.expand, braces.stringify]) {
    assert.throws(() => api(nestedAst()), guarded)
    const cyclic = { type: "root", nodes: [] }
    cyclic.nodes.push(cyclic)
    assert.throws(() => api(cyclic), guarded)
  }
})

test("normal Metro file extensions, nested alternatives, ranges and literal braces remain compatible", () => {
  const extensions = "**/*.{js,jsx,ts,tsx}"
  assert.equal(braces.compile(extensions), "**/*.(js|jsx|ts|tsx)")
  assert.deepEqual(braces.expand("asset-{01..03}.png"), ["asset-01.png", "asset-02.png", "asset-03.png"])
  assert.deepEqual(braces.expand("{src,{app,packages}}/{a,b}.tsx"), [
    "src/a.tsx", "src/b.tsx", "app/a.tsx", "app/b.tsx", "packages/a.tsx", "packages/b.tsx"
  ])
  assert.deepEqual(micromatch(["src/app.tsx", "src/app.js", "src/art.png"], extensions), ["src/app.tsx", "src/app.js"])
  assert.equal(braces.stringify(braces.parse("src/{app,packages}/file.ts")), "src/{app,packages}/file.ts")
  assert.deepEqual(braces.expand("src/\\{literal\\}/file.ts"), ["src/{literal}/file.ts"])
  const nested = "{".repeat(32) + "a,b" + "}".repeat(32)
  assert.doesNotThrow(() => braces.compile(nested))
})
