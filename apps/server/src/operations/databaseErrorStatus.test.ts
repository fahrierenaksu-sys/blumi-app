import assert from "node:assert/strict"
import test from "node:test"
import { DatabaseError } from "pg"
import { classifyDatabaseError } from "./databaseErrorStatus"
import { safeOperationalErrorKind } from "./safeErrorLog"

// The shape node-postgres 8.23 really throws: pg-protocol constructs
// DatabaseError(message, length, "error"), so error.name is "error".
function pgError(code: string): Error {
  const error = new DatabaseError("duplicate key value violates unique constraint \"x\" (phone)", 0, "error")
  error.code = code
  error.severity = "ERROR"
  return error
}

test("a real node-postgres error is recognised by class, not by its name", () => {
  const error = pgError("23505")
  assert.equal(error.name, "error")
  assert.deepEqual(classifyDatabaseError(error), { statusCode: 409, sqlState: "23505" })
  assert.equal(safeOperationalErrorKind(error), "DatabaseError")
})

test("a server error from another copy of the driver is recognised by severity and SQLSTATE", () => {
  const duplicate = Object.assign(new Error("x"), { name: "error", severity: "ERROR", code: "40P01" })
  assert.deepEqual(classifyDatabaseError(duplicate), { statusCode: 503, sqlState: "40P01", retryAfterSeconds: 1 })
  // No severity: an application error that happens to carry a 5-char code.
  assert.equal(classifyDatabaseError(Object.assign(new Error("x"), { code: "23505" })), null)
})

test("constraint races map to 409 and transient database states to 503 with a retry hint", () => {
  assert.deepEqual(classifyDatabaseError(pgError("23505")), { statusCode: 409, sqlState: "23505" })
  assert.deepEqual(classifyDatabaseError(pgError("23503")), { statusCode: 409, sqlState: "23503" })
  for (const code of ["40001", "40P01", "55P03", "57014", "57P01", "53300", "08006"]) {
    assert.deepEqual(classifyDatabaseError(pgError(code)), { statusCode: 503, sqlState: code, retryAfterSeconds: 1 })
  }
})

test("pool and connection failures without a SQLSTATE are transient", () => {
  for (const message of ["timeout exceeded when trying to connect", "Connection terminated unexpectedly", "Connection terminated due to connection timeout"]) {
    assert.deepEqual(classifyDatabaseError(new Error(message)), { statusCode: 503, retryAfterSeconds: 1 })
  }
  assert.deepEqual(classifyDatabaseError(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })),
    { statusCode: 503, retryAfterSeconds: 1 })
})

test("other database errors stay server errors and non-database errors are not classified", () => {
  assert.deepEqual(classifyDatabaseError(pgError("22P02")), { statusCode: 500, sqlState: "22P02" })
  assert.deepEqual(classifyDatabaseError(pgError("23514")), { statusCode: 500, sqlState: "23514" })
  assert.equal(classifyDatabaseError(new Error("boom")), null)
  assert.equal(classifyDatabaseError(Object.assign(new Error("x"), { code: "INVITE_EXPIRED", statusCode: 409 })), null)
  assert.equal(classifyDatabaseError("23505"), null)
})

test("a pooler capacity refusal is transient, other internal errors are not", () => {
  const refusal = (message: string) => {
    const error = new DatabaseError(message, 0, "error")
    error.code = "XX000"
    error.severity = "FATAL"
    return error
  }
  for (const message of [
    "(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15",
    "(EMAXCONN) Max client connections reached",
    "(ECHECKOUTFAILED) failed to check out a connection"
  ]) {
    assert.deepEqual(classifyDatabaseError(refusal(message)), { statusCode: 503, sqlState: "XX000", retryAfterSeconds: 1 })
  }
  assert.deepEqual(classifyDatabaseError(refusal("could not open relation")), { statusCode: 500, sqlState: "XX000" })
})
