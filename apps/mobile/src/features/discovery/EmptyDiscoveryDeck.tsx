import Ionicons from "@expo/vector-icons/Ionicons"
import type { AvatarSelection, DiscoveryDecisionQuota } from "@blumi/contracts"
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native"
import {
  CandidateAvatarPreview,
  createCandidateAvatarSnapshot
} from "../../components/DiscoverCard"
import { LinearGradient } from "../../ui/linearGradient"
import { uiTheme } from "../../ui/theme"
import { useAppViewportMetrics } from "../../ui/layout/useAppViewportMetrics"
import { getAppLocale } from "../session/appLocale"
import { resolveDiscoveryLayoutMetrics } from "./discoveryLayoutMetrics"
import { getDiscoverySurfaceCopy } from "./discoverySurfaceCopy"

const discoverCardSurface = require("../../../assets/ui/discover-card-surface.png")

interface EmptyDiscoveryDeckProps {
  avatarName: string
  avatarSeed: string
  avatarSelection: AvatarSelection
  state?: "exhausted" | "low-supply" | "quota-exhausted"
  quota?: DiscoveryDecisionQuota | null
  refreshing?: boolean
  onRefresh: () => void
  watchActive?: boolean
  watchBusy?: boolean
  onActivateWatch?: () => void
  onCancelWatch?: () => void
}

export function EmptyDiscoveryDeck(props: EmptyDiscoveryDeckProps) {
  const { copy, deckHeight } = useDiscoveryEmptyDeckPresentation()
  const avatarSnapshot = createCandidateAvatarSnapshot({
    userId: props.avatarSeed,
    displayName: props.avatarName,
    avatarSelection: props.avatarSelection
  })
  const isQuotaExhausted = props.state === "quota-exhausted"
  const quotaUsage = props.quota
    ? copy.empty.quotaUsage(props.quota.used, props.quota.limit)
    : copy.empty.quotaFallbackUsage

  return (
    <View style={[styles.emptyDeck, { height: deckHeight }]}>
      <EmptyDeckBack style={styles.emptyBottomCard} />
      <EmptyDeckBack style={styles.emptyMiddleCard} />

      <ImageBackground
        imageStyle={styles.emptyCardImage}
        resizeMode="cover"
        source={discoverCardSurface}
        style={[
          styles.emptyCard,
          props.state === "low-supply" ? styles.lowSupplyCard : null,
          isQuotaExhausted ? styles.quotaExhaustedCard : null
        ]}
      >
        <View style={[
          styles.avatarStage,
          props.state !== "exhausted" ? styles.avatarStageCompact : null
        ]}>
          <CandidateAvatarPreview
            size={props.state !== "exhausted" ? 186 : 228}
            snapshot={avatarSnapshot}
            stage="discover"
          />
        </View>

        <View style={styles.copyBlock}>
          <Text style={styles.emptyTitle}>
            {isQuotaExhausted
              ? copy.empty.quotaTitle
              : props.state === "low-supply"
              ? copy.empty.lowSupplyTitle
              : copy.empty.exhaustedTitle}
          </Text>
          <Text style={styles.emptyBody}>
            {isQuotaExhausted
              ? `${quotaUsage} ${copy.empty.quotaReset}`
              : props.state === "low-supply"
              ? copy.empty.lowSupplyBody
              : copy.empty.exhaustedBody}
          </Text>
        </View>

        {isQuotaExhausted ? (
          <View
            accessibilityLabel={`${copy.empty.rewardTitle}. ${copy.empty.rewardBody}`}
            accessibilityRole="text"
            style={styles.rewardUnavailable}
          >
            <Ionicons
              accessible={false}
              color={uiTheme.colors.textMuted}
              name="play-circle-outline"
              size={19}
            />
            <View style={styles.rewardUnavailableCopy}>
              <Text style={styles.rewardUnavailableTitle}>{copy.empty.rewardTitle}</Text>
              <Text style={styles.rewardUnavailableBody}>
                {copy.empty.rewardBody}
              </Text>
            </View>
          </View>
        ) : null}

        {!isQuotaExhausted ? <Pressable
          accessibilityLabel={copy.empty.refreshAccessibilityLabel}
          accessibilityRole="button"
          accessibilityState={{
            busy: props.refreshing === true,
            disabled: props.refreshing === true
          }}
          disabled={props.refreshing}
          onPress={props.onRefresh}
          style={({ pressed }) => [
            styles.refreshButtonWrap,
            pressed ? styles.refreshButtonPressed : null
          ]}
        >
          <LinearGradient
            colors={uiTheme.gradients.primary}
            end={{ x: 1, y: 0 }}
            start={{ x: 0, y: 0 }}
            style={styles.refreshButton}
          >
            <View style={styles.refreshIconBubble}>
              {props.refreshing ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Ionicons
                  accessible={false}
                  color="#FFFFFF"
                  name="refresh"
                  size={18}
                />
              )}
            </View>
            <Text style={styles.refreshButtonText}>
              {props.refreshing ? copy.empty.refreshingAction : copy.empty.refreshAction}
            </Text>
            <Ionicons
              accessible={false}
              color="rgba(255, 255, 255, 0.82)"
              name="arrow-forward"
              size={17}
            />
          </LinearGradient>
        </Pressable> : null}

        {props.state === "low-supply" && props.onActivateWatch && props.onCancelWatch ? (
          <Pressable
            accessibilityLabel={props.watchActive ? copy.empty.watchCancel : copy.empty.watchActivate}
            accessibilityRole="button"
            accessibilityState={{
              busy: props.watchBusy === true,
              disabled: props.watchBusy === true,
              selected: props.watchActive === true
            }}
            disabled={props.watchBusy}
            onPress={props.watchActive ? props.onCancelWatch : props.onActivateWatch}
            style={[
              styles.watchButton,
              props.watchActive ? styles.watchButtonActive : null
            ]}
          >
            {props.watchBusy ? (
              <ActivityIndicator color={uiTheme.colors.primaryDeep} size="small" />
            ) : (
              <Ionicons
                accessible={false}
                color={uiTheme.colors.primaryDeep}
                name={props.watchActive ? "checkmark-circle" : "sparkles-outline"}
                size={18}
              />
            )}
            <View style={styles.watchCopy}>
              <Text style={styles.watchTitle}>
                {props.watchActive ? copy.empty.watchActive : copy.empty.watchActivate}
              </Text>
              <Text style={styles.watchBody} numberOfLines={2}>
                {props.watchActive ? copy.empty.watchActiveBody : copy.empty.watchInactiveBody}
              </Text>
              {props.watchActive ? (
                <Text style={styles.watchCancel}>{copy.empty.watchCancel}</Text>
              ) : null}
            </View>
          </Pressable>
        ) : null}

      </ImageBackground>
    </View>
  )
}

export function LoadingDiscoveryDeck() {
  const { copy, deckHeight } = useDiscoveryEmptyDeckPresentation()
  return (
    <View style={[styles.emptyDeck, { height: deckHeight }]}>
      <EmptyDeckBack style={styles.emptyBottomCard} />
      <EmptyDeckBack style={styles.emptyMiddleCard} />
      <ImageBackground
        imageStyle={styles.emptyCardImage}
        resizeMode="cover"
        source={discoverCardSurface}
        style={[styles.emptyCard, styles.loadingCard]}
      >
        <View style={styles.emptyPhotoProgress} pointerEvents="none">
          {[0, 1, 2, 3].map((index) => (
            <View key={index} style={styles.emptyPhotoProgressTrack} />
          ))}
        </View>
        <View style={styles.loadingIndicatorWrap}>
          <ActivityIndicator color={uiTheme.colors.primary} size="large" />
        </View>
        <Text style={styles.emptyTitle}>{copy.empty.loadingTitle}</Text>
        <Text style={styles.emptyBody}>{copy.empty.loadingBody}</Text>
      </ImageBackground>
    </View>
  )
}

export function DiscoverErrorCard(props: {
  message: string
  refreshing?: boolean
  onRetry: () => void
}) {
  const { copy, deckHeight } = useDiscoveryEmptyDeckPresentation()
  return (
    <View style={[styles.emptyDeck, { height: deckHeight }]}>
      <ImageBackground
        imageStyle={styles.emptyCardImage}
        resizeMode="cover"
        source={discoverCardSurface}
        style={[styles.emptyCard, styles.errorCard]}
      >
        <View style={styles.errorIconBubble}>
          <Ionicons name="cloud-offline-outline" size={28} color={uiTheme.colors.primaryDeep} />
        </View>
        <Text style={styles.emptyTitle}>{copy.empty.errorTitle}</Text>
        <Text style={styles.emptyBody}>{props.message}</Text>
        <Pressable
          accessibilityLabel={copy.empty.errorAccessibilityLabel}
          accessibilityRole="button"
          accessibilityState={{ busy: props.refreshing === true, disabled: props.refreshing === true }}
          disabled={props.refreshing}
          onPress={props.onRetry}
          style={styles.retryButton}
        >
          {props.refreshing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.retryButtonText}>{copy.empty.errorAction}</Text>}
        </Pressable>
      </ImageBackground>
    </View>
  )
}

function useDiscoveryEmptyDeckPresentation() {
  const viewport = useAppViewportMetrics({ bottomNavVisible: true })
  return {
    copy: getDiscoverySurfaceCopy(getAppLocale()),
    deckHeight: resolveDiscoveryLayoutMetrics(viewport.width, viewport.height).deckHeight
  }
}

function EmptyDeckBack(props: { style: StyleProp<ViewStyle> }) {
  return (
    <View pointerEvents="none" style={[styles.emptyBackCard, props.style]}>
      <ImageBackground
        imageStyle={styles.emptyCardImage}
        resizeMode="cover"
        source={discoverCardSurface}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[
          "rgba(255, 255, 255, 0.46)",
          "rgba(255, 255, 255, 0.08)",
          "rgba(255, 255, 255, 0.20)"
        ]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.backCardLines}>
        <View style={[styles.backCardLine, styles.backCardLineWide]} />
        <View style={styles.backCardLine} />
        <View style={styles.backCardLine} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  emptyDeck: {
    marginTop: 10,
    position: "relative",
    width: "100%"
  },
  emptyBackCard: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#FFF7FC",
    borderColor: "rgba(255, 255, 255, 0.90)",
    borderRadius: 36,
    borderWidth: 1.5,
    overflow: "hidden"
  },
  emptyBottomCard: {
    opacity: 0.82,
    transform: [
      { translateX: -10 },
      { translateY: -30 },
      { rotate: "-3deg" },
      { scale: 0.98 }
    ],
    zIndex: 0
  },
  emptyMiddleCard: {
    opacity: 0.92,
    transform: [
      { translateX: 8 },
      { translateY: -15 },
      { rotate: "2.4deg" },
      { scale: 0.99 }
    ],
    zIndex: 1
  },
  backCardLines: {
    flexDirection: "row",
    gap: 9,
    left: 34,
    position: "absolute",
    right: 34,
    top: 28
  },
  backCardLine: {
    backgroundColor: "rgba(255, 255, 255, 0.66)",
    borderRadius: 999,
    flex: 1,
    height: 4
  },
  backCardLineWide: {
    flex: 1.4
  },
  emptyCard: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    backgroundColor: uiTheme.ambientGlass.surface,
    borderColor: uiTheme.ambientGlass.edgeLight,
    borderRadius: 36,
    borderWidth: 1.5,
    gap: 14,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 28,
    paddingVertical: 26,
    zIndex: 2
  },
  lowSupplyCard: {
    gap: 9,
    paddingVertical: 18
  },
  quotaExhaustedCard: {
    gap: 10,
    paddingVertical: 18
  },
  emptyCardImage: {
    borderRadius: 36
  },
  emptyPhotoProgress: {
    flexDirection: "row",
    gap: 6,
    left: 18,
    position: "absolute",
    right: 18,
    top: 14,
    zIndex: 4
  },
  emptyPhotoProgressTrack: {
    backgroundColor: "rgba(255, 255, 255, 0.38)",
    borderColor: "rgba(255, 255, 255, 0.24)",
    borderRadius: 999,
    borderWidth: 0.5,
    flex: 1,
    height: 3
  },
  emptyPhotoProgressTrackActive: {
    backgroundColor: "rgba(255, 255, 255, 0.88)"
  },
  avatarStage: {
    alignItems: "center",
    height: 224,
    justifyContent: "center",
    position: "relative",
    width: 250
  },
  avatarStageCompact: {
    height: 174
  },
  loadingCard: {
    gap: 10
  },
  errorCard: {
    gap: 12,
    paddingHorizontal: 30
  },
  errorIconBubble: {
    alignItems: "center",
    justifyContent: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.76)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)"
  },
  retryButton: {
    minHeight: 44,
    paddingHorizontal: 24,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: uiTheme.colors.primary
  },
  retryButtonText: {
    ...uiTheme.font.bodyBold,
    color: "#FFFFFF"
  },
  loadingIndicatorWrap: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.58)",
    borderColor: "rgba(255, 255, 255, 0.86)",
    borderRadius: 50,
    borderWidth: 1,
    height: 100,
    justifyContent: "center",
    width: 100
  },
  copyBlock: {
    alignItems: "center",
    gap: 8,
    maxWidth: 300
  },
  emptyTitle: {
    ...uiTheme.font.heading,
    color: uiTheme.colors.textPrimary,
    fontSize: 27,
    textAlign: "center"
  },
  emptyBody: {
    ...uiTheme.font.body,
    color: uiTheme.colors.textSecondary,
    lineHeight: 21,
    textAlign: "center"
  },
  refreshButtonWrap: {
    alignSelf: "stretch",
    borderRadius: 999,
    marginTop: 2
  },
  refreshButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }]
  },
  expandButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.82)",
    borderColor: uiTheme.colors.glassBorder,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 18
  },
  expandButtonText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.primaryDeep
  },
  watchButton: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "rgba(255, 245, 251, 0.88)",
    borderColor: uiTheme.colors.primary,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  watchButtonActive: {
    backgroundColor: "rgba(240, 255, 248, 0.90)",
    borderColor: uiTheme.colors.success
  },
  watchCopy: {
    flex: 1,
    gap: 1
  },
  watchTitle: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.primaryDeep
  },
  watchBody: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textSecondary,
    fontSize: 10,
    lineHeight: 13
  },
  watchCancel: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.danger,
    fontSize: 10,
    marginTop: 2
  },
  rewardUnavailable: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "rgba(255, 255, 255, 0.54)",
    borderColor: "rgba(73, 58, 80, 0.16)",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 54,
    opacity: 0.74,
    paddingHorizontal: 14
  },
  rewardUnavailableCopy: {
    flex: 1,
    gap: 1
  },
  rewardUnavailableTitle: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.textSecondary
  },
  rewardUnavailableBody: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted,
    fontSize: 10
  },
  refreshButton: {
    alignItems: "center",
    borderColor: "rgba(255, 255, 255, 0.64)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    height: 58,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  refreshIconBubble: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 17,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  refreshButtonText: {
    ...uiTheme.font.bodyBold,
    color: "#FFFFFF",
    flex: 1,
    textAlign: "center"
  }
})
