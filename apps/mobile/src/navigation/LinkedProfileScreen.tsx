import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useEffect, useState } from "react"
import { ActivityIndicator, Pressable, Text, View } from "react-native"
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

function LoadingProfile() {
  const copy = getProfilePreviewCopy(getAppLocale())
  return (
    <View style={styles.fallback}>
      <ActivityIndicator size="small" color={uiTheme.colors.primary} />
      <Text style={styles.fallbackText}>{copy.loading}</Text>
    </View>
  )
}

export function LinkedProfileScreen(props: LinkedProfileScreenProps) {
  const { demoMode, navigation, route, sessionActor, sessionToken } = props
  const copy = getProfilePreviewCopy(getAppLocale())
  const directProfile = "profile" in route.params ? route.params.profile : undefined
  const deepLinkedUserId = "userId" in route.params ? route.params.userId : undefined
  const target: LinkedProfileTarget<ProfilePreviewData> | null = directProfile
    ? { kind: "direct", profile: directProfile }
    : deepLinkedUserId
      ? { kind: "remote", userId: deepLinkedUserId }
      : null
  const [loadState, setLoadState] = useState(
    createLinkedProfileLoadState<ProfilePreviewData>(
      directProfile ? null : deepLinkedUserId ?? null
    )
  )
  const [retryNonce, setRetryNonce] = useState(0)

  useEffect(() => {
    if (directProfile || !deepLinkedUserId) {
      setLoadState(createLinkedProfileLoadState(null))
      return
    }
    const userId = deepLinkedUserId
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
        setLoadState((state) => resolveLinkedProfileRequest(state, userId, {
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
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [deepLinkedUserId, demoMode, directProfile, retryNonce, sessionToken])

  const viewState = target
    ? getLinkedProfileViewState(target, loadState)
    : {
        profile: null,
        loadError: "unavailable" as const,
        loading: false
      }

  if (viewState.profile) {
    return (
      <ProfilePreviewScreen
        navigation={navigation}
        route={route}
        sessionActor={sessionActor}
        profileOverride={viewState.profile}
      />
    )
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
                createLinkedProfileLoadState(deepLinkedUserId ?? null)
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
  }
}
