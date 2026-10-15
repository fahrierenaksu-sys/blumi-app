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
