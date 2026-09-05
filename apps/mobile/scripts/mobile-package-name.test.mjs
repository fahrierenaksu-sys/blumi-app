import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"
import test from "node:test"

const repositoryRoot = resolve(
  fileURLToPath(new URL("../../../", import.meta.url))
)
const rootPackage = JSON.parse(
  readFileSync(resolve(repositoryRoot, "package.json"), "utf8")
)
const mobilePackage = JSON.parse(
  readFileSync(resolve(repositoryRoot, "apps/mobile/package.json"), "utf8")
)
const lockfile = readFileSync(resolve(repositoryRoot, "package-lock.json"), "utf8")
const rootReadme = readFileSync(resolve(repositoryRoot, "README.md"), "utf8")
const mobileReadme = readFileSync(
  resolve(repositoryRoot, "apps/mobile/README.md"),
  "utf8"
)
const legacyPackageScope = `@${["date", "vibe"].join("")}/mobile`

test("the mobile workspace uses the Blumi package name", () => {
  assert.equal(mobilePackage.name, "@blumi/mobile")
  assert.equal(
    rootPackage.scripts["dev:mobile"],
    "npm --workspace @blumi/mobile run start"
  )
  assert.match(lockfile, /"name": "@blumi\/mobile"/)
  assert.match(lockfile, /"node_modules\/@blumi\/mobile"/)
  assert.equal(lockfile.includes(legacyPackageScope), false)
})

test("active setup documentation uses the Blumi workspace command", () => {
  assert.match(rootReadme, /npm --workspace @blumi\/mobile/)
  assert.equal(rootReadme.includes(legacyPackageScope), false)
  assert.match(mobileReadme, /`com\.blumi\.mobile`/)
  assert.equal(mobileReadme.includes(legacyPackageScope), false)
})
