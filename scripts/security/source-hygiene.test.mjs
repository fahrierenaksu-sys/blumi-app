import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync, existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

test("secret environment files are ignored without hiding example templates", () => {
  for (const path of [".env", ".env.production", "apps/server/.env", "apps/mobile/.env.preview"]) {
    const ignored = execFileSync("git", ["check-ignore", "--no-index", path], { encoding: "utf8" }).trim()
    assert.equal(ignored, path)
  }
  const rules = readFileSync(new URL("../../.gitignore", import.meta.url), "utf8")
  assert.match(rules, /^!\.env\.example$/m)
})

test("workspaces share the root TypeScript version", () => {
  const root = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"))
  for (const workspace of ["apps/mobile", "apps/server", "packages/contracts", "packages/domain", "packages/realtime-client"]) {
    const pkg = JSON.parse(readFileSync(new URL(`../../${workspace}/package.json`, import.meta.url), "utf8"))
    const version = pkg.devDependencies?.typescript ?? pkg.dependencies?.typescript
    if (version) assert.equal(version, root.devDependencies.typescript, workspace)
  }
})

test("mobile runtime has one TypeScript source rather than stale emitted siblings", () => {
  const files = readdirSync("apps/mobile/src", { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
  const siblings = files.filter((path) => path.endsWith(".js") && (
    existsSync(path.slice(0, -3) + ".ts") || existsSync(path.slice(0, -3) + ".tsx")
  ))
  assert.deepEqual(siblings, [])
  assert.equal(existsSync("apps/mobile/package-lock.json"), false)
})
