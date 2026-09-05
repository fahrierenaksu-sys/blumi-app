import { useCallback, useEffect, useRef, useState } from "react"
import { AppState } from "react-native"
import type {
  CapabilityMap,
  CompleteAvatarSelection
} from "@blumi/contracts"
import { captureProductEvent } from "../../analytics/productAnalytics"
import {
  IS_BLUMI_DEMO_ENABLED,
  MOBILE_HTTP_BASE_URL
, IS_BLUMI_NATIVE_UI_TEST_SESSION_RESET } from "../../config/env"
import { saveProductionAvatar } from "../avatarV2/avatarApi"
import type { AvatarSaveOutcome } from "../avatarV2/avatarSaveOutcome"
import {
  createFailClosedCapabilityResolution,
  getSessionScopedCapabilities,
  resolveProductionCapabilities,
  SUPPORTED_MOBILE_CAPABILITIES,
  type SessionScopedCapabilities
} from "../capabilities/capabilityApi"
import { AVATAR_V2_CATALOG } from "../avatarV2/avatarV2.mock"
import { resolveInitialAvatarV2 } from "../avatarV2/avatarV2Persistence"
import {
  normalizeCompleteAvatarSelection,
  userAvatarToLoadout
} from "../avatarV2/avatarSelectionModel"
import type { UserAvatar } from "../avatarV2/avatarV2.types"
import type { UserRoomDecor } from "../roomV2/roomV2.types"
import {
  savePersonalRoomDecorReplacingCurrent
} from "../roomV2/personalRoomDecorApi"
import {
  completeProductionOnboardingStep,
  acknowledgeAccountModeration,
  AccountAccessError,
  fetchProductionAccountSnapshot,
  registerAccount,
  revokeProductionSession,
  sendVerificationCode,
  type RegisterAccountInput,
  type SendVerificationCodeInput,
  type UpdateSessionProfileInput,
  updateProductionProfile,
  updateSessionActorProfile
} from "./sessionApi"
import {
  needsModerationInterruption,
  type AccountModerationState
} from "./accountModeration"
import { logoutCurrentSession } from "./sessionLifecycle"
import { createSessionMutationCoordinator, SessionMutationCancelledError } from "./sessionMutationCoordinator"
import { persistUntouchedProfileStarterAvatar } from "./initialProfileAvatar"
import { getOnboardingSaveIntent } from "./onboardingFlowModel"
import { completeAndPersistSessionSetupStep } from "./onboardingCompletion"
import {
  completeSessionSetupStep,
  createDemoSessionActor,
  isOnboardingComplete,
  replaceSessionActorAvatar,
  shouldApplyProductionAccountSync,
  type SessionActor
} from "./sessionModel"
import {
  createSessionRefreshCoordinator,
  isSessionRefreshCancelled,
  refreshAndPersistSession,
  shouldRefreshSessionSoon
} from "./sessionRefresh"
import {
  clearSessionActor as clearStoredSessionActor,
  loadHasSeenIntro,
  loadSessionActor,
  resetNativeUiTestSessionState,
  saveHasSeenIntro,
  saveSessionActor
} from "./sessionStorage"
import {
  replayPreAuthOnboardingDraft,
  type PreAuthOnboardingDraft
} from "./preAuthOnboardingDraft"
import { getSecureSessionStorageRecoveryMessage } from "./sessionPersistence"
import { getSessionErrorMessageForDisplay } from "./sessionErrorCopy"
import { claimReferralInvite } from "../referrals/referralApi"
import {
  clearPendingReferralCode,
  loadPendingReferral,
  savePendingReferral
} from "../referrals/referralStorage"
import { subscribeToPendingReferralCapture } from "../referrals/referralCaptureSignal"
import {
  resolvePendingReferralClaim,
  shouldClaimCapturedReferral
} from "../referrals/referralModel"

export interface UseSessionStateResult {
  sessionActor: SessionActor | null
  hasSeenIntro: boolean
  isHydrating: boolean
  isBootstrapping: boolean
  errorMessage: string | null
  accountModeration: AccountModerationState | null
  resolvedCapabilities: CapabilityMap
  completeIntro: () => Promise<void>
  requestVerificationCode: (input: SendVerificationCodeInput) => Promise<void>
  registerSessionActor: (input: RegisterAccountInput) => Promise<void>
  registerSessionActorWithDraft: (
    input: RegisterAccountInput,
    draft: PreAuthOnboardingDraft<
      UpdateSessionProfileInput,
      UserAvatar,
      UserRoomDecor
    >,
    clearDraft: () => Promise<void>
  ) => Promise<void>
  startDemoSession: () => Promise<void>
  completeProfileSetup: (input: UpdateSessionProfileInput) => Promise<void>
  completeAvatarSetup: (avatar: UserAvatar) => Promise<void>
  saveAvatarSelectionOutcome: (
    avatar: UserAvatar,
    signal?: AbortSignal
  ) => Promise<AvatarSaveOutcome>
  saveAvatarSelection: (
    avatar: UserAvatar,
    signal?: AbortSignal
  ) => Promise<CompleteAvatarSelection>
  completeRoomSetup: () => Promise<void>
  updateSessionProfile: (input: UpdateSessionProfileInput) => Promise<void>
  clearErrorMessage: () => void
  acknowledgeModeration: () => Promise<void>
  refreshAccountModeration: () => Promise<void>
  clearSessionActor: () => Promise<void>
}

export function getErrorMessage(error: unknown): string {
  const secureStorageMessage = getSecureSessionStorageRecoveryMessage(error)
  if (secureStorageMessage) return secureStorageMessage
  return getSessionErrorMessageForDisplay(error)
}

function isAuthSessionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("sign in again")
  )
}

export function useSessionState(): UseSessionStateResult {
  const [sessionActor, setSessionActor] = useState<SessionActor | null>(null)
  const [hasSeenIntro, setHasSeenIntro] = useState(false)
  const [isHydrating, setIsHydrating] = useState(true)
  const [isBootstrapping, setIsBootstrapping] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [accountModeration, setAccountModeration] = useState<AccountModerationState | null>(null)
  const [resolvedCapabilityState, setResolvedCapabilityState] =
    useState<SessionScopedCapabilities>({
      sessionToken: null,
      capabilities: createFailClosedCapabilityResolution().capabilities
    })
  const sessionActorRef = useRef<SessionActor | null>(null)
  const mutationCoordinatorRef = useRef<ReturnType<typeof createSessionMutationCoordinator> | null>(null)
  if (!mutationCoordinatorRef.current) {
    mutationCoordinatorRef.current = createSessionMutationCoordinator({
      current: () => sessionActorRef.current,
      save: saveSessionActor,
      publish: (actor) => {
        sessionActorRef.current = actor
        setSessionActor(actor)
      }
    })
  }
  const mutationCoordinator = mutationCoordinatorRef.current
  const capturedSessionStartUserIdRef = useRef<string | null>(null)
  const appStateRef = useRef(AppState.currentState)
  const accountMutationGenerationRef = useRef(0)
  const productionSyncRef = useRef<{
    controller: AbortController
    promise: Promise<void>
  } | null>(null)
  const resolvedCapabilitiesRef = useRef<SessionScopedCapabilities>(
    resolvedCapabilityState
  )
  const commitResolvedCapabilities = useCallback((
    sessionToken: string | null,
    capabilities: CapabilityMap
  ): void => {
    const next = { sessionToken, capabilities }
    resolvedCapabilitiesRef.current = next
    setResolvedCapabilityState(next)
  }, [])
  const refreshCoordinatorRef = useRef<ReturnType<
    typeof createSessionRefreshCoordinator
  > | null>(null)
  if (!refreshCoordinatorRef.current) {
    refreshCoordinatorRef.current = createSessionRefreshCoordinator(
      async (actor, signal) => {
        const ticket = mutationCoordinator.capture(actor, false)
        const refreshed = await refreshAndPersistSession(MOBILE_HTTP_BASE_URL, actor, {
          signal,
          persistence: { save: async () => {} }
        })
        if (signal.aborted) throw new SessionMutationCancelledError()
        return mutationCoordinator.rotate(ticket, refreshed)
      }
    )
  }
  const refreshCoordinator = refreshCoordinatorRef.current

  useEffect(() => {
    sessionActorRef.current = sessionActor
    if (!sessionActor) capturedSessionStartUserIdRef.current = null
  }, [sessionActor])

  const productionSessionToken = sessionActor?.session.mode === "production"
    ? sessionActor.session.sessionToken
    : null
  const resolvedCapabilities = getSessionScopedCapabilities(
    productionSessionToken,
    resolvedCapabilityState
  )
  const capabilitiesForToken = useCallback((sessionToken: string): CapabilityMap =>
    getSessionScopedCapabilities(sessionToken, resolvedCapabilitiesRef.current), [])

  useEffect(() => {
    commitResolvedCapabilities(
      productionSessionToken,
      createFailClosedCapabilityResolution().capabilities
    )
    if (!productionSessionToken) return
    let active = true
    void resolveProductionCapabilities(
      MOBILE_HTTP_BASE_URL,
      productionSessionToken,
      SUPPORTED_MOBILE_CAPABILITIES
    ).then((resolution) => {
      if (!active) return
      const current = sessionActorRef.current
      if (
        current?.session.mode !== "production" ||
        current.session.sessionToken !== productionSessionToken
      ) return
      commitResolvedCapabilities(productionSessionToken, resolution.capabilities)
    })
    return () => {
      active = false
    }
  }, [commitResolvedCapabilities, productionSessionToken])

  useEffect(() => {
    if (isHydrating || !sessionActor) return
    if (capturedSessionStartUserIdRef.current === sessionActor.session.userId) return
    capturedSessionStartUserIdRef.current = sessionActor.session.userId
    captureProductEvent("activation_session_started", {
      mode: sessionActor.session.mode,
      lifecycle: isOnboardingComplete(sessionActor.session.onboarding)
        ? "returning"
        : "onboarding"
    })
  }, [isHydrating, sessionActor])

  const beginAccountMutation = useCallback(async (): Promise<void> => {
    accountMutationGenerationRef.current += 1
    const productionSync = productionSyncRef.current
    productionSync?.controller.abort()
    await productionSync?.promise.catch(() => undefined)
  }, [])

  useEffect(() => {
    let mounted = true

    async function refreshActorIfNeeded(actor: SessionActor): Promise<SessionActor> {
      if (!shouldRefreshSessionSoon(actor)) return actor
      const refreshedActor = await refreshCoordinator.refresh(actor)
      if (refreshedActor.session.userId !== actor.session.userId) {
        throw new Error("Blumi could not refresh your session safely.")
      }
      if (!mounted) return refreshedActor
      setSessionActor(refreshedActor)
      return refreshedActor
    }

    async function syncProductionProfile(
      actor: SessionActor,
      signal: AbortSignal,
      startedAtMutationGeneration: number
    ): Promise<void> {
      if (actor.session.mode !== "production") return
      try {
        const activeActor = await refreshActorIfNeeded(actor)
        const capabilityResolution = await resolveProductionCapabilities(
          MOBILE_HTTP_BASE_URL,
          activeActor.session.sessionToken,
          SUPPORTED_MOBILE_CAPABILITIES
        )
        if (!mounted || signal.aborted) return
        commitResolvedCapabilities(
          activeActor.session.sessionToken,
          capabilityResolution.capabilities
        )
        const latestSnapshot = await fetchProfileWithAuthRecovery(activeActor, signal)
        if (latestSnapshot.profile.userId !== activeActor.profile.userId) {
          throw new Error("Blumi could not refresh your profile safely.")
        }
        if (
          !mounted ||
          signal.aborted ||
          !shouldApplyProductionAccountSync(
            startedAtMutationGeneration,
            accountMutationGenerationRef.current
          )
        ) return
        const nextActor = {
          ...activeActor,
          session: {
            ...activeActor.session,
            onboarding: latestSnapshot.onboarding
          },
          profile: latestSnapshot.profile
        }
        await saveSessionActor(nextActor)
        if (!mounted || signal.aborted) return
        setAccountModeration(
          needsModerationInterruption(latestSnapshot.moderation)
            ? latestSnapshot.moderation
            : null
        )
        setSessionActor((current) =>
          current?.session.userId === activeActor.session.userId
            ? nextActor
            : current
        )
      } catch (error) {
        if (!mounted) return
        if (signal.aborted) return
        if (isSessionRefreshCancelled(error)) return
        if (error instanceof AccountAccessError) {
          setAccountModeration(error.moderation)
          return
        }
        if (isAuthSessionError(error)) {
          await clearStoredSessionActor("production")
          setSessionActor(null)
          return
        }
        setErrorMessage(getErrorMessage(error))
      }
    }

    async function fetchProfileWithAuthRecovery(
      actor: SessionActor,
      signal: AbortSignal
    ) {
      try {
        return await fetchProductionAccountSnapshot(
          MOBILE_HTTP_BASE_URL,
          actor.session.sessionToken,
          fetch,
          signal,
          capabilitiesForToken(actor.session.sessionToken)
        )
      } catch (error) {
        if (!isAuthSessionError(error)) throw error
        const refreshedActor = await refreshCoordinator.refresh(actor)
        if (refreshedActor.session.userId !== actor.session.userId) {
          throw new Error("Blumi could not refresh your session safely.")
        }
        if (mounted) setSessionActor(refreshedActor)
        return fetchProductionAccountSnapshot(
          MOBILE_HTTP_BASE_URL,
          refreshedActor.session.sessionToken,
          fetch,
          signal,
          capabilitiesForToken(refreshedActor.session.sessionToken)
        )
      }
    }

    function startProductionProfileSync(actor: SessionActor): void {
      const controller = new AbortController()
      const startedAtMutationGeneration = accountMutationGenerationRef.current
      const promise = syncProductionProfile(
        actor,
        controller.signal,
        startedAtMutationGeneration
      )
      const work = { controller, promise }
      productionSyncRef.current = work
      void promise.finally(() => {
        if (productionSyncRef.current === work) {
          productionSyncRef.current = null
        }
      })
    }

    const nativeUiTestReset = IS_BLUMI_NATIVE_UI_TEST_SESSION_RESET
      ? resetNativeUiTestSessionState()
      : Promise.resolve()

    Promise.allSettled([
      nativeUiTestReset.then(loadSessionActor),
      nativeUiTestReset.then(loadHasSeenIntro)
    ])
      .then(([sessionResult, introResult]) => {
        if (!mounted) {
          return
        }

        if (sessionResult.status === "fulfilled") {
          sessionActorRef.current = sessionResult.value
          setSessionActor(sessionResult.value)
          if (sessionResult.value) {
            startProductionProfileSync(sessionResult.value)
          }
        } else {
          setSessionActor(null)
          setErrorMessage(getErrorMessage(sessionResult.reason))
        }

        if (introResult.status === "fulfilled") {
          setHasSeenIntro(introResult.value)
        } else {
          setErrorMessage(getErrorMessage(introResult.reason))
        }
      })
      .finally(() => {
        if (!mounted) {
          return
        }
        setIsHydrating(false)
      })

    return () => {
      mounted = false
    }
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [])

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      const previousState = appStateRef.current
      appStateRef.current = state
      const actor = sessionActorRef.current
      if (state === "active" && previousState !== "active" && actor) {
        captureProductEvent("engagement_app_foregrounded", {
          mode: actor.session.mode
        })
      }
      if (state !== "active") return
      if (!actor || !shouldRefreshSessionSoon(actor)) return

      void refreshCoordinator.refresh(actor)
        .then((refreshedActor) => {
          if (refreshedActor.session.userId !== actor.session.userId) {
            throw new Error("Blumi could not refresh your session safely.")
          }
          setSessionActor(refreshedActor)
        })
        .catch((error) => {
          if (isSessionRefreshCancelled(error)) return
          if (isAuthSessionError(error)) {
            void clearStoredSessionActor("production").then(() => setSessionActor(null))
            return
          }
          if (error instanceof AccountAccessError) {
            setAccountModeration(error.moderation)
            return
          }
          setErrorMessage(getErrorMessage(error))
        })
    })

    return () => {
      subscription.remove()
    }
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [])

  const completeIntro = useCallback(async (): Promise<void> => {
    setIsBootstrapping(true)
    setErrorMessage(null)
    try {
      await saveHasSeenIntro()
      setHasSeenIntro(true)
      captureProductEvent("onboarding_step_completed", { step: "intro" })
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
      throw error
    } finally {
      setIsBootstrapping(false)
    }
  }, [])

  const claimPendingReferral = useCallback(async (actor: SessionActor): Promise<void> => {
    if (actor.session.mode !== "production") return
    const pending = await loadPendingReferral()
    if (!pending) return
    const resolution = resolvePendingReferralClaim(pending, actor.profile.userId)
    if (resolution.kind === "discard") {
      await clearPendingReferralCode()
      return
    }
    await savePendingReferral(resolution.pending)
    try {
      await claimReferralInvite(
        MOBILE_HTTP_BASE_URL,
        actor.session.sessionToken,
        resolution.pending.code
      )
      captureProductEvent("referral_attribution_submitted", {
        source: "deep_link"
      })
      await clearPendingReferralCode()
    } catch (error) {
      console.warn("Referral attribution could not be saved yet.", error)
    }
  }, [])

  useEffect(() => {
    if (sessionActor?.session.mode !== "production") return
    void claimPendingReferral(sessionActor)
  }, [claimPendingReferral, sessionActor])

  useEffect(() => subscribeToPendingReferralCapture(() => {
    const actor = sessionActorRef.current
    if (!actor || !shouldClaimCapturedReferral(actor.session)) return
    void claimPendingReferral(actor)
  }), [claimPendingReferral])

  const registerSessionActor = useCallback(
    async (input: RegisterAccountInput): Promise<void> => {
      const replacement = mutationCoordinator.beginReplacement()
      setIsBootstrapping(true)
      setErrorMessage(null)
      try {
        const nextSessionActor = await registerAccount(MOBILE_HTTP_BASE_URL, input)
        await mutationCoordinator.replace(nextSessionActor, replacement)
        setAccountModeration(null)
        captureProductEvent("onboarding_step_completed", { step: "account" })
      } catch (error) {
        setErrorMessage(getErrorMessage(error))
        throw error
      } finally {
        setIsBootstrapping(false)
      }
    },
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
    [claimPendingReferral, mutationCoordinator]
  )

  const registerSessionActorWithDraft = useCallback(
    async (
      input: RegisterAccountInput,
      draft: PreAuthOnboardingDraft<
        UpdateSessionProfileInput,
        UserAvatar,
        UserRoomDecor
      >,
      clearDraft: () => Promise<void>
    ): Promise<void> => {
      const replacement = mutationCoordinator.beginReplacement()
      setIsBootstrapping(true)
      setErrorMessage(null)
      try {
        let completedActor: SessionActor | null = null
        let registrationCapabilities = createFailClosedCapabilityResolution().capabilities
        await replayPreAuthOnboardingDraft(draft, {
          register: async () => {
            const actor = await registerAccount(MOBILE_HTTP_BASE_URL, input)
            const resolution = await resolveProductionCapabilities(
              MOBILE_HTTP_BASE_URL,
              actor.session.sessionToken,
              SUPPORTED_MOBILE_CAPABILITIES
            )
            registrationCapabilities = resolution.capabilities
            return actor
          },
          saveProfile: async (actor, profile) => {
            const savedProfile = await updateProductionProfile(
              MOBILE_HTTP_BASE_URL,
              actor.session.sessionToken,
              profile
            )
            completedActor = { ...actor, profile: savedProfile }
          },
          saveAvatar: async (actor, avatar) => {
            const activeActor = completedActor ?? actor
            const current = normalizeCompleteAvatarSelection(activeActor.profile.avatar)
            const result = await saveProductionAvatar(
              MOBILE_HTTP_BASE_URL,
              actor.session.sessionToken,
              {
                loadout: userAvatarToLoadout(avatar),
                revision: current?.revision ?? 0
              },
              undefined,
              undefined,
              registrationCapabilities
            )
            if (result.kind === "conflict") {
              throw new Error("Your avatar changed on another device. Sign in to continue safely.")
            }
            completedActor = replaceSessionActorAvatar(activeActor, result.selection)
          },
          saveRoom: async (actor, room) => {
            const result = await savePersonalRoomDecorReplacingCurrent(
              MOBILE_HTTP_BASE_URL,
              actor.session.sessionToken,
              room
            )
            if (result.kind === "conflict") {
              throw new Error("Your room already has newer changes. Sign in to continue safely.")
            }
          },
          completeOnboarding: async (actor) => {
            let activeActor = completedActor ?? actor
            for (const step of ["profile", "avatar", "room"] as const) {
              const onboarding = await completeProductionOnboardingStep(
                MOBILE_HTTP_BASE_URL,
                actor.session.sessionToken,
                step
              )
              activeActor = {
                ...activeActor,
                session: { ...activeActor.session, onboarding }
              }
            }
            completedActor = activeActor
          },
          clearDraft: async () => {
            if (!completedActor) {
              throw new Error("Blumi could not finish your setup safely.")
            }
            await mutationCoordinator.replace(completedActor, replacement)
            await clearDraft()
          }
        })
        if (!completedActor) {
          throw new Error("Blumi could not finish your setup safely.")
        }
        setAccountModeration(null)
        captureProductEvent("onboarding_step_completed", { step: "account" })
      } catch (error) {
        setErrorMessage(getErrorMessage(error))
        throw error
      } finally {
        setIsBootstrapping(false)
      }
    },
    [mutationCoordinator]
  )

  const requestVerificationCode = useCallback(
    async (input: SendVerificationCodeInput): Promise<void> => {
      setIsBootstrapping(true)
      setErrorMessage(null)
      try {
        await sendVerificationCode(MOBILE_HTTP_BASE_URL, input)
      } catch (error) {
        setErrorMessage(getErrorMessage(error))
        throw error
      } finally {
        setIsBootstrapping(false)
      }
    },
    []
  )

  const startDemoSession = useCallback(async (): Promise<void> => {
    if (!IS_BLUMI_DEMO_ENABLED) {
      throw new Error("Demo sessions are unavailable in this build.")
    }
    const replacement = mutationCoordinator.beginReplacement()
    setIsBootstrapping(true)
    setErrorMessage(null)
    try {
      const nextSessionActor = createDemoSessionActor({
        displayName: "Demo Vibe",
        age: 24,
        avatarPresetId: "sunset"
      })
      await mutationCoordinator.replace(nextSessionActor, replacement)
      setAccountModeration(null)
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
      throw error
    } finally {
      setIsBootstrapping(false)
    }
  }, [mutationCoordinator])

  const clearSessionActor = useCallback(async (): Promise<void> => {
    setIsBootstrapping(true)
    setErrorMessage(null)
    const actorToRevoke = sessionActor
    mutationCoordinator.invalidate()
    accountMutationGenerationRef.current += 1
    sessionActorRef.current = null
    setSessionActor(null)
    setAccountModeration(null)
    try {
      // Queue the clear immediately, before a new login can enqueue its write.
      const productionSync = productionSyncRef.current
      productionSync?.controller.abort()
      // Abort synchronously before queueing clear: aborted refreshes cannot
      // enqueue behind a clear that is waiting for them to finish.
      const cancellation = Promise.all([
        refreshCoordinator.cancelAndWait(),
        productionSync?.promise.catch(() => undefined)
      ])
      const clearing = mutationCoordinator.clear(async () => {
          await cancellation
          await clearStoredSessionActor(actorToRevoke?.session.mode)
      })
      await logoutCurrentSession({
        revoke:
          actorToRevoke?.session.mode === "production"
            ? () => revokeProductionSession(
                MOBILE_HTTP_BASE_URL,
                actorToRevoke.session.sessionToken
              )
            : undefined,
        clear: () => clearing
      })
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
      throw error
    } finally {
      setIsBootstrapping(false)
    }
  }, [mutationCoordinator, refreshCoordinator, sessionActor])

  const persistProfileUpdate = useCallback(
    async (
      input: UpdateSessionProfileInput,
      completedSetupStep: "profile" | "avatar" | null
    ): Promise<void> => {
      setIsBootstrapping(true)
      setErrorMessage(null)
      try {
        if (!sessionActor) {
          throw new Error("No active session")
        }
        const mutationTicket = mutationCoordinator.capture(sessionActor)
        await beginAccountMutation()
        let updatedActor = updateSessionActorProfile(sessionActor, input)
        if (sessionActor.session.mode === "production") {
          const savedProfile = await updateProductionProfile(
            MOBILE_HTTP_BASE_URL,
            sessionActor.session.sessionToken,
            input
          )
          if (savedProfile.userId !== sessionActor.profile.userId) {
            throw new Error("Blumi could not save your profile safely.")
          }
          updatedActor = {
            ...sessionActor,
            profile: savedProfile
          }
        }
        let nextSessionActor = await persistUntouchedProfileStarterAvatar(
          updatedActor,
          {
            catalog: AVATAR_V2_CATALOG,
            fallbackAvatar: resolveInitialAvatarV2(
              updatedActor.profile.avatar.presetId
            ),
            saveProductionAvatar: ({ avatar, revision, sessionToken }) =>
              saveProductionAvatar(
                MOBILE_HTTP_BASE_URL,
                sessionToken,
                { loadout: userAvatarToLoadout(avatar), revision },
                undefined,
                undefined,
                capabilitiesForToken(sessionToken)
              )
          }
        )
        if (completedSetupStep) {
          if (nextSessionActor.session.mode === "production") {
            const onboarding = await completeProductionOnboardingStep(
              MOBILE_HTTP_BASE_URL,
              nextSessionActor.session.sessionToken,
              completedSetupStep
            )
            nextSessionActor = {
              ...nextSessionActor,
              session: {
                ...nextSessionActor.session,
                onboarding
              }
            }
          } else {
            nextSessionActor = completeSessionSetupStep(
              nextSessionActor,
              completedSetupStep
            )
          }
        }
        await mutationCoordinator.commit(mutationTicket, nextSessionActor)
      } catch (error) {
        if (error instanceof SessionMutationCancelledError) throw error
        setErrorMessage(getErrorMessage(error))
        throw error
      } finally {
        setIsBootstrapping(false)
      }
    },
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
    [beginAccountMutation, mutationCoordinator, sessionActor]
  )

  const updateSessionProfile = useCallback(
    async (input: UpdateSessionProfileInput): Promise<void> => {
      await persistProfileUpdate(input, null)
    },
    [persistProfileUpdate]
  )

  const completeProfileSetup = useCallback(
    async (input: UpdateSessionProfileInput): Promise<void> => {
      const intent = sessionActor
        ? getOnboardingSaveIntent("profile", sessionActor.session.onboarding)
        : "update-and-complete"
      await persistProfileUpdate(
        input,
        intent === "update-and-complete" ? "profile" : null
      )
      if (intent === "update-and-complete") {
        captureProductEvent("onboarding_step_completed", { step: "profile" })
      }
    },
    [persistProfileUpdate, sessionActor]
  )

  const saveAvatarSelectionOutcome = useCallback(
    async (
      avatar: UserAvatar,
      signal?: AbortSignal,
      existingTicket?: ReturnType<typeof mutationCoordinator.capture>
    ): Promise<AvatarSaveOutcome> => {
      setErrorMessage(null)
      try {
        const actor = sessionActor
        if (!actor?.session) {
          throw new Error("Your session needs to be refreshed.")
        }
        const mutationTicket = existingTicket ?? mutationCoordinator.capture(actor)
        await beginAccountMutation()
        const current = normalizeCompleteAvatarSelection(
          actor.profile.avatar
        )
        const revision = current?.revision ?? 0
        let selection: CompleteAvatarSelection
        if (actor.session.mode === "production") {
          const result = await saveProductionAvatar(
            MOBILE_HTTP_BASE_URL,
            actor.session.sessionToken,
            { loadout: userAvatarToLoadout(avatar), revision },
            undefined,
            signal,
            capabilitiesForToken(actor.session.sessionToken)
          )
          if (result.kind === "conflict") {
            const canonicalActor = replaceSessionActorAvatar(
              actor,
              result.current
            )
            await mutationCoordinator.commit(mutationTicket, canonicalActor)
            return {
              kind: "conflict",
              current: result.current,
              message: "Your avatar changed on another device. Review the latest look and try again."
            }
          }
          selection = result.selection
        } else {
          selection = {
            presetId: avatar.bodyId,
            revision: revision + 1,
            loadout: userAvatarToLoadout(avatar)
          }
        }
        const nextActor = replaceSessionActorAvatar(actor, selection)
        await mutationCoordinator.commit(mutationTicket, nextActor)
        return { kind: "updated", selection }
      } catch (error) {
        if (error instanceof SessionMutationCancelledError) throw error
        setErrorMessage(getErrorMessage(error))
        throw error
      }
    },
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
    [beginAccountMutation, mutationCoordinator, sessionActor]
  )

  const saveAvatarSelection = useCallback(
    async (
      avatar: UserAvatar,
      signal?: AbortSignal
    ): Promise<CompleteAvatarSelection> => {
      const outcome = await saveAvatarSelectionOutcome(avatar, signal)
      if (outcome.kind === "conflict") {
        throw new Error(outcome.message)
      }
      return outcome.selection
    },
    [saveAvatarSelectionOutcome]
  )

  const completeAvatarSetup = useCallback(
    async (avatar: UserAvatar): Promise<void> => {
      setIsBootstrapping(true)
      setErrorMessage(null)
      try {
        const actor = sessionActor
        if (!actor?.session) {
          throw new Error("Your session needs to be refreshed.")
        }
        const intent = getOnboardingSaveIntent(
          "avatar",
          actor.session.onboarding
        )
        const mutationTicket = mutationCoordinator.capture(actor)
            const outcome = await saveAvatarSelectionOutcome(avatar, undefined, mutationTicket)
            if (outcome.kind === "conflict") {
              throw new Error(outcome.message)
            }
        const selection = outcome.selection
        const actorWithAvatar = replaceSessionActorAvatar(actor, selection)
        let nextActor = actorWithAvatar
        if (intent === "update-and-complete") {
          nextActor = await completeAndPersistSessionSetupStep({
            actor: actorWithAvatar,
            step: "avatar",
            completeProductionStep: (step) => completeProductionOnboardingStep(
              MOBILE_HTTP_BASE_URL,
              actorWithAvatar.session.sessionToken,
              step
            ),
            saveActor: (next) => mutationCoordinator.commit(mutationTicket, next)
          })
        } else {
          await mutationCoordinator.commit(mutationTicket, nextActor)
        }
        if (intent === "update-and-complete") {
          captureProductEvent("onboarding_step_completed", { step: "avatar" })
        }
      } catch (error) {
        if (error instanceof SessionMutationCancelledError) throw error
        setErrorMessage(getErrorMessage(error))
        throw error
      } finally {
        setIsBootstrapping(false)
      }
    },
        [mutationCoordinator, saveAvatarSelectionOutcome, sessionActor]
      )

  const completeRoomSetup = useCallback(async (): Promise<void> => {
    setIsBootstrapping(true)
    setErrorMessage(null)
    try {
      const actor = sessionActor
      if (!actor?.session) {
        throw new Error("Your session needs to be refreshed.")
      }
      const mutationTicket = mutationCoordinator.capture(actor)
      await beginAccountMutation()
      await completeAndPersistSessionSetupStep({
        actor,
        step: "room",
        completeProductionStep: (step) => completeProductionOnboardingStep(
          MOBILE_HTTP_BASE_URL,
          actor.session.sessionToken,
          step
        ),
        saveActor: (next) => mutationCoordinator.commit(mutationTicket, next)
      })
      captureProductEvent("activation_first_room_change", {
        mode: actor.session.mode
      })
      captureProductEvent("onboarding_step_completed", { step: "room" })
    } catch (error) {
      if (error instanceof SessionMutationCancelledError) throw error
      setErrorMessage(getErrorMessage(error))
      throw error
    } finally {
      setIsBootstrapping(false)
    }
  }, [beginAccountMutation, mutationCoordinator, sessionActor])

  const clearErrorMessage = useCallback((): void => {
    setErrorMessage(null)
  }, [])

  const acknowledgeModeration = useCallback(async (): Promise<void> => {
    if (!sessionActor || sessionActor.session.mode !== "production") return
    setIsBootstrapping(true)
    setErrorMessage(null)
    try {
      const moderation = await acknowledgeAccountModeration(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken
      )
      setAccountModeration(needsModerationInterruption(moderation) ? moderation : null)
    } catch (error) {
      if (error instanceof AccountAccessError) {
        setAccountModeration(error.moderation)
      }
      setErrorMessage(getErrorMessage(error))
      throw error
    } finally {
      setIsBootstrapping(false)
    }
  }, [sessionActor])

  const refreshAccountModeration = useCallback(async (): Promise<void> => {
    if (!sessionActor || sessionActor.session.mode !== "production") return
    try {
      const snapshot = await fetchProductionAccountSnapshot(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken,
        undefined,
        undefined,
        capabilitiesForToken(sessionActor.session.sessionToken)
      )
      setAccountModeration(
        needsModerationInterruption(snapshot.moderation) ? snapshot.moderation : null
      )
    } catch (error) {
      if (error instanceof AccountAccessError) {
        setAccountModeration(error.moderation)
      }
    }
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [sessionActor])

  return {
    sessionActor,
    hasSeenIntro,
    isHydrating,
    isBootstrapping,
    errorMessage,
    accountModeration,
    resolvedCapabilities,
    completeIntro,
    requestVerificationCode,
    registerSessionActor,
    registerSessionActorWithDraft,
    startDemoSession,
    completeProfileSetup,
    completeAvatarSetup,
    saveAvatarSelectionOutcome,
    saveAvatarSelection,
    completeRoomSetup,
    updateSessionProfile,
    clearErrorMessage,
    acknowledgeModeration,
    refreshAccountModeration,
    clearSessionActor
  }
}
