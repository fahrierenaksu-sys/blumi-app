import Ionicons from "@expo/vector-icons/Ionicons"
import { useEffect } from "react"
import { StyleSheet, Text, View } from "react-native"
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated"
import { blumiEntryTheme as uiTheme } from "../../../ui/theme"

interface RoomSetupProgressRailProps {
  motionActive: boolean
  ready: boolean
  reduceMotion: boolean
  selected: boolean
}

export function RoomSetupProgressRail({
  motionActive,
  ready,
  reduceMotion,
  selected
}: RoomSetupProgressRailProps) {
  return (
    <View
      accessibilityLabel={ready
        ? "Oda kurulumu tamamlandı"
        : selected
          ? "Yatak seçildi, şimdi odada yerleştir"
          : "Önce yatağı seç, sonra odada yerleştir"}
      style={styles.root}
    >
      <QuestStep
        active={!selected}
        complete={selected || ready}
        icon="hand-left-outline"
        label="Yatağı seç"
        motionActive={motionActive}
        reduceMotion={reduceMotion}
      />
      <View style={[styles.connector, selected ? styles.connectorActive : null]} />
      <QuestStep
        active={selected && !ready}
        complete={ready}
        icon="sparkles-outline"
        label="Odaya yerleştir"
        motionActive={motionActive}
        reduceMotion={reduceMotion}
      />
    </View>
  )
}

function QuestStep(props: {
  active: boolean
  complete: boolean
  icon: keyof typeof Ionicons.glyphMap
  label: string
  motionActive: boolean
  reduceMotion: boolean
}) {
  const progress = useSharedValue(props.active || props.complete ? 1 : 0)

  useEffect(() => {
    progress.value = withTiming(props.active || props.complete ? 1 : 0, {
      duration: !props.motionActive ? 0 : props.reduceMotion ? 120 : 240,
      easing: Easing.out(Easing.cubic)
    })
  }, [progress, props.active, props.complete, props.motionActive, props.reduceMotion])

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ["rgba(255,255,255,0.54)", "rgba(255,226,237,0.9)"]
    ),
    borderColor: interpolateColor(
      progress.value,
      [0, 1],
      ["rgba(221,204,216,0.72)", "rgba(209,55,96,0.42)"]
    ),
    transform: [{
      scale: props.reduceMotion
        ? 1
        : interpolate(progress.value, [0, 1], [0.985, 1])
    }]
  }))

  return (
    <Animated.View style={[styles.step, animatedStyle]}>
      <View style={[styles.iconFrame, props.complete ? styles.iconFrameComplete : null]}>
        <Ionicons
          color={props.complete ? "#FFFFFF" : uiTheme.colors.primaryDeep}
          name={props.complete ? "checkmark" : props.icon}
          size={16}
        />
      </View>
      <Text numberOfLines={1} style={styles.label}>{props.label}</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    flexDirection: "row",
    width: "100%"
  },
  step: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 9
  },
  connector: {
    backgroundColor: "rgba(206,184,198,0.5)",
    height: 2,
    width: 12
  },
  connectorActive: {
    backgroundColor: uiTheme.colors.primary
  },
  iconFrame: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.78)",
    borderRadius: 13,
    height: 26,
    justifyContent: "center",
    width: 26
  },
  iconFrameComplete: {
    backgroundColor: uiTheme.colors.primary
  },
  label: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.primaryDeep,
    flex: 1,
    fontFamily: "Inter_700Bold"
  }
})
