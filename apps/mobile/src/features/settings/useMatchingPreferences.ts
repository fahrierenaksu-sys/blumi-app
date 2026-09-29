import AsyncStorage from "@react-native-async-storage/async-storage"
import type { DiscoveryFilters } from "@blumi/contracts"
import { useCallback, useEffect, useState } from "react"
import { showToast } from "../../ui/toast"
import {
  DEFAULT_DISCOVERY_FILTERS,
  loadDiscoveryFilters,
  persistDiscoveryFilters
} from "../discovery/discoveryFiltersModel"
import type { UpdateSessionProfileInput } from "../session/sessionApi"
import type { SessionActor } from "../session/sessionModel"
import { toDiscoveryFilters, toDiscoveryPreferences } from "./settingsPreferencesModel"

/**
 * Discovery preferences edited from Settings. Production sessions read and
 * save through the authoritative profile; every session also persists the
 * same filters Discover reads locally.
 */
export function useMatchingPreferences(
  sessionActor: SessionActor,
  onUpdateProfile: (input: UpdateSessionProfileInput) => Promise<void>
) {
  const [matchingFilters, setMatchingFilters] = useState<DiscoveryFilters>(
    DEFAULT_DISCOVERY_FILTERS
  )
  const [matchingFiltersVisible, setMatchingFiltersVisible] = useState(false)

  useEffect(() => {
    let active = true
    if (sessionActor.session.mode === "production") {
      const preferences = sessionActor.profile.discoveryPreferences
      if (preferences && active) {
        setMatchingFilters(toDiscoveryFilters(preferences))
      }
      return () => {
        active = false
      }
    }
    void loadDiscoveryFilters(AsyncStorage, sessionActor.profile.userId).then(
      (filters) => {
        if (active) setMatchingFilters(filters)
      }
    )
    return () => {
      active = false
    }
  }, [sessionActor.profile.discoveryPreferences, sessionActor.profile.userId, sessionActor.session.mode])

  const handleApplyMatchingFilters = useCallback((filters: DiscoveryFilters) => {
    const previous = matchingFilters
    setMatchingFilters(filters)
    setMatchingFiltersVisible(false)
    void (async () => {
      if (sessionActor.session.mode === "production") {
        await onUpdateProfile({
          displayName: sessionActor.profile.displayName,
          discoveryPreferences: toDiscoveryPreferences(
            filters,
            sessionActor.profile.discoveryPreferences
          )
        })
      }
      return persistDiscoveryFilters(AsyncStorage, sessionActor.profile.userId, filters)
    })().then(setMatchingFilters).catch(() => {
      setMatchingFilters(previous)
      showToast({
        title: "Preferences not saved",
        body: "Try again in a moment.",
        type: "warning"
      })
    })
  }, [matchingFilters, onUpdateProfile, sessionActor])

  const openMatchingFilters = useCallback(() => setMatchingFiltersVisible(true), [])
  const closeMatchingFilters = useCallback(() => setMatchingFiltersVisible(false), [])

  return {
    matchingFilters,
    matchingFiltersVisible,
    openMatchingFilters,
    closeMatchingFilters,
    handleApplyMatchingFilters
  }
}
