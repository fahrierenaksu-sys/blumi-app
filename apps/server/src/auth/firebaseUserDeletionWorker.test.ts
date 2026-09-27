import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService } from "./authService"
import { createBlumiBackendStore } from "./authStore"
import { createFirebaseUserDeletionDispatch } from "./firebaseUserDeletionWorker"

test("Firebase deletion survives account removal and retry without losing ownership evidence", async () => {
  const store = createBlumiBackendStore()
  const service = createAuthService({ store, codeFactory: () => "482931" })
  await service.sendCode("+905551112233")
  const { sessionToken } = await service.verifyCode("+905551112233", "482931")
  const proof = await service.verifyFirebaseAccountDeletion(sessionToken, "+905551112233", "firebase-uid-1")
  assert.ok(proof)
  assert.equal(await service.deleteAccount(sessionToken, proof.confirmationToken), "pending_firebase_deletion")
  assert.equal(await service.repository.isFirebaseUserDeletionPending("firebase-uid-1"), true)

  let attempts = 0
  let clock = Date.now() + 60_000
  const dispatch = createFirebaseUserDeletionDispatch({
    repository: service.repository,
    now: () => new Date(clock),
    async deleteUser(uid) {
      assert.equal(uid, "firebase-uid-1")
      if (++attempts === 1) throw new Error("transient")
    }
  })
  await dispatch()
  assert.equal(await service.repository.isFirebaseUserDeletionPending("firebase-uid-1"), true)
  clock += 60_000
  await dispatch()
  assert.equal(attempts, 2)
  assert.equal(await service.repository.isFirebaseUserDeletionPending("firebase-uid-1"), false)
})
