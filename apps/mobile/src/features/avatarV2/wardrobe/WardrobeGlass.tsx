import type { ReactNode } from "react"
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { useReduceTransparency } from "../../../ui/reduceTransparency"
import { getOptionalBlurView } from "./optionalBlurView"
import { wardrobeTheme } from "./wardrobeV2Styles"

type WardrobeGlassTone = "panel" | "control"

// Resolved once at load: null when this binary lacks the native blur module.
const OptionalBlurView = getOptionalBlurView()

/**
 * A light glass surface: thin bright edge, soft shadow, faint sheen and, where
 * the native blur exists, a gentle backdrop blur. Content stays on top of a
 * near-opaque tint so text and products remain sharp. Reduce Transparency or a
 * missing blur module gives the same shape as a solid surface.
 */
export function WardrobeGlass(props: {
  tone: WardrobeGlassTone
  radius: number
  style?: StyleProp<ViewStyle>
  contentStyle?: StyleProp<ViewStyle>
  children?: ReactNode
}) {
  const { tone, radius, style, contentStyle, children } = props
  const reduceTransparency = useReduceTransparency()
  const isPanel = tone === "panel"
  const tint = reduceTransparency
    ? {
        backgroundColor: isPanel ? wardrobeTheme.panelSolid : wardrobeTheme.controlSolid
      }
    : {
        backgroundColor: isPanel ? wardrobeTheme.panelSolid : wardrobeTheme.controlSolid,
        experimental_backgroundImage: isPanel
          ? wardrobeTheme.panelGradient
          : wardrobeTheme.controlGradient
      }

  return (
    <View
      style={[
        isPanel ? styles.panelShadow : styles.controlShadow,
        { borderRadius: radius },
        style
      ]}
    >
      <View style={[styles.clip, { borderRadius: radius }]}>
        {!reduceTransparency && OptionalBlurView && isPanel ? (
          <OptionalBlurView intensity={26} tint="light" style={StyleSheet.absoluteFill} />
        ) : null}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, tint]} />
        {reduceTransparency ? null : (
          <View pointerEvents="none" style={[styles.sheen, { height: isPanel ? 64 : 20 }]} />
        )}
        <View pointerEvents="none" style={styles.edgeLight} />
        <View
          pointerEvents="none"
          style={[styles.border, { borderRadius: radius }]}
        />
        <View style={[styles.content, contentStyle]}>{children}</View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  panelShadow: {
    shadowColor: wardrobeTheme.shadow,
    shadowOpacity: 0.11,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4
  },
  controlShadow: {
    shadowColor: wardrobeTheme.shadow,
    shadowOpacity: 0.09,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2
  },
  // flexGrow, not flex: a fixed-size shell is filled, an auto-height one hugs its content.
  clip: {
    flexGrow: 1,
    overflow: "hidden"
  },
  sheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    experimental_backgroundImage: wardrobeTheme.sheenGradient
  },
  edgeLight: {
    position: "absolute",
    top: 0,
    left: 18,
    right: 18,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: wardrobeTheme.edge
  },
  border: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.92)"
  },
  content: {
    flexGrow: 1
  }
})
