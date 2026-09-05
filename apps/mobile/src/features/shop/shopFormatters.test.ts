import assert from "node:assert/strict"
import test from "node:test"
import { formatCoins } from "./shopFormatters"

test("coin formatting uses the active app locale instead of a fixed Turkish locale", () => {
  assert.equal(formatCoins(1_500, "en"), "1,500")
  assert.equal(formatCoins(1_500, "tr"), "1.500")
  assert.equal(formatCoins(-10, "en"), "0")
})
