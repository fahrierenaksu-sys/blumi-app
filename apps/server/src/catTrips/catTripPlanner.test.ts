import assert from "node:assert/strict"
import test from "node:test"
import { createCatLocalClock } from "./catTripClock"
import {
  CAT_SOUVENIR_CATALOG,
  candidateWeight,
  classifyTripKind,
  pickDestination,
  pickReturnState,
  pickSouvenir,
  planTripWindows
} from "./catTripPlanner"
import { createCatTripSeed } from "./catTripSeed"
import { CAT_TRIP_MAX_MS, CAT_TRIP_MIN_GAP_MS, CAT_TRIP_MIN_MS, CAT_TRIPS_PER_DAY } from "./catTripTypes"

const clock = createCatLocalClock({ timeZone: "Europe/Istanbul" })
const dayStartMs = clock.dayStartMs("2026-10-16")
const dayEndMs = clock.dayEndMs("2026-10-16")
const seedFor = (user: string, day = "2026-10-16") => createCatTripSeed("test-secret", user, day)

test("local day window is 24 hours in a fixed-offset zone and starts at local midnight", () => {
  assert.equal(dayEndMs - dayStartMs, 24 * 60 * 60_000)
  assert.equal(clock.dayKey(dayStartMs), "2026-10-16")
  assert.equal(clock.dayKey(dayStartMs - 1), "2026-10-15")
  assert.equal(clock.minuteOfDay(dayStartMs), 0)
})

test("the same user and day always plan the same trips; another day or user differs", () => {
  const input = { dayStartMs, dayEndMs, busy: [] }
  const a = planTripWindows({ ...input, seed: seedFor("u1") })
  assert.deepEqual(planTripWindows({ ...input, seed: seedFor("u1") }), a)
  assert.notDeepEqual(planTripWindows({ ...input, seed: seedFor("u2") }), a)
  assert.notDeepEqual(planTripWindows({ ...input, seed: seedFor("u1", "2026-10-17") }), a)
})

test("every plan has two trips of 1-8 hours that start in the day and never overlap", () => {
  for (let index = 0; index < 400; index += 1) {
    const windows = planTripWindows({ seed: seedFor(`user-${index}`), dayStartMs, dayEndMs, busy: [] })
    assert.equal(windows.length, CAT_TRIPS_PER_DAY)
    windows.forEach((trip, slot) => {
      assert.equal(trip.slot, slot)
      assert.ok(trip.startsAtMs >= dayStartMs && trip.startsAtMs < dayEndMs)
      const length = trip.endsAtMs - trip.startsAtMs
      assert.ok(length >= CAT_TRIP_MIN_MS && length <= CAT_TRIP_MAX_MS)
    })
    assert.ok(windows[1]!.startsAtMs >= windows[0]!.endsAtMs + CAT_TRIP_MIN_GAP_MS)
  }
})

test("a trip carried over from the day before is never overlapped", () => {
  const carried = { startsAtMs: dayStartMs - 3 * 60 * 60_000, endsAtMs: dayStartMs + 6 * 60 * 60_000 }
  for (let index = 0; index < 200; index += 1) {
    const windows = planTripWindows({ seed: seedFor(`carry-${index}`), dayStartMs, dayEndMs, busy: [carried] })
    for (const trip of windows) assert.ok(trip.startsAtMs >= carried.endsAtMs + CAT_TRIP_MIN_GAP_MS)
  }
})

test("times are spread over the day rather than fixed slots", () => {
  const starts = new Set<number>()
  for (let index = 0; index < 300; index += 1) {
    for (const trip of planTripWindows({ seed: seedFor(`spread-${index}`), dayStartMs, dayEndMs, busy: [] })) {
      starts.add(Math.floor((trip.startsAtMs - dayStartMs) / (3 * 60 * 60_000)))
    }
  }
  assert.equal(starts.size, 8)
})

test("a trip over the local night is a sleepover and a daytime one is a visit", () => {
  const at = (hour: number) => dayStartMs + hour * 60 * 60_000
  assert.equal(classifyTripKind({ startsAtMs: at(22), endsAtMs: at(30) }, clock), "sleepover")
  assert.equal(classifyTripKind({ startsAtMs: at(10), endsAtMs: at(15) }, clock), "visit")
})

test("no candidate means the cat stays home", () => {
  assert.equal(pickDestination(seedFor("u1"), 0, []), null)
  assert.equal(pickDestination(seedFor("u1"), 0, [{ partnerUserId: "a", messageCount: 0 }]), null)
})

test("the pick is deterministic and independent of candidate order", () => {
  const candidates = [
    { partnerUserId: "a", messageCount: 4 }, { partnerUserId: "b", messageCount: 25 }, { partnerUserId: "c", messageCount: 1 }
  ]
  const first = pickDestination(seedFor("u1"), 0, candidates)
  assert.deepEqual(pickDestination(seedFor("u1"), 0, [...candidates].reverse()), first)
  assert.ok(first && candidates.some((candidate) => candidate.partnerUserId === first.partnerUserId))
})

test("weights follow sqrt of the message volume, so a chatty pair does not take every trip", () => {
  assert.equal(candidateWeight(100), 10)
  const candidates = [{ partnerUserId: "chatty", messageCount: 100 }, { partnerUserId: "quiet", messageCount: 4 }]
  const counts = { chatty: 0, quiet: 0 }
  for (let index = 0; index < 3000; index += 1) {
    const pick = pickDestination(seedFor(`w-${index}`), 0, candidates)!
    counts[pick.partnerUserId as "chatty" | "quiet"] += 1
  }
  // expected chatty share: 10 / (10 + 2) = 83%
  const share = counts.chatty / 3000
  assert.ok(share > 0.78 && share < 0.88, `chatty share ${share}`)
  assert.ok(counts.quiet > 300)
})

test("two slots of one day draw independently", () => {
  const candidates = Array.from({ length: 6 }, (_, index) => ({ partnerUserId: `p${index}`, messageCount: 9 }))
  let different = 0
  for (let index = 0; index < 200; index += 1) {
    const seed = seedFor(`slots-${index}`)
    if (pickDestination(seed, 0, candidates)!.partnerUserId !== pickDestination(seed, 1, candidates)!.partnerUserId) different += 1
  }
  assert.ok(different > 100 && different < 200)
})

test("souvenirs come from the catalog, are mostly common, and the same seed gives the same one", () => {
  const rarities = { common: 0, uncommon: 0, rare: 0 }
  for (let index = 0; index < 2000; index += 1) {
    const seed = seedFor(`s-${index}`)
    const souvenir = pickSouvenir(seed, 0)
    assert.deepEqual(pickSouvenir(seed, 0), souvenir)
    assert.ok(CAT_SOUVENIR_CATALOG.some((entry) => entry.key === souvenir.key && entry.rarity === souvenir.rarity))
    rarities[souvenir.rarity] += 1
  }
  assert.ok(rarities.common > rarities.uncommon && rarities.uncommon > rarities.rare && rarities.rare > 0)
})

test("a funny return state is rare", () => {
  let funny = 0
  for (let index = 0; index < 2000; index += 1) if (pickReturnState(seedFor(`r-${index}`), 0)) funny += 1
  assert.ok(funny > 100 && funny < 320, `funny ${funny}`)
})

test("the seed digest does not reveal the user and changes with the key", () => {
  const digest = createCatTripSeed("k1", "user-1", "2026-10-16").digest
  assert.match(digest, /^[0-9a-f]{16}$/)
  assert.ok(!digest.includes("user"))
  assert.notEqual(createCatTripSeed("k2", "user-1", "2026-10-16").digest, digest)
})
