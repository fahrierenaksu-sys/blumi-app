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

const EAS_WORKFLOWS = [
  "apps/mobile/.eas/workflows/testflight.yml",
  "apps/mobile/.eas/workflows/preview-testflight-build.yml",
]

function easCheckCommands(path) {
  const text = readFileSync(path, "utf8")
  const block = text.split("run: |")[1]?.split(/\n\s*\n|\n  build/)[0] ?? ""
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("npm run ") || line.startsWith("npm test"))
    .map((line) => (line === "npm test" ? "npm run test" : line))
}

test("release checks run only steps that the full verify also runs", () => {
  const root = JSON.parse(readFileSync("package.json", "utf8"))
  const verifySteps = root.scripts.verify.split("&&").map((step) => step.trim())
  for (const path of EAS_WORKFLOWS) {
    const commands = easCheckCommands(path)
    assert.ok(commands.length >= 5, `${path} lost its release check commands`)
    for (const command of commands) assert.ok(verifySteps.includes(command), `${path}: "${command}" is not part of npm run verify`)
  }
})

test("release builds require a successful full Verify run for the exact commit", () => {
  for (const path of EAS_WORKFLOWS) {
    assert.match(readFileSync(path, "utf8"), /node scripts\/security\/require-verify-run\.mjs/, path)
  }
  const verify = readFileSync(".github/workflows/verify.yml", "utf8")
  assert.match(verify, /branches: \[main, "release\/\*\*"\]/)
  assert.match(verify, /run: npm run verify$/m)
})

test("verify run lookup accepts only a successful Verify run for the same commit", async () => {
  const { findSuccessfulVerifyRun, requireVerifyRun, VERIFY_WORKFLOW_PATH } = await import("./require-verify-run.mjs")
  const sha = "a".repeat(40)
  const good = { id: 1, head_sha: sha, path: VERIFY_WORKFLOW_PATH, status: "completed", conclusion: "success" }
  assert.equal(findSuccessfulVerifyRun([good], sha), good)
  assert.equal(findSuccessfulVerifyRun([{ ...good, head_sha: "b".repeat(40) }], sha), null)
  assert.equal(findSuccessfulVerifyRun([{ ...good, conclusion: "failure" }], sha), null)
  assert.equal(findSuccessfulVerifyRun([{ ...good, path: ".github/workflows/other.yml" }], sha), null)
  assert.equal(findSuccessfulVerifyRun(undefined, sha), null)

  const respond = (body, ok = true, status = 200) => async () => ({ ok, status, json: async () => body })
  const args = { sha, repository: "owner/repo", token: "test-token" }
  assert.equal((await requireVerifyRun({ ...args, fetchImpl: respond({ workflow_runs: [good] }) })).id, 1)
  await assert.rejects(requireVerifyRun({ ...args, fetchImpl: respond({ workflow_runs: [] }) }), /no successful Verify run/)
  await assert.rejects(requireVerifyRun({ ...args, fetchImpl: respond({}, false, 404) }), /HTTP 404/)
  await assert.rejects(requireVerifyRun({ ...args, token: "", fetchImpl: respond({ workflow_runs: [good] }) }), /GITHUB_VERIFY_TOKEN/)
  await assert.rejects(requireVerifyRun({ ...args, sha: "HEAD", fetchImpl: respond({ workflow_runs: [good] }) }), /malformed/)
})
