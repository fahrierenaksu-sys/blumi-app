import type {
  DiscoveryFilters,
  DiscoveryPreferences
} from "@blumi/contracts"

export function toDiscoveryFilters(
  preferences: DiscoveryPreferences
): DiscoveryFilters {
  return {
    ageMin: preferences.ageMin,
    ageMax: preferences.ageMax,
    genders: [...preferences.genders],
    vibes: [...preferences.vibes]
  }
}

export function toDiscoveryPreferences(
  filters: DiscoveryFilters,
  current: DiscoveryPreferences | undefined
): DiscoveryPreferences {
  return {
    ageMin: filters.ageMin,
    ageMax: filters.ageMax,
    genders: [...filters.genders],
    vibes: [...filters.vibes],
    radiusKm: current?.radiusKm ?? 25
  }
}
