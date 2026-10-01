import assert from "node:assert/strict"
import test from "node:test"
import { classifyDatabaseError } from "./databaseErrorStatus"

function pgError(code: string): Error {
  return Object.assign(new Error("duplicate key value violates unique constraint \"x\" (phone)"), { name: "DatabaseError", code })
}

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
