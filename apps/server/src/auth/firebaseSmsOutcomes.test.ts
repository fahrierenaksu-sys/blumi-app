import assert from "node:assert/strict"
import test from "node:test"
import { createFirebaseAuthVerifier, type FirebaseAdminAuthClient } from "./firebaseAuth"
import { createPhoneOutcomeReporter } from "./firebaseSmsOutcomes"
import { createAfterResponseTasks } from "../operations/afterResponseTasks"

test("only fresh provider-verified phone identities reach outcome reporting", async () => {
  let reports = 0, rejected = false
  const decoded = { uid: "fixture", phone_number: "+12025550102", auth_time: Math.floor(Date.now() / 1000),
    firebase: { sign_in_provider: "phone" } }
  const verifier = createFirebaseAuthVerifier({
    authClient: { verifyIdToken: async (_token: string, checkRevoked: boolean) => {
      assert.equal(checkRevoked, true)
      if (rejected) throw new Error("rejected")
      return decoded
    } } as unknown as FirebaseAdminAuthClient,
    onVerifiedPhone: () => { reports++; throw new Error("statistics unavailable") }
  })
  assert.equal((await verifier.verifyIdToken("fixture")).authTime, decoded.auth_time)
  assert.equal(reports, 1)
  rejected = true
  await assert.rejects(verifier.verifyIdToken("fixture"))
  rejected = false
  decoded.firebase.sign_in_provider = "password"
  await assert.rejects(verifier.verifyIdToken("fixture"))
  decoded.firebase.sign_in_provider = "phone"
  decoded.auth_time -= 600
  await verifier.verifyIdToken("fixture")
  assert.equal(reports, 1)
})

test("outcome work is bounded, asynchronous, stable across refreshes and failure-isolated", async () => {
  const recorded: { eventId: string; timestamp: string }[] = []
  let release!: () => void, failures = 0
  const wait = new Promise<void>(resolve => { release = resolve })
  const tasks = createAfterResponseTasks({ reportFailure: () => { failures++ } })
  const report = createPhoneOutcomeReporter({ projectId: "fixture-project", tasks, record: async input => {
    recorded.push(input); await wait; throw new Error("unavailable")
  } })
  const identity = { uid: "fixture", phoneNumber: "+12025550102", authTime: 1_700_000_000 }
  for (let i = 0; i < 100; i++) report(identity)
  assert.equal(recorded.length, 0)
  await Promise.resolve()
  assert.equal(recorded.length, 2)
  assert.deepEqual(recorded[0], recorded[1])
  assert.equal(recorded[0].timestamp, new Date(identity.authTime * 1000).toISOString())
  release(); await tasks.drain()
  assert.equal(failures, 2)
  report(identity); await tasks.drain()
  assert.equal(recorded.length, 3)
})
