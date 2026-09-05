import assert from "node:assert/strict"
import test from "node:test"
import {
  createReferralService
} from "./referralService"
import { createInMemoryReferralRepository } from "./referralRepository"

test("referrals use opaque, stable links and attribute an invitee only once", async () => {
  const service = createReferralService({
    repository: createInMemoryReferralRepository(),
    codeFactory: () => "r_abcdefghijklmnopqrstuvwxyz0123456789AB"
  })

  const first = await service.issueInvite("inviter")
  const repeated = await service.issueInvite("inviter")
  assert.equal(first.code, "r_abcdefghijklmnopqrstuvwxyz0123456789AB")
  assert.equal(repeated.code, first.code)
  assert.equal(first.url, "blumi://r/r_abcdefghijklmnopqrstuvwxyz0123456789AB")
  assert.equal(first.url.includes("inviter"), false)

  assert.equal(await service.claimInvite("invitee", first.code), true)
  assert.equal(await service.claimInvite("second_invitee", first.code), false)
  assert.equal(await service.claimInvite("invitee", first.code), false)
  assert.equal(await service.claimInvite("inviter", first.code), false)
})

test("referrals reject malformed opaque codes before repository access", async () => {
  const service = createReferralService()
  await assert.rejects(
    () => service.claimInvite("invitee", "inviter"),
    /valid referral link/
  )
})
