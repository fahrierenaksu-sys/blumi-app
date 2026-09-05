/**
 * DemoLobbyView – replaces the real lobby discover section when demo mode is active.
 *
 * Shows:
 * - Swipeable profile cards with left/right gestures
 * - Like (♥) / Skip (✕) action buttons
 * - Match detection + Blumi shared-room entry
 * - Empty state when deck is exhausted
 * - Deck progress indicator
 */

import { useCallback, useRef } from "react"
import { Animated, StyleSheet, Vibration, View } from "react-native"
import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { useDemoStore } from "../features/demo/demoStore"
import type { SessionActor } from "../features/session/sessionModel"
import { DiscoveryDeckView } from "../features/discovery/DiscoveryDeckView"
import { EmptyDiscoveryDeck } from "../features/discovery/EmptyDiscoveryDeck"
import { createLocalDemoMatch } from "../features/matches/matchRoomModel"
import { uiTheme } from "../ui/theme"

  // Demo-only visual fixture. Production Discovery receives roomSnapshotUrl
  // from the server's revision-bound Room Save projection instead.
  const demoRoomSnapshot = require("../features/miniRoom/assets/runtime/rooms/cozy_pink_bedroom/room_snapshot_card.png")

interface DemoLobbyViewProps {
  sessionActor: SessionActor
}

export function DemoLobbyView({ sessionActor }: DemoLobbyViewProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const demo = useDemoStore()

  // The shared deck resets this stable value in a layout effect before the
  // next featured card paints. Recreating it during render remounts the back
  // cards and creates a visible one-frame flash.
  const swipeAnim = useRef(new Animated.ValueXY()).current

  const handleSwipeRight = useCallback(
    (userId: string) => {
      Vibration.vibrate(18)
      const result = demo.like(
        userId,
        {
          userId: sessionActor.profile.userId,
          displayName: sessionActor.profile.displayName
        }
      )
      if (result.matched && result.profile) {
        const matchedProfile = result.profile
        // Let the card finish leaving before opening the match moment.
        setTimeout(() => {
          Vibration.vibrate([0, 40, 60, 40, 60, 80])
          navigation.navigate("MatchResult", {
            match: createLocalDemoMatch({
              currentUser: {
                userId: sessionActor.profile.userId,
                displayName: sessionActor.profile.displayName
              },
              matchedUser: {
                userId: matchedProfile.userId,
                displayName: matchedProfile.displayName
              },
              mode: "demo"
            })
          })
        }, 320)
      }
    },
    [demo, navigation, sessionActor]
  )

  const handleSwipeLeft = useCallback(
    (userId: string) => {
      Vibration.vibrate(10)
      demo.skip(userId)
    },
    [demo]
  )

  return (
    <View style={styles.demoContainer}>
      <DiscoveryDeckView
        profiles={demo.deck.map((profile) => ({
          ...profile,
          signals: profile.signals,
          prompts: profile.prompt
            ? [{ promptId: "small_joy" as const, answer: profile.prompt }]
            : undefined,
          badges: profile.badges,
          roomSnapshot: demoRoomSnapshot,
          roomHeadline: profile.userId === "demo-user-001" ? "Kahve ve sakin pazarlar" : undefined
        }))}
        swipeAnim={swipeAnim}
        onSwipeRight={handleSwipeRight}
        onSwipeLeft={handleSwipeLeft}
        progressLabel={demo.deckRemaining > 0
          ? `${demo.deckRemaining} nearby ${demo.deckRemaining === 1 ? "vibe" : "vibes"}`
          : "Fresh vibes soon"}
        emptyContent={(
          <EmptyDiscoveryDeck
            avatarName={sessionActor.profile.displayName}
            avatarSeed={sessionActor.profile.userId}
            avatarSelection={sessionActor.profile.avatar}
            onRefresh={demo.reset}
          />
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  demoContainer: {
    flex: 1,
    width: "100%",
  },
  deckWrapper: {
    height: 548,
    marginTop: 10,
    position: "relative",
  },
  middleCardContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: -2,
  },
  bottomCardContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    transform: [
      { translateX: -10 },
      { translateY: -30 },
      { rotate: "-3deg" },
      { scale: 0.98 }
    ],
    opacity: 0.96,
    zIndex: -3,
  },
  actionRow: {
    position: "absolute",
    bottom: 30,
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.30)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.70)",
    zIndex: 20,
    ...uiTheme.shadow.soft,
  },
  secondaryActionButton: {
    backgroundColor: "rgba(255, 255, 255, 0.42)",
    borderColor: "rgba(255, 255, 255, 0.76)",
  },
  secondaryActionText: {
    fontSize: 18,
    color: "rgba(44, 31, 55, 0.76)",
    fontWeight: "900",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: -uiTheme.spacing.xs,
  },
  progressDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: uiTheme.colors.success,
  },
  progressText: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  emptyCard: {
    borderRadius: uiTheme.radius.xl,
    backgroundColor: uiTheme.colors.glass,
    borderWidth: 1,
    borderColor: uiTheme.colors.glassBorder,
    padding: uiTheme.spacing.xl,
    gap: uiTheme.spacing.md,
    alignItems: "center",
    overflow: "hidden",
    position: "relative",
    ...uiTheme.shadow.deep,
  },
  emptyGlow: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: uiTheme.colors.accentGlow,
    top: -100,
    right: -80,
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
  resetHint: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.primaryDeep,
    marginTop: -uiTheme.spacing.xxs,
  },
})
