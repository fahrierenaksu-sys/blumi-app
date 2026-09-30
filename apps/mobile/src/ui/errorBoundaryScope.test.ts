import assert from "node:assert/strict"
import test from "node:test"
import {
  createErrorBoundaryReport,
  getErrorBoundaryActions,
  toReportableRouteName
} from "./errorBoundaryScope"

test("only typed root stack route names are reportable; everything else is unknown", () => {
  assert.equal(toReportableRouteName("ChatThread"), "ChatThread")
  assert.equal(toReportableRouteName("MyRoomEditor"), "MyRoomEditor")
  for (const unsafe of [
    "", "chat/thread_1?partner=Ada", "Ada Lovelace", "user@example.com", "a".repeat(80), "1Lobby",
    // Identifier-shaped but not a registered route: still withheld.
    "ProfileScreen", "chatThread", "CHATTHREAD", "ChatThread ", "AdaLovelace", "toString", "__proto__", "constructor"
  ]) {
    assert.equal(toReportableRouteName(unsafe), "unknown", unsafe)
  }
})

test("a route boundary reports its scope and allowlisted route as tags, never params", () => {
  assert.deepEqual(
    createErrorBoundaryReport({ componentStack: "in ChatThreadScreen", routeName: "ChatThread" }),
    { context: { componentStack: "in ChatThreadScreen" }, tags: { boundary: "route", route: "ChatThread" } }
  )
  assert.deepEqual(
    createErrorBoundaryReport({ componentStack: undefined, routeName: "partnerName=Ada" }),
    { context: { componentStack: undefined }, tags: { boundary: "route", route: "unknown" } }
  )
})

test("the root boundary reports only its root scope", () => {
  assert.deepEqual(
    createErrorBoundaryReport({ componentStack: "in App" }),
    { context: { componentStack: "in App" }, tags: { boundary: "root" } }
  )
})

test("recovery offers one retry, and back only for a route that can go back", () => {
  assert.deepEqual(getErrorBoundaryActions({ recoveryAttempts: 0, canGoBack: false }), { retry: true, back: false })
  assert.deepEqual(getErrorBoundaryActions({ recoveryAttempts: 0, canGoBack: true }), { retry: true, back: true })
  assert.deepEqual(getErrorBoundaryActions({ recoveryAttempts: 1, canGoBack: true }), { retry: false, back: true })
  assert.deepEqual(getErrorBoundaryActions({ recoveryAttempts: 1, canGoBack: false }), { retry: false, back: false })
})
