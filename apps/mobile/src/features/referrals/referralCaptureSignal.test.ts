import assert from "node:assert/strict"
import test from "node:test"
import {
  notifyPendingReferralCaptured,
  subscribeToPendingReferralCapture
} from "./referralCaptureSignal"

test("a captured referral wakes active subscribers and cleanup prevents later delivery", () => {
  let received = 0
  const unsubscribe = subscribeToPendingReferralCapture(() => {
    received += 1
  })

  notifyPendingReferralCaptured()
  unsubscribe()
  notifyPendingReferralCaptured()

  assert.equal(received, 1)
})
