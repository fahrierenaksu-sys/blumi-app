import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import {
  FIXTURE_PARENT,
  WORKBENCH_FIXTURE_TESTS,
  findMissingFixtures,
  linkWorkbenchFixtures,
  resolveWorkbenchRoot,
  runWorkbenchFixtureTests,
  unlinkWorkbenchFixtures
} from "./run-workbench-fixture-tests.mjs"

const mobileRoot = path.resolve(import.meta.dirname, "..")
const runner = path.join(mobileRoot, "scripts/run-workbench-fixture-tests.mjs")

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "blumi-workbench-runner-"))
  const repo = path.join(root, "repo")
  const workbench = path.join(root, "workbench")
  mkdirSync(path.join(repo, FIXTURE_PARENT, "female-fit-zones"), { recursive: true })
  writeFileSync(path.join(repo, FIXTURE_PARENT, "female-fit-zones.json"), "{}")
  for (const relative of new Set(Object.values(WORKBENCH_FIXTURE_TESTS).flat())) {
    mkdirSync(path.join(workbench, relative), { recursive: true })
  }
  mkdirSync(path.join(workbench, FIXTURE_PARENT, "female-fit-zones"), { recursive: true })
  return { repo, workbench, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

test("the CLI fails loudly instead of skipping when BLUMI_WORKBENCH_ROOT is unset", () => {
  const environment = { ...process.env }
  delete environment.BLUMI_WORKBENCH_ROOT
  const result = spawnSync(process.execPath, [runner], { env: environment, encoding: "utf8" })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /BLUMI_WORKBENCH_ROOT is not set/)
  assert.throws(() => resolveWorkbenchRoot({ BLUMI_WORKBENCH_ROOT: "  " }), /is not set/)
  assert.throws(() => resolveWorkbenchRoot({ BLUMI_WORKBENCH_ROOT: path.join(tmpdir(), "no-such-blumi-root") }), /not a directory/)
})

test("every listed test exists, is not wired elsewhere, and lives outside the default npm test", () => {
  const packageJson = JSON.parse(readFileSync(path.join(mobileRoot, "package.json"), "utf8"))
  assert.equal(packageJson.scripts["test:workbench"], "node scripts/run-workbench-fixture-tests.mjs")
  assert.doesNotMatch(packageJson.scripts.test, /test:workbench/)
  for (const file of Object.keys(WORKBENCH_FIXTURE_TESTS)) {
    assert.ok(existsSync(path.join(mobileRoot, file)), file)
    for (const script of Object.values(packageJson.scripts)) assert.equal(script.includes(file), false, file)
  }
})

test("missing fixture trees are reported and nothing runs", () => {
  const f = fixture()
  try {
    rmSync(path.join(f.workbench, FIXTURE_PARENT, "male-wardrobe-redesign"), { recursive: true })
    assert.deepEqual(findMissingFixtures(f.workbench), [`${FIXTURE_PARENT}/male-wardrobe-redesign`])
    let ran = false
    assert.throws(
      () => runWorkbenchFixtureTests({
        environment: { BLUMI_WORKBENCH_ROOT: f.workbench },
        repositoryRoot: f.repo,
        mobileRoot,
        run: () => { ran = true; return { status: 0 } }
      }),
      /Missing Workbench fixtures[\s\S]*male-wardrobe-redesign/
    )
    assert.equal(ran, false)
  } finally {
    f.cleanup()
  }
})

test("fixture trees are linked for the run, never replace repository paths, and are removed afterwards", () => {
  const f = fixture()
  try {
    let seen
    const status = runWorkbenchFixtureTests({
      environment: { BLUMI_WORKBENCH_ROOT: f.workbench },
      repositoryRoot: f.repo,
      mobileRoot,
      run: (_command, args, options) => {
        seen = { args, cwd: options.cwd }
        const link = path.join(f.repo, FIXTURE_PARENT, "male-wardrobe-redesign")
        assert.equal(lstatSync(link).isSymbolicLink(), true)
        assert.equal(lstatSync(path.join(f.repo, FIXTURE_PARENT, "female-fit-zones")).isSymbolicLink(), false)
        return { status: 3 }
      }
    })
    assert.equal(status, 3)
    assert.equal(seen.cwd, f.repo)
    assert.deepEqual(seen.args.slice(1), Object.keys(WORKBENCH_FIXTURE_TESTS).map((file) => path.join(mobileRoot, file)))
    assert.equal(existsSync(path.join(f.repo, FIXTURE_PARENT, "male-wardrobe-redesign")), false)
    assert.ok(existsSync(path.join(f.repo, FIXTURE_PARENT, "female-fit-zones.json")))

    const created = linkWorkbenchFixtures({ repositoryRoot: f.repo, workbenchRoot: f.workbench })
    assert.ok(created.length > 0)
    unlinkWorkbenchFixtures(created)
    assert.ok(created.every((link) => !existsSync(link)))
  } finally {
    f.cleanup()
  }
})
