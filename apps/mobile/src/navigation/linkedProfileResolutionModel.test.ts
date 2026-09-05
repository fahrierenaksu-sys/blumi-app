import assert from "node:assert/strict"
import test from "node:test"
import {
  createLinkedProfileLoadState,
  failLinkedProfileRequest,
  getLinkedProfileViewState,
  resolveLinkedProfileRequest
} from "./linkedProfileResolutionModel"

type TestProfile = {
  userId: string
  displayName: string
}

const profileA: TestProfile = {
  userId: "user-a",
  displayName: "Ada"
}

const profileB: TestProfile = {
  userId: "user-b",
  displayName: "Bora"
}

test("a route change never renders a profile or error resolved for another user", () => {
  const failedUserA = failLinkedProfileRequest(
    createLinkedProfileLoadState<TestProfile>("user-a"),
    "user-a",
    "failed"
  )
  const userBView = getLinkedProfileViewState(
    { kind: "remote", userId: "user-b" },
    failedUserA
  )

  assert.deepEqual(userBView, {
    profile: null,
    loadError: null,
    loading: true
  })
})

test("a direct profile route always renders its current profile", () => {
  const resolvedUserA = resolveLinkedProfileRequest(
    createLinkedProfileLoadState<TestProfile>("user-a"),
    "user-a",
    profileA
  )

  assert.deepEqual(
    getLinkedProfileViewState(
      { kind: "direct", profile: profileB },
      resolvedUserA
    ),
    {
      profile: profileB,
      loadError: null,
      loading: false
    }
  )
})

test("a late response cannot replace the active request state", () => {
  const activeUserB = createLinkedProfileLoadState<TestProfile>("user-b")
  const afterLateUserA = resolveLinkedProfileRequest(
    activeUserB,
    "user-a",
    profileA
  )

  assert.deepEqual(afterLateUserA, activeUserB)
  assert.notEqual(afterLateUserA, activeUserB)
})
