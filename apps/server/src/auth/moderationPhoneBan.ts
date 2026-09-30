import { createHmac } from "node:crypto"

/**
 * Keyed hash of an E.164 phone number for moderation phone bans (migration
 * 069). A ban record outlives a banned account that was deleted or moved to
 * another number, so the freed number cannot sign up again unbanned. Only this
 * HMAC is stored, never the number; it uses the OTP HMAC secret
 * (`BLUMI_OTP_HMAC_SECRET`) with its own domain prefix, so rotating that
 * secret makes existing records unmatchable.
 */
export type PhoneBanHasher = (phoneNumber: string) => string

export type ModerationPhoneBanSource = "account_deletion" | "phone_change"

export interface ModerationPhoneBanRecord {
  source: ModerationPhoneBanSource
  createdAt: string
}

export function createPhoneBanHasher(secret: string | Buffer): PhoneBanHasher {
  return (phoneNumber) =>
    createHmac("sha256", secret)
      .update("blumi:moderation-phone-ban:v1\0")
      .update(phoneNumber)
      .digest("hex")
}
