import assert from "node:assert/strict"
import test from "node:test"
import { publishPartnerBlocked, subscribeToPartnerBlocked } from "./partnerBlockedEvents"

test("every subscriber hears a block and a failing subscriber does not stop the others", () => {
  const heard: string[] = []
  const unsubscribeFailing = subscribeToPartnerBlocked(() => { throw new Error("subscriber failure") })
  const unsubscribe = subscribeToPartnerBlocked((event) => { heard.push(`${event.ownerUserId}->${event.blockedUserId}`) })

  publishPartnerBlocked({ ownerUserId: "ada", blockedUserId: "bora" })
  unsubscribe()
  unsubscribeFailing()
  publishPartnerBlocked({ ownerUserId: "ada", blockedUserId: "cem" })

  assert.deepEqual(heard, ["ada->bora"])
})
