import assert from "node:assert/strict"
import test from "node:test"
import {
  applyBlockHydrationFailure,
  applyBlockHydrationSuccess,
  createBlockOwnerState,
  isBlockOwnerReady,
  replaceBlockedUsers,
  shouldApplyBlockServerResponse
} from "./blockScopeModel"

test("switching owners never exposes the previous account's blocks", () => {
  const ownerA = replaceBlockedUsers(
    createBlockOwnerState("user-a"),
    "user-a",
    ["blocked-by-a"]
  )
  const ownerB = createBlockOwnerState("user-b")

  assert.deepEqual(ownerA.blockedUserIds, ["blocked-by-a"])
  assert.deepEqual(ownerB.blockedUserIds, [])
})

test("a stale hydration response cannot mutate another owner", () => {
  const ownerB = createBlockOwnerState("user-b")
  const staleResult = applyBlockHydrationSuccess(
    ownerB,
    "user-a",
    ["blocked-by-a"],
    "server"
  )

  assert.equal(staleResult, ownerB)
  assert.deepEqual(staleResult.blockedUserIds, [])
})

test("production safety is not ready until the server list succeeds", () => {
  const initial = createBlockOwnerState("user-a")
  const localOnly = applyBlockHydrationSuccess(initial, "user-a", [], "local")
  const failedServer = applyBlockHydrationFailure(localOnly, "user-a", "server")
  const serverReady = applyBlockHydrationSuccess(failedServer, "user-a", [], "server")

  assert.equal(isBlockOwnerReady(localOnly, false), true)
  assert.equal(isBlockOwnerReady(localOnly, true), false)
  assert.equal(isBlockOwnerReady(failedServer, true), false)
  assert.equal(isBlockOwnerReady(serverReady, true), true)
})

test("invalid and duplicate ids are normalized without mutating prior state", () => {
  const initial = createBlockOwnerState("user-a")
  const next = replaceBlockedUsers(initial, "user-a", [" target ", "", "target"])

  assert.notEqual(next, initial)
  assert.deepEqual(initial.blockedUserIds, [])
  assert.deepEqual(next.blockedUserIds, ["target"])
})

test("late local hydration cannot overwrite an authoritative server list", () => {
  const server = applyBlockHydrationSuccess(
    createBlockOwnerState("user-a"),
    "user-a",
    ["server-block"],
    "server"
  )
  const lateLocal = applyBlockHydrationSuccess(
    server,
    "user-a",
    ["stale-local-block"],
    "local"
  )

  assert.deepEqual(lateLocal.blockedUserIds, ["server-block"])
  assert.equal(lateLocal.localStatus, "ready")
})

test("stale server lists are rejected after a newer request or block mutation", () => {
  assert.equal(shouldApplyBlockServerResponse({
    currentRequestGeneration: 2,
    responseRequestGeneration: 1,
    currentMutationGeneration: 0,
    startedMutationGeneration: 0
  }), false)
  assert.equal(shouldApplyBlockServerResponse({
    currentRequestGeneration: 2,
    responseRequestGeneration: 2,
    currentMutationGeneration: 3,
    startedMutationGeneration: 2
  }), false)
  assert.equal(shouldApplyBlockServerResponse({
    currentRequestGeneration: 2,
    responseRequestGeneration: 2,
    currentMutationGeneration: 3,
    startedMutationGeneration: 3
  }), true)
})
