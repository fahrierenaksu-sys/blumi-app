import assert from "node:assert/strict"
import test from "node:test"
import {
  doesShowcaseAuthorizationMatch,
  isBundledDemoShowcase,
  nextShowcaseAuthorizationOnFlip,
  resolveCardBackRoom,
  selectAuthorizedShowcase
} from "./discoveryShowcaseAuthorizationModel"

const request = { baseHttpUrl: "https://api.test", viewerUserId: "viewer-1", sessionToken: "session-secret" }
const authorization = { ...request, id: 2, candidateUserId: "candidate-1" }

test("the showcase is authorized only for the current viewer, session, card and open back face", () => {
  const match = (overrides: Partial<Parameters<typeof doesShowcaseAuthorizationMatch>[0]>) =>
    doesShowcaseAuthorizationMatch({
      isBackVisible: true,
      request,
      authorization,
      candidateUserId: "candidate-1",
      ...overrides
    })
  assert.equal(match({}), true)
  assert.equal(match({ isBackVisible: false }), false)
  assert.equal(match({ request: { ...request, sessionToken: "rotated-session" } }), false)
  assert.equal(match({ request: { ...request, viewerUserId: "viewer-2" } }), false)
  assert.equal(match({ request: { ...request, baseHttpUrl: "https://other.test" } }), false)
  assert.equal(match({ candidateUserId: "candidate-2" }), false)
  assert.equal(match({ request: undefined }), false)
  assert.equal(match({ authorization: null }), false)
})

test("old room data is hidden while another viewer or flip is awaiting authorization", () => {
  const oldRoom = { roomHeadline: "Old room", roomSnapshotUrl: "/old-image" }
  assert.equal(selectAuthorizedShowcase({ matches: false, isSuccess: true, data: oldRoom }), undefined)
  assert.equal(selectAuthorizedShowcase({ matches: true, isSuccess: false, data: oldRoom }), undefined)
  assert.equal(selectAuthorizedShowcase({ matches: true, isSuccess: true, isFetching: true, data: oldRoom }), undefined)
  assert.equal(selectAuthorizedShowcase({ matches: true, isSuccess: true, isFetching: false, data: oldRoom }), oldRoom)
})

test("a server-backed card never falls back to stale profile room text or image", () => {
  const stale = { profileRoomSnapshot: { uri: "/stale-image" }, profileRoomHeadline: "Stale headline" }
  assert.deepEqual(
    resolveCardBackRoom({ ...stale, showEmbeddedDemoRoom: false, authorizedShowcase: undefined }),
    { roomSnapshot: undefined, roomHeadline: undefined }
  )
  // Losing the request while the card stays mounted cannot reveal profile fields.
  const removedRequest = isBundledDemoShowcase({
    request: undefined,
    authorization: { ...authorization, id: 3 },
    userId: "candidate-1",
    roomSnapshot: 11,
    roomSnapshotUrl: "/stale-image",
    bundledSnapshot: 11
  })
  assert.equal(removedRequest, false)
  assert.deepEqual(
    resolveCardBackRoom({
      ...stale,
      showEmbeddedDemoRoom: false,
      authorizedShowcase: { roomSnapshotUrl: "/current-image", roomHeadline: "Current headline" }
    }),
    { roomSnapshot: { uri: "/current-image" }, roomHeadline: "Current headline" }
  )
  assert.deepEqual(
    resolveCardBackRoom({
      showEmbeddedDemoRoom: true,
      profileRoomSnapshot: 11,
      profileRoomHeadline: "Demo room",
      authorizedShowcase: undefined
    }),
    { roomSnapshot: 11, roomHeadline: "Demo room" }
  )
})

test("only the bundled demo fixture keeps its showcase without an authorization request", () => {
  const demo = {
    request: undefined,
    authorization: null,
    userId: "demo-user-001",
    roomSnapshot: 11,
    roomSnapshotUrl: undefined,
    bundledSnapshot: 11
  }
  assert.equal(isBundledDemoShowcase(demo), true)
  assert.equal(isBundledDemoShowcase({ ...demo, roomSnapshot: 12 }), false)
  assert.equal(isBundledDemoShowcase({ ...demo, roomSnapshotUrl: "/untrusted-image" }), false)
  assert.equal(isBundledDemoShowcase({ ...demo, userId: "production-user" }), false)
  assert.equal(isBundledDemoShowcase({ ...demo, authorization }), false)
  assert.equal(isBundledDemoShowcase({ ...demo, request }), false)
})

test("opening the back face authorizes afresh; flipping back drops the authorization", () => {
  assert.deepEqual(
    nextShowcaseAuthorizationOnFlip({ nextVisible: true, request, candidateUserId: "candidate-1", nextId: 7 }),
    { ...request, id: 7, candidateUserId: "candidate-1" }
  )
  assert.equal(
    nextShowcaseAuthorizationOnFlip({ nextVisible: false, request, candidateUserId: "candidate-1", nextId: 8 }),
    null
  )
})
