import assert from "node:assert/strict"
import test from "node:test"
import {
  createRealtimeUpgradeLimiter,
  MAX_FAILED_UPGRADES_PER_ADDRESS_PER_WINDOW,
  MAX_UPGRADES_PER_USER_PER_WINDOW,
  REALTIME_UPGRADE_WINDOW_MS
} from "./realtimeUpgradeLimiter"

const NOW = 1_000_000
const CARRIER_ADDRESS = "203.0.113.50"

test("thousands of phones behind one carrier address can all reconnect after a deploy", () => {
  const limiter = createRealtimeUpgradeLimiter()
  let admitted = 0
  for (let phone = 0; phone < 1_500; phone += 1) {
    if (limiter.admitAddress(CARRIER_ADDRESS, NOW) && limiter.admitUser(`user_${phone}`, NOW)) admitted += 1
  }
  // The previous flat cap admitted 40 per address per 10 s.
  assert.equal(admitted, 1_500)
})

test("failed authentications per address are capped before any ticket lookup", () => {
  const limiter = createRealtimeUpgradeLimiter()
  for (let attempt = 0; attempt < MAX_FAILED_UPGRADES_PER_ADDRESS_PER_WINDOW; attempt += 1) {
    assert.equal(limiter.admitAddress(CARRIER_ADDRESS, NOW), true)
    limiter.recordFailure(CARRIER_ADDRESS, NOW)
  }
  assert.equal(limiter.admitAddress(CARRIER_ADDRESS, NOW), false)
  assert.equal(limiter.admitAddress("198.51.100.7", NOW), true, "other addresses are unaffected")
  assert.equal(limiter.admitAddress(CARRIER_ADDRESS, NOW + REALTIME_UPGRADE_WINDOW_MS), true, "the window expires")
})

test("each account is capped after authentication whatever its address", () => {
  const limiter = createRealtimeUpgradeLimiter()
  const results = Array.from({ length: MAX_UPGRADES_PER_USER_PER_WINDOW + 1 }, () => limiter.admitUser("user_1", NOW))
  assert.equal(results.filter(Boolean).length, MAX_UPGRADES_PER_USER_PER_WINDOW)
  assert.equal(results.at(-1), false)
  assert.equal(limiter.admitUser("user_2", NOW), true)
})

test("the total per-address ceiling still bounds a flood", () => {
  const limiter = createRealtimeUpgradeLimiter({ attemptsPerAddress: 3 })
  const results = Array.from({ length: 5 }, () => limiter.admitAddress(CARRIER_ADDRESS, NOW))
  assert.deepEqual(results, [true, true, true, false, false])
})

test("expired windows are purged", () => {
  const limiter = createRealtimeUpgradeLimiter({ upgradesPerUser: 1 })
  assert.equal(limiter.admitUser("user_1", NOW), true)
  assert.equal(limiter.admitUser("user_1", NOW), false)
  limiter.purgeExpired(NOW + REALTIME_UPGRADE_WINDOW_MS)
  assert.equal(limiter.admitUser("user_1", NOW + REALTIME_UPGRADE_WINDOW_MS), true)
})
