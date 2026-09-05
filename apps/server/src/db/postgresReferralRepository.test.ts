import assert from "node:assert/strict"
import test from "node:test"
import { createPostgresReferralRepository } from "./postgresReferralRepository"

test("postgres referrals keep one opaque invite per inviter and atomically claim once", async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = []
  const client = {
    async query(text: string, values?: readonly unknown[]) {
      calls.push({ text, values })
      if (text.includes("INSERT INTO blumi_referral_invites")) {
        return {
          rows: [{
            code: "r_abcdefghijklmnopqrstuvwxyz0123456789AB",
            inviter_user_id: "inviter",
            created_at: "2026-07-22T08:00:00.000Z",
            claimed_by_user_id: null,
            claimed_at: null
          }]
        }
      }
      if (text.includes("UPDATE blumi_referral_invites")) return { rows: [{ code: "r_code" }] }
      return { rows: [] }
    },
    release() {}
  }
  const repository = createPostgresReferralRepository({
    query: client.query,
    async connect() { return client }
  })

  const invite = await repository.issueInvite({
    code: "r_abcdefghijklmnopqrstuvwxyz0123456789AB",
    inviterUserId: "inviter",
    createdAt: "2026-07-22T08:00:00.000Z"
  })
  const claimed = await repository.claimInvite({
    code: invite.code,
    inviteeUserId: "invitee",
    claimedAt: "2026-07-22T09:00:00.000Z"
  })

  assert.equal(invite.code, "r_abcdefghijklmnopqrstuvwxyz0123456789AB")
  assert.equal(claimed, true)
  assert.match(calls[0]?.text ?? "", /ON CONFLICT \(inviter_user_id\)/)
  assert.equal(calls[1]?.text, "BEGIN")
  assert.match(calls[2]?.text ?? "", /pg_advisory_xact_lock/)
  assert.match(calls[3]?.text ?? "", /claimed_by_user_id IS NULL/)
  assert.equal(calls.at(-1)?.text, "COMMIT")
})
