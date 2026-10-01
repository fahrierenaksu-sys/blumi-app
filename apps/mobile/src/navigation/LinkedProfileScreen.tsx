import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useEffect, useEffectEvent, useState, type ReactNode } from "react"
import { Pressable, Text, View } from "react-native"
import Reanimated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming
} from "react-native-reanimated"
import { createCandidateAvatarSnapshot } from "../features/avatarV2/candidateAvatarSnapshot"
import { DUMMY_PROFILES } from "../features/demo/dummyProfiles"
import {
  DiscoveryProfileUnavailableError,
  fetchDiscoverProfile,
  type DiscoverProfileResponse
} from "../features/discovery/discoveryApi"
import { getProfilePreviewCopy } from "../features/discovery/profilePreviewCopy"
import { MOBILE_HTTP_BASE_URL } from "../config/env"
import {
  ProfilePreviewScreen,
  toProfilePreviewPrompts,
  type ProfilePreviewData
} from "../screens/ProfilePreviewScreen"
import type { SessionActor } from "../features/session/sessionModel"
import { getAppLocale } from "../features/session/appLocale"
import type { RootStackParamList } from "./RootNavigator"
import { uiTheme } from "../ui/theme"
import { useReducedMotion } from "../ui/animations"
import {
  createLinkedProfileLoadState,
  failLinkedProfileRequest,
  getLinkedProfileViewState,
  resolveLinkedProfileRequest,
  type LinkedProfileTarget
} from "./linkedProfileResolutionModel"

function createDeepLinkedProfile(
  response: DiscoverProfileResponse
): ProfilePreviewData {
  const { profile } = response
  const copy = getProfilePreviewCopy(getAppLocale())
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    profileUpdatedAt: profile.updatedAt,
    age: profile.age,
    avatarSnapshot: createCandidateAvatarSnapshot({
      userId: profile.userId,
      displayName: profile.displayName,
      avatarPresetId: profile.avatarPresetId,
      avatarSelection: profile.avatar
    }),
    headline: copy.deepLinkHeadline,
    vibeLine: profile.vibeTags.join(" · "),
    tags: [...profile.vibeTags],
    bio: profile.bio ?? "",
    cues: [],
    prompts: toProfilePreviewPrompts(profile.prompts),
    decisionCapability: response.decision.capability,
    blocked: false,
    isSelf: false,
    spotId: `backend:${profile.userId}`,
    distanceLabel: profile.distanceLabel
  }
}

type LinkedProfileScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "ProfilePreview"
> & {
  sessionToken: string
  demoMode: boolean
  sessionActor: SessionActor
}

const SKELETON_PULSE_MIN_OPACITY = 0.55
const SKELETON_PULSE_HALF_MS = 800
const SKELETON_AVATAR_SIZE = 72
const PROFILE_REVEAL_DURATION_MS = 160

// A card-shaped placeholder announced once as a progress element; its shapes
// are hidden from assistive technology and hold still under Reduce Motion.
export function LoadingProfile() {
  const copy = getProfilePreviewCopy(getAppLocale())
  const reduceMotion = useReducedMotion()
  const pulse = useSharedValue(1)

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(pulse)
      pulse.value = 1
      return undefined
    }
    pulse.value = withRepeat(
      withTiming(SKELETON_PULSE_MIN_OPACITY, {
        duration: SKELETON_PULSE_HALF_MS,
        easing: Easing.inOut(Easing.ease)
      }),
      -1,
      true
    )
    return () => cancelAnimation(pulse)
  }, [pulse, reduceMotion])

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }))

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={copy.loading}
      accessibilityState={{ busy: true }}
      style={styles.fallback}
    >
      <Reanimated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.skeletonCard, pulseStyle]}
      >
        <View style={styles.skeletonAvatar} />
        <View style={[styles.skeletonBar, styles.skeletonTitleBar]} />
        <View style={[styles.skeletonBar, styles.skeletonLineBar]} />
      </Reanimated.View>
      <Text style={styles.fallbackText}>{copy.loading}</Text>
    </View>
  )
}

// A profile that arrives after loading fades in instead of replacing the
// placeholder in one frame; Reduce Motion shows it at once.
function LinkedProfileReveal(props: { children: ReactNode }) {
  const reduceMotion = useReducedMotion()
  const opacity = useSharedValue(reduceMotion ? 1 : 0)

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(opacity)
      opacity.value = 1
      return undefined
    }
    opacity.value = withTiming(1, {
      duration: PROFILE_REVEAL_DURATION_MS,
      easing: Easing.out(Easing.cubic)
    })
    return () => cancelAnimation(opacity)
  }, [opacity, reduceMotion])

  const revealStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  return (
    <Reanimated.View style={[styles.reveal, revealStyle]}>
      {props.children}
    </Reanimated.View>
  )
}

export function LinkedProfileScreen(props: LinkedProfileScreenProps) {
  const { demoMode, navigation, route, sessionActor, sessionToken } = props
  const copy = getProfilePreviewCopy(getAppLocale())
  const directProfile = "profile" in route.params ? route.params.profile : undefined
  const deepLinkedUserId = "userId" in route.params ? route.params.userId : undefined
  // A production card is a snapshot, not authority for the opened profile.
  const requestUserId = deepLinkedUserId ?? (!demoMode && directProfile && !directProfile.isSelf ? directProfile.userId : undefined)
  const target: LinkedProfileTarget<ProfilePreviewData> | null = requestUserId
    ? { kind: "remote", userId: requestUserId }
    : directProfile
    ? { kind: "direct", profile: directProfile }
    : null
  const [loadState, setLoadState] = useState(
    createLinkedProfileLoadState<ProfilePreviewData>(
      requestUserId ?? null
    )
  )
  const [retryNonce, setRetryNonce] = useState(0)
  // Demo labels follow the current locale without restarting the request.
  const createDemoLinkedProfile = useEffectEvent((
    demoProfile: (typeof DUMMY_PROFILES)[number]
  ): ProfilePreviewData => ({
    userId: demoProfile.userId,
    displayName: demoProfile.displayName,
    age: demoProfile.age,
    headline: copy.discoverProfile,
    vibeLine: demoProfile.bio,
    tags: [],
    bio: demoProfile.bio,
    cues: [],
    prompts: [],
    decisionCapability: "live-invite",
    blocked: false,
    isSelf: false,
    spotId: `demo:${demoProfile.userId}`,
    distanceLabel: copy.availableNow
  }))

  useEffect(() => {
    if (!requestUserId) {
      setLoadState(createLinkedProfileLoadState(null))
      return
    }
    const userId = requestUserId
    const controller = new AbortController()
    let isActive = true

    setLoadState(createLinkedProfileLoadState(userId))

    async function resolveProfile(): Promise<void> {
      if (demoMode) {
        const demoProfile = DUMMY_PROFILES.find((profile) => profile.userId === userId)
        if (!demoProfile) {
          setLoadState((state) =>
            failLinkedProfileRequest(state, userId, "unavailable")
          )
          return
        }
        const profile = createDemoLinkedProfile(demoProfile)
        setLoadState((state) => resolveLinkedProfileRequest(state, userId, profile))
        return
      }

      try {
        const profile = await fetchDiscoverProfile(
          MOBILE_HTTP_BASE_URL,
          sessionToken,
          userId,
          fetch,
          controller.signal
        )
        if (!isActive) return
        setLoadState((state) =>
          resolveLinkedProfileRequest(
            state,
            userId,
            createDeepLinkedProfile(profile)
          )
        )
      } catch (error) {
        if (!isActive || controller.signal.aborted) return
        setLoadState((state) =>
          failLinkedProfileRequest(
            state,
            userId,
            error instanceof DiscoveryProfileUnavailableError
              ? "unavailable"
              : "failed"
          )
        )
      }
    }

    void resolveProfile()
    return () => {
      isActive = false
      controller.abort()
    }
  }, [requestUserId, demoMode, retryNonce, sessionToken])

  const viewState = target
    ? getLinkedProfileViewState(target, loadState)
    : {
        profile: null,
        loadError: "unavailable" as const,
        loading: false
      }

  if (viewState.profile) {
    const profileScreen = (
      <ProfilePreviewScreen
        navigation={navigation}
        route={route}
        sessionActor={sessionActor}
        profileOverride={viewState.profile}
      />
    )
    // Only a fetched profile passed through the loading placeholder.
    return target?.kind === "remote"
      ? <LinkedProfileReveal>{profileScreen}</LinkedProfileReveal>
      : profileScreen
  }

  if (viewState.loadError) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackTitle}>
          {viewState.loadError === "unavailable"
            ? copy.unavailableTitle
            : copy.failedTitle}
        </Text>
        <Text style={styles.fallbackText}>
          {viewState.loadError === "unavailable"
            ? copy.unavailableBody
            : copy.failedBody}
        </Text>
        {viewState.loadError === "failed" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.tryAgain}
            onPress={() => {
              setLoadState(
                createLinkedProfileLoadState(requestUserId ?? null)
              )
              setRetryNonce((value) => value + 1)
            }}
            style={styles.action}
          >
          <Text style={styles.actionText}>{copy.tryAgain}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.backToDiscover}
          onPress={() => navigation.navigate("Lobby")}
          style={styles.secondaryAction}
        >
          <Text style={styles.secondaryActionText}>{copy.backToDiscover}</Text>
        </Pressable>
      </View>
    )
  }

  return <LoadingProfile />
}

const styles = {
  fallback: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: uiTheme.colors.background,
    gap: uiTheme.spacing.sm
  },
  fallbackText: {
    color: uiTheme.colors.textMuted,
    ...uiTheme.font.bodySmall,
    textAlign: "center" as const,
    maxWidth: 280,
    fontWeight: "600" as const
  },
  fallbackTitle: {
    color: uiTheme.colors.textPrimary,
    ...uiTheme.font.subheading,
    textAlign: "center" as const,
    maxWidth: 280
  },
  action: {
    marginTop: uiTheme.spacing.sm,
    paddingHorizontal: uiTheme.spacing.xl,
    paddingVertical: uiTheme.spacing.sm,
    borderRadius: uiTheme.radius.full,
    backgroundColor: uiTheme.colors.primary
  },
  actionText: {
    color: "#FFFFFF",
    ...uiTheme.font.bodySmall,
    fontWeight: "800" as const
  },
  secondaryAction: {
    paddingHorizontal: uiTheme.spacing.lg,
    paddingVertical: uiTheme.spacing.sm
  },
  secondaryActionText: {
    color: uiTheme.colors.primaryDeep,
    ...uiTheme.font.bodySmall,
    fontWeight: "700" as const
  },
  skeletonCard: {
    alignItems: "center" as const,
    gap: uiTheme.spacing.sm,
    width: 220,
    paddingVertical: uiTheme.spacing.xl,
    paddingHorizontal: uiTheme.spacing.lg,
    borderRadius: uiTheme.radius.xl,
    backgroundColor: uiTheme.colors.surface
  },
  skeletonAvatar: {
    width: SKELETON_AVATAR_SIZE,
    height: SKELETON_AVATAR_SIZE,
    borderRadius: SKELETON_AVATAR_SIZE / 2,
    marginBottom: uiTheme.spacing.xs,
    backgroundColor: uiTheme.colors.primarySoft
  },
  skeletonBar: {
    borderRadius: uiTheme.radius.full
  },
  skeletonTitleBar: {
    width: "62%" as const,
    height: 14,
    backgroundColor: uiTheme.colors.primarySoft
  },
  skeletonLineBar: {
    width: "84%" as const,
    height: 10,
    backgroundColor: uiTheme.colors.surfaceMuted
  },
  reveal: {
    flex: 1
  }
}
