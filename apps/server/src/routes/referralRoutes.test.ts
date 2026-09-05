import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService } from "../auth/authService"
import { createBlumiBackendStore } from "../auth/authStore"
import { createReferralService } from "../referrals/referralService"
import { createServer } from "../server"

test("referral claims require a session and deliberately do not disclose attribution outcome", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const referralService = createReferralService({
    codeFactory: () => "r_abcdefghijklmnopqrstuvwxyz0123456789AB"
  })
  const invite = await referralService.issueInvite("inviter")
  const app = createServer({ authService, referralService })

  const missing = await app.inject({
    method: "POST",
    url: "/v1/referrals/claim",
    payload: { code: invite.code }
  })
  assert.equal(missing.statusCode, 401)

  await app.inject({
    method: "POST",
    url: "/v1/auth/send-code",
    payload: { phoneNumber: "+905551112233" }
  })
  const signedIn = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" }, phoneNumber: "+905551112233", verificationCode: "482931" }
  })
  const token = signedIn.json().session.sessionToken as string

  const firstClaim = await app.inject({
    method: "POST",
    url: "/v1/referrals/claim",
    headers: { authorization: `Bearer ${token}` },
    payload: { code: invite.code }
  })
  const repeatedClaim = await app.inject({
    method: "POST",
    url: "/v1/referrals/claim",
    headers: { authorization: `Bearer ${token}` },
    payload: { code: invite.code }
  })
  assert.equal(firstClaim.statusCode, 204)
  assert.equal(repeatedClaim.statusCode, 204)
  assert.equal(repeatedClaim.body, "")
  await app.close()
})
