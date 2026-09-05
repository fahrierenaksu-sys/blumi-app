/**
 * Reserved server boundary for a future rewarded-ad provider.
 *
 * The mobile client never grants decisions. A production adapter must verify a
 * provider-issued reward server-side, persist an idempotent provider reward id,
 * then atomically add exactly ten extension decisions to the UTC-day quota.
 */
export interface VerifiedDiscoveryRewardedAdGrant {
  provider: string
  providerRewardId: string
  userId: string
  verifiedAt: Date
}

export interface DiscoveryRewardedAdVerifier {
  readonly available: boolean
  verify(input: unknown): Promise<VerifiedDiscoveryRewardedAdGrant>
}

export function createUnavailableDiscoveryRewardedAdVerifier(): DiscoveryRewardedAdVerifier {
  return {
    available: false,
    async verify() {
      throw new Error("Rewarded-ad verification is not configured.")
    }
  }
}
