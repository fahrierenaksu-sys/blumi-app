import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"

test("packaging runs legal preflight before generating native artifacts", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../apps/mobile/package.json", import.meta.url), "utf8"))
  assert.match(pkg.scripts["eas-build-post-install"] ?? "", /legal-preflight/)
})

test("unverified legal metadata blocks production but not local preview preflight", () => {
  for (const profile of ["production", "preview"]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", "apps/mobile/scripts/legal-preflight.ts"], {
      cwd: new URL("../../", import.meta.url),
      env: { ...process.env, EAS_BUILD_PROFILE: profile }, encoding: "utf8"
    })
    assert.equal(result.status, profile === "production" ? 1 : 0)
    if (profile === "production") assert.match(result.stderr, /legal release is blocked/)
  }
})
