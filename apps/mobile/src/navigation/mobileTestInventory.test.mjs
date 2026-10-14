import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

// Every mobile test file must be started by some runner. A runner's tsc list
// only compiles; a test that is compiled but absent from its `--test` list
// passes silently while guarding nothing (bottomNavReturnPreview.test.ts did).
const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const repositoryRoot = resolve(mobileRoot, "../..")

// Test files that exist on purpose without a runner. Path from apps/mobile
// mapped to the reason. Keep it empty unless a file really cannot run.
const NOT_RUN_BY_DESIGN = {}

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules") return []
    const path = join(directory, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  })
}

/** The part of a runner that starts tests: its literal `tsc` source list is only compiled, never run. */
function withoutCompileList(runnerSource) {
  return runnerSource.replace(/const sourceFiles = \[[\s\S]*?\n\]\n/, "")
}

function readPackageScripts(packagePath) {
  return Object.values(JSON.parse(readFileSync(packagePath, "utf8")).scripts ?? {}).join("\n")
}

/** Returns the test files (paths from apps/mobile) that no runner text starts. */
export function findTestsNoRunnerStarts(testFiles, runnerText) {
  return testFiles.filter((file) => {
    const fromSource = file.replace(/^src\//, "")
    const compiled = fromSource.replace(/\.tsx?$/, ".js")
    const baseName = fromSource.split("/").at(-1).replace(/\.test\.[a-z]+$/, "")
    return !(
      runnerText.includes(file)
      || runnerText.includes(`apps/mobile/${file}`)
      || (compiled !== fromSource && runnerText.includes(compiled))
      || runnerText.includes(`"${baseName}"`)
    )
  })
}

function collectRunnerText() {
  const runners = readdirSync(join(mobileRoot, "scripts"))
    .filter((name) => /^run-.*\.mjs$/.test(name))
    .map((name) => withoutCompileList(readFileSync(join(mobileRoot, "scripts", name), "utf8")))
  return [
    readPackageScripts(join(mobileRoot, "package.json")),
    readPackageScripts(join(repositoryRoot, "package.json")),
    readFileSync(join(repositoryRoot, "apps/server/scripts/run-server-tests.mjs"), "utf8"),
    ...runners
  ].join("\n")
}

test("a test that a runner only compiles, without starting it, is reported", () => {
  const compileOnlyRunner = withoutCompileList([
    "const sourceFiles = [",
    '  "src/navigation/compiledOnly.test.ts",',
    '  "src/navigation/started.test.ts"',
    "]",
    'join(outputDirectory, "navigation/started.test.js")'
  ].join("\n") + "\n")
  assert.deepEqual(
    findTestsNoRunnerStarts(["src/navigation/compiledOnly.test.ts", "src/navigation/started.test.ts"], compileOnlyRunner),
    ["src/navigation/compiledOnly.test.ts"]
  )
})

test("every mobile test file is started by a runner or listed as intentionally not run", () => {
  const testFiles = ["src", "scripts"]
    .flatMap((directory) => listFiles(join(mobileRoot, directory)))
    .map((path) => relative(mobileRoot, path))
    .filter((path) => /\.test\.(?:ts|tsx|mjs|cjs)$/.test(path))
  assert.ok(testFiles.length > 400, "the inventory must see the mobile test tree")
  const unrun = findTestsNoRunnerStarts(testFiles, collectRunnerText())
    .filter((file) => !(file in NOT_RUN_BY_DESIGN))
  assert.deepEqual(unrun, [], "add these to a runner's --test list, or to NOT_RUN_BY_DESIGN with a reason")
})
