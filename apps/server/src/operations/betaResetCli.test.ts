import assert from "node:assert/strict"
import test from "node:test"
import { assertApplySource, parseBetaResetArgs } from "./betaResetCli"

const HEAD = "0123456789abcdef0123456789abcdef01234567"
const PROJECT_REF = "abcdefghijklmnopqrst"
const APPLY = ["--project-ref", PROJECT_REF, "--apply", "--expect", "a".repeat(64), "--fingerprint", "b".repeat(16)]

test("apply refuses a checkout with uncommitted changes, even on the deployed commit", () => {
  assert.throws(() => assertApplySource({ fullCommit: HEAD, modified: true }, HEAD), /uncommitted changes/)
  assert.doesNotThrow(() => assertApplySource({ fullCommit: HEAD, modified: false }, HEAD))
})

test("apply refuses a typed deployed commit that differs from HEAD anywhere in its typed length", () => {
  const differsAfterTwelve = HEAD.slice(0, 12) + "f".repeat(28)
  assert.throws(() => assertApplySource({ fullCommit: HEAD, modified: false }, differsAfterTwelve), /not the deployed commit/)
  assert.throws(() => assertApplySource({ fullCommit: HEAD, modified: false }, "fedcba987654"), /not the deployed commit/)
  assert.doesNotThrow(() => assertApplySource({ fullCommit: HEAD, modified: false }, HEAD.slice(0, 12)))
})

test("apply needs at least the 12-character deployed commit /health reports", () => {
  assert.throws(() => parseBetaResetArgs([...APPLY, "--deployed-commit", HEAD.slice(0, 7)]), /--deployed-commit/)
  assert.equal(parseBetaResetArgs([...APPLY, "--deployed-commit", HEAD.toUpperCase()]).deployedCommit, HEAD)
})
