import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService } from "./authService"
import { createBlumiBackendStore } from "./authStore"

const PHONE = "+905551112233"
const NEXT_PHONE = "+905559998877"
const CODE = "482931"

async function signedInService() {
  const store = createBlumiBackendStore()
  const service = createAuthService({ store, codeFactory: () => CODE })
  const signedAt = new Date("2026-07-21T09:00:00.000Z")
  await service.sendCode(PHONE, signedAt)
  const signedIn = await service.verifyCode(PHONE, CODE, signedAt)
  return { service, store, token: signedIn.sessionToken, signedAt }
}

test("phone changes require current and new-number purpose-bound OTPs, then revoke every old session", async () => {
  const { service, store, token, signedAt } = await signedInService()
  const secondAt = new Date(signedAt.getTime() + 31_000)
  await service.sendCode(PHONE, secondAt)
  const second = await service.verifyCode(PHONE, CODE, secondAt)
  const now = new Date(signedAt.getTime() + 62_000)

  await service.requestPhoneChangeChallenge(token, now)
  assert.equal(store.pendingAccountActionOtps.size, 1)
  await assert.rejects(
    () => service.verifyAccountDataExportChallenge(token, CODE, now),
    /invalid or expired/i
  )

  const currentPhoneConfirmation = await service.verifyPhoneChangeChallenge(token, CODE, now)
  assert.ok(currentPhoneConfirmation)
  await service.requestPhoneChangeNewNumberChallenge(
    token,
    NEXT_PHONE,
    currentPhoneConfirmation.confirmationToken,
    now
  )
  const newPhoneConfirmation = await service.verifyPhoneChangeNewNumberChallenge(token, CODE, now)
  assert.ok(newPhoneConfirmation)
  const changed = await service.confirmPhoneChange(
    token,
    currentPhoneConfirmation.confirmationToken,
    newPhoneConfirmation.confirmationToken,
    now
  )
  assert.ok(changed)
  if (typeof changed === "string") throw new Error(`Phone change failed: ${changed}`)
  assert.equal(changed.account.phoneNumber, NEXT_PHONE)
  assert.equal(await service.getSession(token, now), null)
  assert.equal(await service.getSession(second.sessionToken, now), null)
  const reloginAt = new Date(now.getTime() + 31_000)
  await service.sendCode(NEXT_PHONE, reloginAt)
  const resignedIn = await service.verifyCode(NEXT_PHONE, CODE, reloginAt)
  assert.equal(resignedIn.account.phoneNumber, NEXT_PHONE)
})

test("account data export confirmation is purpose-bound and single-use", async () => {
  const { service, store, token, signedAt } = await signedInService()
  const now = new Date(signedAt.getTime() + 31_000)

  await service.requestAccountDataExportChallenge(token, now)
  const confirmation = await service.verifyAccountDataExportChallenge(token, CODE, now)
  assert.ok(confirmation)
  assert.equal(JSON.stringify([...store.accountActionConfirmations.values()]).includes(confirmation.confirmationToken), false)

  const exported = await service.exportAccountData(token, confirmation.confirmationToken, now)
  assert.ok(exported)
  if (typeof exported === "string") throw new Error(`Export failed: ${exported}`)
  let json = ""
  for await (const chunk of exported) json += chunk
  const payload = JSON.parse(json)
  assert.equal(payload.account.phoneNumber, PHONE)
  assert.equal(payload.schemaVersion, "2026-07-21")
  assert.equal(await service.exportAccountData(token, confirmation.confirmationToken, now), "reauth_required")
})

test("recovery OTPs have an isolated send limit and cannot replace a sign-in OTP", async () => {
  const store = createBlumiBackendStore()
  const service = createAuthService({ store, codeFactory: () => CODE })
  const now = new Date("2026-07-21T09:00:00.000Z")

  await service.sendCode(PHONE, now)
  await service.requestRecoveryPhoneVerification(PHONE, now)

  assert.equal(store.pendingOtps.size, 1)
  assert.equal(store.pendingRecoveryOtps.size, 1)
  assert.ok(await service.verifyCode(PHONE, CODE, now))
  assert.equal(await service.verifyRecoveryPhoneVerification(PHONE, CODE, now), true)
})
