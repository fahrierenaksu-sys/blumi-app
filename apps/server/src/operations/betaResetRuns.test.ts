import assert from "node:assert/strict"
import test from "node:test"
import { parseRepeatReason, REPEAT_REASON_FLAG } from "./betaResetRuns"

test("a repeat reason is optional, apply-only and plain text without phone-like numbers", () => {
  assert.equal(parseRepeatReason(["--apply"], true), null)
  assert.equal(parseRepeatReason([REPEAT_REASON_FLAG, "  QA asked for a clean slate on 15 Oct  "], true), "QA asked for a clean slate on 15 Oct")
  assert.throws(() => parseRepeatReason([REPEAT_REASON_FLAG, "QA asked for a clean slate"], false), /only with --apply/)
  for (const bad of [undefined, "too short", "x".repeat(201), "drop <script> tags here", "user +90 555 123 45 67 asked"]) {
    const argv = bad === undefined ? [REPEAT_REASON_FLAG] : [REPEAT_REASON_FLAG, bad]
    assert.throws(() => parseRepeatReason(argv, true), /refused/, String(bad))
  }
})

test("a repeat reason never swallows the next flag or a dash value as its text", () => {
  const commit = "0123456789abcdef0123456789abcdef01234567"
  // The operator forgot the reason: the next flag must not become it.
  assert.throws(() => parseRepeatReason([REPEAT_REASON_FLAG, "--deployed-commit", commit, "--apply"], true), /needs a typed reason/)
  for (const bad of ["-deployed commit sha", "--", "", "   "]) {
    assert.throws(() => parseRepeatReason([REPEAT_REASON_FLAG, bad], true), /refused/, JSON.stringify(bad))
  }
  assert.equal(parseRepeatReason(["--deployed-commit", commit, REPEAT_REASON_FLAG, "second QA pass after fix"], true),
    "second QA pass after fix", "a reason after other flags still parses")
})
