import { useEffect, type ComponentProps } from "react"
import { Image as ExpoImage } from "expo-image"
import { StyleSheet, Text, View } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated"
import { MOTION_DURATIONS } from "../../ui/motionTokens"
import { animateTo, useMotion } from "../../ui/motion"
import { uiTheme } from "../../ui/theme"
import type { RoomShowcaseSlot } from "./discoveryShowcaseAuthorizationModel"

/**
 * The bottom of a Discover card's back face: the room showcase panel or the
 * "tap again" hint. Both sit in fixed frames and only crossfade, so the room
 * arriving (or not) never moves or pops anything. A card that can have a
 * showcase holds the panel's frame as a quiet placeholder until the answer is
 * in. Room images use the memory cache only: the showcase is re-authorized on
 * every flip and is not kept on disk.
 */
export function DiscoveryRoomShowcaseSlot(props: {
  slot: RoomShowcaseSlot
  roomSnapshot?: ComponentProps<typeof ExpoImage>["source"]
  roomHeadline?: string
  label: string
  returnHint: string
  imagePriority: "low" | "normal" | "high"
}) {
  const { slot, roomSnapshot, roomHeadline } = props
  const motion = useMotion()
  const panelOpacity = useSharedValue(slot === "footer" ? 0 : 1)
  const roomOpacity = useSharedValue(slot === "room" ? 1 : 0)
  const footerOpacity = useSharedValue(slot === "footer" ? 1 : 0)
  useEffect(() => {
    panelOpacity.value = animateTo(slot === "footer" ? 0 : 1, motion.crossfade)
    roomOpacity.value = animateTo(slot === "room" ? 1 : 0, motion.crossfade)
    footerOpacity.value = animateTo(slot === "footer" ? 1 : 0, motion.crossfade)
  }, [footerOpacity, motion, panelOpacity, roomOpacity, slot])
  const panelStyle = useAnimatedStyle(() => ({ opacity: panelOpacity.value }))
  const roomStyle = useAnimatedStyle(() => ({ opacity: roomOpacity.value }))
  const footerStyle = useAnimatedStyle(() => ({ opacity: footerOpacity.value }))

  return (
    <>
      <Animated.View style={[styles.panel, panelStyle]} pointerEvents="none">
        <Animated.View style={[StyleSheet.absoluteFill, roomStyle]}>
          {roomSnapshot ? (
            <ExpoImage
              source={roomSnapshot}
              contentFit="contain"
              cachePolicy="memory"
              priority={props.imagePriority}
              transition={MOTION_DURATIONS.crossfade}
              style={styles.image}
            />
          ) : null}
          <View style={styles.wash} />
          <View style={styles.copy}>
            <Text style={styles.label}>{props.label}</Text>
            {roomHeadline ? (
              <Text style={styles.headline} numberOfLines={1}>
                {roomHeadline}
              </Text>
            ) : null}
          </View>
        </Animated.View>
      </Animated.View>
      <Animated.View style={[styles.footer, footerStyle]} pointerEvents="none">
        <Text style={styles.footerText}>{props.returnHint}</Text>
        <View style={styles.footerLine} />
      </Animated.View>
    </>
  )
}

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 50,
    height: 72,
    zIndex: 8,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#E9DDF4",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.72)",
  },
  image: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 104,
    backgroundColor: "#E9DDF4",
    opacity: 0.96,
  },
  wash: {
    ...StyleSheet.absoluteFill,
    left: 104,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
  copy: {
    position: "absolute",
    left: 117,
    right: 13,
    bottom: 10,
  },
  label: {
    ...uiTheme.font.overline,
    color: "#816B96",
    fontSize: 9,
    letterSpacing: 1.2,
  },
  headline: {
    ...uiTheme.font.bodyMedium,
    color: "#33213E",
    fontSize: 14,
    fontWeight: "800",
  },
  footer: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  footerText: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted,
  },
  footerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(76, 53, 72, 0.12)",
  },
})
