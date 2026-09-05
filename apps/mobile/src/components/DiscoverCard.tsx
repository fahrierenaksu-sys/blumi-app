import { useEffect, useMemo, useRef } from "react"
import type { AvatarSelection } from "@blumi/contracts"
import { Animated, Easing, ImageBackground, StyleSheet, Text, View } from "react-native"
import type { RealtimeConnectionStatus } from "../features/realtime/realtimeClient"
import {
  ROOM_AVATAR_CATALOG
} from "../features/avatarV2/room/avatarRoom.mock"
import {
  getRoomAvatarRenderLayers
} from "../features/avatarV2/room/avatarRoomSelectors"
import { RoomAvatarRenderer2D } from "../features/avatarV2/room/components/RoomAvatarRenderer2D"
import {
  createCandidateAvatarAppearance,
  createCandidateAvatarSnapshot,
  type CandidateAvatarSnapshot
} from "../features/avatarV2/candidateAvatarSnapshot"
import { LinearGradient } from "../ui/linearGradient"
import { useReducedMotion } from "../ui/animations"
import { MyAvatar } from "../ui/myAvatar"
import { TagChip } from "../ui/primitives"
import { uiTheme } from "../ui/theme"

const discoverCardSurface = require("../../assets/ui/discover-card-surface.png")

// ── Breathing pulse for online presence ─────────────────────

function useBreathingPulse(active: boolean) {
  const anim = useRef(new Animated.Value(1)).current
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (!active || reduceMotion) {
      anim.stopAnimation()
      anim.setValue(1)
      return undefined
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1.08,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(anim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
    )

    loop.start()
    return () => loop.stop()
  }, [active, anim, reduceMotion])

  return anim
}

// ── DiscoverCard ────────────────────────────────────────────

export interface DiscoverCardProps {
  displayName: string
  age?: number
  userId: string
  avatarPresetId?: string
  avatarSelection?: AvatarSelection
  avatarSnapshot?: CandidateAvatarSnapshot
  headline: string
  distanceLabel: string
  vibeTags: string[]
  isPending: boolean
  isOnline?: boolean
}

export {
  createCandidateAvatarSnapshot,
  readCandidateAvatarSnapshot
} from "../features/avatarV2/candidateAvatarSnapshot"
export type { CandidateAvatarSnapshot } from "../features/avatarV2/candidateAvatarSnapshot"

export function DiscoverCard(props: DiscoverCardProps) {
  const {
    displayName,
    age,
    userId,
    avatarPresetId,
    avatarSelection,
    avatarSnapshot,
    headline,
    distanceLabel,
    vibeTags,
    isPending,
    isOnline
  } = props

  const breathScale = useBreathingPulse(isOnline === true)
  const actionLabel = isOnline === true
    ? "Ready to chat"
    : isOnline === false
      ? "Send a like first"
      : "Open to a mutual match"
  const presenceLabel = isOnline === true
    ? "Online now"
    : isOnline === false
      ? "Not live now"
      : "Discover"
  const resolvedAvatarSnapshot = createCandidateAvatarSnapshot({
    userId,
    displayName,
    avatarPresetId,
    avatarSelection,
    avatarSnapshot
  })

  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.heroBlock}>
        <ImageBackground
          source={discoverCardSurface}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
        />
        <View style={cardStyles.heroGlassWash} pointerEvents="none" />
        <Animated.View
          style={[cardStyles.heroGlow, { transform: [{ scale: breathScale }] }]}
          pointerEvents="none"
        />
        <View style={cardStyles.heroGlowSecondary} pointerEvents="none" />
        <CandidateAvatarPreview
          snapshot={resolvedAvatarSnapshot}
          size={236}
          stage="discover"
        />
        <View style={cardStyles.heroInfoPanel}>
          <View style={cardStyles.heroNameBlock}>
            <Text style={cardStyles.heroNameText}>
              {displayName}{typeof age === "number" ? `, ${age}` : ""}
            </Text>
            <Text style={cardStyles.heroHeadlineText}>{headline}</Text>
          </View>
          <View style={cardStyles.heroMetaRow}>
            <View style={cardStyles.heroMetaPill}>
              <Text style={cardStyles.distanceText}>{distanceLabel}</Text>
            </View>
            <View style={cardStyles.heroMetaPill}>
              <Text style={cardStyles.distanceText}>
                {resolvedAvatarSnapshot.label}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={cardStyles.nameRow}>
        <View style={cardStyles.identityStack}>
          <Text style={cardStyles.nameText}>Meet {displayName.split(" ")[0]}</Text>
          <Text style={cardStyles.headlineText}>
            {actionLabel}
          </Text>
        </View>
        {isOnline !== undefined ? (
          <TagChip label={presenceLabel} variant={isOnline ? "success" : "muted"} />
        ) : null}
      </View>

      <View style={cardStyles.tagsRow}>
        {vibeTags.map((tag) => (
          <TagChip key={tag} label={tag} />
        ))}
      </View>

      {isPending ? (
        <LinearGradient
          colors={[uiTheme.colors.primarySoft, "#FFF0F6"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={cardStyles.pendingBanner}
        >
          <View style={cardStyles.pendingDot} />
          <Text style={cardStyles.pendingText}>
            Waiting for {displayName.split(" ")[0]} to accept…
          </Text>
        </LinearGradient>
      ) : null}
    </View>
  )
}

export function CandidateAvatarPreview(props: {
  snapshot: CandidateAvatarSnapshot
  size?: number
  stage?: "discover" | "profile" | "match"
}) {
  const { snapshot, size = 160, stage = "profile" } = props
  const layers = useMemo(() => {
    const appearance = createCandidateAvatarAppearance(snapshot)
    return getRoomAvatarRenderLayers({
      appearance,
      catalog: ROOM_AVATAR_CATALOG
    })
  }, [snapshot])
  const platformWidth = size * (stage === "discover" ? 0.96 : 0.82)
  const avatarWidth = size * 0.62
  const avatarHeight = avatarWidth / (256 / 384)

  return (
    <View
      accessibilityLabel={`${snapshot.displayName} ${snapshot.label}`}
      style={[
        cardStyles.candidateAvatarStage,
        {
          width: size,
          height: size,
          borderRadius: size * 0.18
        }
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          cardStyles.candidateAvatarGlow,
          {
            width: size * 0.92,
            height: size * 0.68,
            borderRadius: size * 0.46
          }
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          cardStyles.candidateAvatarPlatform,
          {
            width: platformWidth,
            height: size * 0.2,
            borderRadius: size * 0.1
          }
        ]}
      />
      <View
        style={[
          cardStyles.candidateAvatarBody,
          {
            width: avatarWidth,
            height: avatarHeight
          }
        ]}
      >
        <RoomAvatarRenderer2D layers={layers} />
      </View>
    </View>
  )
}

// ── EmptyDiscoverCard ───────────────────────────────────────

export interface EmptyDiscoverCardProps {
  connectionStatus: RealtimeConnectionStatus
  myDisplayName: string
  myUserId: string
  hasSeenEveryone: boolean
}

export function EmptyDiscoverCard(props: EmptyDiscoverCardProps) {
  const { connectionStatus, myDisplayName, myUserId, hasSeenEveryone } = props
  const connecting = connectionStatus === "connecting" || connectionStatus === "idle"
  const offline = connectionStatus === "error" || connectionStatus === "disconnected"

  const title = offline
    ? "We lost the signal"
    : connecting
      ? "Joining the room…"
      : hasSeenEveryone
        ? "You've seen everyone for now"
        : "No new people yet"
  const body = offline
    ? "Check your connection. Your deck will stay ready."
    : connecting
      ? "Finding people who match your vibe. One moment."
      : hasSeenEveryone
        ? "New people will appear here when they match your vibe."
        : "Check back soon. We'll introduce you when someone new fits."

  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.heroBlock}>
        <ImageBackground
          source={discoverCardSurface}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
        />
        <View style={cardStyles.heroGlassWash} pointerEvents="none" />
        <View style={cardStyles.heroGlow} pointerEvents="none" />
        <View style={cardStyles.heroGlowSecondary} pointerEvents="none" />
        <MyAvatar
          name={myDisplayName}
          seed={myUserId}
          size={132}
          ring="soft"
        />
      </View>
      <Text style={cardStyles.emptyTitle}>{title}</Text>
      <Text style={cardStyles.emptyBody}>{body}</Text>
    </View>
  )
}

// ── Styles ──────────────────────────────────────────────────

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 34,
    backgroundColor: "rgba(255, 255, 255, 0.58)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.82)",
    padding: 8,
    gap: uiTheme.spacing.md,
    ...uiTheme.shadow.deep,
  },
  heroBlock: {
    height: 430,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.86)",
  },
  heroGlassWash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  heroGlow: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(255, 123, 174, 0.18)",
    top: 84,
  },
  heroGlowSecondary: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(190, 171, 255, 0.18)",
    right: -80,
    bottom: 30,
  },
  candidateAvatarStage: {
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "hidden",
    position: "relative",
  },
  candidateAvatarGlow: {
    position: "absolute",
    bottom: "13%",
    backgroundColor: "rgba(255, 255, 255, 0.32)"
  },
  candidateAvatarPlatform: {
    position: "absolute",
    bottom: "7%",
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.8)",
    transform: [{ rotate: "-3deg" }]
  },
  candidateAvatarShadow: {
    position: "absolute",
    bottom: "9%",
    backgroundColor: "rgba(64, 31, 66, 0.18)",
    transform: [{ rotate: "-3deg" }]
  },
  candidateAvatarBody: {
    marginBottom: "8%",
    zIndex: 2
  },
  heroInfoPanel: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: "rgba(255, 255, 255, 0.48)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.84)",
    gap: 12,
  },
  heroNameBlock: {
    gap: 4,
  },
  heroNameText: {
    ...uiTheme.font.title,
    fontSize: 34,
    color: uiTheme.colors.textPrimary,
  },
  heroHeadlineText: {
    ...uiTheme.font.bodySmall,
    color: "rgba(54, 40, 68, 0.72)",
    fontWeight: "800",
  },
  heroMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  heroMetaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.58)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.78)",
  },
  distancePill: {
    position: "absolute",
    bottom: uiTheme.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: uiTheme.radius.full,
    backgroundColor: uiTheme.colors.glassStrong,
    borderWidth: 1,
    borderColor: uiTheme.colors.glassBorder,
    ...uiTheme.shadow.soft,
  },
  avatarSourcePill: {
    position: "absolute",
    bottom: 56,
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.58)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.82)",
    ...uiTheme.shadow.soft,
  },
  avatarSourceText: {
    ...uiTheme.font.micro,
    color: "rgba(48, 35, 62, 0.74)",
    fontSize: 10,
  },
  distanceText: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.textPrimary,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiTheme.spacing.sm,
    paddingHorizontal: 10,
  },
  identityStack: {
    flex: 1,
    gap: 3,
  },
  nameText: {
    ...uiTheme.font.title,
    fontSize: 32,
    color: uiTheme.colors.textPrimary,
  },
  headlineText: {
    ...uiTheme.font.label,
    color: uiTheme.colors.primaryDeep,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiTheme.spacing.xs,
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  pendingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: uiTheme.spacing.sm,
    borderRadius: uiTheme.radius.full,
    borderWidth: 1,
    borderColor: "#FAD0E3",
  },
  pendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: uiTheme.colors.primary,
  },
  pendingText: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.primaryDeep,
    fontWeight: "700",
  },
  emptyTitle: {
    ...uiTheme.font.heading,
    color: uiTheme.colors.textPrimary,
    textAlign: "center",
  },
  emptyBody: {
    ...uiTheme.font.body,
    color: uiTheme.colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: uiTheme.spacing.md,
  },
})
