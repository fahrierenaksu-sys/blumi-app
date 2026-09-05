import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function read(relativePath) {
  return readFileSync(resolve(mobileRoot, relativePath), "utf8")
}

function parse(relativePath) {
  return ts.createSourceFile(
    relativePath,
    read(relativePath),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
}

function findCallback(sourceFile, variableName) {
  let callback = null

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === variableName &&
      node.initializer &&
      ts.isCallExpression(node.initializer)
    ) {
      const candidate = node.initializer.arguments[0]
      if (candidate && (ts.isArrowFunction(candidate) || ts.isFunctionExpression(candidate))) {
        callback = candidate
        return
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  assert.ok(callback, `Expected ${variableName} callback to exist`)
  return callback
}

function hasDescendant(node, predicate) {
  let found = false
  function visit(candidate) {
    if (predicate(candidate)) {
      found = true
      return
    }
    ts.forEachChild(candidate, visit)
  }
  visit(node)
  return found
}

function callsIdentifier(node, identifier) {
  return hasDescendant(
    node,
    (candidate) =>
      ts.isCallExpression(candidate) &&
      ts.isIdentifier(candidate.expression) &&
      candidate.expression.text === identifier
  )
}

test("Lobby refresh awaits the refresh operation and never uses a cosmetic timer", () => {
  const callback = findCallback(parse("src/screens/LobbyScreen.tsx"), "handleRefresh")

  assert.equal(
    callsIdentifier(callback, "setTimeout"),
    false,
    "handleRefresh must not stop the spinner on a cosmetic timer"
  )
  assert.equal(
    callback.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) ?? false,
    true,
    "handleRefresh must be async"
  )
  assert.equal(
    hasDescendant(callback, ts.isAwaitExpression),
    true,
    "handleRefresh must await the real refresh boundary"
  )
})

test("Lobby refresh clears pending state in finally and exposes a visible failure path", () => {
  const callback = findCallback(parse("src/screens/LobbyScreen.tsx"), "handleRefresh")
  let refreshTry = null

  function visit(node) {
    if (ts.isTryStatement(node) && node.finallyBlock) {
      refreshTry = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(callback)

  assert.ok(refreshTry, "handleRefresh must use try/finally so refreshing always clears")
  assert.equal(
    callsIdentifier(refreshTry.finallyBlock, "setRefreshing"),
    true,
    "handleRefresh finally block must clear refreshing"
  )
  assert.ok(refreshTry.catchClause, "handleRefresh must handle refresh failures")
  assert.equal(
    callsIdentifier(refreshTry.catchClause, "setProductionDiscoverError") ||
      callsIdentifier(refreshTry.catchClause, "showToast"),
    true,
    "refresh failures must be visible to the user"
  )
})

test("realtime lobby refresh exposes an awaitable callback contract", () => {
  const lobbyFlow = read("src/features/lobby/useLobbyFlow.ts")

  assert.match(
    lobbyFlow,
    /requestRefresh:\s*\(\)\s*=>\s*Promise<void>/,
    "requestRefresh must expose the server acknowledgement boundary"
  )
  assert.doesNotMatch(
    lobbyFlow,
    /requestRefresh:\s*\(\)\s*=>\s*void/,
    "requestRefresh must not be fire-and-forget"
  )
})
