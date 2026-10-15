import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService } from "../auth/authService"
import { createSafetyService } from "../safety/safetyService"
import { createServer } from "../server"

// Moderation details (action, private note, operator and token record) belong
// to the admin side only. A reporter must never read them back, not on the
// first answer and not by replaying their own idempotency key later.
const PRIVATE_NOTE = "moderator-only-note"
const PRIVATE_OPERATOR = "operator-private"
const PRIVATE_TOKEN = "token-record-private"
const REPORTER_REPORT_FIELDS = ["actorUserId", "createdAt", "note", "reason", "reportId", "reportedUserId", "status"]

async function signedIn(authService: ReturnType<typeof createAuthService>, phoneNumber: string) {
  await authService.sendCode(phoneNumber)
  const { sessionToken, account } = await authService.verifyCode(phoneNumber, "123456")
  return { userId: account.userId, headers: { authorization: `Bearer ${sessionToken}` } }
}

function assertNoModerationDetails(body: string): void {
  for (const secret of [PRIVATE_NOTE, PRIVATE_OPERATOR, PRIVATE_TOKEN, "resolution", "adminNote", "idempotencyKey"]) {
    assert.equal(body.includes(secret), false, `reporter answer must not contain ${secret}`)
  }
}

test("a reporter replaying a resolved report never sees the moderation record", async () => {
  const authService = createAuthService({ codeFactory: () => "123456" })
  const safetyService = createSafetyService({
    isKnownUser: async (userId) => Boolean(await authService.repository.findAccountByUserId(userId))
  })
  const app = createServer({ authService, safetyService })
  try {
    const reporter = await signedIn(authService, "+905551118101")
    const target = await signedIn(authService, "+905551118102")
    const send = () => app.inject({
      method: "POST", url: "/v1/safety/reports",
      headers: { ...reporter.headers, "idempotency-key": "report-privacy-key-01" },
      payload: { reportedUserId: target.userId, reason: "spam", note: "sends links" }
    })

    const first = await send()
    assert.equal(first.statusCode, 201)
    assertNoModerationDetails(first.body)
    assert.deepEqual(Object.keys(first.json().report).sort(), REPORTER_REPORT_FIELDS)

    const reportId = first.json().report.reportId as string
    const resolved = await safetyService.resolveReport(reportId, {
      action: "warn",
      note: PRIVATE_NOTE,
      admin: { operatorId: PRIVATE_OPERATOR, tokenId: PRIVATE_TOKEN }
    })
    assert.ok(resolved, "the moderator resolves the report")

    const replay = await send()
    assert.equal(replay.statusCode, 200)
    assert.equal(replay.json().replayed, true)
    assertNoModerationDetails(replay.body)
    assert.deepEqual(Object.keys(replay.json().report).sort(), REPORTER_REPORT_FIELDS)
    assert.equal(replay.json().report.reportId, reportId)
    assert.equal(replay.json().block.blockedUserId, target.userId)

    const listed = await app.inject({ method: "GET", url: "/v1/safety/reports", headers: reporter.headers })
    assert.equal(listed.statusCode, 200)
    assertNoModerationDetails(listed.body)
  } finally {
    await app.close()
  }
})
