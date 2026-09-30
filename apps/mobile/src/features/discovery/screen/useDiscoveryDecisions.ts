import { useCallback, useEffect, useRef, useState } from "react"
import { Animated } from "react-native"
import { useFocusEffect, type RouteProp } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import type { DiscoveryDecisionQuota } from "@blumi/contracts"
import { MOBILE_HTTP_BASE_URL } from "../../../config/env"
import { captureProductEvent } from "../../../analytics/productAnalytics"
import type { RootStackParamList } from "../../../navigation/RootNavigator"
import { skipDiscoveryCandidate } from "../../connections/savedConnectionsStore"
import { useInventoryStore } from "../../inventory/inventoryStore"
import type { LobbyFeedbackCopy } from "../../lobby/lobbyFeedbackCopy"
import type { PendingInviteMemory } from "../../lobby/pendingInvitesStore"
import type { SessionActor } from "../../session/sessionModel"
import { showToast } from "../../../ui/toast"
import {
  createMatchFromDiscoveryResult,
  decideDiscoverProfile,
  DiscoveryDecisionQuotaExhaustedError
} from "../discoveryApi"
import {
  applyProductionDetailDecision,
  beginInFlightDiscoveryDecision,
  finishInFlightDiscoveryDecision,
  rollbackOptimisticDiscoveryDecision
} from "../discoveryDeckModel"
import {
  isLiveInviteAvailable,
  type DiscoveryCandidate
} from "../discoveryCandidateModel"
import { getDiscoveryErrorMessageForDisplay } from "../discoveryErrorCopy"
import { scheduleMatchResultNavigation } from "../matchResultNavigation"
import type { ShowDiscoverFeedback } from "./DiscoveryFeedbackPill"
import type { SetSeenCandidateIds } from "./useDiscoveryDeck"

// Card and ProfilePreview decisions. Production decisions advance the deck
// optimistically, call the Discover API, and open MatchResult on a mutual
// like; outside production they fall back to legacy lobby room invites.
export function useDiscoveryDecisions(input: {
  sessionActor: SessionActor
  isProductionDiscovery: boolean
  navigation: NativeStackNavigationProp<RootStackParamList>
  route: RouteProp<RootStackParamList, "Lobby">
  lobbyCopy: LobbyFeedbackCopy
  featuredCandidate: DiscoveryCandidate | null
  discoverSourceUsers: DiscoveryCandidate[]
  markCandidateSeen: (userId: string) => void
  setSeenThisSessionUserIds: SetSeenCandidateIds
  updateProductionQuota: (quota: DiscoveryDecisionQuota) => void
  showDiscoverFeedback: ShowDiscoverFeedback
  sendInvite: (recipientUserId: string) => boolean
  addPendingInvite: (invite: PendingInviteMemory) => void
}) {
  const {
    sessionActor,
    isProductionDiscovery,
    navigation,
    route,
    lobbyCopy,
    featuredCandidate,
    discoverSourceUsers,
    markCandidateSeen,
    setSeenThisSessionUserIds,
    updateProductionQuota,
    showDiscoverFeedback,
    sendInvite,
    addPendingInvite
  } = input
  const myUserId = sessionActor.profile.userId
  const myDisplayName = sessionActor.profile.displayName
  const { hydrateFromServer } = useInventoryStore(
    sessionActor.profile.userId,
    sessionActor.session.mode === "production"
  )
  const cancelPendingMatchNavigationRef = useRef<(() => void) | null>(null)
  const [inFlightDecisionUserIds, setInFlightDecisionUserIds] =
    useState<ReadonlySet<string>>(() => new Set())
  const inFlightDecisionUserIdsRef = useRef<ReadonlySet<string>>(new Set())
  const cardDragX = useRef(new Animated.ValueXY()).current
  const firstDiscoveryDecisionCapturedRef = useRef(false)

  useFocusEffect(useCallback(() => () => {
    cancelPendingMatchNavigationRef.current?.()
    cancelPendingMatchNavigationRef.current = null
  }, []))

  const showInviteDeliveryFailure = useCallback((): void => {
    showToast({
      title: lobbyCopy.inviteTitle,
      body: lobbyCopy.inviteBody,
      type: "warning"
    })
    showDiscoverFeedback(lobbyCopy.inviteFeedback, "soft")
  }, [lobbyCopy, showDiscoverFeedback])

  useEffect(() => {
    const completion = route.params?.completedProductionDecision
    if (!completion || !isProductionDiscovery) return
    setSeenThisSessionUserIds((current) =>
      applyProductionDetailDecision(current, completion).seenUserIds
    )
    updateProductionQuota(completion.quota)
    if (!firstDiscoveryDecisionCapturedRef.current) {
      firstDiscoveryDecisionCapturedRef.current = true
      captureProductEvent("activation_first_discovery_decision", {
        decision: completion.decision,
        mode: "production"
      })
    }
    navigation.setParams({ completedProductionDecision: undefined })
  }, [
    isProductionDiscovery,
    navigation,
    route.params?.completedProductionDecision,
    setSeenThisSessionUserIds,
    updateProductionQuota
  ])

  const restoreCandidateAfterDecisionFailure = useCallback((userId: string): void => {
    setSeenThisSessionUserIds((current) =>
      rollbackOptimisticDiscoveryDecision(current, userId)
    )
    cardDragX.setValue({ x: 0, y: 0 })
  }, [cardDragX, setSeenThisSessionUserIds])

  const decideProductionCandidate = useCallback(
    async (
      candidate: DiscoveryCandidate,
      decision: "like" | "pass"
    ): Promise<boolean> => {
      const started = beginInFlightDiscoveryDecision(
        inFlightDecisionUserIdsRef.current,
        candidate.userId
      )
      if (!started.accepted) return false
      inFlightDecisionUserIdsRef.current = started.nextUserIds
      setInFlightDecisionUserIds(started.nextUserIds)
      markCandidateSeen(candidate.userId)
      try {
        const result = await decideDiscoverProfile(
          MOBILE_HTTP_BASE_URL,
          sessionActor.session.sessionToken,
          candidate.userId,
          decision
        )
        updateProductionQuota(result.quota)
        captureProductEvent("discovery_decision", {
          decision,
          mode: "production"
        })
        if (!firstDiscoveryDecisionCapturedRef.current) {
          firstDiscoveryDecisionCapturedRef.current = true
          captureProductEvent("activation_first_discovery_decision", {
            decision,
            mode: "production"
          })
        }
        if (decision === "pass") {
          showDiscoverFeedback(lobbyCopy.passed, "soft")
          return true
        }

        const match = createMatchFromDiscoveryResult({
          currentUser: {
            userId: myUserId,
            displayName: myDisplayName,
            avatarSelection: sessionActor.profile.avatar
          },
          matchedUser: {
            userId: candidate.userId,
            displayName: candidate.displayName,
            avatarSelection: candidate.avatar
          },
          result
        })

        if (match) {
          void hydrateFromServer(sessionActor.session.sessionToken)
          showDiscoverFeedback(lobbyCopy.matched, "warm")
          cancelPendingMatchNavigationRef.current?.()
          cancelPendingMatchNavigationRef.current = scheduleMatchResultNavigation(
            () => navigation.navigate("MatchResult", { match }),
            () => navigation.isFocused()
          )
          return true
        }

        showDiscoverFeedback(lobbyCopy.liked, "warm")
        return true
      } catch (error) {
        if (error instanceof DiscoveryDecisionQuotaExhaustedError) {
          updateProductionQuota(error.quota)
        }
        const title = error instanceof DiscoveryDecisionQuotaExhaustedError
          ? lobbyCopy.quota
          : getDiscoveryErrorMessageForDisplay("decision", error)
        showToast({
          title,
          type: "warning"
        })
        showDiscoverFeedback(lobbyCopy.retry, "soft")
        restoreCandidateAfterDecisionFailure(candidate.userId)
        return false
      } finally {
        const finishedUserIds = finishInFlightDiscoveryDecision(
          inFlightDecisionUserIdsRef.current,
          candidate.userId
        )
        inFlightDecisionUserIdsRef.current = finishedUserIds
        setInFlightDecisionUserIds(finishedUserIds)
      }
    },
    [
      hydrateFromServer,
      lobbyCopy,
      markCandidateSeen,
      myDisplayName,
      myUserId,
      navigation,
      restoreCandidateAfterDecisionFailure,
      sessionActor.profile.avatar,
      sessionActor.session.sessionToken,
      showDiscoverFeedback,
      updateProductionQuota
    ]
  )

  const handlePrimaryLike = useCallback(() => {
    if (!featuredCandidate) return
    if (
      featuredCandidate.blocked ||
      (!isProductionDiscovery && !isLiveInviteAvailable(featuredCandidate))
    ) return
    if (isProductionDiscovery) {
      void decideProductionCandidate(featuredCandidate, "like")
      return
    }
    const inviteSent = sendInvite(featuredCandidate.userId)
    if (!inviteSent) {
      showInviteDeliveryFailure()
      return
    }
    showDiscoverFeedback(lobbyCopy.inviteSent, "warm")
    captureProductEvent("discovery_decision", {
      decision: "like",
      mode: sessionActor.session.mode
    })
    if (!firstDiscoveryDecisionCapturedRef.current) {
      firstDiscoveryDecisionCapturedRef.current = true
      captureProductEvent("activation_first_discovery_decision", {
        decision: "like",
        mode: sessionActor.session.mode
      })
    }
    addPendingInvite({
      userId: featuredCandidate.userId,
      displayName: featuredCandidate.displayName,
      sentAt: Date.now()
    })
    markCandidateSeen(featuredCandidate.userId)
  }, [
    addPendingInvite,
    decideProductionCandidate,
    featuredCandidate,
    isProductionDiscovery,
    lobbyCopy,
    markCandidateSeen,
    sessionActor.session.mode,
    sendInvite,
    showDiscoverFeedback,
    showInviteDeliveryFailure
  ])

  const handleSkipFeatured = useCallback(() => {
    if (!featuredCandidate) return
    if (inFlightDecisionUserIdsRef.current.has(featuredCandidate.userId)) return
    if (isProductionDiscovery) {
      void decideProductionCandidate(featuredCandidate, "pass")
      return
    }
    showDiscoverFeedback(lobbyCopy.skipped, "soft")
    markCandidateSeen(featuredCandidate.userId)
    void skipDiscoveryCandidate({
      ownerUserId: sessionActor.profile.userId,
      userId: featuredCandidate.userId
    })
    captureProductEvent("discovery_decision", {
      decision: "pass",
      mode: sessionActor.session.mode
    })
    if (!firstDiscoveryDecisionCapturedRef.current) {
      firstDiscoveryDecisionCapturedRef.current = true
      captureProductEvent("activation_first_discovery_decision", {
        decision: "pass",
        mode: sessionActor.session.mode
      })
    }
  }, [
    decideProductionCandidate,
    featuredCandidate,
    isProductionDiscovery,
    lobbyCopy,
    markCandidateSeen,
    sessionActor.profile.userId,
    sessionActor.session.mode,
    showDiscoverFeedback
  ])

  // Handle Like fired from ProfilePreview via navigation param bounce.
  useEffect(() => {
    const target = route.params?.pendingLikeUserId
    if (!target) return
    const targetUser = discoverSourceUsers.find((user) => user.userId === target)
    if (isProductionDiscovery) {
      if (targetUser) {
        void decideProductionCandidate(targetUser, "like")
      } else {
        showDiscoverFeedback(lobbyCopy.unavailable, "soft")
      }
      navigation.setParams({ pendingLikeUserId: undefined })
      return
    }
    const inviteSent = sendInvite(target)
    if (!inviteSent) {
      showInviteDeliveryFailure()
      navigation.setParams({ pendingLikeUserId: undefined })
      return
    }
    addPendingInvite({
      userId: target,
      displayName: targetUser?.displayName ?? lobbyCopy.someone,
      sentAt: Date.now()
    })
    markCandidateSeen(target)
    navigation.setParams({ pendingLikeUserId: undefined })
  }, [
    addPendingInvite,
    decideProductionCandidate,
    discoverSourceUsers,
    isProductionDiscovery,
    lobbyCopy,
    markCandidateSeen,
    navigation,
    route.params?.pendingLikeUserId,
    sendInvite,
    showDiscoverFeedback,
    showInviteDeliveryFailure
  ])

  // Handle Pass fired from ProfilePreview through the same Discover decision path.
  useEffect(() => {
    const target = route.params?.pendingPassUserId
    if (!target) return
    const targetUser = discoverSourceUsers.find((user) => user.userId === target)
    if (isProductionDiscovery) {
      if (targetUser) {
        void decideProductionCandidate(targetUser, "pass")
      } else {
        showDiscoverFeedback(lobbyCopy.unavailable, "soft")
      }
      navigation.setParams({ pendingPassUserId: undefined })
      return
    }
    if (!isProductionDiscovery) {
      showDiscoverFeedback(lobbyCopy.passed, "soft")
      markCandidateSeen(target)
      void skipDiscoveryCandidate({
        ownerUserId: sessionActor.profile.userId,
        userId: target
      })
      captureProductEvent("discovery_decision", {
        decision: "pass",
        mode: sessionActor.session.mode
      })
    }
    navigation.setParams({ pendingPassUserId: undefined })
  }, [
    decideProductionCandidate,
    discoverSourceUsers,
    isProductionDiscovery,
    lobbyCopy,
    markCandidateSeen,
    navigation,
    route.params?.pendingPassUserId,
    sessionActor.profile.userId,
    sessionActor.session.mode,
    showDiscoverFeedback
  ])

  return {
    cardDragX,
    inFlightDecisionUserIds,
    handlePrimaryLike,
    handleSkipFeatured
  }
}
