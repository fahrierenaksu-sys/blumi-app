export interface ReferralInvite {
  code: string
  inviterUserId: string
  createdAt: string
  claimedByUserId?: string
  claimedAt?: string
}

export interface ReferralRepository {
  issueInvite(input: {
    code: string
    inviterUserId: string
    createdAt: string
  }): Promise<ReferralInvite>
  claimInvite(input: {
    code: string
    inviteeUserId: string
    claimedAt: string
  }): Promise<boolean>
}

export function createInMemoryReferralRepository(): ReferralRepository {
  const byCode = new Map<string, ReferralInvite>()
  const codeByInviter = new Map<string, string>()
  const codeByInvitee = new Map<string, string>()

  return {
    async issueInvite(input) {
      const existingCode = codeByInviter.get(input.inviterUserId)
      if (existingCode) {
        const existing = byCode.get(existingCode)
        if (existing) return { ...existing }
      }
      const invite: ReferralInvite = { ...input }
      byCode.set(invite.code, invite)
      codeByInviter.set(invite.inviterUserId, invite.code)
      return { ...invite }
    },
    async claimInvite(input) {
      const invite = byCode.get(input.code)
      if (
        !invite ||
        invite.inviterUserId === input.inviteeUserId ||
        invite.claimedByUserId ||
        codeByInvitee.has(input.inviteeUserId)
      ) return false
      const claimed: ReferralInvite = {
        ...invite,
        claimedByUserId: input.inviteeUserId,
        claimedAt: input.claimedAt
      }
      byCode.set(input.code, claimed)
      codeByInvitee.set(input.inviteeUserId, input.code)
      return true
    }
  }
}
