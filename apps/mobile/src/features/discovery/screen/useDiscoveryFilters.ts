import { useCallback, useMemo, useRef, useState } from "react"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useFocusEffect } from "@react-navigation/native"
import type { DiscoveryPreferences } from "@blumi/contracts"
import {
  DEFAULT_DISCOVER_FILTERS,
  type DiscoverFilters
} from "../../../components/DiscoverFiltersBottomSheet"
import {
  areDiscoveryFiltersReadyFor,
  clearLocalDiscoveryFiltersFallback,
  createDiscoveryFiltersHydrationGate,
  getLoadedLocalDiscoveryFiltersFallback,
  loadDiscoveryFilters,
  loadLocalDiscoveryFiltersFallback,
  persistDiscoveryFilters,
  persistLocalDiscoveryFiltersFallback,
  resolveDiscoveryFiltersForFocus
} from "../discoveryFiltersModel"
import { countActiveDiscoverFilters } from "../lobbyPresentationModel"
import type { LobbyFeedbackCopy } from "../../lobby/lobbyFeedbackCopy"
import type { SessionActor } from "../../session/sessionModel"
import { showToast } from "../../../ui/toast"

// Account-scoped Discover filters. Production discovery waits for
// `filtersReady` (filters hydrated for this exact account) before querying.
export function useDiscoveryFilters(input: {
  sessionActor: SessionActor
  isProductionDiscovery: boolean
  lobbyCopy: LobbyFeedbackCopy
  onUpdateDiscoveryPreferences?: (
    preferences: DiscoveryPreferences
  ) => Promise<void>
  // Applying filters starts a fresh deck in the same state batch.
  onFiltersApplied: () => void
}) {
  const {
    sessionActor,
    isProductionDiscovery,
    lobbyCopy,
    onUpdateDiscoveryPreferences,
    onFiltersApplied
  } = input
  const [filtersVisible, setFiltersVisible] = useState(false)
  const loadedLocalFallback = isProductionDiscovery
    ? getLoadedLocalDiscoveryFiltersFallback(AsyncStorage, sessionActor.profile.userId)
    : undefined
  const [filters, setFilters] = useState<DiscoverFilters>(() =>
    loadedLocalFallback === undefined
      ? DEFAULT_DISCOVER_FILTERS
      : resolveDiscoveryFiltersForFocus(sessionActor.profile.discoveryPreferences, loadedLocalFallback)
  )
  const [filtersReadyForUserId, setFiltersReadyForUserId] = useState<string | null>(() =>
    isProductionDiscovery && loadedLocalFallback !== undefined
      ? sessionActor.profile.userId
      : null
  )
  // A save bumps the gate, so a load that started before it cannot overwrite it.
  const [hydrationGate] = useState(createDiscoveryFiltersHydrationGate)
  const localFiltersFallbackRef = useRef<DiscoverFilters | null>(null)
  const filtersReady = areDiscoveryFiltersReadyFor(filtersReadyForUserId, sessionActor.profile.userId)

  useFocusEffect(useCallback(() => {
    let active = true
    const loadToken = hydrationGate.beginLoad()
    const accountPreferences = sessionActor.profile.discoveryPreferences
    const inMemoryFallback = localFiltersFallbackRef.current
    if (isProductionDiscovery && inMemoryFallback) {
      setFilters(resolveDiscoveryFiltersForFocus(accountPreferences, inMemoryFallback))
      setFiltersReadyForUserId(sessionActor.profile.userId)
      return () => {
        active = false
      }
    }
    const loadedFallback = isProductionDiscovery
      ? getLoadedLocalDiscoveryFiltersFallback(AsyncStorage, sessionActor.profile.userId)
      : undefined
    if (loadedFallback !== undefined) {
      setFilters(resolveDiscoveryFiltersForFocus(accountPreferences, loadedFallback))
      setFiltersReadyForUserId(sessionActor.profile.userId)
      return () => {
        active = false
      }
    }
    const loadFocusedFilters = isProductionDiscovery
      ? loadLocalDiscoveryFiltersFallback(
          AsyncStorage,
          sessionActor.profile.userId
        ).then((localFallback) => {
          if (localFallback) {
            localFiltersFallbackRef.current = localFallback
          }
          return resolveDiscoveryFiltersForFocus(
            accountPreferences,
            localFallback
          )
        })
      : loadDiscoveryFilters(AsyncStorage, sessionActor.profile.userId)
    void loadFocusedFilters
      .then((savedFilters) => {
        if (!active || !hydrationGate.canApply(loadToken)) return
        setFilters(savedFilters)
        setFiltersReadyForUserId(sessionActor.profile.userId)
      })
      .catch(() => {
        if (!active || !hydrationGate.canApply(loadToken)) return
        setFilters(isProductionDiscovery
          ? resolveDiscoveryFiltersForFocus(accountPreferences, localFiltersFallbackRef.current)
          : DEFAULT_DISCOVER_FILTERS)
        setFiltersReadyForUserId(sessionActor.profile.userId)
      })
    return () => {
      active = false
    }
  }, [
    hydrationGate,
    isProductionDiscovery,
    sessionActor.profile.discoveryPreferences,
    sessionActor.profile.userId
  ]))

  const handleOpenFilters = useCallback(() => {
    setFiltersVisible(true)
  }, [])

  const handleCloseFilters = useCallback(() => {
    setFiltersVisible(false)
  }, [])

  const handleApplyFilters = useCallback((next: DiscoverFilters) => {
    const saveToken = hydrationGate.recordSave()
    localFiltersFallbackRef.current = isProductionDiscovery ? next : null
    setFilters(next)
    setFiltersReadyForUserId(sessionActor.profile.userId)
    setFiltersVisible(false)
    onFiltersApplied()
    void (async () => {
      await persistDiscoveryFilters(
        AsyncStorage,
        sessionActor.profile.userId,
        next
      ).catch(() => undefined)
      if (!isProductionDiscovery) return
      await persistLocalDiscoveryFiltersFallback(
        AsyncStorage,
        sessionActor.profile.userId,
        next
      ).catch(() => undefined)
      if (!onUpdateDiscoveryPreferences) return
      try {
        await onUpdateDiscoveryPreferences({
          ...next,
          radiusKm: sessionActor.profile.discoveryPreferences?.radiusKm ?? 25
        })
        if (!hydrationGate.isLatestSave(saveToken)) return
        localFiltersFallbackRef.current = null
        await clearLocalDiscoveryFiltersFallback(
          AsyncStorage,
          sessionActor.profile.userId
        ).catch(() => undefined)
      } catch {
        showToast({
          title: lobbyCopy.filtersLocalTitle,
          body: lobbyCopy.filtersLocalBody,
          type: "warning"
        })
      }
    })()
  }, [
    hydrationGate,
    isProductionDiscovery,
    lobbyCopy,
    onFiltersApplied,
    onUpdateDiscoveryPreferences,
    sessionActor.profile.discoveryPreferences?.radiusKm,
    sessionActor.profile.userId
  ])

  const activeFilterCount = useMemo(
    () => countActiveDiscoverFilters(filters),
    [filters]
  )

  return {
    filters,
    filtersReady,
    filtersVisible,
    activeFilterCount,
    handleOpenFilters,
    handleCloseFilters,
    handleApplyFilters
  }
}
