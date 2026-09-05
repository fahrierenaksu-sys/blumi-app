import { PROFILE_GENDERS } from "../users/UserProfile"

export const DISCOVERY_GENDERS = PROFILE_GENDERS

export type DiscoveryGender = (typeof DISCOVERY_GENDERS)[number]

export const DISCOVERY_RADIUS_KM = [25, 50, 100] as const
export type DiscoveryRadiusKm = (typeof DISCOVERY_RADIUS_KM)[number]

export interface DiscoveryFilters {
  ageMin: number
  ageMax: number
  genders: DiscoveryGender[]
  vibes: string[]
}

export interface DiscoveryPreferences extends DiscoveryFilters {
  radiusKm: DiscoveryRadiusKm
}

export interface DiscoveryWatchRecord {
  userId: string
  status: "active"
  preferences: DiscoveryFilters
  updatedAt: string
  expiresAt: string
}

export interface DiscoveryRewardedAdStatus {
  available: boolean
  extensionDecisions: 10
}

export interface DiscoveryDecisionQuota {
  limit: number
  extensionDecisions: number
  used: number
  remaining: number
  resetsAt: string
  rewardedAd: DiscoveryRewardedAdStatus
}
