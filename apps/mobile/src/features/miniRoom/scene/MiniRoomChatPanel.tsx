import Ionicons from "@expo/vector-icons/Ionicons"
import { useEffect, useRef, type ReactNode } from "react"
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated"
import { hapticSelection } from "../../../ui/haptics"
import { animateToAfter, useMotion } from "../../../ui/motion"
import { PressableScale } from "../../../ui/PressableScale"
import type { MiniRoomCopy } from "../miniRoomCopy"
import type { RoomChatHistoryItem, RoomChatHistoryStatus } from "../roomChatHistoryModel"
import { MiniRoomChatHistory } from "./MiniRoomChatHistory"
import type { MiniRoomPanelMode } from "./miniRoomLayout"
import {
  MINI_ROOM_PAPER_BODY_UNIT, MINI_ROOM_PAPER_CAP, MINI_ROOM_PAPER_REST_MARGIN, MINI_ROOM_PAPER_SHADOW_UNIT,
  resolveMiniRoomContentDrift,
  resolveMiniRoomContentOpacity, resolveMiniRoomPaperGeometry, resolveMiniRoomTextWidths, type MiniRoomTransitionFrame
} from "./miniRoomTransitionModel"

/** How far the recent strip's items rise on its first appearance (points). */
const RECENT_ENTER_RISE = 6

interface MiniRoomChatPanelProps {
  copy: MiniRoomCopy
  mode: MiniRoomPanelMode
  transition: SharedValue<MiniRoomTransitionFrame>
  /** What the content opacities follow (crossfades alone under Reduce Motion). */
  contentProgress: SharedValue<number>
  windowWidth: number
  windowHeight: number
  historyHeight: number
  historyItems: readonly RoomChatHistoryItem[]
  historyStatus: RoomChatHistoryStatus
  partnerName: string
  recentMessage?: RoomChatHistoryItem
  onRecentHeightChange: (height: number) => void
  onRecentRowsHeightChange: (height: number) => void
  onCloseKeyboard: () => void
  scrollToLatestRequest: number
  children: ReactNode
}

/**
 * The chat paper. Every moving part is a transform or an opacity (house
 * rule 5): the paper is drawn from caps and a stretched middle
 * (resolveMiniRoomPaperGeometry), the content rides inside one clip pinned to
 * the paper's top edge, and the composer is pinned to its bottom edge. So the
 * keyboard-driven pose never re-lays out the transcript.
 */
export function MiniRoomChatPanel(props: MiniRoomChatPanelProps) {
  const { copy, mode, transition, contentProgress, windowWidth, windowHeight, historyHeight, historyItems,
    historyStatus, partnerName, recentMessage, onRecentHeightChange, onRecentRowsHeightChange, onCloseKeyboard,
    scrollToLatestRequest, children } = props
  const typing = mode === "typing"
  const historyDay = copy.historyDay(historyItems[0]?.sentAt)
  const textWidths = resolveMiniRoomTextWidths(windowWidth)
  // Switch once at the confirmed mode, rather than wrapping the draft at every
  // animated width. Endpoint sizing/padding stays identical to the chosen design.
  const composerWidth = typing ? textWidths.typingComposer : textWidths.historyComposer
  const restCapWidth = Math.max(0, windowWidth - 2 * MINI_ROOM_PAPER_REST_MARGIN)
  const topCapRestStyle = useAnimatedStyle(() => {
    const paper = resolveMiniRoomPaperGeometry(transition.value, windowWidth)
    return { transform: [{ translateY: -paper.topCapUp }, { scaleX: paper.restScaleX }] }
  })
  const topCapOpenStyle = useAnimatedStyle(() => {
    const paper = resolveMiniRoomPaperGeometry(transition.value, windowWidth)
    return { opacity: paper.openOpacity, transform: [{ translateY: -paper.topCapUp }, { scaleX: paper.fullScaleX }] }
  })
  const bodyStyle = useAnimatedStyle(() => {
    const paper = resolveMiniRoomPaperGeometry(transition.value, windowWidth)
    // Scaled about its centre: lift so the stretched bottom edge sits at bodyUp.
    const lift = paper.bodyUp - MINI_ROOM_PAPER_BODY_UNIT / 2 * (1 - paper.bodyScaleY)
    return { transform: [{ translateY: -lift }, { scaleX: paper.fullScaleX }, { scaleY: paper.bodyScaleY }] }
  })
  const bottomCapRestStyle = useAnimatedStyle(() => {
    const paper = resolveMiniRoomPaperGeometry(transition.value, windowWidth)
    return { transform: [{ translateY: -paper.bottomCapUp }, { scaleX: paper.restScaleX }] }
  })
  const bottomCapOpenStyle = useAnimatedStyle(() => {
    const paper = resolveMiniRoomPaperGeometry(transition.value, windowWidth)
    return { opacity: paper.openOpacity, transform: [{ translateY: -paper.bottomCapUp }, { scaleX: paper.fullScaleX }] }
  })
  const shadowStyle = useAnimatedStyle(() => {
    const paper = resolveMiniRoomPaperGeometry(transition.value, windowWidth)
    const lift = paper.shadowUp - MINI_ROOM_PAPER_SHADOW_UNIT / 2 * (1 - paper.shadowScaleY)
    return { transform: [{ translateY: -lift }, { scaleX: paper.shadowScaleX }, { scaleY: paper.shadowScaleY }] }
  })
  // The clip's top edge is the paper's top edge; it reaches past the bottom.
  const clipStyle = useAnimatedStyle(() => {
    const pose = transition.value
    return { transform: [{ translateY: windowHeight - pose.bottom - pose.height }] }
  })
  const motion = useMotion()
  const { reduceMotion } = motion
  // The handoff: each layer fades (the owner's quiet midpoint) and drifts a
  // few points while it is not fully shown; Reduce Motion keeps only the fade.
  // Inside the clip, y runs from the paper's top edge. The transcript keeps
  // its resting place under that edge; while the paper shrinks for the
  // keyboard it stays on the composer (height − restHeight), clipped from above.
  const historyStyle = useAnimatedStyle(() => {
    const pose = transition.value
    const drift = resolveMiniRoomContentDrift(contentProgress.value, reduceMotion).history
    return {
      opacity: resolveMiniRoomContentOpacity(contentProgress.value).history,
      transform: [{ translateX: pose.margin }, { translateY: pose.height - pose.restHeight + drift }]
    }
  })
  const recentStyle = useAnimatedStyle(() => ({
    opacity: resolveMiniRoomContentOpacity(contentProgress.value).recent,
    transform: [{ translateX: transition.value.margin },
      { translateY: resolveMiniRoomContentDrift(contentProgress.value, reduceMotion).recent }]
  }))
  // The recent strip's first appearance: name, line and close rise in on the
  // `stagger` token (once per room visit); afterwards it only crossfades.
  const enterName = useSharedValue(0)
  const enterText = useSharedValue(0)
  const enterClose = useSharedValue(0)
  const recentEntered = useRef(false)
  useEffect(() => {
    if (!typing || recentEntered.current) return
    recentEntered.current = true
    ;[enterName, enterText, enterClose].forEach((value, index) => {
      value.value = animateToAfter(motion.staggerDelay(index), 1, motion.smooth)
    })
  }, [enterClose, enterName, enterText, motion, typing])
  const enterNameStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: reduceMotion ? 0 : (1 - enterName.value) * RECENT_ENTER_RISE }]
  }))
  const enterTextStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: reduceMotion ? 0 : (1 - enterText.value) * RECENT_ENTER_RISE }]
  }))
  const enterCloseStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: reduceMotion ? 0 : (1 - enterClose.value) * RECENT_ENTER_RISE }]
  }))
  // Pinned to the paper's bottom edge: 10 points above it at rest, 9 when open.
  const composerStyle = useAnimatedStyle(() => {
    const pose = transition.value
    return { transform: [{ translateY: pose.height - (10 - pose.progress) - windowHeight }] }
  })
  const measureRecent = (event: LayoutChangeEvent) => onRecentHeightChange(event.nativeEvent.layout.height)
  const restCapStyle = { left: MINI_ROOM_PAPER_REST_MARGIN, width: restCapWidth }
  const fullWidthStyle = { width: windowWidth }
  return (
    <View pointerEvents="box-none" style={[styles.dock, { height: windowHeight }]}>
      <View pointerEvents="box-none" style={styles.paper}>
        <Animated.View style={[styles.piece, styles.shadow, fullWidthStyle, shadowStyle]} />
        <Animated.View style={[styles.piece, styles.topCapRest, restCapStyle, topCapRestStyle]} />
        <Animated.View style={[styles.piece, styles.topCapOpen, fullWidthStyle, topCapOpenStyle]} />
        <Animated.View style={[styles.piece, styles.body, fullWidthStyle, bodyStyle]} />
        <Animated.View style={[styles.piece, styles.bottomCapRest, restCapStyle, bottomCapRestStyle]} />
        <Animated.View style={[styles.piece, fullWidthStyle, bottomCapOpenStyle]} />
      </View>
      <Animated.View pointerEvents="box-none" style={[styles.clip, { width: windowWidth, height: windowHeight }, clipStyle]}>
        <Animated.View style={[styles.recent, { width: textWidths.recent }, recentStyle]} onLayout={measureRecent}
          pointerEvents={typing ? "auto" : "none"} accessibilityElementsHidden={!typing}
          importantForAccessibility={typing ? "auto" : "no-hide-descendants"}>
          <Animated.Text numberOfLines={1} maxFontSizeMultiplier={1.35} style={[styles.recentName, enterNameStyle]}>
            {recentMessage?.mine ? copy.youLabel : partnerName}
          </Animated.Text>
          <Animated.Text numberOfLines={2} ellipsizeMode="tail" maxFontSizeMultiplier={1.35}
            style={[styles.recentText, enterTextStyle]}>
            {recentMessage?.body ?? copy.historyEmpty}
          </Animated.Text>
          <Animated.View style={enterCloseStyle}>
            <PressableScale accessibilityRole="button" accessibilityLabel={copy.closeKeyboard} hitSlop={6}
              onPress={() => {
                hapticSelection()
                onCloseKeyboard()
              }} style={styles.closeKeyboard}>
              <Ionicons name="chevron-down" size={18} color="#70596E" />
            </PressableScale>
          </Animated.View>
        </Animated.View>
        <Animated.View style={[styles.historyContent, { width: textWidths.history, height: historyHeight + 26 }, historyStyle]}
          pointerEvents={typing ? "none" : "auto"} accessibilityElementsHidden={typing}
          importantForAccessibility={typing ? "no-hide-descendants" : "auto"}>
          <View style={styles.heading}>
            <Text maxFontSizeMultiplier={1.35} style={styles.headingText}>{copy.historyHeading}</Text>
            {historyDay ? <Text maxFontSizeMultiplier={1.35} style={styles.dayText}>{historyDay}</Text> : null}
          </View>
          <MiniRoomChatHistory copy={copy} items={historyItems} status={historyStatus}
            partnerName={partnerName} height={historyHeight}
            onRecentRowsHeightChange={onRecentRowsHeightChange} scrollToLatestRequest={scrollToLatestRequest} />
        </Animated.View>
        <Animated.View style={[styles.composer, { width: composerWidth, left: (windowWidth - composerWidth) / 2 },
          composerStyle]}>{children}</Animated.View>
      </Animated.View>
    </View>
  )
}
const PAPER = "#FFFCFF"
const styles = StyleSheet.create({
  dock: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 20 },
  paper: StyleSheet.absoluteFill,
  piece: { position: "absolute", left: 0, bottom: 0, height: MINI_ROOM_PAPER_CAP, backgroundColor: PAPER },
  // A solid caster gets a path shadow (no offscreen pass while it moves).
  shadow: {
    height: MINI_ROOM_PAPER_SHADOW_UNIT,
    shadowColor: "#865078", shadowOpacity: 0.07, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }
  },
  topCapRest: { borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  topCapOpen: { borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  body: { height: MINI_ROOM_PAPER_BODY_UNIT },
  bottomCapRest: { borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
  clip: { position: "absolute", left: 0, top: 0, overflow: "hidden" },
  composer: { position: "absolute", bottom: 0 },
  // Paper edge + 1-point inner inset + the design's 9 / 16 / 6 / 17 padding.
  historyContent: { position: "absolute", top: 10, left: 17, overflow: "hidden" },
  heading: { height: 24, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headingText: { color: "#8C7892", fontFamily: "Inter_600SemiBold", fontSize: 11, lineHeight: 14 },
  dayText: { color: "#8C7892", fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 14 },
  recent: { position: "absolute", top: 7, left: 18, minHeight: 39,
    flexDirection: "row", alignItems: "center", gap: 8 },
  recentName: { maxWidth: 74, color: "#9B5477", fontFamily: "Inter_600SemiBold", fontSize: 11, lineHeight: 16 },
  recentText: { flex: 1, color: "#86718C", fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginVertical: 11.5 },
  closeKeyboard: { width: 32, height: 32, alignItems: "center", justifyContent: "center" }
})
