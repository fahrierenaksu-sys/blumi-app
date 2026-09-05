const REFERRAL_CODE_PATTERN = /^r_[A-Za-z0-9_-]{32,96}$/

export interface PendingReferral {
  code: string
  userId?: string
}

export function shouldClaimCapturedReferral(
  session: { mode: "demo" | "production" } | null
): boolean {
  return session?.mode === "production"
}

export function isReferralCode(value: string): boolean {
  return REFERRAL_CODE_PATTERN.test(value)
}

export function parseReferralCodeFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const isCustomLink = parsed.protocol === "blumi:"
    const segments = isCustomLink
      ? [parsed.hostname, ...parsed.pathname.split("/").filter(Boolean)]
      : parsed.pathname.split("/").filter(Boolean)
    if (!isCustomLink) return null
    if (segments.length !== 2 || segments[0] !== "r") return null
    return isReferralCode(segments[1]) ? segments[1] : null
  } catch {
    return null
  }
}

export function resolveReferralShareOutcome(action: string | null | undefined):
  | "shared"
  | "dismissed" {
  return action === "sharedAction" ? "shared" : "dismissed"
}

export function createReferralShareMessage(url: string): string {
  return [
    "A small invitation to Blumi.",
    "Create your avatar and room, then meet people with less pressure.",
    "Avatar-first. Low-pressure. Built for real conversation.",
    url
  ].join("\n\n")
}

export function resolvePendingReferralClaim(
  pending: PendingReferral,
  userId: string
): { kind: "claim"; pending: PendingReferral } | { kind: "discard" } {
  if (pending.userId && pending.userId !== userId) return { kind: "discard" }
  return {
    kind: "claim",
    pending: {
      code: pending.code,
      ...(pending.userId ? { userId: pending.userId } : { userId })
    }
  }
}
