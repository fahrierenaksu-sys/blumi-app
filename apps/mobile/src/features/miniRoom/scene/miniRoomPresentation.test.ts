import assert from "node:assert/strict"
import test from "node:test"
import { shouldAnnouncePartnerJoin } from "./miniRoomPresentation"

test("a partner's arrival is announced once per partner, only while connected", () => {
  let announced: string | null = null
  let count = 0
  const step = (connected: boolean, partnerUserId: string) => {
    if (!shouldAnnouncePartnerJoin({ connected, partnerUserId, announcedPartnerUserId: announced })) return
    announced = partnerUserId
    count += 1
  }
  step(false, "partner-a")
  assert.equal(count, 0, "not before the room is connected")
  step(true, "partner-a")
  step(true, "partner-a")
  // A reconnect replays the same partner.
  step(false, "partner-a")
  step(true, "partner-a")
  assert.equal(count, 1)
  step(true, "partner-b")
  assert.equal(count, 2)
  step(true, "")
  assert.equal(count, 2)
})
