import assert from "node:assert/strict"
import test from "node:test"
import {
  createErrorBoundaryReportContext,
  getErrorBoundaryActions,
  toReportableRouteName
} from "./errorBoundaryScope"

test("route names are reported only when they are plain navigator identifiers", () => {
  assert.equal(toReportableRouteName("ChatThread"), "ChatThread")
  assert.equal(toReportableRouteName("MyRoomEditor"), "MyRoomEditor")
  for (const unsafe of ["", "chat/thread_1?partner=Ada", "Ada Lovelace", "user@example.com", "a".repeat(80), "1Lobby"]) {
    assert.equal(toReportableRouteName(unsafe), "unknown", unsafe)
  }
})

test("a route boundary reports its scope and route name, never params", () => {
  assert.deepEqual(
    createErrorBoundaryReportContext({ componentStack: "in ChatThreadScreen", routeName: "ChatThread" }),
    { componentStack: "in ChatThreadScreen", boundary: "route", route: "ChatThread" }
  )
  assert.deepEqual(
    createErrorBoundaryReportContext({ componentStack: undefined, routeName: "partnerName=Ada" }),
    { componentStack: undefined, boundary: "route", route: "unknown" }
  )
})

test("the root boundary keeps its original report context", () => {
  assert.deepEqual(
    createErrorBoundaryReportContext({ componentStack: "in App" }),
    { componentStack: "in App" }
  )
})

test("recovery offers one retry, and back only for a route that can go back", () => {
  assert.deepEqual(getErrorBoundaryActions({ recoveryAttempts: 0, canGoBack: false }), { retry: true, back: false })
  assert.deepEqual(getErrorBoundaryActions({ recoveryAttempts: 0, canGoBack: true }), { retry: true, back: true })
  assert.deepEqual(getErrorBoundaryActions({ recoveryAttempts: 1, canGoBack: true }), { retry: false, back: true })
  assert.deepEqual(getErrorBoundaryActions({ recoveryAttempts: 1, canGoBack: false }), { retry: false, back: false })
})
