import assert from "node:assert/strict"
import test from "node:test"
import { Pool } from "pg"
import { createPostgresAccountDataExporter } from "../account/accountDataExporter"
import { createAuthService } from "../auth/authService"
import { createDevelopmentSmsProvider } from "../auth/smsProvider"
import { createPostgresAuthRepository } from "../db/postgresAuthRepository"
import { createServer } from "../server"

const databaseUrl = process.env.DATABASE_URL?.trim()

test(
  "critical auth flow persists through PostgreSQL and a real loopback HTTP boundary",
  { skip: !databaseUrl },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl })
    const authService = createAuthService({
      repository: createPostgresAuthRepository(pool),
      accountDataExporter: createPostgresAccountDataExporter(pool),
      codeFactory: () => "482931",
      otpHmacSecret: process.env.BLUMI_OTP_HMAC_SECRET,
      smsProvider: createDevelopmentSmsProvider()
    })
    const app = createServer({ authService, logger: false })
    await app.listen({ host: "127.0.0.1", port: 0 })

    try {
      const address = app.server.address()
      assert.ok(address && typeof address === "object")
      const baseUrl = `http://127.0.0.1:${address.port}`
      const phoneNumber = "+905551234567"

      const sendCode = await fetch(`${baseUrl}/v1/auth/send-code`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phoneNumber })
      })
      assert.equal(sendCode.status, 202)

      const withoutAcceptance = await fetch(`${baseUrl}/v1/auth/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phoneNumber, verificationCode: "482931" })
      })
      assert.equal(withoutAcceptance.status, 409)
      const verified = await fetch(`${baseUrl}/v1/accounts/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phoneNumber, verificationCode: "482931",
          termsAcceptance: { version: "test-terms-v1", locale: "tr" } })
      })
      assert.equal(verified.status, 200)
      const verifiedBody = await verified.json() as {
        session?: { sessionToken: string }
      }
      assert.ok(verifiedBody.session)
      const persisted = await createPostgresAuthRepository(pool).getAccountByPhone(phoneNumber)
      assert.equal(persisted?.acceptedTerms?.version, "test-terms-v1")
      assert.equal(persisted?.acceptedTerms?.locale, "tr")
      assert.ok(persisted?.acceptedTerms?.acceptedAt)

      const me = await fetch(`${baseUrl}/v1/users/me`, {
        headers: {
          authorization: `Bearer ${verifiedBody.session.sessionToken}`
        }
      })
      assert.equal(me.status, 200)
      const meBody = await me.json() as { profile?: { userId?: string } }
      assert.match(meBody.profile?.userId ?? "", /^user_/)
      assert.ok(persisted)
      const freshRepository = createPostgresAuthRepository(pool)
      for (const status of ["active", "warned", "suspended", "banned"]) {
        await pool.query("UPDATE blumi_accounts SET moderation_status = $2 WHERE account_id = $1", [persisted.accountId, status])
        for (const account of [await freshRepository.findAccountById(persisted.accountId),
          await freshRepository.findAccountByUserId(persisted.userId), await freshRepository.getAccountByPhone(phoneNumber)]) {
          assert.equal(account?.moderation?.status, status)
          assert.deepEqual(account?.acceptedTerms, persisted.acceptedTerms)
        }
      }
      await pool.query("UPDATE blumi_accounts SET moderation_status = 'active' WHERE account_id = $1", [persisted.accountId])
      const exportTime = new Date(Date.now() + 31_000)
      await authService.requestAccountDataExportChallenge(verifiedBody.session.sessionToken, exportTime)
      const confirmation = await authService.verifyAccountDataExportChallenge(
        verifiedBody.session.sessionToken, "482931", exportTime
      )
      assert.ok(confirmation)
      const exportResponse = await fetch(`${baseUrl}/v1/account/export`, {
        method: "POST", headers: { authorization: `Bearer ${verifiedBody.session.sessionToken}`, "content-type": "application/json" },
        body: JSON.stringify({ confirmationToken: confirmation.confirmationToken })
      })
      assert.equal(exportResponse.status, 200)
      assert.equal(exportResponse.headers.get("x-blumi-export-format"), "json-v1")
      const exportText = await exportResponse.text()
      assert.ok(exportText.endsWith("}}\n"))
      const exportPayload = JSON.parse(exportText)
      assert.equal(exportPayload.account.userId, persisted.userId)
      assert.deepEqual(exportPayload.account.acceptedTerms, persisted.acceptedTerms)
      assert.equal(Object.keys(exportPayload.data).length, 11)
      const replay = await fetch(`${baseUrl}/v1/account/export`, {
        method: "POST", headers: { authorization: `Bearer ${verifiedBody.session.sessionToken}`, "content-type": "application/json" },
        body: JSON.stringify({ confirmationToken: confirmation.confirmationToken })
      })
      assert.equal(replay.status, 403)
      assert.equal(replay.headers.has("content-disposition"), false)

      const revoked = await fetch(`${baseUrl}/v1/auth/session`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${verifiedBody.session.sessionToken}`
        }
      })
      assert.equal(revoked.status, 204)
    } finally {
      await app.close()
      await pool.end()
    }
  }
)
