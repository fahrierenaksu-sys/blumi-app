import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useEffect, useRef, useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import Reanimated, { useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from "react-native-reanimated"
import { getProfileHeroStretch } from "../features/discovery/profilePreviewHeroModel"
import { hapticLight } from "../ui/haptics"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import {
  CandidateAvatarPreview,
  createCandidateAvatarSnapshot,
  type CandidateAvatarSnapshot
} from "../components/DiscoverCard"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { getLobbyReturnStrategy, goBackOrFallback } from "../navigation/rootNavigationModel"
import { ReportModal } from "../components/ReportModal"
import type { DiscoveryDecisionCapability } from "../features/discovery/discoveryCandidateModel"
import {
  createMatchFromDiscoveryResult,
  decideDiscoverProfile,
  DiscoveryDecisionNotEligibleError,
  type DiscoveryDecision
} from "../features/discovery/discoveryApi"
import { getDiscoveryDecisionErrorMessageForDisplay } from "../features/discovery/discoveryErrorCopy"
import { getProfilePreviewCopy } from "../features/discovery/profilePreviewCopy"
import { getAppLocale } from "../features/session/appLocale"
import { SoftBlobBackground } from "../ui/backgrounds"
import { LinearGradient } from "../ui/linearGradient"
import {
  ActionButtonCircle,
  CardWrapper,
  TagChip,
} from "../ui/primitives"
import { uiTheme } from "../ui/theme"
import { useEntranceAnimation, useReducedMotion } from "../ui/animations"
import { PressableScale } from "../ui/PressableScale"
import type { SessionActor } from "../features/session/sessionModel"
import { MOBILE_HTTP_BASE_URL } from "../config/env"
import { captureProductEvent } from "../analytics/productAnalytics"
import type { UserProfilePrompt } from "@blumi/contracts"
import type { AppLocale } from "../features/session/appLocale"
import {
  resolvePreviewTags,
  resolveMatchedChatNavigation,
  resolveProfilePreviewActions,
  resolveProfilePreviewContext,
  shouldShowProfileSafety,
  toProfilePromptViews
} from "../features/profile/profileViewModel"
import { ProfileMatchedActions } from "../features/profile/ProfileMatchedActions"

export interface ProfilePrompt {
  id: string
  question: string
  answer: string
}

export function toProfilePreviewPrompts(
  prompts: readonly UserProfilePrompt[] | undefined,
  locale: AppLocale = "en"
): ProfilePrompt[] {
  return toProfilePromptViews(prompts, locale)
}

/** Text only: never a phone number. The user id is used for actions, never shown. */
export interface ProfilePreviewData {
  userId: string
  displayName: string
  age?: number
  avatarSnapshot?: CandidateAvatarSnapshot
  tags: string[]
  bio: string
  prompts: ProfilePrompt[]
  decisionCapability: DiscoveryDecisionCapability
  blocked: boolean
  isSelf: boolean
  spotId: string
  distanceLabel: string
}

type ProfilePreviewScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "ProfilePreview"
> & {
  profileOverride?: ProfilePreviewData
  sessionActor: SessionActor
}

export function ProfilePreviewScreen(props: ProfilePreviewScreenProps) {
  const { navigation, route } = props
  const copy = getProfilePreviewCopy(getAppLocale())
  const profile = props.profileOverride ?? ("profile" in route.params ? route.params.profile : undefined)
  // The content rises in on the UI thread; Reduce Motion only fades it in.
  const contentEntrance = useEntranceAnimation({ translateY: 20 })
  const reduceMotion = useReducedMotion()
  const [reportVisible, setReportVisible] = useState(false)
  const [isDeciding, setIsDeciding] = useState(false)
  const screenMountedRef = useRef(true)
  const decisionInFlightRef = useRef(false)
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const [serverDeniedDecision, setServerDeniedDecision] = useState(false)
  const goBackToDiscovery = (): void => {
    goBackOrFallback(navigation, () => navigation.replace("Lobby"))
  }

  useEffect(() => {
    screenMountedRef.current = true
    return () => { screenMountedRef.current = false }
  }, [])

  // DSC-15: the page bounces, and pulling past the top stretches the hero glow.
  const scrollY = useSharedValue(0)
  const handleScroll = useAnimatedScrollHandler((event) => { scrollY.value = event.contentOffset.y })
  const heroStretchStyle = useAnimatedStyle(() => {
    const stretch = getProfileHeroStretch(scrollY.value, reduceMotion)
    return { transform: [{ translateY: stretch.translateY }, { scale: stretch.scale }] }
  })

  if (!profile) return null
  const isProductionDiscovery = props.sessionActor.session.mode === "production"
  const avatarSnapshot = createCandidateAvatarSnapshot({
    userId: profile.userId,
    displayName: profile.displayName,
    avatarSnapshot: profile.avatarSnapshot
  })

  const promptCards = profile.prompts.slice(0, 2)
  const tags = resolvePreviewTags(profile.tags)
  const stackRoutes = navigation.getState().routes
  const routeIndex = stackRoutes.findIndex((candidate) => candidate.key === route.key)
  const previousRoute = routeIndex > 0 ? stackRoutes[routeIndex - 1] : undefined
  const context = resolveProfilePreviewContext({
    requested: route.params.context,
    isSelf: profile.isSelf || profile.userId === props.sessionActor.profile.userId,
    previousRouteName: previousRoute?.name
  })
  const isSelfView = context === "self"
  const actions = resolveProfilePreviewActions({
    context,
    blocked: profile.blocked,
    decisionCapability: profile.decisionCapability,
    serverDeniedDecision,
    productionDiscovery: isProductionDiscovery
  })
  const decisionDisabled = actions.kind !== "decide" || !actions.likeEnabled

  const openChat = (inviteRequest?: string): void => {
    const target = resolveMatchedChatNavigation({
      previousRoute,
      partner: { userId: profile.userId, displayName: profile.displayName },
      inviteRequest
    })
    if (target.kind === "back") {
      navigation.goBack()
      return
    }
    if (target.kind === "popTo") {
      navigation.popTo("ChatThread", target.params)
      return
    }
    navigation.navigate("ChatThread", target.params)
  }

  const returnToLobby = (
    completedProductionDecision: {
      decision: "like" | "pass"
      userId: string
      quota: Awaited<ReturnType<typeof decideDiscoverProfile>>["quota"]
    }
  ): void => {
    const strategy = getLobbyReturnStrategy(
      navigation.getState().routes.map((candidateRoute) => candidateRoute.name)
    )
    if (strategy === "popTo") {
      navigation.popTo("Lobby", { completedProductionDecision })
      return
    }
    navigation.replace("Lobby", { completedProductionDecision })
  }

  const submitProductionDecision = async (
    decision: DiscoveryDecision
  ): Promise<void> => {
    if (decisionDisabled || decisionInFlightRef.current) return
    decisionInFlightRef.current = true
    setIsDeciding(true)
    setDecisionError(null)
    try {
      const result = await decideDiscoverProfile(
        MOBILE_HTTP_BASE_URL,
        props.sessionActor.session.sessionToken,
        profile.userId,
        decision
      )
      if (!navigation.isFocused()) return
      captureProductEvent("discovery_decision", { decision, mode: "production" })
      const completedProductionDecision = {
        decision,
        userId: profile.userId,
        quota: result.quota
      }
      if (decision === "like") {
        const match = createMatchFromDiscoveryResult({
          currentUser: {
            userId: props.sessionActor.profile.userId,
            displayName: props.sessionActor.profile.displayName,
            avatarSelection: props.sessionActor.profile.avatar
          },
          matchedUser: {
            userId: profile.userId,
            displayName: profile.displayName,
            avatarSelection: avatarSnapshot.avatarSelection
          },
          result
        })
        if (match) {
          returnToLobby(completedProductionDecision)
          navigation.navigate("MatchResult", { match })
          return
        }
      }
      returnToLobby(completedProductionDecision)
    } catch (error) {
      if (!navigation.isFocused()) return
      if (error instanceof DiscoveryDecisionNotEligibleError) {
        setServerDeniedDecision(true)
        setDecisionError(copy.viewOnlyExplanation)
      } else {
        setDecisionError(getDiscoveryDecisionErrorMessageForDisplay(error))
      }
    } finally {
      decisionInFlightRef.current = false
      if (screenMountedRef.current) setIsDeciding(false)
    }
  }

  const sendInviteAndReturn = (): void => {
    if (decisionDisabled) return
    hapticLight()
    if (isProductionDiscovery) {
      void submitProductionDecision("like")
      return
    }
    navigation.navigate("Lobby", { pendingLikeUserId: profile.userId })
  }

  const passAndReturn = (): void => {
    if (isSelfView) {
      goBackToDiscovery()
      return
    }
    hapticLight()
    if (isProductionDiscovery) {
      void submitProductionDecision("pass")
      return
    }
    navigation.navigate("Lobby", { pendingPassUserId: profile.userId })
  }

  return (
    <View style={styles.root}>
      <SoftBlobBackground variant="lobby" />
      <Reanimated.ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <Reanimated.View style={contentEntrance}>
          {/* Full-bleed Hero Section */}
          <View style={styles.heroBlock}>
            {/* Background Glows */}
            <Reanimated.View style={[StyleSheet.absoluteFill, heroStretchStyle]} pointerEvents="none">
              <View style={[styles.heroGlow, { backgroundColor: uiTheme.colors.avatarAccent }]} />
              <View style={styles.heroGlowSecondary} />
            </Reanimated.View>

            {/* Top Navigation Overlays */}
            <SafeAreaView contentGutter={false} edges={["top"]} style={styles.heroNav}>
              <ActionButtonCircle
                accessibilityLabel={copy.back}
                onPress={goBackToDiscovery}
                size={42}
                style={styles.navButton}
              >
                <Ionicons name="chevron-back" size={22} color={uiTheme.colors.textPrimary} />
              </ActionButtonCircle>
              {shouldShowProfileSafety(context) ? (
                <ActionButtonCircle
                  accessibilityLabel={copy.safetyOptions(profile.displayName)}
                  onPress={() => setReportVisible(true)}
                  size={42}
                  style={styles.navButton}
                >
                  <Ionicons name="shield-outline" size={20} color={uiTheme.colors.textPrimary} />
                </ActionButtonCircle>
              ) : (
                <View style={styles.navButton} />
              )}
            </SafeAreaView>

            {/* Giant Avatar */}
            <View style={styles.avatarContainer} pointerEvents="none">
              <CandidateAvatarPreview
                snapshot={avatarSnapshot}
                size={280}
                stage="profile"
              />
            </View>

            {/* Info Overlay (Gradient at bottom of hero) */}
            <View style={styles.heroInfoOverlay} pointerEvents="none">
              <LinearGradient
                colors={["transparent", "rgba(10, 5, 15, 0.26)", "rgba(10, 5, 15, 0.72)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.heroInfoContent}>
                <View style={styles.stagePill}>
                  <View style={styles.stageDot} />
                  <Text style={styles.stagePillText}>
                    {isSelfView
                      ? copy.yourProfile
                      : context === "matched"
                        ? copy.yourMatch
                        : profile.decisionCapability === "live-invite"
                          ? copy.availableNow
                          : copy.discoverProfile}
                  </Text>
                </View>

                <View style={styles.nameRow}>
                  <Text style={styles.nameText}>
                    {profile.displayName}
                    {typeof profile.age === "number" ? `, ${profile.age}` : ""}
                  </Text>
                </View>
                {profile.distanceLabel ? (
                  <Text style={styles.subtitleText}>{profile.distanceLabel}</Text>
                ) : null}
              </View>
            </View>
          </View>

          {/* Details Section */}
          <View style={styles.detailsBlock}>

            {profile.bio ? (
              <View style={styles.bioCard}>
                <Text style={styles.bioLabel}>{copy.profileNote}</Text>
                <Text style={styles.bioText}>{profile.bio}</Text>
              </View>
            ) : null}

            {tags.length > 0 ? (
              <View style={styles.tagsRow}>
                {tags.map((tag) => (
                  <TagChip key={tag} label={tag} />
                ))}
              </View>
            ) : null}

            {promptCards.length > 0 ? promptCards.map((prompt) => (
              <CardWrapper key={prompt.id} style={styles.promptCard}>
                <Text style={styles.promptQuestion}>{prompt.question}</Text>
                <Text style={styles.promptAnswer}>{prompt.answer}</Text>
              </CardWrapper>
            )) : null}

            <SafeAreaView contentGutter={false} edges={["bottom"]}>
              {actions.kind === "matched" ? (
                <ProfileMatchedActions
                  displayName={profile.displayName}
                  canInvite={actions.canInvite}
                  onBackToChat={() => openChat()}
                  onInviteToRoom={() => openChat(`${Date.now()}`)}
                />
              ) : null}
              {actions.kind === "none" ? (
                <Text style={styles.decisionUnavailable}>{copy.selfPreviewNote}</Text>
              ) : null}
              {actions.kind === "decide" ? (
                <View style={styles.actionRow}>
                  <ActionButtonCircle
                    accessibilityLabel={copy.passProfile}
                    onPress={passAndReturn}
                    disabled={isProductionDiscovery && (decisionDisabled || isDeciding)}
                    accessibilityState={{
                      disabled: isProductionDiscovery && decisionDisabled,
                      busy: isProductionDiscovery && isDeciding
                    }}
                    size={62}
                  >
                    <Ionicons name="close" size={28} color={uiTheme.colors.textPrimary} />
                  </ActionButtonCircle>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={copy.likeProfile(profile.displayName)}
                      accessibilityState={{ disabled: decisionDisabled, busy: isDeciding }}
                      disabled={decisionDisabled || isDeciding}
                      onPress={sendInviteAndReturn}
                      style={[
                        styles.likeButton,
                          decisionDisabled || isDeciding ? styles.likeButtonDisabled : null,
                      ]}
                    >
                      <LinearGradient
                        colors={
                          decisionDisabled || isDeciding
                            ? [uiTheme.colors.primaryDisabled, uiTheme.colors.primaryDisabled]
                            : uiTheme.gradients.primary as [string, string]
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.likeButtonGradient}
                      >
                        <View style={styles.likeButtonContent}>
                          <Ionicons name="heart" size={18} color="#FFFFFF" />
                          <Text style={styles.likeButtonText}>
                            {isDeciding ? copy.saving : copy.sayHi}
                          </Text>
                        </View>
                      </LinearGradient>
                    </PressableScale>
                </View>
              ) : null}
              {decisionError ? (
                <Text accessibilityRole="alert" style={styles.decisionError}>
                  {decisionError}
                </Text>
              ) : null}
              {actions.kind === "decide" && actions.showViewOnlyNotice && !decisionError ? (
                <Text style={styles.decisionUnavailable}>
                  {copy.viewOnlyExplanation}
                </Text>
              ) : null}
            </SafeAreaView>
          </View>
        </Reanimated.View>
      </Reanimated.ScrollView>
      {shouldShowProfileSafety(context) ? (
        <ReportModal
          visible={reportVisible}
          targetUserId={profile.userId}
          targetDisplayName={profile.displayName}
          sessionActor={props.sessionActor}
          onClose={() => setReportVisible(false)}
          onActionComplete={goBackToDiscovery}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: uiTheme.colors.background,
  },
  safe: {
    flex: 1,
  },
  scroll: {
    paddingBottom: uiTheme.spacing.xl,
    // No horizontal or top padding, we want the hero to bleed to the edges
  },
  heroBlock: {
    height: 540, // Takes up more than half the screen
    width: "100%",
    backgroundColor: uiTheme.colors.surface,
    position: "relative",
    overflow: "hidden",
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    ...uiTheme.shadow.deep,
  },
  heroGlow: {
    position: "absolute",
    width: 500,
    height: 500,
    borderRadius: 250,
    top: -100,
    left: -80,
  },
  heroGlowSecondary: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "#FCE4F1",
    right: -80,
    bottom: -50,
  },
  heroNav: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: uiTheme.spacing.lg,
    paddingTop: uiTheme.spacing.md,
    zIndex: 20,
  },
  navButton: {
    backgroundColor: "rgba(255, 255, 255, 0.5)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.4)",
    ...uiTheme.shadow.soft,
  },
  avatarContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  heroInfoOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 220,
    justifyContent: "flex-end",
    padding: uiTheme.spacing.lg,
    paddingBottom: uiTheme.spacing.xl,
    zIndex: 10,
  },
  heroInfoContent: {
    gap: 8,
  },
  stagePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(32, 22, 42, 0.6)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  stageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: uiTheme.colors.success,
  },
  stagePillText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nameText: {
    color: "#FFFFFF",
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: -0.5,
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  subtitleText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    opacity: 0.95,
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  detailsBlock: {
    paddingHorizontal: uiTheme.spacing.lg,
    paddingTop: uiTheme.spacing.md,
    gap: uiTheme.spacing.md,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiTheme.spacing.xs,
  },
  bioCard: {
    gap: uiTheme.spacing.xs,
    padding: uiTheme.spacing.lg,
    borderRadius: uiTheme.radius.xl,
    backgroundColor: uiTheme.colors.glass,
    borderWidth: 1,
    borderColor: uiTheme.colors.glassBorder,
    ...uiTheme.shadow.soft,
  },
  bioLabel: {
    ...uiTheme.font.overline,
    color: uiTheme.colors.textMuted,
  },
  bioText: {
    ...uiTheme.font.body,
    color: uiTheme.colors.textSecondary,
  },
  promptCard: {
    gap: uiTheme.spacing.sm,
    backgroundColor: uiTheme.colors.glass,
    borderColor: uiTheme.colors.glassBorder,
  },
  promptQuestion: {
    ...uiTheme.font.overline,
    color: uiTheme.colors.textMuted,
  },
  promptAnswer: {
    ...uiTheme.font.body,
    color: uiTheme.colors.textPrimary,
    fontWeight: "600",
  },
  actionRow: {
    marginTop: uiTheme.spacing.lg,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: uiTheme.spacing.lg,
  },
  likeButton: {
    borderRadius: uiTheme.radius.full,
    overflow: "hidden",
    ...uiTheme.shadow.glow,
  },
  likeButtonGradient: {
    minHeight: 64,
    minWidth: 200,
    borderRadius: uiTheme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: uiTheme.spacing.xl,
  },
  likeButtonDisabled: {
    opacity: 0.6,
    shadowOpacity: 0,
    elevation: 0,
  },
  likeButtonText: {
    ...uiTheme.font.bodyBold,
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  likeButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: uiTheme.spacing.xs,
  },
  decisionError: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.dangerInk,
    textAlign: "center",
    marginTop: uiTheme.spacing.sm
  },
  decisionUnavailable: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textSecondary,
    textAlign: "center",
    marginTop: uiTheme.spacing.sm
  },
})
