import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService } from "./authService"
import { createInMemoryAuthRepository } from "./authRepository"
import { createBlumiBackendStore } from "./authStore"

const PHONE_NUMBER = "+905551112233"
const OTP_CODE = "482931"

test("a phone-aware code factory still uses the normal one-time OTP lifecycle", async () => {
  const qaPhoneNumber = "+12025550123"
  const qaCode = "246810"
  const service = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: (phoneNumber) =>
      phoneNumber === qaPhoneNumber ? qaCode : OTP_CODE
  })

  await assert.rejects(
    () => service.verifyCode(qaPhoneNumber, qaCode),
    /invalid or expired/i
  )
  await service.sendCode(qaPhoneNumber)
  const pending = await service.repository.getPendingOtp(qaPhoneNumber)
  assert.ok(pending)
  assert.equal(JSON.stringify(pending).includes(qaCode), false)
  const signedIn = await service.verifyCode(qaPhoneNumber, qaCode)

  assert.equal(signedIn.account.phoneNumber, qaPhoneNumber)
  await assert.rejects(
    () => service.verifyCode(qaPhoneNumber, qaCode),
    /invalid or expired/i
  )
})

test("concurrent SMS requests reserve one durable send slot", async () => {
  let releaseFirstSend: (() => void) | undefined
  const firstSendStarted = new Promise<void>((resolve) => {
    releaseFirstSend = resolve
  })
  let providerCalls = 0
  const service = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => OTP_CODE,
    smsProvider: {
      async sendVerificationCode() {
        providerCalls += 1
        if (providerCalls === 1) {
          await firstSendStarted
        }
      }
    }
  })

  const first = service.sendCode(PHONE_NUMBER)
  await Promise.resolve()
  const second = service.sendCode(PHONE_NUMBER)
  releaseFirstSend?.()
  const results = await Promise.allSettled([first, second])

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1)
  assert.equal(results.filter((result) => result.status === "rejected").length, 1)
  assert.equal(providerCalls, 1)
})

test("pending OTP storage never retains the six-digit secret", async () => {
  const service = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => OTP_CODE
  })

  await service.sendCode(PHONE_NUMBER)
  const pending = await service.repository.getPendingOtp(PHONE_NUMBER)

  assert.ok(pending)
  assert.equal("code" in pending, false)
  assert.equal(JSON.stringify(pending).includes(OTP_CODE), false)
})

test("send-code resolves only after the challenge is durably activated", async () => {
  const store = createBlumiBackendStore()
  const baseRepository = createInMemoryAuthRepository(store)
  let releaseActivation: (() => void) | undefined
  const activationGate = new Promise<void>((resolve) => {
    releaseActivation = resolve
  })
  const service = createAuthService({
    store,
    codeFactory: () => OTP_CODE,
    repository: {
      ...baseRepository,
      async activatePendingOtp(pendingOtp) {
        await activationGate
        return baseRepository.activatePendingOtp(pendingOtp)
      }
    }
  })

  let settled = false
  const send = service.sendCode(PHONE_NUMBER).finally(() => {
    settled = true
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(settled, false)

  releaseActivation?.()
  await send
  assert.equal(settled, true)
})

test("a provider outage during resend preserves the previous active code", async () => {
  let providerCalls = 0
  const service = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => OTP_CODE,
    smsProvider: {
      sendVerificationCode() {
        providerCalls += 1
        if (providerCalls === 2) throw new Error("provider unavailable")
      }
    }
  })
  const firstSentAt = new Date("2026-07-11T10:00:00.000Z")
  await service.sendCode(PHONE_NUMBER, firstSentAt)

  await assert.rejects(
    () => service.sendCode(
      PHONE_NUMBER,
      new Date(firstSentAt.getTime() + 31_000)
    ),
    /could not send a code/i
  )
  const verified = await service.verifyCode(
    PHONE_NUMBER,
    OTP_CODE,
    new Date(firstSentAt.getTime() + 32_000)
  )

  assert.equal(verified.account.phoneNumber, PHONE_NUMBER)
})

test("a pending OTP is consumed exactly once under concurrent verification", async () => {
  const service = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => OTP_CODE
  })
  await service.sendCode(PHONE_NUMBER)

  const results = await Promise.allSettled([
    service.verifyCode(PHONE_NUMBER, OTP_CODE),
    service.verifyCode(PHONE_NUMBER, OTP_CODE)
  ])

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1)
  assert.equal(results.filter((result) => result.status === "rejected").length, 1)
  assert.equal(service.store.sessionsByTokenHash.size, 1)
})

test("a sign-in finalization failure leaves the verified OTP reusable", async () => {
  const store = createBlumiBackendStore()
  const baseRepository = createInMemoryAuthRepository(store)
  let shouldFailSessionWrite = true
  const service = createAuthService({
    store,
    codeFactory: () => OTP_CODE,
    repository: {
      ...baseRepository,
      async finalizeOtpSignIn(input) {
        if (shouldFailSessionWrite) {
          shouldFailSessionWrite = false
          throw new Error("session persistence unavailable")
        }
        return baseRepository.finalizeOtpSignIn(input)
      }
    }
  })
  await service.sendCode(PHONE_NUMBER)

  await assert.rejects(
    () => service.verifyCode(PHONE_NUMBER, OTP_CODE),
    /session persistence unavailable/
  )
  assert.ok(await service.repository.getPendingOtp(PHONE_NUMBER))

  const retried = await service.verifyCode(PHONE_NUMBER, OTP_CODE)
  assert.equal(retried.account.phoneNumber, PHONE_NUMBER)
})

test("concurrent wrong guesses cannot bypass the verification attempt limit", async () => {
  const service = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => OTP_CODE
  })
  await service.sendCode(PHONE_NUMBER)

  await Promise.allSettled(
    Array.from({ length: 8 }, (_, index) =>
      service.verifyCode(PHONE_NUMBER, String(index).padStart(6, "0"))
    )
  )
  const pending = await service.repository.getPendingOtp(PHONE_NUMBER)

  assert.ok(pending)
  assert.equal(pending.attemptCount, 5)
  await assert.rejects(
    () => service.verifyCode(PHONE_NUMBER, OTP_CODE),
    /fresh SMS code/i
  )
})

test("concurrent refresh consumes the previous session exactly once", async () => {
  const service = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => OTP_CODE
  })
  await service.sendCode(PHONE_NUMBER)
  const signedIn = await service.verifyCode(PHONE_NUMBER, OTP_CODE)

  const refreshed = await Promise.all([
    service.refreshSession(signedIn.sessionToken),
    service.refreshSession(signedIn.sessionToken)
  ])

  assert.equal(refreshed.filter(Boolean).length, 1)
  assert.equal(
    [...service.store.sessionsByTokenHash.values()].filter(
      (session) => new Date(session.expiresAt).getTime() > Date.now()
    ).length,
    1
  )
})

test("logout with the pre-refresh token revokes the whole rotated session family", async () => {
  const service = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => OTP_CODE
  })
  await service.sendCode(PHONE_NUMBER)
  const signedIn = await service.verifyCode(PHONE_NUMBER, OTP_CODE)
  const refreshed = await service.refreshSession(signedIn.sessionToken)

  assert.ok(refreshed)
  await service.revokeSession(signedIn.sessionToken)

  assert.equal(
    await service.getSession(refreshed.sessionToken),
    null
  )
  assert.equal(service.store.sessionsByTokenHash.size, 0)
})
