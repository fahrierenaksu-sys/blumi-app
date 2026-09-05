import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const runnerSource = await readFile(
  resolve(scriptDirectory, "run-match-room-tests.mjs"),
  "utf8"
)

test("match-room coverage is enabled only on Node versions with stable coverage reporting", () => {
  assert.match(
    runnerSource,
    /const nodeMajorVersion = Number\.parseInt\(process\.versions\.node\.split\("\."\)\[0\] \?\? "0", 10\)/
  )
  assert.match(
    runnerSource,
    /const coverageArguments = nodeMajorVersion >= 22\s*\? \["--experimental-test-coverage"\]\s*: \[\]/
  )
  assert.match(runnerSource, /\.\.\.coverageArguments,\s*"--test"/)
})
