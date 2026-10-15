import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

// Every mobile test file must be started by some runner. A runner's tsc call
// only compiles; a test that is compiled but absent from its `--test` call
// passes silently while guarding nothing (bottomNavReturnPreview.test.ts did).
// Runners build their lists in different ways (literal arrays, names mapped to
// paths), so read what each runner actually executes, not its source text.
const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const repositoryRoot = resolve(mobileRoot, "../..")

// Test files that exist on purpose without a runner. Path from apps/mobile
// mapped to the reason. Keep it empty unless a file really cannot run.
const NOT_RUN_BY_DESIGN = {}

// Loaded before a runner: records every child command instead of running it.
const RECORD_COMMANDS = `data:text/javascript,${encodeURIComponent(`
  import childProcess from "node:child_process"
  import { appendFileSync } from "node:fs"
  import { syncBuiltinESMExports } from "node:module"
  const record = (command, args = [], options = {}) => appendFileSync(process.env.BLUMI_RUNNER_RECORD,
    JSON.stringify({ command, args: (args ?? []).map(String), cwd: options?.cwd ?? process.cwd() }) + "\\n")
  childProcess.execFileSync = (command, args, options) => {
    record(command, args, options)
    return options?.encoding ? "" : Buffer.alloc(0)
  }
  childProcess.spawnSync = (command, args, options) => {
    record(command, args, options)
    return { status: 0, signal: null, stdout: "", stderr: "", output: [] }
  }
  syncBuiltinESMExports()
`)}`

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules") return []
    const path = join(directory, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  })
}

function readPackageScripts(packagePath) {
  return Object.values(JSON.parse(readFileSync(packagePath, "utf8")).scripts ?? {}).join("\n")
}

function recordRunnerCommands(runnerPath) {
  const directory = mkdtempSync(join(tmpdir(), "blumi-runner-record-"))
  const recordPath = join(directory, "commands.jsonl")
  try {
    execFileSync(process.execPath, ["--import", RECORD_COMMANDS, runnerPath], {
      cwd: mobileRoot,
      env: { ...process.env, BLUMI_RUNNER_RECORD: recordPath },
      stdio: ["ignore", "ignore", "inherit"]
    })
    if (!existsSync(recordPath)) return []
    return readFileSync(recordPath, "utf8").trim().split("\n").map((line) => JSON.parse(line))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

const isCompile = ({ args }) => args.some((argument) => /typescript\/bin\/tsc$|(?:^|\/)tsc$/.test(argument))
const isTestRun = ({ args }) => args.includes("--test")
const optionValue = (args, name) => args[args.indexOf(name) + 1]

/**
 * Test files (paths from apps/mobile) that a runner's recorded commands start.
 * A compiled test counts only when a `--test` command runs its output file.
 */
export function startedTestsFromCommands(commands, root = mobileRoot) {
  const compiled = commands.filter(isCompile).map(({ args, cwd }) => ({
    outDir: optionValue(args, "--outDir"),
    rootDir: resolve(cwd, optionValue(args, "--rootDir") ?? "."),
    sources: new Set(args.filter((argument) => /\.test\.tsx?$/.test(argument))
      .map((argument) => relative(root, resolve(cwd, argument))))
  }))
  const toSource = (path) => {
    for (const { outDir, rootDir, sources } of compiled) {
      if (!outDir || !path.startsWith(`${outDir}/`)) continue
      const base = relative(root, join(rootDir, relative(outDir, path))).replace(/\.js$/, "")
      return [`${base}.ts`, `${base}.tsx`].find((candidate) => sources.has(candidate)) ?? `${base}.ts`
    }
    return relative(root, path)
  }
  return new Set(commands.filter(isTestRun).flatMap(({ args, cwd }) => args
    .filter((argument) => /\.test\.(?:[cm]?js|tsx?)$/.test(argument))
    .map((argument) => toSource(isAbsolute(argument) ? argument : resolve(cwd, argument)))))
}

/** Returns the test files (paths from apps/mobile) that no runner starts. */
export function findTestsNoRunnerStarts(testFiles, started, commandText) {
  return testFiles.filter((file) => !(
    started.has(file)
    || commandText.includes(file)
    || commandText.includes(`apps/mobile/${file}`)
  ))
}

function collectStartedTests() {
  const runners = readdirSync(join(mobileRoot, "scripts")).filter((name) => /^run-.*\.mjs$/.test(name))
  assert.ok(runners.length >= 10, `found only ${runners.length} mobile runners`)
  const started = new Set()
  for (const name of runners) {
    const commands = recordRunnerCommands(join(mobileRoot, "scripts", name))
    assert.ok(commands.some(isTestRun), `${name} recorded no --test command`)
    for (const file of startedTestsFromCommands(commands)) started.add(file)
  }
  return started
}

// Package scripts and the server runner name their test files literally.
function collectCommandText() {
  return [
    readPackageScripts(join(mobileRoot, "package.json")),
    readPackageScripts(join(repositoryRoot, "package.json")),
    readFileSync(join(repositoryRoot, "apps/server/scripts/run-server-tests.mjs"), "utf8")
  ].join("\n")
}

test("a test that a runner only compiles, without starting it, is reported", () => {
  const outDir = "/tmp/blumi-out"
  const commands = [
    { command: "node", cwd: mobileRoot, args: [
      "../../node_modules/typescript/bin/tsc", "src/navigation/compiledOnly.test.ts",
      "src/navigation/started.test.ts", "src/navigation/view.test.tsx", "--outDir", outDir, "--rootDir", "src"] },
    { command: "node", cwd: mobileRoot, args: [
      "--test", `${outDir}/navigation/started.test.js`, `${outDir}/navigation/view.test.js`] },
    { command: "node", cwd: mobileRoot, args: ["--import", "tsx", "--test", "src/navigation/direct.test.ts"] }
  ]
  const files = ["src/navigation/compiledOnly.test.ts", "src/navigation/started.test.ts",
    "src/navigation/view.test.tsx", "src/navigation/direct.test.ts"]
  assert.deepEqual(findTestsNoRunnerStarts(files, startedTestsFromCommands(commands), ""),
    ["src/navigation/compiledOnly.test.ts"])
})

test("every mobile test file is started by a runner or listed as intentionally not run", () => {
  const testFiles = ["src", "scripts"]
    .flatMap((directory) => listFiles(join(mobileRoot, directory)))
    .map((path) => relative(mobileRoot, path))
    .filter((path) => /\.test\.(?:ts|tsx|mjs|cjs)$/.test(path))
  assert.ok(testFiles.length > 400, "the inventory must see the mobile test tree")
  const started = collectStartedTests()
  assert.ok(started.size > 300, `runners started only ${started.size} test files`)
  const unrun = findTestsNoRunnerStarts(testFiles, started, collectCommandText())
    .filter((file) => !(file in NOT_RUN_BY_DESIGN))
  assert.deepEqual(unrun, [], "add these to a runner's --test list, or to NOT_RUN_BY_DESIGN with a reason")
})
