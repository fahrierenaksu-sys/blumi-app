import type { ReactNode } from "react"
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { useReduceTransparency } from "../../../ui/reduceTransparency"
import { wardrobeTheme } from "./wardrobeV2Styles"

type WardrobeGlassTone = "panel" | "control"

/**
 * A light glass surface: thin bright edge, soft shadow and faint sheen over an
 * opaque tint, so text and products stay sharp. Reduce Transparency drops the
 * gradient and sheen. WRD-4: there is no backdrop blur: the opaque tint always
 * covered it (it was paid for and never visible), and the binary-missing guard
 * could not detect a missing native module anyway.
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
