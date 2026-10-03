import assert from "node:assert/strict"
import test from "node:test"
import {
  beginShowcaseAuthorizationOnPress,
  doesShowcaseAuthorizationMatch,
  dropUnopenedShowcaseAuthorization,
  isBundledDemoShowcase,
  isShowcaseAuthorizationCurrent,
  nextShowcaseAuthorizationOnFlip,
  resolveCardBackRoom,
  resolveRoomShowcaseSlot,
  selectAuthorizedShowcase
} from "./discoveryShowcaseAuthorizationModel"

const request = { baseHttpUrl: "https://api.test", viewerUserId: "viewer-1", sessionToken: "session-secret" }
const authorization = { ...request, id: 2, candidateUserId: "candidate-1", opened: true }

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
  // A request a press started is not shown until a flip opens it.
  assert.equal(match({ authorization: { ...authorization, opened: false } }), false)
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
    { ...request, id: 7, candidateUserId: "candidate-1", opened: true }
  )
  assert.equal(
    nextShowcaseAuthorizationOnFlip({ nextVisible: false, request, candidateUserId: "candidate-1", nextId: 8 }),
    null
  )
})

test("the press that opens the back face starts its request; the flip reuses it once", () => {
  const pressed = beginShowcaseAuthorizationOnPress({
    isBackVisible: false, request, candidateUserId: "candidate-1", nextId: 11
  })
  assert.ok(pressed)
  // The request may run before the back face opens, but nothing is shown yet.
  assert.equal(isShowcaseAuthorizationCurrent({ request, authorization: pressed, candidateUserId: "candidate-1" }), true)
  assert.equal(doesShowcaseAuthorizationMatch({ isBackVisible: false, request, authorization: pressed, candidateUserId: "candidate-1" }), false)

  const opened = nextShowcaseAuthorizationOnFlip({ nextVisible: true, request, candidateUserId: "candidate-1", nextId: 12, pressed })
  assert.equal(opened?.id, 11, "the flip shows the request its own press started")
  assert.equal(doesShowcaseAuthorizationMatch({ isBackVisible: true, request, authorization: opened, candidateUserId: "candidate-1" }), true)

  // Every later opening gets its own request, even if an opened one is offered.
  const reopened = nextShowcaseAuthorizationOnFlip({ nextVisible: true, request, candidateUserId: "candidate-1", nextId: 13, pressed: opened })
  assert.equal(reopened?.id, 13)
})

test("a pressed request from another viewer, session or card is never reused", () => {
  const pressed = beginShowcaseAuthorizationOnPress({
    isBackVisible: false, request, candidateUserId: "candidate-1", nextId: 21
  })
  const flip = (overrides: Partial<Parameters<typeof nextShowcaseAuthorizationOnFlip>[0]>) =>
    nextShowcaseAuthorizationOnFlip({ nextVisible: true, request, candidateUserId: "candidate-1", nextId: 22, pressed, ...overrides })
  assert.equal(flip({ request: { ...request, sessionToken: "rotated-session" } })?.id, 22)
  assert.equal(flip({ request: { ...request, viewerUserId: "viewer-2" } })?.id, 22)
  assert.equal(flip({ candidateUserId: "candidate-2" })?.id, 22)
})

test("a press that becomes a swipe drops its request; an opened back face keeps its own", () => {
  const pressed = beginShowcaseAuthorizationOnPress({
    isBackVisible: false, request, candidateUserId: "candidate-1", nextId: 31
  })
  assert.equal(dropUnopenedShowcaseAuthorization(pressed), null)
  assert.equal(dropUnopenedShowcaseAuthorization(authorization), authorization)
  assert.equal(dropUnopenedShowcaseAuthorization(null), null)
  // Closing the back face or a card without a server request starts nothing.
  assert.equal(beginShowcaseAuthorizationOnPress({ isBackVisible: true, request, candidateUserId: "candidate-1", nextId: 32 }), null)
  assert.equal(beginShowcaseAuthorizationOnPress({ isBackVisible: false, request: undefined, candidateUserId: "candidate-1", nextId: 33 }), null)
})

test("the room slot holds its place until the answer is in, then shows the room or the hint", () => {
  assert.equal(resolveRoomShowcaseSlot({ expectsShowcase: true, settled: false, hasRoom: false }), "placeholder")
  assert.equal(resolveRoomShowcaseSlot({ expectsShowcase: true, settled: true, hasRoom: true }), "room")
  assert.equal(resolveRoomShowcaseSlot({ expectsShowcase: true, settled: true, hasRoom: false }), "footer")
  // A card that can never have a showcase shows the hint from the start.
  assert.equal(resolveRoomShowcaseSlot({ expectsShowcase: false, settled: false, hasRoom: false }), "footer")
  // The bundled demo room is there at once.
  assert.equal(resolveRoomShowcaseSlot({ expectsShowcase: true, settled: false, hasRoom: true }), "room")
})
