import assert from "node:assert/strict"
import test from "node:test"
import { createAccountRecoveryService, createInMemoryAccountRecoveryRepository } from "./accountRecoveryService"
import { createAuthService } from "../auth/authService"
import { createBlumiBackendStore } from "../auth/authStore"

const OLD_PHONE = "+905551112233"
const NEW_PHONE = "+905559998877"
const CODE = "482931"

test("recovery pagination reaches all pending requests across equal timestamps", async () => {
  const repository = createInMemoryAccountRecoveryRepository()
  const service = createAccountRecoveryService({ repository, authService: createAuthService() })
  for (let i = 0; i < 105; i++) await repository.save({ requestId: `recovery_${String(i).padStart(3, "0")}`,
    newPhoneNumber: NEW_PHONE, createdAt: "2026-09-05T10:00:00.000Z", status: "pending" })
  await repository.save({ requestId: "recovery_resolved", newPhoneNumber: NEW_PHONE,
    createdAt: "2026-09-05T11:00:00.000Z", status: "rejected" })
  const first = await service.listPage({ limit: 100, status: "pending" })
  assert.equal(first.requests.length, 100)
  assert.ok(first.nextCursor)
  await service.resolve({ requestId: first.requests[0]!.requestId, status: "rejected", operatorId: "ops", tokenId: "token" })
  const second = await service.listPage({ limit: 100, status: "pending", cursor: first.nextCursor })
  assert.equal(second.requests.length, 5)
  assert.equal(second.nextCursor, null)
  assert.equal(new Set([...first.requests, ...second.requests].map(r => r.requestId)).size, 105)
  await assert.rejects(service.listPage({ cursor: "invalid" }), /cursor/i)
  await assert.rejects(service.listPage({ status: "rejected", cursor: first.nextCursor }), /cursor/i)
})

test("recovery request verifies only the new phone and never rebinds the account automatically", async () => {
  const authService = createAuthService({ store: createBlumiBackendStore(), codeFactory: () => CODE })
  await authService.sendCode(OLD_PHONE)
  await authService.verifyCode(OLD_PHONE, CODE)
  const service = createAccountRecoveryService({ authService })

  await authService.requestRecoveryPhoneVerification(NEW_PHONE)
  await service.request({ oldPhoneNumber: OLD_PHONE, newPhoneNumber: NEW_PHONE, verificationCode: CODE })

  const [request] = await service.list()
  assert.equal(request?.status, "pending")
  assert.ok(request?.accountId)
  assert.equal(request?.claimedOldPhoneNumber, OLD_PHONE)
  assert.equal((await authService.repository.getAccountByPhone(OLD_PHONE))?.phoneNumber, OLD_PHONE)
  assert.equal(await authService.repository.getAccountByPhone(NEW_PHONE), null)
})

test("only an audited admin resolution can close a pending recovery request", async () => {
  const authService = createAuthService({ store: createBlumiBackendStore(), codeFactory: () => CODE })
  const service = createAccountRecoveryService({ authService })
  await authService.requestRecoveryPhoneVerification(NEW_PHONE)
  await service.request({ oldPhoneNumber: OLD_PHONE, newPhoneNumber: NEW_PHONE, verificationCode: CODE })
  const request = (await service.list())[0]
  assert.ok(request)
  const resolved = await service.resolve({ requestId: request.requestId, status: "manual_review_required", operatorId: "ops-1", tokenId: "token-1" })
  assert.equal(resolved?.status, "manual_review_required")
  assert.equal(resolved?.resolvedByOperatorId, "ops-1")
  assert.equal(await service.resolve({ requestId: request.requestId, status: "rejected", operatorId: "ops-2", tokenId: "token-2" }), null)
})
