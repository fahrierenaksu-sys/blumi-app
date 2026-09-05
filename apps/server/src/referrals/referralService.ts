import { randomBytes } from "node:crypto"
import { PublicRequestError } from "../errors/publicRequestError"
import {
  createInMemoryReferralRepository,
  type ReferralRepository
} from "./referralRepository"

const REFERRAL_CODE_PATTERN = /^r_[A-Za-z0-9_-]{32,96}$/
const REFERRAL_SHARE_PREFIX = "blumi://r"

export interface ReferralService {
  issueInvite(inviterUserId: string, now?: Date): Promise<{ code: string; url: string }>
  claimInvite(inviteeUserId: string, code: string, now?: Date): Promise<boolean>
}

export function createReferralService(options: {
  repository?: ReferralRepository
  codeFactory?: () => string
} = {}): ReferralService {
  const repository = options.repository ?? createInMemoryReferralRepository()
  const codeFactory = options.codeFactory ?? createReferralCode

  return {
    async issueInvite(inviterUserId, now = new Date()) {
      const normalizedInviterUserId = normalizeUserId(inviterUserId)
      const invite = await repository.issueInvite({
        code: normalizeReferralCode(codeFactory()),
        inviterUserId: normalizedInviterUserId,
        createdAt: now.toISOString()
      })
      return { code: invite.code, url: `${REFERRAL_SHARE_PREFIX}/${invite.code}` }
    },
    async claimInvite(inviteeUserId, code, now = new Date()) {
      return repository.claimInvite({
        code: normalizeReferralCode(code),
        inviteeUserId: normalizeUserId(inviteeUserId),
        claimedAt: now.toISOString()
      })
    }
  }
}

export function normalizeReferralCode(value: string): string {
  const code = value.trim()
  if (!REFERRAL_CODE_PATTERN.test(code)) {
    throw new PublicRequestError("Use a valid referral link.")
  }
  return code
}

function normalizeUserId(value: string): string {
  const userId = value.trim()
  if (!userId) throw new PublicRequestError("Sign in again to continue.")
  return userId
}

function createReferralCode(): string {
  return `r_${randomBytes(32).toString("base64url")}`
}
