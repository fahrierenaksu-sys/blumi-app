import assert from "node:assert/strict"
import test from "node:test"
import { safeOperationalErrorKind } from "./safeErrorLog"

test("operational error labels never copy provider details, identities or arbitrary names", () => {
  const error = Object.assign(new Error("private-message"), {
    name: "private-name",
    detail: "private-account-data",
    userId: "private-user-id"
  })
  assert.equal(safeOperationalErrorKind(error), "ServiceError")
  assert.equal(safeOperationalErrorKind(new TypeError("private-message")), "TypeError")
  assert.equal(safeOperationalErrorKind("private-rejection"), "NonError")
  assert.doesNotMatch(JSON.stringify({ errorKind: safeOperationalErrorKind(error) }), /private/)
})
