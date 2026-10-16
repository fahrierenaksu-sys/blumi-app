import assert from "node:assert/strict"
import test from "node:test"
import type { AvatarLoadoutV2, ChatThread } from "@blumi/contracts"
import { diffStreetLook, diffStreetRoom } from "./streetDigest"
import { resolveStreetEdition } from "./streetEdition"
import { createInMemoryStreetRepository } from "./streetRepository"
import { createStreetService, StreetUnavailableError, type StreetServiceDependencies } from "./streetService"

const VIEWER = "viewer"
const LOOK: AvatarLoadoutV2 = {
  schemaVersion: 2, bodyId: "b", faceId: "f", eyesId: "e", noseId: "n", mouthId: "m", hairId: "h1",
  topId: "t1", bottomId: "p1", shoesId: "s1", dressId: null, outerwearId: null, accessoryIds: []
}

function thread(partner: string, unread = 0): ChatThread {
  return {
    threadId: `thread_${partner}`,
    miniRoomId: `room_${partner}`,
    participantUserIds: [VIEWER, partner],
    participants: [{ userId: VIEWER }, { userId: partner, displayName: partner.toUpperCase() }],
    createdAt: "2026-10-01T10:00:00.000Z",
    unreadCount: unread
  }
}

function service(overrides: Partial<StreetServiceDependencies> & { threads: ChatThread[]; mutual: string[] }) {
  const repository = overrides.repository ?? createInMemoryStreetRepository()
  const street = createStreetService({
    repository,
    isSchemaReady: async () => true,
    listThreads: async () => overrides.threads,
    listMutualPartnerIds: async () => new Set(overrides.mutual),
    listBlockedPartnerIds: async () => [],
    isUserAllowed: async () => true,
    getRoom: async () => ({ revision: 3, decor: { roomShellId: "shell", placedItems: [] } }),
    ...overrides
  })
  return { street, repository }
}

test("an edition starts at 05:00 Istanbul and a change shows only during the next one", async () => {
  // Arrange: a dress saved at 14:00 Istanbul on Oct 16 (11:00 UTC)
  const { street } = service({ threads: [thread("ece")], mutual: ["ece"] })
  await street.recordLookSave("ece", LOOK, { ...LOOK, dressId: "dress_1" }, new Date("2026-10-16T11:00:00.000Z"))
  // Act
  const sameDay = await street.read(VIEWER, new Date("2026-10-16T20:00:00.000Z"))
  const nextMorning = await street.read(VIEWER, new Date("2026-10-17T02:00:00.000Z"))
  const nextEvening = await street.read(VIEWER, new Date("2026-10-17T19:00:00.000Z"))
  const dayAfter = await street.read(VIEWER, new Date("2026-10-18T03:00:00.000Z"))
  // Assert
  assert.equal(sameDay.windows[0]?.change, null)
  assert.equal(nextMorning.edition, "2026-10-17")
  assert.equal(nextMorning.windows[0]?.change, "dress")
  assert.equal(nextEvening.windows[0]?.change, "dress")
  assert.equal(dayAfter.windows[0]?.change, null)
})

test("04:59 Istanbul still belongs to yesterday's edition", () => {
  assert.equal(resolveStreetEdition(new Date("2026-10-17T01:59:00.000Z")).id, "2026-10-16")
  assert.equal(resolveStreetEdition(new Date("2026-10-17T02:00:00.000Z")).id, "2026-10-17")
})

test("windows are ordered changed first, then unread, then chat order", async () => {
  const { street } = service({
    threads: [thread("a"), thread("b", 2), thread("c"), thread("d", 1)],
    mutual: ["a", "b", "c", "d"]
  })
  await street.recordRoomSave("c", [], [{ itemId: "room_v3_bed_oyun_gingham", x: 1, y: 1, rotation: "front" }], 4,
    new Date("2026-10-16T12:00:00.000Z"))
  const result = await street.read(VIEWER, new Date("2026-10-17T08:00:00.000Z"))
  assert.deepEqual(result.windows.map((window) => window.threadId), ["thread_c", "thread_b", "thread_d", "thread_a"])
  assert.equal(result.windows[0]?.change, "bed")
})

test("only mutual, unblocked, allowed partners appear, at most 50", async () => {
  const partners = Array.from({ length: 60 }, (_, index) => `p${index}`)
  const { street } = service({
    threads: [...partners.map((partner) => thread(partner)), thread("nomatch")],
    mutual: partners,
    listBlockedPartnerIds: async () => ["p0"],
    isUserAllowed: async (userId) => userId !== "p1"
  })
  const result = await street.read(VIEWER, new Date("2026-10-17T08:00:00.000Z"))
  const ids = result.windows.map((window) => window.threadId)
  assert.equal(ids.length, 50)
  assert.ok(!ids.includes("thread_p0"))
  assert.ok(!ids.includes("thread_p1"))
  assert.ok(!ids.includes("thread_nomatch"))
})

test("a hidden user is a closed window; everyone else is visible by default", async () => {
  const { street } = service({ threads: [thread("ece"), thread("can")], mutual: ["ece", "can"] })
  await street.recordLookSave("ece", LOOK, { ...LOOK, hairId: "h2" }, new Date("2026-10-16T12:00:00.000Z"))
  await street.setWindowClosed("ece", true)
  const result = await street.read(VIEWER, new Date("2026-10-17T08:00:00.000Z"))
  const ece = result.windows.find((window) => window.threadId === "thread_ece")
  const can = result.windows.find((window) => window.threadId === "thread_can")
  assert.deepEqual({ closed: ece?.closed, room: ece?.room, avatar: ece?.avatar, change: ece?.change },
    { closed: true, room: null, avatar: null, change: null })
  assert.equal(can?.closed, false)
  assert.equal(can?.room?.roomShellId, "shell")
  assert.equal(can?.room && "revision" in can.room, false)
})

test("a partner whose room privacy keeps matches out is a closed window with no room or look", async () => {
  // Arrange: ece's room privacy refuses matches; can keeps the default
  const { street } = service({
    threads: [thread("ece"), thread("can")],
    mutual: ["ece", "can"],
    isRoomVisibleToMatches: async (userId) => userId !== "ece"
  })
  await street.recordLookSave("ece", LOOK, { ...LOOK, hairId: "h2" }, new Date("2026-10-16T12:00:00.000Z"))
  // Act
  const result = await street.read(VIEWER, new Date("2026-10-17T08:00:00.000Z"))
  // Assert
  const ece = result.windows.find((window) => window.threadId === "thread_ece")
  assert.deepEqual({ closed: ece?.closed, room: ece?.room, avatar: ece?.avatar, change: ece?.change },
    { closed: true, room: null, avatar: null, change: null })
  assert.equal(result.windows.find((window) => window.threadId === "thread_can")?.closed, false)
})

test("a street-off partner is closed and a non-match is absent", async () => {
  const { street } = service({ threads: [thread("ece"), thread("stranger")], mutual: ["ece"] })
  await street.setWindowClosed("ece", true)
  const result = await street.read(VIEWER, new Date("2026-10-17T08:00:00.000Z"))
  assert.deepEqual(result.windows.map((window) => [window.threadId, window.closed]), [["thread_ece", true]])
  assert.equal(result.windows[0]?.room, null)
})

test("the street refuses to read before migration 079 and a save never fails because of it", async () => {
  const { street } = service({ threads: [], mutual: [], isSchemaReady: async () => false })
  await assert.rejects(street.read(VIEWER), StreetUnavailableError)
  await street.recordLookSave("ece", LOOK, { ...LOOK, hairId: "h2" }, new Date())
})

test("look and room diffs name the most visible change", () => {
  assert.equal(diffStreetLook(LOOK, { ...LOOK, dressId: "d" }), "dress")
  assert.equal(diffStreetLook({ ...LOOK, dressId: "d" }, LOOK), "outfit")
  assert.equal(diffStreetLook(LOOK, { ...LOOK, topId: "t2" }), "outfit")
  assert.equal(diffStreetLook(LOOK, { ...LOOK, shoesId: "s2" }), "shoes")
  assert.equal(diffStreetLook(LOOK, { ...LOOK, accessoryIds: ["a"] }), "accessory")
  assert.equal(diffStreetLook(LOOK, { ...LOOK }), null)
  assert.equal(diffStreetLook(null, LOOK), null)
  const rug = { itemId: "room_v3_rug_oyun_cloud", x: 2, y: 2, rotation: "front" }
  const bed = { itemId: "room_v3_bed_oyun_gingham", x: 4, y: 4, rotation: "front" }
  assert.equal(diffStreetRoom([], [rug, bed]), "bed")
  assert.equal(diffStreetRoom([bed], [bed, rug]), "rug")
  assert.equal(diffStreetRoom([rug], [{ ...rug, x: 3 }]), "layout")
  assert.equal(diffStreetRoom([rug], [rug]), null)
  assert.equal(diffStreetRoom(null, [rug]), null)
})
