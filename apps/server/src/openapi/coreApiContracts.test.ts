import assert from "node:assert/strict"
import test from "node:test"
import {
  accountRecoveryRequestSchema,
  authPhoneRequestSchema,
  commerceReconcileRequestSchema,
  connectionDecisionRequestSchema,
  discoverDeckQuerySchema,
  discoverProfileParamsSchema,
  notificationPreferencesPatchSchema,
  phoneChangeConfirmRequestSchema,
  phoneChangeNewChallengeRequestSchema,
  phoneNumberRequestSchema,
  reportUserRequestSchema,
  revenueCatWebhookRequestSchema,
  roomInviteDecisionRequestSchema
} from "@blumi/contracts"

test("shared core parsers normalize accepted commands and reject unsafe variants", () => {
  assert.deepEqual(
    connectionDecisionRequestSchema.parse({
      miniRoomId: " room_1 ",
      partnerUserId: " user_2 ",
      status: "saved"
    }),
    { miniRoomId: "room_1", partnerUserId: "user_2", status: "saved" }
  )
  assert.equal(
    connectionDecisionRequestSchema.safeParse({
      miniRoomId: "room_1",
      partnerUserId: "user_2",
      status: "later"
    }).success,
    false
  )
  assert.equal(
    reportUserRequestSchema.safeParse({
      reportedUserId: "user_2",
      reason: "unknown"
    }).success,
    false
  )
  assert.equal(
    roomInviteDecisionRequestSchema.safeParse({ status: "pending" }).success,
    false
  )
  assert.deepEqual(
    notificationPreferencesPatchSchema.parse({ quietHours: null }),
    { quietHours: null }
  )
  assert.equal(
    phoneNumberRequestSchema.safeParse({ phoneNumber: 905551112233 }).success,
    false
  )
  assert.equal(
    phoneChangeNewChallengeRequestSchema.safeParse({
      phoneNumber: "+905551112233"
    }).success,
    false
  )
  assert.equal(
    phoneChangeConfirmRequestSchema.safeParse({
      currentPhoneConfirmationToken: "current"
    }).success,
    false
  )
  assert.equal(
    accountRecoveryRequestSchema.safeParse({
      oldPhoneNumber: "+905551112233",
      newPhoneNumber: "+905559998877"
    }).success,
    false
  )
})

test("shared release-critical parsers reject malformed auth, commerce, and discovery input", () => {
  assert.equal(
    authPhoneRequestSchema.safeParse({ phoneNumber: 905551112233 }).success,
    false
  )
  assert.deepEqual(
    commerceReconcileRequestSchema.parse({
      transactionIds: [" transaction_1 ", "transaction_2"]
    }),
    { transactionIds: ["transaction_1", "transaction_2"] }
  )
  assert.equal(
    commerceReconcileRequestSchema.safeParse({
      transactionIds: ["transaction_1", "transaction_1"]
    }).success,
    false
  )
  assert.equal(
    revenueCatWebhookRequestSchema.safeParse({}).success,
    false
  )
  assert.equal(
    revenueCatWebhookRequestSchema.safeParse({ event: {} }).success,
    true
  )
  assert.equal(
    discoverProfileParamsSchema.safeParse({ userId: " " }).success,
    false
  )
  assert.equal(
    discoverDeckQuerySchema.safeParse({ ageMin: 18 }).success,
    false
  )
})
