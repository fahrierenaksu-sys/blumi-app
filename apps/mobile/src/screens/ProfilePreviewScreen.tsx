import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useEffect, useRef, useState } from "react"
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import {
  CandidateAvatarPreview,
  createCandidateAvatarSnapshot,
  type CandidateAvatarSnapshot
} from "../components/DiscoverCard"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { getLobbyReturnStrategy } from "../navigation/rootNavigationModel"
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
import { MyAvatar } from "../ui/myAvatar"
import {
  ActionButtonCircle,
  CardWrapper,
  TagChip,
} from "../ui/primitives"
import { uiTheme } from "../ui/theme"
import type { SessionActor } from "../features/session/sessionModel"
import { MOBILE_HTTP_BASE_URL } from "../config/env"
import { captureProductEvent } from "../analytics/productAnalytics"
import {
  USER_PROFILE_PROMPT_OPTIONS,
  type UserProfilePrompt
} from "@blumi/contracts"

export interface ProfilePrompt {
  id: string
  question: string
  answer: string
}

export function toProfilePreviewPrompts(
  prompts: readonly UserProfilePrompt[] | undefined
): ProfilePrompt[] {
  return (prompts ?? []).flatMap((prompt) => {
    const option = USER_PROFILE_PROMPT_OPTIONS.find(
      (candidate) => candidate.promptId === prompt.promptId
    )
    return option
      ? [{ id: prompt.promptId, question: option.question, answer: prompt.answer }]
      : []
  })
}

export interface ProfileCue {
  id: string
  label: string
  value: string
  detail: string
}

export interface ProfilePreviewData {
  userId: string
  displayName: string
  age?: number
  avatarSnapshot?: CandidateAvatarSnapshot
  headline: string
  vibeLine: string
  tags: string[]
  bio: string
  cues: ProfileCue[]
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

const CUE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  live_overlap: "pulse-outline",
  proximity: "location-outline",
  room_readiness: "sparkles-outline",
}

export function ProfilePreviewScreen(props: ProfilePreviewScreenProps) {
  const { navigation, route } = props
  const copy = getProfilePreviewCopy(getAppLocale())
  const profile = props.profileOverride ?? ("profile" in route.params ? route.params.profile : undefined)
  const likeScaleAnim = useRef(new Animated.Value(1)).current
  const contentAnim = useRef(new Animated.Value(0)).current
  const [reportVisible, setReportVisible] = useState(false)
  const [isDeciding, setIsDeciding] = useState(false)
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const [serverDeniedDecision, setServerDeniedDecision] = useState(false)

  useEffect(() => {
    Animated.spring(contentAnim, {
      toValue: 1,
      useNativeDriver: true,
      ...uiTheme.animation.springGentle,
    }).start()
  }, [contentAnim])

  if (!profile) return null
  const isProductionDiscovery = props.sessionActor.session.mode === "production"
  const avatarSnapshot = createCandidateAvatarSnapshot({
    userId: profile.userId,
    displayName: profile.displayName,
    avatarSnapshot: profile.avatarSnapshot
  })

  const promptCards = profile.prompts.slice(0, 2)
  const likeDisabled =
    profile.isSelf ||
    profile.blocked ||
    profile.decisionCapability === "unavailable" ||
    profile.decisionCapability === "view-only"
  const decisionDisabled = likeDisabled || serverDeniedDecision

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
    if (decisionDisabled || isDeciding) return
    setIsDeciding(true)
    setDecisionError(null)
    try {
      const result = await decideDiscoverProfile(
        MOBILE_HTTP_BASE_URL,
        props.sessionActor.session.sessionToken,
        profile.userId,
        decision
      )
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
            displayName: props.sessionActor.profile.displayName
          },
          matchedUser: {
            userId: profile.userId,
            displayName: profile.displayName
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
      if (error instanceof DiscoveryDecisionNotEligibleError) {
        setServerDeniedDecision(true)
        setDecisionError(copy.viewOnlyExplanation)
      } else {
        setDecisionError(getDiscoveryDecisionErrorMessageForDisplay(error))
      }
    } finally {
      setIsDeciding(false)
    }
  }

  const sendInviteAndReturn = (): void => {
    if (decisionDisabled) return
    if (isProductionDiscovery) {
      void submitProductionDecision("like")
      return
    }
    navigation.navigate("Lobby", { pendingLikeUserId: profile.userId })
  }

  const passAndReturn = (): void => {
    if (profile.isSelf) {
      navigation.goBack()
      return
    }
    if (isProductionDiscovery) {
      void submitProductionDecision("pass")
      return
    }
    navigation.navigate("Lobby", { pendingPassUserId: profile.userId })
  }

  const handleLikePressIn = () => {
    Animated.spring(likeScaleAnim, {
      toValue: uiTheme.animation.scalePress,
      useNativeDriver: true,
      ...uiTheme.animation.spring,
    }).start()
  }

  const handleLikePressOut = () => {
    Animated.spring(likeScaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      ...uiTheme.animation.springBouncy,
    }).start()
  }

  return (
    <View style={styles.root}>
      <SoftBlobBackground variant="lobby" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View
          style={{
            opacity: contentAnim,
            transform: [
              {
                translateY: contentAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [20, 0],
                })
              }
            ]
          }}
        >
          {/* Full-bleed Hero Section */}
          <View style={styles.heroBlock}>
            {/* Background Glows */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <View style={[styles.heroGlow, { backgroundColor: uiTheme.colors.avatarAccent }]} />
              <View style={styles.heroGlowSecondary} />
            </View>

            {/* Top Navigation Overlays */}
            <SafeAreaView contentGutter={false} edges={["top"]} style={styles.heroNav}>
              <ActionButtonCircle
                accessibilityLabel={copy.back}
                onPress={() => navigation.goBack()}
                size={42}
                style={styles.navButton}
              >
                <Ionicons name="arrow-back" size={20} color={uiTheme.colors.textPrimary} />
              </ActionButtonCircle>
              {!profile.isSelf ? (
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
              {profile.isSelf ? (
                <MyAvatar
                  name={profile.displayName}
                  seed={profile.userId}
                  size={260}
                  ring="strong"
                />
              ) : (
                <CandidateAvatarPreview
                  snapshot={avatarSnapshot}
                  size={280}
                  stage="profile"
                />
              )}
            </View>

            {/* Info Overlay (Gradient at bottom of hero) */}
            <View style={styles.heroInfoOverlay} pointerEvents="none">
              <LinearGradient
                colors={["transparent", "rgba(10, 5, 15, 0.4)", "rgba(10, 5, 15, 0.95)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.heroInfoContent}>
                <View style={styles.stagePill}>
                  <View style={styles.stageDot} />
                  <Text style={styles.stagePillText}>
                    {profile.isSelf
                      ? copy.yourProfile
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
                <Text style={styles.subtitleText}>{profile.distanceLabel}</Text>
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

            {profile.tags.length > 0 ? (
              <View style={styles.tagsRow}>
                {profile.tags.map((tag) => (
                  <TagChip key={tag} label={tag} />
                ))}
              </View>
            ) : null}

            {profile.headline || profile.vibeLine ? (
              <View style={styles.identityBlock}>
                {profile.headline ? (
                  <Text style={styles.headlineText}>{profile.headline}</Text>
                ) : null}
                {profile.vibeLine ? (
                  <Text style={styles.vibeText}>{profile.vibeLine}</Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.contextGrid}>
              {profile.cues.map((cue) => (
                <View key={cue.id} style={styles.contextCard}>
                  <View style={styles.contextHeader}>
                    <View style={styles.contextIconCircle}>
                      <Ionicons
                        accessible={false}
                        name={CUE_ICONS[cue.id] ?? "ellipse-outline"}
                        size={16}
                        color={uiTheme.colors.primaryDeep}
                      />
                    </View>
                    <View style={styles.contextTextStack}>
                      <Text style={styles.contextLabel}>{cue.label}</Text>
                      <Text style={styles.contextValue}>{cue.value}</Text>
                    </View>
                  </View>
                  <Text style={styles.contextDetail}>{cue.detail}</Text>
                </View>
              ))}
            </View>

            {promptCards.length > 0 ? promptCards.map((prompt) => (
              <CardWrapper key={prompt.id} style={styles.promptCard}>
                <Text style={styles.promptQuestion}>{prompt.question}</Text>
                <Text style={styles.promptAnswer}>{prompt.answer}</Text>
              </CardWrapper>
            )) : null}

            <SafeAreaView contentGutter={false} edges={["bottom"]}>
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
                <Animated.View style={{ transform: [{ scale: likeScaleAnim }] }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={copy.likeProfile(profile.displayName)}
                    accessibilityState={{ disabled: decisionDisabled, busy: isDeciding }}
                    disabled={decisionDisabled || isDeciding}
                    onPress={sendInviteAndReturn}
                    onPressIn={handleLikePressIn}
                    onPressOut={handleLikePressOut}
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
                  </Pressable>
                </Animated.View>
              </View>
              {decisionError ? (
                <Text accessibilityRole="alert" style={styles.decisionError}>
                  {decisionError}
                </Text>
              ) : null}
              {isProductionDiscovery && decisionDisabled && !profile.isSelf && !decisionError ? (
                <Text style={styles.decisionUnavailable}>
                  {copy.viewOnlyExplanation}
                </Text>
              ) : null}
            </SafeAreaView>
          </View>
        </Animated.View>
      </ScrollView>
      {!profile.isSelf ? (
        <ReportModal
          visible={reportVisible}
          targetUserId={profile.userId}
          targetDisplayName={profile.displayName}
          sessionActor={props.sessionActor}
          onClose={() => setReportVisible(false)}
          onActionComplete={() => navigation.goBack()}
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
  identityBlock: {
    gap: uiTheme.spacing.xxs,
    paddingHorizontal: 4,
  },
  headlineText: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.primaryDeep,
  },
  vibeText: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary,
    fontWeight: "600",
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
  contextGrid: {
    gap: uiTheme.spacing.sm,
  },
  contextCard: {
    borderRadius: uiTheme.radius.xl,
    borderWidth: 1,
    borderColor: uiTheme.colors.border,
    backgroundColor: uiTheme.colors.surface,
    paddingHorizontal: uiTheme.spacing.lg,
    paddingVertical: uiTheme.spacing.md,
    gap: uiTheme.spacing.xs,
    ...uiTheme.shadow.soft,
  },
  contextHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm,
  },
  contextIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: uiTheme.colors.chipBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  contextTextStack: {
    flex: 1,
    gap: 1,
  },
  contextLabel: {
    ...uiTheme.font.overline,
    color: uiTheme.colors.textMuted,
    fontSize: 10,
  },
  contextValue: {
    ...uiTheme.font.bodyBold,
    fontSize: 14,
    color: uiTheme.colors.textPrimary,
  },
  contextDetail: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textSecondary,
    lineHeight: 17,
    paddingLeft: 48,
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
