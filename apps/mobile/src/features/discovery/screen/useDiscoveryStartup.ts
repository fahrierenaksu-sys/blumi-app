import { useCallback, useEffect, useRef, useState } from "react"
import { useDiscoveryStartupBoundary } from "../DiscoveryStartupBoundary"
import {
  areDiscoveryImagesDisplayed,
  recordDiscoveryImageReceipt,
  resolveDiscoveryStartup
} from "../discoveryStartupModel"
import type { DiscoveryCandidate } from "../discoveryCandidateModel"
import type { SessionActor } from "../../session/sessionModel"
import type { ProductionDiscoveryPlaceholderState } from "./discoveryScreenModel"

// First-frame readiness for production Discover: the background and the
// front card must report a real display (not a prefetch) for the current
// session, attempt and front card before the startup boundary is released.
export function useDiscoveryStartup(input: {
  sessionActor: SessionActor
  isProductionDiscovery: boolean
  isSafetyListReady: boolean
  filtersReady: boolean
  isInitialPagePending: boolean
  visibleDiscoverDeck: readonly DiscoveryCandidate[]
  discoveryPlaceholderState: ProductionDiscoveryPlaceholderState
}) {
  const {
    sessionActor,
    isProductionDiscovery,
    isSafetyListReady,
    filtersReady,
    isInitialPagePending,
    visibleDiscoverDeck,
    discoveryPlaceholderState
  } = input
  const startupBoundary = useDiscoveryStartupBoundary()
  const [imageAttempt, setImageAttempt] = useState(0)
  const [imageReceipts, setImageReceipts] = useState<readonly string[]>([])
  const [imageFailures, setImageFailures] = useState<readonly string[]>([])
  const [completedStartupScope, setCompletedStartupScope] = useState<string | null>(null)
  const requiredImagesRef = useRef<readonly string[]>([])
  const validImageFailureScopesRef = useRef<readonly string[]>([])
  const imageSessionRef = useRef({ token: sessionActor.session.sessionToken, generation: 0 })
  if (imageSessionRef.current.token !== sessionActor.session.sessionToken) {
    imageSessionRef.current = { token: sessionActor.session.sessionToken, generation: imageSessionRef.current.generation + 1 }
  }

  const startupSessionScope = `${sessionActor.profile.userId}:${imageSessionRef.current.generation}`
  const startupComplete = completedStartupScope === startupSessionScope
  const startupScope = `${startupSessionScope}:${imageAttempt}`
  const firstCardScope = `${startupScope}:${visibleDiscoverDeck[0]?.userId ?? "empty"}:${JSON.stringify(visibleDiscoverDeck[0]?.avatar ?? null)}`
  requiredImagesRef.current = [
    `${startupScope}:background`,
    `${firstCardScope}:layout`, `${firstCardScope}:surface`, `${firstCardScope}:avatar`
  ]
  validImageFailureScopesRef.current = [startupScope, firstCardScope]
  const recordImage = useCallback((key: string) => {
    setImageReceipts((current) => recordDiscoveryImageReceipt(current, requiredImagesRef.current, key))
  }, [])
  const recordImageFailure = useCallback((key: string) => {
    setImageFailures((current) => recordDiscoveryImageReceipt(current, validImageFailureScopesRef.current, key))
  }, [])
  const onBackgroundDisplay = useCallback(() => recordImage(`${startupScope}:background`), [recordImage, startupScope])
  const onBackgroundError = useCallback(() => recordImageFailure(startupScope), [recordImageFailure, startupScope])
  const onFrontDisplay = useCallback((part: "layout" | "surface" | "avatar") => recordImage(`${firstCardScope}:${part}`), [firstCardScope, recordImage])
  const onFrontError = useCallback(() => recordImageFailure(firstCardScope), [firstCardScope, recordImageFailure])
  const startupImageFailed = imageFailures.includes(startupScope) || imageFailures.includes(firstCardScope)
  const startupImagesReady = areDiscoveryImagesDisplayed(requiredImagesRef.current, imageReceipts)
  const startupStatus = resolveDiscoveryStartup({
    safetyReady: !isProductionDiscovery || isSafetyListReady,
    dataReady: filtersReady && !isInitialPagePending,
    hasCard: visibleDiscoverDeck.length > 0,
    chromeReady: areDiscoveryImagesDisplayed([`${startupScope}:background`], imageReceipts),
    imagesReady: startupImagesReady,
    failed: discoveryPlaceholderState === "error" || startupImageFailed
  })
  useEffect(() => {
    if (isProductionDiscovery) startupBoundary?.report(startupStatus)
    if (startupStatus === "ready") setCompletedStartupScope(startupSessionScope)
  }, [isProductionDiscovery, startupBoundary, startupStatus, startupSessionScope])
  const showStartupFailure = isProductionDiscovery && !startupComplete && (startupImageFailed || discoveryPlaceholderState === "error" ||
    (startupBoundary?.deadlineExpired === true && startupStatus === "pending"))

  // A retry remounts every scoped image (background, deck) under a new attempt.
  const retryStartupImages = useCallback(() => {
    setImageAttempt((current) => current + 1)
  }, [])

  return {
    startupScope,
    startupComplete,
    startupImagesReady,
    showStartupFailure,
    onBackgroundDisplay,
    onBackgroundError,
    onFrontDisplay,
    onFrontError,
    retryStartupImages
  }
}
