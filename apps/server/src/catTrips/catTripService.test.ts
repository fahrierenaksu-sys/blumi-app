import assert from "node:assert/strict"
import test from "node:test"
import { createInMemoryCatTripRepository } from "./catTripRepository"
import { createCatTripService, type CatTripServiceOptions, type CatTripWorld } from "./catTripService"
import { CAT_PUSHES_PER_DAY, CAT_TRIPS_PER_DAY, type CatTripRecord } from "./catTripTypes"

const OWNER = "owner-1"
const START = Date.parse("2026-10-16T06:00:00.000Z")

interface Harness {
  service: ReturnType<typeof createCatTripService>
  repository: ReturnType<typeof createInMemoryCatTripRepository>
  world: CatTripWorld & {
    partners: Map<string, number>
    blocked: Set<string>
    inactive: Set<string>
    noCat: Set<string>
    unmatched: Set<string>
    teasers: Array<{ userId: string; role: string; tripId: string; availableAt: Date }>
    quietHours: { startMinute: number; endMinute: number } | null
  }
  setNow(ms: number): void
  events: string[]
  trips(userId?: string): Promise<CatTripRecord[]>
}

function harness(overrides: Partial<CatTripServiceOptions> = {}, partners: Record<string, number> = { "host-a": 9, "host-b": 4 }): Harness {
  let nowMs = START
  let counter = 0
  const events: string[] = []
  const repository = createInMemoryCatTripRepository()
  const state = {
    partners: new Map(Object.entries(partners)),
    blocked: new Set<string>(),
    inactive: new Set<string>(),
    noCat: new Set<string>(),
    unmatched: new Set<string>(),
    teasers: [] as Array<{ userId: string; role: string; tripId: string; availableAt: Date }>,
    quietHours: null as { startMinute: number; endMinute: number } | null
  }
  const world: Harness["world"] = {
    ...state,
    async countMessagesByPartner() {
      return [...state.partners].map(([partnerUserId, messageCount]) => ({ partnerUserId, messageCount }))
    },
    async isMutualMatch(_a, b) { return !state.unmatched.has(b) },
    async hasBlockBetween(_a, b) { return state.blocked.has(b) },
    async isUserActive(userId) { return !state.inactive.has(userId) },
    async hasCat(userId) { return !state.noCat.has(userId) },
    async getTimeSettings() { return { timeZone: "UTC", quietHours: world.quietHours } },
    async queueTeaser(input) { state.teasers.push(input) }
  }
  const service = createCatTripService({
    repository,
    world,
    enabled: true,
    seedSecret: "secret-a",
    now: () => new Date(nowMs),
    createId: () => `id-${(counter += 1)}`,
    report: (event) => { events.push(event) },
    ...overrides
  })
  return {
    service, repository, world, events,
    setNow: (ms) => { nowMs = ms },
    trips: (userId = OWNER) => repository.listOwnerTrips(userId, "2000-01-01T00:00:00.000Z")
  }
}

test("a disabled flag or an unapplied migration answers disabled and plans nothing", async () => {
  for (const options of [{ enabled: false }, { schema: { isReady: async () => false } }]) {
    const h = harness(options)
    assert.deepEqual(await h.service.getState(OWNER), { enabled: false })
    assert.deepEqual(await h.service.getCurrentTrip(OWNER), { enabled: false })
    assert.deepEqual(await h.service.listGuests(OWNER), { enabled: false })
    assert.deepEqual(await h.service.acknowledgeReveal(OWNER, "x"), { outcome: "disabled" })
    assert.equal(await h.service.endTripsBetween(OWNER, "host-a", "block"), 0)
    assert.deepEqual(await h.trips(), [])
  }
})

test("with nobody to visit the cat stays home, and the day is not planned again", async () => {
  const h = harness({}, {})
  const state = await h.service.getState(OWNER)
  assert.ok(state.enabled && state.catPhase === "home" && state.currentTrip === null && state.pendingReveals.length === 0)
  h.world.partners.set("host-a", 20)
  await h.service.getState(OWNER)
  assert.deepEqual(await h.trips(), [])
  h.setNow(START + 24 * 60 * 60_000)
  await h.service.getState(OWNER)
  assert.ok((await h.trips()).length > 0, "the next day plans again")
})

test("a day has at most two trips, however often it is read, and they never overlap", async () => {
  const h = harness()
  for (let read = 0; read < 5; read += 1) await h.service.getState(OWNER)
  const trips = await h.trips()
  assert.equal(trips.length, CAT_TRIPS_PER_DAY)
  assert.ok(Date.parse(trips[1]!.startsAt) >= Date.parse(trips[0]!.endsAt))
  for (const trip of trips) assert.ok(["host-a", "host-b"].includes(trip.hostUserId))
})

test("the same user, day and key plan the same trips on another server; another key differs", async () => {
  const [one, two, other] = [harness(), harness(), harness({ seedSecret: "secret-b" })]
  for (const h of [one, two, other]) await h.service.getState(OWNER)
  const shape = (trips: CatTripRecord[]) => trips.map((trip) => [trip.startsAt, trip.endsAt, trip.hostUserId, trip.seedDigest])
  assert.deepEqual(shape(await one.trips()), shape(await two.trips()))
  assert.notDeepEqual(shape(await one.trips()), shape(await other.trips()))
})

test("only mutual, unblocked, active partners with a cat are candidates", async () => {
  const h = harness({}, { "host-a": 5, blocked: 50, gone: 50, unmatched: 50, nocat: 50 })
  h.world.blocked.add("blocked"); h.world.inactive.add("gone"); h.world.unmatched.add("unmatched"); h.world.noCat.add("nocat")
  await h.service.getState(OWNER)
  const hosts = new Set((await h.trips()).map((trip) => trip.hostUserId))
  assert.deepEqual([...hosts], ["host-a"])
})

test("a user without a cat is not planned and plans once they have one", async () => {
  const h = harness()
  h.world.noCat.add(OWNER)
  await h.service.getState(OWNER)
  assert.deepEqual(await h.trips(), [])
  h.world.noCat.delete(OWNER)
  await h.service.getState(OWNER)
  assert.equal((await h.trips()).length, CAT_TRIPS_PER_DAY)
})

test("while the cat is away the owner sees the trip but not who hosts it; the name comes after the return", async () => {
  const h = harness()
  await h.service.getState(OWNER)
  const [first] = await h.trips()
  h.setNow(Date.parse(first!.startsAt) + 60_000)
  const away = await h.service.getState(OWNER)
  assert.ok(away.enabled && away.catPhase === "away")
  assert.equal(away.currentTrip?.tripId, first!.tripId)
  assert.equal(away.currentTrip?.souvenir, undefined)
  assert.equal(JSON.stringify(away).includes(first!.hostUserId), false, "no host id while away")
  assert.deepEqual(await h.service.acknowledgeReveal(OWNER, first!.tripId), { outcome: "not_yet" })

  h.setNow(Date.parse(first!.endsAt) + 60_000)
  const home = await h.service.getState(OWNER)
  assert.ok(home.enabled)
  const pending = home.pendingReveals.find((view) => view.tripId === first!.tripId)!
  assert.equal(pending.phase, "home")
  assert.ok(pending.souvenir)
  assert.equal(pending.counterpartUserId, undefined, "still a mystery until the reveal is opened")
  assert.deepEqual(await h.service.acknowledgeReveal(OWNER, first!.tripId), {
    outcome: "revealed", tripId: first!.tripId, role: "owner", counterpartUserId: first!.hostUserId
  })
  const after = await h.service.getState(OWNER)
  assert.ok(after.enabled && !after.pendingReveals.some((view) => view.tripId === first!.tripId))
  assert.ok(after.souvenirs.some((entry) => entry.tripId === first!.tripId))
  assert.equal(after.souvenirs.filter((entry) => entry.tripId === first!.tripId).length, 1, "one souvenir per trip, however often read")
})

test("a block ends the trip at once: no guest, no souvenir, no reveal", async () => {
  const h = harness({}, { "host-a": 9 })
  await h.service.getState(OWNER)
  const [first] = await h.trips()
  h.setNow(Date.parse(first!.startsAt) + 60_000)
  assert.equal((await h.service.listGuests("host-a")).enabled && (await h.service.listGuests("host-a") as { guests: unknown[] }).guests.length, 1)
  h.world.blocked.add("host-a")
  const state = await h.service.getState(OWNER)
  assert.ok(state.enabled && state.currentTrip === null && state.catPhase === "home")
  assert.deepEqual(await h.service.listGuests("host-a"), { enabled: true, guests: [] })
  const stored = (await h.trips()).find((trip) => trip.tripId === first!.tripId)!
  assert.equal(stored.status, "cancelled")
  assert.equal(stored.endReason, "block")
  h.setNow(Date.parse(first!.endsAt) + 60_000)
  const later = await h.service.getState(OWNER)
  assert.ok(later.enabled && !later.souvenirs.some((entry) => entry.tripId === first!.tripId))
  assert.deepEqual(await h.service.acknowledgeReveal(OWNER, first!.tripId), { outcome: "not_found" })
})

test("an unmatch or a removed account also brings the cat home", async () => {
  for (const [mutate, reason] of [
    [(h: Harness) => h.world.unmatched.add("host-a"), "unmatch"],
    [(h: Harness) => h.world.inactive.add("host-a"), "account"]
  ] as const) {
    const h = harness({}, { "host-a": 9 })
    await h.service.getState(OWNER)
    const [first] = await h.trips()
    h.setNow(Date.parse(first!.startsAt) + 60_000)
    mutate(h)
    const state = await h.service.getState(OWNER)
    assert.ok(state.enabled && state.currentTrip === null)
    assert.equal((await h.trips()).find((trip) => trip.tripId === first!.tripId)?.endReason, reason)
  }
})

test("the unmatch hook ends every unfinished trip between the pair", async () => {
  const h = harness({}, { "host-a": 9 })
  await h.service.getState(OWNER)
  assert.equal(await h.service.endTripsBetween("host-a", OWNER, "unmatch"), CAT_TRIPS_PER_DAY)
  assert.ok((await h.trips()).every((trip) => trip.status === "cancelled" && trip.endReason === "unmatch"))
})

test("the host sees the guest cat only while it is there and learns the owner only after tapping", async () => {
  const h = harness({}, { "host-a": 9 })
  await h.service.getState(OWNER)
  const [first] = await h.trips()
  h.setNow(Date.parse(first!.startsAt) - 60_000)
  assert.deepEqual(await h.service.listGuests("host-a"), { enabled: true, guests: [] })
  h.setNow(Date.parse(first!.startsAt) + 60_000)
  const during = await h.service.listGuests("host-a") as { guests: Array<{ tripId: string; ownerRevealed: boolean; ownerUserId?: string }> }
  assert.equal(during.guests.length, 1)
  assert.equal(during.guests[0]!.ownerRevealed, false)
  assert.equal(JSON.stringify(during).includes(OWNER), false)
  assert.deepEqual(await h.service.acknowledgeReveal("host-a", first!.tripId), {
    outcome: "revealed", tripId: first!.tripId, role: "host", counterpartUserId: OWNER
  })
  const tapped = await h.service.listGuests("host-a") as { guests: Array<{ ownerRevealed: boolean; ownerUserId?: string }> }
  assert.deepEqual([tapped.guests[0]!.ownerRevealed, tapped.guests[0]!.ownerUserId], [true, OWNER])
  h.setNow(Date.parse(first!.endsAt) + 60_000)
  assert.deepEqual(await h.service.listGuests("host-a"), { enabled: true, guests: [] })
})

test("a stranger cannot reveal or learn about someone else's trip", async () => {
  const h = harness()
  await h.service.getState(OWNER)
  const [first] = await h.trips()
  h.setNow(Date.parse(first!.endsAt) + 60_000)
  assert.deepEqual(await h.service.acknowledgeReveal("stranger", first!.tripId), { outcome: "not_found" })
  assert.deepEqual(await h.service.acknowledgeReveal(OWNER, "no-such-trip"), { outcome: "not_found" })
})

test("teaser pushes name no one, respect quiet hours and never exceed the daily cap", async () => {
  const h = harness({}, { "host-a": 9 })
  h.world.quietHours = { startMinute: 22 * 60, endMinute: 8 * 60 }
  // Several owners all send their cat to the same host on the same day.
  for (let index = 0; index < 8; index += 1) await h.service.getState(`owner-${index}`)
  assert.ok(h.world.teasers.length > 0)
  const perUser = new Map<string, number>()
  for (const teaser of h.world.teasers) {
    perUser.set(teaser.userId, (perUser.get(teaser.userId) ?? 0) + 1)
    const minute = teaser.availableAt.getUTCHours() * 60 + teaser.availableAt.getUTCMinutes()
    assert.ok(minute >= 8 * 60 && minute < 22 * 60, `teaser at minute ${minute} is inside quiet hours`)
    assert.deepEqual(Object.keys(teaser).sort(), ["availableAt", "role", "tripId", "userId"], "ids only: no name or text")
  }
  assert.ok(Math.max(...perUser.values()) <= CAT_PUSHES_PER_DAY)
  assert.ok(h.events.includes("cat_push_dropped"), "the host hit the cap")
})

test("purgeExpired deletes trips older than the retention window", async () => {
  const h = harness()
  await h.service.getState(OWNER)
  assert.equal(await h.service.purgeExpired(), 0)
  h.setNow(START + 91 * 24 * 60 * 60_000)
  assert.equal(await h.service.purgeExpired(), CAT_TRIPS_PER_DAY)
})
