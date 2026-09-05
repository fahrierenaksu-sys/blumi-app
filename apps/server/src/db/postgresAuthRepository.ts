import type { Pool, QueryResultRow } from "pg"
import {
  isProfileGender,
  isReadableProfileGender,
  normalizeUserProfilePrompts,
  type CompleteAvatarSelection,
  type UserProfile
} from "@blumi/contracts"
import { normalizeStoredAvatarSelection } from "../avatar/avatarSelectionPersistence"
import type { AuthRepository } from "../auth/authRepository"
import type {
  AccountActionPurpose,
  AccountRecord,
  PendingAccountActionOtp,
  PendingOtp,
  SessionRecord,
} from "../auth/authStore"
import { otpDigestsMatch } from "../auth/authStore"
import { discoveryWatchLockSql } from "./discoveryWatchLock"

export function createPostgresAuthRepository(pool: Pool): AuthRepository {
  return {
    async getPendingOtp(phoneNumber) {
      const result = await pool.query(
        `SELECT phone_number, otp_id, code_digest, expires_at, attempt_count
           FROM blumi_pending_otps
          WHERE phone_number = $1`,
        [phoneNumber]
      )
      return result.rows[0] ? mapPendingOtp(result.rows[0]) : null
    },

    async claimOtpSend(input) {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        await client.query(
          "DELETE FROM blumi_pending_otps WHERE expires_at <= $1",
          [new Date(input.now)]
        )
        await client.query(
          "DELETE FROM blumi_otp_send_limits WHERE window_started_at <= $1",
          [new Date(input.now - input.windowMs)]
        )
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [input.phoneNumber]
        )
        const result = await client.query(
          `SELECT phone_number, active_request_id, window_started_at,
                  last_requested_at, request_count
             FROM blumi_otp_send_limits
            WHERE phone_number = $1`,
          [input.phoneNumber]
        )
        const existing = result.rows[0]
        const windowStartedAt = existing
          ? new Date(existing.window_started_at).getTime()
          : input.now
        const windowActive = Boolean(
          existing && windowStartedAt + input.windowMs > input.now
        )
        if (windowActive) {
          const lastRequestedAt = new Date(existing.last_requested_at).getTime()
          const cooldownRemaining =
            lastRequestedAt + input.cooldownMs - input.now
          if (cooldownRemaining > 0) {
            await client.query("COMMIT")
            return { kind: "cooldown", retryAfterMs: cooldownRemaining }
          }
          if (Number(existing.request_count) >= input.maxRequests) {
            await client.query("COMMIT")
            return {
              kind: "limit",
              retryAfterMs: windowStartedAt + input.windowMs - input.now
            }
          }
        }

        await client.query(
          `INSERT INTO blumi_otp_send_limits (
              phone_number, active_request_id, window_started_at,
              last_requested_at, request_count
            ) VALUES ($1, $2, $3, $3, 1)
            ON CONFLICT (phone_number) DO UPDATE SET
              active_request_id = EXCLUDED.active_request_id,
              window_started_at = $4,
              last_requested_at = EXCLUDED.last_requested_at,
              request_count = $5`,
          [
            input.phoneNumber,
            input.requestId,
            new Date(input.now),
            new Date(windowActive ? windowStartedAt : input.now),
            windowActive ? Number(existing.request_count) + 1 : 1
          ]
        )
        await client.query("COMMIT")
        return { kind: "claimed" }
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    },

    async activatePendingOtp(pendingOtp) {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [pendingOtp.phoneNumber]
        )
        const result = await client.query(
          `INSERT INTO blumi_pending_otps (
              phone_number, otp_id, code_digest, expires_at, attempt_count
            )
            SELECT $1, $2, $3, $4, $5
              FROM blumi_otp_send_limits
             WHERE phone_number = $1 AND active_request_id = $2
            ON CONFLICT (phone_number) DO UPDATE SET
              otp_id = EXCLUDED.otp_id,
              code_digest = EXCLUDED.code_digest,
              expires_at = EXCLUDED.expires_at,
              attempt_count = EXCLUDED.attempt_count
            RETURNING phone_number`,
          [
            pendingOtp.phoneNumber,
            pendingOtp.otpId,
            pendingOtp.codeDigest,
            new Date(pendingOtp.expiresAt),
            pendingOtp.attemptCount
          ]
        )
        await client.query("COMMIT")
        return Boolean(result.rowCount && result.rowCount > 0)
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    },

    async getPendingRecoveryOtp(phoneNumber) {
      const result = await pool.query(
        `SELECT phone_number, otp_id, code_digest, expires_at, attempt_count
           FROM blumi_recovery_phone_challenges
          WHERE phone_number = $1`,
        [phoneNumber]
      )
      return result.rows[0] ? mapPendingOtp(result.rows[0]) : null
    },

    async claimRecoveryOtpSend(input) {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        await client.query("DELETE FROM blumi_recovery_phone_challenges WHERE expires_at <= $1", [new Date(input.now)])
        await client.query("DELETE FROM blumi_recovery_otp_send_limits WHERE window_started_at <= $1", [new Date(input.now - input.windowMs)])
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [recoveryOtpLockKey(input.phoneNumber)])
        const result = await client.query(
          `SELECT window_started_at, last_requested_at, request_count
             FROM blumi_recovery_otp_send_limits WHERE phone_number = $1`,
          [input.phoneNumber]
        )
        const existing = result.rows[0]
        const windowStartedAt = existing ? new Date(existing.window_started_at).getTime() : input.now
        const active = Boolean(existing && windowStartedAt + input.windowMs > input.now)
        if (active) {
          const cooldown = new Date(existing.last_requested_at).getTime() + input.cooldownMs - input.now
          if (cooldown > 0) { await client.query("COMMIT"); return { kind: "cooldown", retryAfterMs: cooldown } }
          if (Number(existing.request_count) >= input.maxRequests) {
            await client.query("COMMIT")
            return { kind: "limit", retryAfterMs: windowStartedAt + input.windowMs - input.now }
          }
        }
        await client.query(
          `INSERT INTO blumi_recovery_otp_send_limits (
             phone_number, active_request_id, window_started_at, last_requested_at, request_count
           ) VALUES ($1, $2, $3, $3, 1)
           ON CONFLICT (phone_number) DO UPDATE SET active_request_id = EXCLUDED.active_request_id,
             window_started_at = $4, last_requested_at = EXCLUDED.last_requested_at, request_count = $5`,
          [input.phoneNumber, input.requestId, new Date(input.now), new Date(active ? windowStartedAt : input.now), active ? Number(existing.request_count) + 1 : 1]
        )
        await client.query("COMMIT")
        return { kind: "claimed" }
      } catch (error) { await client.query("ROLLBACK"); throw error } finally { client.release() }
    },

    async activatePendingRecoveryOtp(pendingOtp) {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [recoveryOtpLockKey(pendingOtp.phoneNumber)])
        const result = await client.query(
          `INSERT INTO blumi_recovery_phone_challenges (
             phone_number, otp_id, code_digest, expires_at, attempt_count
           ) SELECT $1, $2, $3, $4, $5
             FROM blumi_recovery_otp_send_limits
            WHERE phone_number = $1 AND active_request_id = $2
           ON CONFLICT (phone_number) DO UPDATE SET otp_id = EXCLUDED.otp_id,
             code_digest = EXCLUDED.code_digest, expires_at = EXCLUDED.expires_at,
             attempt_count = EXCLUDED.attempt_count
           RETURNING phone_number`,
          [pendingOtp.phoneNumber, pendingOtp.otpId, pendingOtp.codeDigest, new Date(pendingOtp.expiresAt), pendingOtp.attemptCount]
        )
        await client.query("COMMIT")
        return Boolean(result.rowCount && result.rowCount > 0)
      } catch (error) { await client.query("ROLLBACK"); throw error } finally { client.release() }
    },

    async verifyAndConsumePendingRecoveryOtp(input) {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [recoveryOtpLockKey(input.phoneNumber)])
        const result = await client.query(
          `SELECT phone_number, otp_id, code_digest, expires_at, attempt_count
             FROM blumi_recovery_phone_challenges WHERE phone_number = $1 FOR UPDATE`,
          [input.phoneNumber]
        )
        const pending = result.rows[0] ? mapPendingOtp(result.rows[0]) : null
        if (!pending || pending.expiresAt <= input.now) {
          if (pending) await client.query("DELETE FROM blumi_recovery_phone_challenges WHERE phone_number = $1", [input.phoneNumber])
          await client.query("COMMIT")
          return { kind: "missing_or_expired" }
        }
        if (pending.attemptCount >= input.maxAttempts) { await client.query("COMMIT"); return { kind: "attempt_limit" } }
        if (!input.matches(pending)) {
          const attempts = pending.attemptCount + 1
          await client.query("UPDATE blumi_recovery_phone_challenges SET attempt_count = $2 WHERE phone_number = $1", [input.phoneNumber, attempts])
          await client.query("COMMIT")
          return attempts >= input.maxAttempts ? { kind: "attempt_limit" } : { kind: "invalid", attemptsRemaining: input.maxAttempts - attempts }
        }
        await client.query("DELETE FROM blumi_recovery_phone_challenges WHERE phone_number = $1", [input.phoneNumber])
        await client.query("COMMIT")
        return { kind: "verified" }
      } catch (error) { await client.query("ROLLBACK"); throw error } finally { client.release() }
    },

    async getPendingAccountDeletionOtp(accountId) {
      const result = await pool.query(
        `SELECT phone_number, otp_id, code_digest, expires_at, attempt_count
           FROM blumi_account_deletion_challenges WHERE account_id = $1`,
        [accountId]
      )
      return result.rows[0] ? mapPendingOtp(result.rows[0]) : null
    },

    async claimAccountDeletionOtpSend(input) {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        await client.query("DELETE FROM blumi_account_deletion_challenges WHERE expires_at <= $1", [new Date(input.now)])
        await client.query("DELETE FROM blumi_account_deletion_otp_send_limits WHERE window_started_at <= $1", [new Date(input.now - input.windowMs)])
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [input.accountId])
        const result = await client.query(
          `SELECT window_started_at, last_requested_at, request_count
             FROM blumi_account_deletion_otp_send_limits WHERE account_id = $1`,
          [input.accountId]
        )
        const existing = result.rows[0]
        const windowStartedAt = existing ? new Date(existing.window_started_at).getTime() : input.now
        const active = Boolean(existing && windowStartedAt + input.windowMs > input.now)
        if (active) {
          const cooldownRemaining = new Date(existing.last_requested_at).getTime() + input.cooldownMs - input.now
          if (cooldownRemaining > 0) { await client.query("COMMIT"); return { kind: "cooldown", retryAfterMs: cooldownRemaining } }
          if (Number(existing.request_count) >= input.maxRequests) { await client.query("COMMIT"); return { kind: "limit", retryAfterMs: windowStartedAt + input.windowMs - input.now } }
        }
        await client.query(
          `INSERT INTO blumi_account_deletion_otp_send_limits (
             account_id, active_request_id, window_started_at, last_requested_at, request_count
           ) VALUES ($1, $2, $3, $3, 1)
           ON CONFLICT (account_id) DO UPDATE SET active_request_id = EXCLUDED.active_request_id,
             window_started_at = $4, last_requested_at = EXCLUDED.last_requested_at, request_count = $5`,
          [input.accountId, input.requestId, new Date(input.now), new Date(active ? windowStartedAt : input.now), active ? Number(existing.request_count) + 1 : 1]
        )
        await client.query("COMMIT")
        return { kind: "claimed" }
      } catch (error) { await client.query("ROLLBACK"); throw error } finally { client.release() }
    },

    async activatePendingAccountDeletionOtp(input) {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [input.accountId])
        const pending = input.pendingOtp
        const result = await client.query(
          `INSERT INTO blumi_account_deletion_challenges (
             account_id, phone_number, otp_id, code_digest, expires_at, attempt_count
           ) SELECT $1, $2, $3, $4, $5, $6
             FROM blumi_account_deletion_otp_send_limits
            WHERE account_id = $1 AND active_request_id = $3
           ON CONFLICT (account_id) DO UPDATE SET phone_number = EXCLUDED.phone_number,
             otp_id = EXCLUDED.otp_id, code_digest = EXCLUDED.code_digest,
             expires_at = EXCLUDED.expires_at, attempt_count = EXCLUDED.attempt_count
           RETURNING account_id`,
          [input.accountId, pending.phoneNumber, pending.otpId, pending.codeDigest, new Date(pending.expiresAt), pending.attemptCount]
        )
        await client.query("COMMIT")
        return Boolean(result.rowCount && result.rowCount > 0)
      } catch (error) { await client.query("ROLLBACK"); throw error } finally { client.release() }
    },

    async verifyAndCreateAccountDeletionConfirmation(input) {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [input.accountId])
        const result = await client.query(
          `SELECT phone_number, otp_id, code_digest, expires_at, attempt_count
             FROM blumi_account_deletion_challenges WHERE account_id = $1 FOR UPDATE`, [input.accountId]
        )
        const pending = result.rows[0] ? mapPendingOtp(result.rows[0]) : null
        if (!pending || pending.expiresAt <= input.now) {
          if (pending) await client.query("DELETE FROM blumi_account_deletion_challenges WHERE account_id = $1", [input.accountId])
          await client.query("COMMIT"); return { kind: "missing_or_expired" }
        }
        if (pending.attemptCount >= input.maxAttempts) { await client.query("COMMIT"); return { kind: "attempt_limit" } }
        if (!input.matches(pending)) {
          const attemptCount = pending.attemptCount + 1
          await client.query("UPDATE blumi_account_deletion_challenges SET attempt_count = $2 WHERE account_id = $1", [input.accountId, attemptCount])
          await client.query("COMMIT")
          return attemptCount >= input.maxAttempts ? { kind: "attempt_limit" } : { kind: "invalid", attemptsRemaining: input.maxAttempts - attemptCount }
        }
        await client.query("DELETE FROM blumi_account_deletion_challenges WHERE account_id = $1", [input.accountId])
        await client.query(
          `INSERT INTO blumi_account_deletion_confirmations (account_id, token_digest, expires_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (account_id) DO UPDATE SET token_digest = EXCLUDED.token_digest, expires_at = EXCLUDED.expires_at`,
          [input.accountId, input.confirmationTokenDigest, new Date(input.confirmationExpiresAt)]
        )
        await client.query("COMMIT")
        return { kind: "verified" }
      } catch (error) { await client.query("ROLLBACK"); throw error } finally { client.release() }
    },

    async consumeAccountDeletionConfirmation(input) {
      const result = await pool.query(
        `DELETE FROM blumi_account_deletion_confirmations
          WHERE account_id = $1 AND token_digest = $2 AND expires_at > $3 RETURNING account_id`,
        [input.accountId, input.confirmationTokenDigest, new Date(input.now)]
      )
      return Boolean(result.rowCount && result.rowCount > 0)
    },

    async getPendingAccountActionOtp(input) {
      const result = await pool.query(
        `SELECT account_id, purpose, target_phone_number, otp_id, code_digest, expires_at, attempt_count
           FROM blumi_account_action_challenges
          WHERE account_id = $1 AND purpose = $2`,
        [input.accountId, input.purpose]
      )
      return result.rows[0] ? mapPendingAccountActionOtp(result.rows[0]) : null
    },

    async claimAccountActionOtpSend(input) {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        await client.query("DELETE FROM blumi_account_action_challenges WHERE expires_at <= $1", [new Date(input.now)])
        await client.query("DELETE FROM blumi_account_action_otp_send_limits WHERE window_started_at <= $1", [new Date(input.now - input.windowMs)])
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [accountActionLockKey(input.accountId, input.purpose)])
        const result = await client.query(
          `SELECT window_started_at, last_requested_at, request_count
             FROM blumi_account_action_otp_send_limits WHERE account_id = $1 AND purpose = $2`,
          [input.accountId, input.purpose]
        )
        const existing = result.rows[0]
        const windowStartedAt = existing ? new Date(existing.window_started_at).getTime() : input.now
        const active = Boolean(existing && windowStartedAt + input.windowMs > input.now)
        if (active) {
          const cooldown = new Date(existing.last_requested_at).getTime() + input.cooldownMs - input.now
          if (cooldown > 0) { await client.query("COMMIT"); return { kind: "cooldown", retryAfterMs: cooldown } }
          if (Number(existing.request_count) >= input.maxRequests) {
            await client.query("COMMIT")
            return { kind: "limit", retryAfterMs: windowStartedAt + input.windowMs - input.now }
          }
        }
        await client.query(
          `INSERT INTO blumi_account_action_otp_send_limits (
             account_id, purpose, active_request_id, window_started_at, last_requested_at, request_count
           ) VALUES ($1, $2, $3, $4, $4, 1)
           ON CONFLICT (account_id, purpose) DO UPDATE SET active_request_id = EXCLUDED.active_request_id,
             window_started_at = $5, last_requested_at = EXCLUDED.last_requested_at, request_count = $6`,
          [input.accountId, input.purpose, input.requestId, new Date(input.now), new Date(active ? windowStartedAt : input.now), active ? Number(existing.request_count) + 1 : 1]
        )
        await client.query("COMMIT")
        return { kind: "claimed" }
      } catch (error) { await client.query("ROLLBACK"); throw error } finally { client.release() }
    },

    async activatePendingAccountActionOtp({ action }) {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [accountActionLockKey(action.accountId, action.purpose)])
        const result = await client.query(
          `INSERT INTO blumi_account_action_challenges (
             account_id, purpose, target_phone_number, otp_id, code_digest, expires_at, attempt_count
           ) SELECT $1, $2, $3, $4, $5, $6, $7
             FROM blumi_account_action_otp_send_limits
            WHERE account_id = $1 AND purpose = $2 AND active_request_id = $4
           ON CONFLICT (account_id, purpose) DO UPDATE SET target_phone_number = EXCLUDED.target_phone_number,
             otp_id = EXCLUDED.otp_id, code_digest = EXCLUDED.code_digest, expires_at = EXCLUDED.expires_at,
             attempt_count = EXCLUDED.attempt_count
           RETURNING account_id`,
          [action.accountId, action.purpose, action.targetPhoneNumber, action.otpId, action.codeDigest, new Date(action.expiresAt), action.attemptCount]
        )
        await client.query("COMMIT")
        return Boolean(result.rowCount && result.rowCount > 0)
      } catch (error) { await client.query("ROLLBACK"); throw error } finally { client.release() }
    },

    async verifyAndCreateAccountActionConfirmation(input) {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [accountActionLockKey(input.accountId, input.purpose)])
        const result = await client.query(
          `SELECT account_id, purpose, target_phone_number, otp_id, code_digest, expires_at, attempt_count
             FROM blumi_account_action_challenges WHERE account_id = $1 AND purpose = $2 FOR UPDATE`,
          [input.accountId, input.purpose]
        )
        const pending = result.rows[0] ? mapPendingAccountActionOtp(result.rows[0]) : null
        if (!pending || pending.expiresAt <= input.now || pending.targetPhoneNumber !== input.targetPhoneNumber) {
          if (pending) await client.query("DELETE FROM blumi_account_action_challenges WHERE account_id = $1 AND purpose = $2", [input.accountId, input.purpose])
          await client.query("COMMIT"); return { kind: "missing_or_expired" }
        }
        if (pending.attemptCount >= input.maxAttempts) { await client.query("COMMIT"); return { kind: "attempt_limit" } }
        if (!input.matches(pending)) {
          const attempts = pending.attemptCount + 1
          await client.query("UPDATE blumi_account_action_challenges SET attempt_count = $3 WHERE account_id = $1 AND purpose = $2", [input.accountId, input.purpose, attempts])
          await client.query("COMMIT")
          return attempts >= input.maxAttempts ? { kind: "attempt_limit" } : { kind: "invalid", attemptsRemaining: input.maxAttempts - attempts }
        }
        await client.query("DELETE FROM blumi_account_action_challenges WHERE account_id = $1 AND purpose = $2", [input.accountId, input.purpose])
        await client.query(
          `INSERT INTO blumi_account_action_confirmations (account_id, purpose, target_phone_number, token_digest, expires_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (account_id, purpose) DO UPDATE SET target_phone_number = EXCLUDED.target_phone_number,
             token_digest = EXCLUDED.token_digest, expires_at = EXCLUDED.expires_at`,
          [input.accountId, input.purpose, input.targetPhoneNumber, input.confirmationTokenDigest, new Date(input.confirmationExpiresAt)]
        )
        await client.query("COMMIT")
        return { kind: "verified" }
      } catch (error) { await client.query("ROLLBACK"); throw error } finally { client.release() }
    },

    async consumeAccountActionConfirmation(input) {
      const result = await pool.query(
        `DELETE FROM blumi_account_action_confirmations
          WHERE account_id = $1 AND purpose = $2 AND token_digest = $3 AND expires_at > $4 RETURNING account_id`,
        [input.accountId, input.purpose, input.confirmationTokenDigest, new Date(input.now)]
      )
      return Boolean(result.rowCount && result.rowCount > 0)
    },

    async validateAccountActionConfirmation(input) {
      const result = await pool.query(
        `SELECT 1 FROM blumi_account_action_confirmations
          WHERE account_id = $1 AND purpose = $2 AND token_digest = $3 AND expires_at > $4`,
        [input.accountId, input.purpose, input.confirmationTokenDigest, new Date(input.now)]
      )
      return Boolean(result.rows[0])
    },

    async completePhoneChange(input) {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [input.accountId])
        const grants = await client.query(
          `SELECT purpose, target_phone_number, token_digest, expires_at
             FROM blumi_account_action_confirmations
            WHERE account_id = $1 AND purpose IN ('phone_change_current', 'phone_change_new') FOR UPDATE`,
          [input.accountId]
        )
        const current = grants.rows.find((row) => row.purpose === "phone_change_current")
        const replacement = grants.rows.find((row) => row.purpose === "phone_change_new")
        if (!current || !replacement || new Date(current.expires_at) <= input.now || new Date(replacement.expires_at) <= input.now ||
          !otpDigestsMatch(current.token_digest, input.currentPhoneConfirmationDigest) ||
          !otpDigestsMatch(replacement.token_digest, input.newPhoneConfirmationDigest)) {
          await client.query("COMMIT"); return { kind: "reauth_required" }
        }
        const accountResult = await client.query(`${accountSelectSql()} WHERE account_id = $1 FOR UPDATE`, [input.accountId])
        const account = accountResult.rows[0] ? mapAccount(accountResult.rows[0]) : null
        if (!account) { await client.query("COMMIT"); return { kind: "reauth_required" } }
        const collision = await client.query("SELECT 1 FROM blumi_accounts WHERE phone_number = $1 AND account_id <> $2", [replacement.target_phone_number, input.accountId])
        if (collision.rows[0]) { await client.query("COMMIT"); return { kind: "conflict" } }
        await client.query(
          "UPDATE blumi_accounts SET phone_number = $2, updated_at = $3 WHERE account_id = $1",
          [input.accountId, replacement.target_phone_number, input.now]
        )
        const updated = await client.query(`${accountSelectSql()} WHERE account_id = $1`, [input.accountId])
        await client.query("DELETE FROM blumi_sessions WHERE account_id = $1", [input.accountId])
        await client.query("DELETE FROM blumi_account_action_challenges WHERE account_id = $1", [input.accountId])
        await client.query("DELETE FROM blumi_account_action_confirmations WHERE account_id = $1", [input.accountId])
        await client.query("COMMIT")
        return { kind: "updated", account: mapAccount(updated.rows[0]) }
      } catch (error) { await client.query("ROLLBACK"); throw error } finally { client.release() }
    },

    async verifyAndConsumePendingOtp(input) {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [input.phoneNumber]
        )
        const result = await client.query(
          `SELECT phone_number, otp_id, code_digest, expires_at, attempt_count
             FROM blumi_pending_otps
            WHERE phone_number = $1
            FOR UPDATE`,
          [input.phoneNumber]
        )
        const pending = result.rows[0] ? mapPendingOtp(result.rows[0]) : null
        if (!pending || pending.expiresAt <= input.now) {
          if (pending) {
            await client.query(
              "DELETE FROM blumi_pending_otps WHERE phone_number = $1",
              [input.phoneNumber]
            )
          }
          await client.query("COMMIT")
          return { kind: "missing_or_expired" }
        }
        if (pending.attemptCount >= input.maxAttempts) {
          await client.query("COMMIT")
          return { kind: "attempt_limit" }
        }
        if (!input.matches(pending)) {
          const attemptCount = pending.attemptCount + 1
          await client.query(
            `UPDATE blumi_pending_otps
                SET attempt_count = $2
              WHERE phone_number = $1`,
            [input.phoneNumber, attemptCount]
          )
          await client.query("COMMIT")
          return attemptCount >= input.maxAttempts
            ? { kind: "attempt_limit" }
            : {
                kind: "invalid",
                attemptsRemaining: input.maxAttempts - attemptCount
              }
        }
        await client.query(
          "DELETE FROM blumi_pending_otps WHERE phone_number = $1",
          [input.phoneNumber]
        )
        await client.query("COMMIT")
        return { kind: "verified" }
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    },

    async finalizeOtpSignIn(input) {
      if (input.newAccount.phoneNumber !== input.phoneNumber) {
        throw new Error("The sign-in account must match the verified phone number.")
      }

      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [input.phoneNumber]
        )
        const otpResult = await client.query(
          `SELECT phone_number, otp_id, code_digest, expires_at, attempt_count
             FROM blumi_pending_otps
            WHERE phone_number = $1
            FOR UPDATE`,
          [input.phoneNumber]
        )
        const pending = otpResult.rows[0]
          ? mapPendingOtp(otpResult.rows[0])
          : null
        if (!pending || pending.expiresAt <= input.now) {
          if (pending) {
            await client.query(
              "DELETE FROM blumi_pending_otps WHERE phone_number = $1",
              [input.phoneNumber]
            )
          }
          await client.query("COMMIT")
          return { kind: "missing_or_expired" }
        }
        if (pending.attemptCount >= input.maxAttempts) {
          await client.query("COMMIT")
          return { kind: "attempt_limit" }
        }
        if (!input.matches(pending)) {
          const attemptCount = pending.attemptCount + 1
          await client.query(
            `UPDATE blumi_pending_otps
                SET attempt_count = $2
              WHERE phone_number = $1`,
            [input.phoneNumber, attemptCount]
          )
          await client.query("COMMIT")
          return attemptCount >= input.maxAttempts
            ? { kind: "attempt_limit" }
            : {
                kind: "invalid",
                attemptsRemaining: input.maxAttempts - attemptCount
              }
        }

        const existingAccountResult = await client.query(
          `${accountSelectSql()}
            WHERE phone_number = $1
            FOR UPDATE`,
          [input.phoneNumber]
        )
        let account = existingAccountResult.rows[0]
          ? mapAccount(existingAccountResult.rows[0])
          : null
        if (!account) {
          if (input.requireExistingAccount) {
            await client.query("COMMIT")
            return { kind: "terms_required" }
          }
          const candidate = input.newAccount
          const selection = toCompleteAvatarSelection(candidate.profile.avatar)
          const insertedAccount = await client.query(
            `INSERT INTO blumi_accounts (
                account_id, user_id, phone_number, display_name, age,
                avatar_preset_id, avatar_selection, avatar_revision,
                bio, gender, identity_gender, discovery_genders,
                discovery_age_min, discovery_age_max, discovery_vibes,
                discovery_radius_km, interests, location_lat,
                location_lng, created_at, updated_at,
                onboarding_profile_complete, onboarding_avatar_complete,
                onboarding_room_complete, onboarding_completed_at, accepted_terms
              ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10,
                        $11, $12, $13, $14, $15, $16, $17, $18, $19,
                        $20, $21, $22, $23, $24, $25, $26::jsonb)
              ON CONFLICT (phone_number) DO NOTHING
              RETURNING account_id, user_id, phone_number, display_name, age,
                        avatar_preset_id, avatar_selection, avatar_revision,
                        bio, gender, identity_gender, discovery_genders,
                        discovery_age_min, discovery_age_max, discovery_vibes,
                        discovery_radius_km, interests, profile_prompts, location_lat,
                        location_lng, onboarding_profile_complete,
                        onboarding_avatar_complete, onboarding_room_complete,
                        onboarding_completed_at, accepted_terms, moderation_status, moderation_updated_at, suspended_until, created_at, updated_at`,
            [
              candidate.accountId,
              candidate.userId,
              candidate.phoneNumber,
              candidate.profile.displayName,
              candidate.profile.age ?? null,
              candidate.profile.avatar.presetId,
              JSON.stringify(selection.loadout),
              selection.revision,
              candidate.profile.bio ?? "",
              candidate.profile.gender ?? null,
              candidate.profile.identityGender ?? null,
              candidate.profile.discoveryPreferences?.genders ?? [],
              candidate.profile.discoveryPreferences?.ageMin ?? 18,
              candidate.profile.discoveryPreferences?.ageMax ?? 99,
              candidate.profile.discoveryPreferences?.vibes ?? [],
              candidate.profile.discoveryPreferences?.radiusKm ?? 25,
              candidate.profile.interests ?? [],
              candidate.profile.location?.lat ?? null,
              candidate.profile.location?.lng ?? null,
              candidate.createdAt,
              candidate.updatedAt,
              candidate.onboarding.profile === "complete",
              candidate.onboarding.avatar === "complete",
              candidate.onboarding.room === "complete",
              candidate.onboarding.completedAt ?? null,
              candidate.acceptedTerms ? JSON.stringify(candidate.acceptedTerms) : null
            ]
          )
          if (insertedAccount.rows[0]) {
            account = mapAccount(insertedAccount.rows[0])
          } else {
            const canonicalAccount = await client.query(
              `${accountSelectSql()}
                WHERE phone_number = $1
                FOR UPDATE`,
              [input.phoneNumber]
            )
            account = canonicalAccount.rows[0]
              ? mapAccount(canonicalAccount.rows[0])
              : null
          }
        }
        if (!account) {
          throw new Error("The verified account could not be finalized.")
        }

        const session = input.createSession(account)
        assertSessionMatchesAccount(session, account)
        await client.query(
          `INSERT INTO blumi_sessions (
              session_token_hash, session_id, account_id, user_id, expires_at
            ) VALUES ($1, $2, $3, $4, $5)`,
          [
            session.sessionTokenHash,
            session.sessionId,
            session.accountId,
            session.userId,
            session.expiresAt
          ]
        )
        await client.query(
          "DELETE FROM blumi_pending_otps WHERE phone_number = $1",
          [input.phoneNumber]
        )
        await client.query("COMMIT")
        return { kind: "verified", account, session }
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    },

    async getAccountByPhone(phoneNumber) {
      const result = await pool.query(
        `${accountSelectSql()}
          WHERE phone_number = $1`,
        [phoneNumber]
      )
      return result.rows[0] ? mapAccount(result.rows[0]) : null
    },

    async findAccountById(accountId) {
      const result = await pool.query(
        `${accountSelectSql()}
          WHERE account_id = $1`,
        [accountId]
      )
      return result.rows[0] ? mapAccount(result.rows[0]) : null
    },

    async findAccountByUserId(userId) {
      const result = await pool.query(
        `${accountSelectSql()}
          WHERE user_id = $1`,
        [userId]
      )
      return result.rows[0] ? mapAccount(result.rows[0]) : null
    },

    async saveAccount(account) {
      await pool.query(
        `INSERT INTO blumi_accounts (
            account_id, user_id, phone_number, display_name, age,
            avatar_preset_id, avatar_selection, avatar_revision,
            bio, gender, identity_gender, discovery_genders,
            discovery_age_min, discovery_age_max, discovery_vibes,
            discovery_radius_km, interests, location_lat,
            location_lng, created_at, updated_at,
            onboarding_profile_complete, onboarding_avatar_complete,
            onboarding_room_complete, onboarding_completed_at, accepted_terms
          ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, $19,
                    $20, $21, $22, $23, $24, $25, $26::jsonb)
          ON CONFLICT (phone_number) DO NOTHING`,
        [
          account.accountId,
          account.userId,
          account.phoneNumber,
          account.profile.displayName,
          account.profile.age ?? null,
          account.profile.avatar.presetId,
          JSON.stringify(toCompleteAvatarSelection(account.profile.avatar).loadout),
          toCompleteAvatarSelection(account.profile.avatar).revision,
          account.profile.bio ?? "",
          account.profile.gender ?? null,
          account.profile.identityGender ?? null,
          account.profile.discoveryPreferences?.genders ?? [],
          account.profile.discoveryPreferences?.ageMin ?? 18,
          account.profile.discoveryPreferences?.ageMax ?? 99,
          account.profile.discoveryPreferences?.vibes ?? [],
          account.profile.discoveryPreferences?.radiusKm ?? 25,
          account.profile.interests ?? [],
          account.profile.location?.lat ?? null,
          account.profile.location?.lng ?? null,
          account.createdAt,
          account.updatedAt,
          account.onboarding.profile === "complete",
          account.onboarding.avatar === "complete",
          account.onboarding.room === "complete",
          account.onboarding.completedAt ?? null,
          account.acceptedTerms ? JSON.stringify(account.acceptedTerms) : null
        ]
      )
    },

    async updateAccountProfile(input) {
      const profile = input.profile
      const values: unknown[] = [input.accountId]
      const assignments: string[] = []
      const setValue = (column: string, value: unknown): void => {
        values.push(value)
        assignments.push(`${column} = $${values.length}`)
      }
      if (profile.displayName !== undefined) setValue("display_name", profile.displayName)
      if (profile.age !== undefined) setValue("age", profile.age)
      if (Object.hasOwn(profile, "bio")) setValue("bio", profile.bio ?? "")
      if (Object.hasOwn(profile, "gender")) setValue("gender", profile.gender)
      if (Object.hasOwn(profile, "identityGender")) {
        setValue("identity_gender", profile.identityGender)
      }
      if (Object.hasOwn(profile, "discoveryPreferences")) {
        const preferences = profile.discoveryPreferences
        setValue("discovery_age_min", preferences?.ageMin ?? 18)
        setValue("discovery_age_max", preferences?.ageMax ?? 99)
        setValue("discovery_genders", preferences?.genders ?? [])
        setValue("discovery_vibes", preferences?.vibes ?? [])
        setValue("discovery_radius_km", preferences?.radiusKm ?? 25)
      }
      if (Object.hasOwn(profile, "interests")) setValue("interests", profile.interests ?? [])
      if (Object.hasOwn(profile, "prompts")) {
        setValue("profile_prompts", JSON.stringify(profile.prompts ?? []))
      }
      if (Object.hasOwn(profile, "location")) {
        setValue("location_lat", profile.location?.lat ?? null)
        setValue("location_lng", profile.location?.lng ?? null)
      }
      setValue("updated_at", input.now)
      const blocksCompletedGenderClear =
        Object.hasOwn(profile, "gender") && profile.gender === null
      const result = await pool.query(
        `UPDATE blumi_accounts
            SET ${assignments.join(", ")}
          WHERE account_id = $1
            ${blocksCompletedGenderClear
              ? "AND onboarding_profile_complete = FALSE"
              : ""}
          RETURNING account_id, user_id, phone_number, display_name, age,
                    avatar_preset_id, avatar_selection, avatar_revision,
                    bio, gender, identity_gender, discovery_genders,
                    discovery_age_min, discovery_age_max, discovery_vibes,
                    discovery_radius_km, interests, profile_prompts, location_lat,
                    location_lng, onboarding_profile_complete,
                    onboarding_avatar_complete, onboarding_room_complete,
                    onboarding_completed_at, accepted_terms, moderation_status, moderation_updated_at, suspended_until, created_at, updated_at`,
        values
      )
      return result.rows[0] ? mapAccount(result.rows[0]) : null
    },

    async updateAvatarSelection(input) {
      const result = await pool.query(
        `UPDATE blumi_accounts
            SET avatar_preset_id = $3,
                avatar_selection = $4::jsonb,
                avatar_revision = avatar_revision + 1,
                updated_at = $5
          WHERE account_id = $1 AND avatar_revision = $2
          RETURNING account_id, user_id, phone_number, display_name, age,
                    avatar_preset_id, avatar_selection, avatar_revision,
                    bio, gender, identity_gender, discovery_genders,
                    discovery_age_min, discovery_age_max, discovery_vibes,
                    discovery_radius_km, interests, profile_prompts, location_lat,
                    location_lng, onboarding_profile_complete,
                    onboarding_avatar_complete, onboarding_room_complete,
                    onboarding_completed_at, accepted_terms, moderation_status, moderation_updated_at, suspended_until, created_at, updated_at`,
        [
          input.accountId,
          input.expectedRevision,
          input.selection.presetId,
          JSON.stringify(input.selection.loadout),
          input.now
        ]
      )
      if (result.rows[0]) {
        return { kind: "updated", account: mapAccount(result.rows[0]) }
      }

      const current = await pool.query(
        `SELECT account_id, user_id, phone_number, display_name, age,
                avatar_preset_id, avatar_selection, avatar_revision,
                bio, gender, identity_gender, discovery_genders,
                discovery_age_min, discovery_age_max, discovery_vibes,
                discovery_radius_km, interests, profile_prompts, location_lat,
                location_lng, onboarding_profile_complete,
                onboarding_avatar_complete, onboarding_room_complete,
                onboarding_completed_at, accepted_terms, moderation_status, moderation_updated_at, suspended_until, created_at, updated_at
           FROM blumi_accounts
          WHERE account_id = $1`,
        [input.accountId]
      )
      if (!current.rows[0]) return { kind: "missing" }
      return {
        kind: "conflict",
        current: mapAvatarSelection(current.rows[0])
      }
    },

    async completeOnboardingStep(input) {
      const completedColumn = onboardingColumnForStep(input.step)
      const profileReadySql = `char_length(trim(display_name)) >= 2
        AND age BETWEEN 18 AND 99
        AND COALESCE(identity_gender, gender) IN ('woman', 'man')`
      const completionValue = input.step === "profile"
        ? `CASE WHEN ${profileReadySql}
            THEN TRUE ELSE onboarding_profile_complete END`
        : "TRUE"
      const result = await pool.query(
        `UPDATE blumi_accounts
            SET ${completedColumn} = ${completionValue},
                onboarding_completed_at = CASE
                  WHEN onboarding_completed_at IS NOT NULL
                    THEN onboarding_completed_at
                  WHEN onboarding_profile_complete
                    AND onboarding_avatar_complete
                    AND onboarding_room_complete
                    THEN $2
                  WHEN $3 = 'profile'
                    AND ${profileReadySql}
                    AND onboarding_avatar_complete
                    AND onboarding_room_complete
                    THEN $2
                  WHEN $3 = 'avatar'
                    AND onboarding_profile_complete
                    AND onboarding_room_complete
                    THEN $2
                  WHEN $3 = 'room'
                    AND onboarding_profile_complete
                    AND onboarding_avatar_complete
                    THEN $2
                  ELSE NULL
                END,
                updated_at = $2
          WHERE account_id = $1
          RETURNING account_id, user_id, phone_number, display_name, age,
                    avatar_preset_id, avatar_selection, avatar_revision,
                    bio, gender, identity_gender, discovery_genders,
                    discovery_age_min, discovery_age_max, discovery_vibes,
                    discovery_radius_km, interests, profile_prompts, location_lat,
                    location_lng, onboarding_profile_complete,
                    onboarding_avatar_complete, onboarding_room_complete,
                    onboarding_completed_at, accepted_terms, moderation_status, moderation_updated_at, suspended_until, created_at, updated_at`,
        [input.accountId, input.now, input.step]
      )
      return result.rows[0] ? mapAccount(result.rows[0]) : null
    },

    async getSessionByTokenHash(sessionTokenHash) {
      const result = await pool.query(
        `SELECT account_id, session_id, user_id, session_token_hash, expires_at
           FROM blumi_sessions
          WHERE session_token_hash = $1`,
        [sessionTokenHash]
      )
      return result.rows[0] ? mapSession(result.rows[0]) : null
    },
    async hasActiveSessionFamily(input) {
      const result = await pool.query(
        `SELECT 1 FROM blumi_sessions
          WHERE user_id = $1 AND session_id = $2 AND expires_at > $3 LIMIT 1`,
        [input.userId, input.sessionFamilyId, input.now]
      )
      return result.rows.length > 0
    },

    async saveSession(session) {
      await pool.query(
        `INSERT INTO blumi_sessions (
            session_token_hash, session_id, account_id, user_id, expires_at
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (session_token_hash) DO UPDATE SET
            expires_at = EXCLUDED.expires_at`,
        [
          session.sessionTokenHash,
          session.sessionId,
          session.accountId,
          session.userId,
          session.expiresAt
        ]
      )
    },

    async deleteSession(sessionTokenHash) {
      await pool.query(
        `WITH target_session AS (
           SELECT session_id
             FROM blumi_sessions
            WHERE session_token_hash = $1
         )
         DELETE FROM blumi_sessions
          WHERE session_id IN (SELECT session_id FROM target_session)`,
        [sessionTokenHash]
      )
    },

    async acknowledgeModeration(input) {
      const result = await pool.query(
        `UPDATE blumi_accounts
            SET moderation_status = CASE
                  WHEN moderation_status = 'warned' THEN 'active'
                  ELSE moderation_status
                END,
                moderation_updated_at = CASE
                  WHEN moderation_status = 'warned' THEN $2
                  ELSE moderation_updated_at
                END,
                updated_at = CASE
                  WHEN moderation_status = 'warned' THEN $2
                  ELSE updated_at
                END
          WHERE account_id = $1
        RETURNING account_id, user_id, phone_number, display_name, age,
                  avatar_preset_id, avatar_selection, avatar_revision,
                  bio, gender, identity_gender, discovery_genders,
                  discovery_age_min, discovery_age_max, discovery_vibes,
                  discovery_radius_km, interests, profile_prompts, location_lat,
                  location_lng, onboarding_profile_complete,
                  onboarding_avatar_complete, onboarding_room_complete,
                  onboarding_completed_at, moderation_status,
                  moderation_updated_at, suspended_until, accepted_terms, created_at, updated_at`,
        [input.accountId, input.now]
      )
      return result.rows[0] ? mapAccount(result.rows[0]) : null
    },

    async clearExpiredSuspension(input) {
      const result = await pool.query(
        `UPDATE blumi_accounts
            SET moderation_status = 'active',
                moderation_updated_at = $2,
                suspended_until = NULL,
                updated_at = $2
          WHERE account_id = $1
            AND moderation_status = 'suspended'
            AND suspended_until IS NOT NULL
            AND suspended_until <= $2
        RETURNING account_id, user_id, phone_number, display_name, age,
                  avatar_preset_id, avatar_selection, avatar_revision,
                  bio, gender, identity_gender, discovery_genders,
                  discovery_age_min, discovery_age_max, discovery_vibes,
                  discovery_radius_km, interests, profile_prompts, location_lat,
                  location_lng, onboarding_profile_complete,
                  onboarding_avatar_complete, onboarding_room_complete,
                  onboarding_completed_at, moderation_status,
                  moderation_updated_at, suspended_until, accepted_terms, created_at, updated_at`,
        [input.accountId, input.now]
      )
      if (result.rows[0]) return mapAccount(result.rows[0])
      const account = await pool.query(
        `${accountSelectSql()} WHERE account_id = $1`,
        [input.accountId]
      )
      return account.rows[0] ? mapAccount(account.rows[0]) : null
    },

    async rotateSession(input) {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        const consumed = await client.query(
          `UPDATE blumi_sessions
              SET expires_at = $2
            WHERE session_token_hash = $1 AND expires_at > $2
          RETURNING session_id`,
          [input.currentSessionTokenHash, input.now]
        )
        if (!consumed.rowCount) {
          await client.query("COMMIT")
          return false
        }
        await client.query(
          `INSERT INTO blumi_sessions (
              session_token_hash, session_id, account_id, user_id, expires_at
            ) VALUES ($1, $2, $3, $4, $5)`,
          [
            input.nextSession.sessionTokenHash,
            consumed.rows[0].session_id,
            input.nextSession.accountId,
            input.nextSession.userId,
            input.nextSession.expiresAt
          ]
        )
        await client.query("COMMIT")
        return true
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    },

    async deleteAccountData(account, confirmation) {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        if (confirmation) {
          const consumed = await client.query(
            `DELETE FROM blumi_account_deletion_confirmations
              WHERE account_id = $1
                AND token_digest = $2
                AND expires_at > $3
            RETURNING account_id`,
            [
              account.accountId,
              confirmation.confirmationTokenDigest,
              new Date(confirmation.now)
            ]
          )
          if (!consumed.rowCount) {
            await client.query("ROLLBACK")
            return false
          }
        }
        // Match dispatch/enqueue lock order: user authority -> watch -> device -> outbox.
        // Acquire only after confirmation is consumed in this same transaction.
        // Locking devices first deadlocks with a dispatch holding the watch row.
        await client.query(discoveryWatchLockSql, [account.userId])
        await client.query(
          "SELECT user_id FROM blumi_discovery_watches WHERE user_id = $1 FOR UPDATE",
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_pending_otps WHERE phone_number = $1",
          [account.phoneNumber]
        )
        await client.query(
          "DELETE FROM blumi_otp_send_limits WHERE phone_number = $1",
          [account.phoneNumber]
        )
        await client.query(
          "DELETE FROM blumi_recovery_phone_challenges WHERE phone_number = $1",
          [account.phoneNumber]
        )
        await client.query(
          "DELETE FROM blumi_recovery_otp_send_limits WHERE phone_number = $1",
          [account.phoneNumber]
        )
        await client.query(
          `DELETE FROM blumi_account_recovery_requests
            WHERE account_id = $1
               OR claimed_old_phone_number = $2
               OR new_phone_number = $2`,
          [account.accountId, account.phoneNumber]
        )
        await client.query(
          "DELETE FROM blumi_account_deletion_confirmations WHERE account_id = $1",
          [account.accountId]
        )
        await client.query(
          "DELETE FROM blumi_account_deletion_challenges WHERE account_id = $1",
          [account.accountId]
        )
        await client.query(
          "DELETE FROM blumi_account_deletion_otp_send_limits WHERE account_id = $1",
          [account.accountId]
        )
        await client.query(
          "DELETE FROM blumi_account_action_challenges WHERE account_id = $1",
          [account.accountId]
        )
        await client.query(
          "DELETE FROM blumi_account_action_confirmations WHERE account_id = $1",
          [account.accountId]
        )
        await client.query(
          "DELETE FROM blumi_account_action_otp_send_limits WHERE account_id = $1",
          [account.accountId]
        )
        await client.query(
          "DELETE FROM blumi_push_devices WHERE user_id = $1",
          [account.userId]
        )
        await client.query("DELETE FROM blumi_push_receipts WHERE user_id = $1", [account.userId])
        await client.query(
          `DELETE FROM blumi_push_delivery_audit
            WHERE delivery_id IN (
              SELECT delivery_id
                FROM blumi_push_delivery_outbox
               WHERE user_id = $1
            )`,
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_push_delivery_outbox WHERE user_id = $1",
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_notification_preferences WHERE user_id = $1",
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_notification_policy_events WHERE user_id = $1",
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_notification_policy_audit WHERE user_id = $1",
          [account.userId]
        )
        await client.query(
          `DELETE FROM blumi_realtime_tickets
            WHERE session_token_hash IN (
              SELECT session_token_hash
                FROM blumi_sessions
               WHERE account_id = $1
            )`,
          [account.accountId]
        )
        await client.query(
          "DELETE FROM blumi_chat_threads WHERE thread_id IN (SELECT thread_id FROM blumi_chat_thread_participants WHERE user_id = $1)",
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_room_presence WHERE user_id = $1",
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_mini_room_invites WHERE sender_user_id = $1 OR recipient_user_id = $1",
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_mini_rooms WHERE participant_a_user_id = $1 OR participant_b_user_id = $1",
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_connection_decisions WHERE actor_user_id = $1 OR partner_user_id = $1",
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_connection_matches WHERE participant_a_user_id = $1 OR participant_b_user_id = $1",
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_reactions WHERE actor_user_id = $1 OR target_user_id = $1",
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_safety_blocks WHERE actor_user_id = $1 OR blocked_user_id = $1",
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_safety_reports WHERE actor_user_id = $1 OR reported_user_id = $1",
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_economy_reward_ledger WHERE user_id = $1",
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_economy_iap_ledger WHERE user_id = $1",
          [account.userId]
        )
        await client.query(
          `DELETE FROM blumi_store_transactions
            WHERE user_id = $1`,
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_economy_inventories WHERE user_id = $1",
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_discovery_decisions WHERE from_user_id = $1 OR to_user_id = $1",
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_discovery_decision_quotas WHERE user_id = $1",
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_discovery_watches WHERE user_id = $1",
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_matches WHERE participant_a_user_id = $1 OR participant_b_user_id = $1",
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_referral_invites WHERE inviter_user_id = $1 OR claimed_by_user_id = $1",
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_personal_room_decor WHERE user_id = $1",
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_discover_profiles WHERE user_id = $1",
          [account.userId]
        )
        await client.query(
          "DELETE FROM blumi_accounts WHERE account_id = $1",
          [account.accountId]
        )
        await client.query("COMMIT")
        return true
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    }
  }
}

function mapPendingOtp(row: QueryResultRow): PendingOtp {
  return {
    phoneNumber: String(row.phone_number),
    otpId: String(row.otp_id),
    codeDigest: String(row.code_digest),
    expiresAt: new Date(row.expires_at).getTime(),
    attemptCount: Number(row.attempt_count)
  }
}

function mapPendingAccountActionOtp(row: QueryResultRow): PendingAccountActionOtp {
  const purpose = row.purpose
  if (
    purpose !== "account_data_export" &&
    purpose !== "phone_change_current" &&
    purpose !== "phone_change_new"
  ) {
    throw new Error("Invalid stored account action purpose.")
  }
  return {
    ...mapPendingOtp(row),
    accountId: String(row.account_id),
    purpose,
    targetPhoneNumber: String(row.target_phone_number)
  }
}

function accountActionLockKey(accountId: string, purpose: AccountActionPurpose): string {
  return `${accountId}:${purpose}`
}

function recoveryOtpLockKey(phoneNumber: string): string {
  return `account-recovery:${phoneNumber}`
}

export async function readPostgresAccountExportSnapshot(
  executor: { query(text: string, values?: readonly unknown[]): Promise<{ rows: QueryResultRow[] }> },
  accountId: string
): Promise<AccountRecord | null> {
  const result = await executor.query(`${accountSelectSql()} WHERE account_id = $1`, [accountId])
  return result.rows[0] ? mapAccount(result.rows[0]) : null
}

function accountSelectSql(): string {
  return `SELECT account_id, user_id, phone_number, display_name, age,
                 avatar_preset_id, avatar_selection, avatar_revision,
                 bio, gender, identity_gender, discovery_genders,
                 discovery_age_min, discovery_age_max, discovery_vibes,
                 discovery_radius_km, interests, profile_prompts, location_lat,
                 location_lng, onboarding_profile_complete,
                 onboarding_avatar_complete, onboarding_room_complete,
                 onboarding_completed_at, moderation_status,
                 moderation_updated_at, suspended_until, accepted_terms, created_at, updated_at
            FROM blumi_accounts`
}

function assertSessionMatchesAccount(
  session: SessionRecord,
  account: AccountRecord
): void {
  if (
    session.accountId !== account.accountId ||
    session.userId !== account.userId
  ) {
    throw new Error("The sign-in session must belong to the canonical account.")
  }
}

function mapAccount(row: QueryResultRow): AccountRecord {
  const userId = String(row.user_id)
  return {
    accountId: String(row.account_id),
    ...(row.accepted_terms ? { acceptedTerms: { ...row.accepted_terms } } : {}),
    userId,
    phoneNumber: String(row.phone_number),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    moderation: {
      status: normalizeModerationStatus(row.moderation_status),
      updatedAt: row.moderation_updated_at
        ? new Date(row.moderation_updated_at).toISOString()
        : new Date(row.updated_at).toISOString(),
      ...(row.suspended_until
        ? { suspendedUntil: new Date(row.suspended_until).toISOString() }
        : {})
    },
    profile: {
      userId,
      displayName: String(row.display_name),
      age: row.age === null || row.age === undefined ? undefined : Number(row.age),
      bio: row.bio ? String(row.bio) : undefined,
      gender: isReadableProfileGender(row.gender) ? row.gender : undefined,
      identityGender: isProfileGender(row.identity_gender)
        ? row.identity_gender
        : isProfileGender(row.gender)
          ? row.gender
          : undefined,
      discoveryPreferences: mapDiscoveryPreferences(row),
      interests: normalizeTextArray(row.interests),
      prompts: normalizeUserProfilePrompts(row.profile_prompts),
      location: normalizeLocation(row.location_lat, row.location_lng),
      avatar: mapAvatarSelection(row)
    },
    onboarding: {
      profile: row.onboarding_profile_complete ? "complete" : "incomplete",
      avatar: row.onboarding_avatar_complete ? "complete" : "incomplete",
      room: row.onboarding_room_complete ? "complete" : "incomplete",
      ...(row.onboarding_completed_at
        ? { completedAt: new Date(row.onboarding_completed_at).toISOString() }
        : {})
    }
  }
}

function mapDiscoveryPreferences(
  row: QueryResultRow
): UserProfile["discoveryPreferences"] {
  const ageMin = Number(row.discovery_age_min ?? 18)
  const ageMax = Number(row.discovery_age_max ?? 99)
  const genders = (normalizeTextArray(row.discovery_genders) ?? [])
    .filter((gender): gender is "woman" | "man" => isProfileGender(gender))
  const vibes = normalizeTextArray(row.discovery_vibes) ?? []
  const radius = Number(row.discovery_radius_km ?? 25)
  return {
    ageMin,
    ageMax,
    genders,
    vibes,
    radiusKm: radius === 50 || radius === 100 ? radius : 25
  }
}

function normalizeModerationStatus(
  value: unknown
): "active" | "warned" | "suspended" | "banned" {
  if (value === "warned" || value === "suspended" || value === "banned") {
    return value
  }
  return "active"
}

function mapAvatarSelection(row: QueryResultRow): CompleteAvatarSelection {
  const rawLoadout = typeof row.avatar_selection === "string"
    ? JSON.parse(row.avatar_selection) as unknown
    : row.avatar_selection
  return normalizeStoredAvatarSelection({
    presetId: row.avatar_preset_id,
    revision: row.avatar_revision,
    loadout: rawLoadout
  })
}

function toCompleteAvatarSelection(
  selection: AccountRecord["profile"]["avatar"]
): CompleteAvatarSelection {
  if (!selection.loadout || typeof selection.revision !== "number") {
    throw new Error("A complete avatar selection is required.")
  }
  return {
    presetId: selection.presetId,
    revision: selection.revision,
    loadout: {
      ...selection.loadout,
      accessoryIds: [...selection.loadout.accessoryIds]
    }
  }
}

function onboardingColumnForStep(step: "profile" | "avatar" | "room"): string {
  if (step === "profile") return "onboarding_profile_complete"
  if (step === "avatar") return "onboarding_avatar_complete"
  return "onboarding_room_complete"
}

function normalizeTextArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const normalized = value.map(String).filter((item) => item.length > 0)
  return normalized.length > 0 ? normalized : undefined
}

function normalizeLocation(lat: unknown, lng: unknown): { lat: number; lng: number } | undefined {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return undefined
  }
  return {
    lat: Number(lat),
    lng: Number(lng)
  }
}

function mapSession(row: QueryResultRow): SessionRecord {
  return {
    accountId: String(row.account_id),
    sessionId: String(row.session_id),
    userId: String(row.user_id),
    sessionTokenHash: String(row.session_token_hash),
    expiresAt: new Date(row.expires_at).toISOString()
  }
}
