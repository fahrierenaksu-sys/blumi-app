/**
 * The traveling cat ("Gezgin kedi") is off unless EXPO_PUBLIC_BLUMI_CAT_TRIPS
 * is exactly "1". Off: no request, no reveal, no shelf, no settings row. The
 * server has its own flag (BLUMI_CAT_TRIPS_ENABLED) and answers
 * `enabled: false` while it is off, which hides everything too.
 */
export function isCatTripsEnabled(rawValue: string | undefined): boolean {
  return rawValue?.trim() === "1"
}

export const IS_BLUMI_CAT_TRIPS_ENABLED = isCatTripsEnabled(process.env.EXPO_PUBLIC_BLUMI_CAT_TRIPS)
