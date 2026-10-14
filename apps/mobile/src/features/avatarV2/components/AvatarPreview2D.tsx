import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native"
import { blumiEntryTheme, uiTheme } from "../../../ui/theme"
import type { AvatarItemType, UserAvatar } from "../avatarV2.types"
import { AvatarTryOnFigure } from "./AvatarTryOnFigure"

export interface AvatarPreview2DProps {
  avatar?: Partial<UserAvatar>
  size?: number
  stageHeight?: number
  selectedType?: AvatarItemType
  label?: string
  /** What screen readers hear for the figure. */
  accessibilityLabel?: string
  metaTone?: "dark" | "light"
  themeTone?: "app" | "entry"
  showGlow?: boolean
  style?: StyleProp<ViewStyle>
}

export function AvatarPreview2D(props: AvatarPreview2DProps) {
  const {
    avatar,
    size = 220,
    stageHeight = 286,
    selectedType,
    label,
    metaTone = "dark",
    themeTone = "app",
    showGlow = true,
    style
  } = props
  const previewTheme = themeTone === "entry" ? blumiEntryTheme : uiTheme
  const avatarHeight = size / (256 / 384)

  return (
    <View style={[styles.root, style]}>
      <View style={[styles.stage, { minHeight: stageHeight }]}>
        {showGlow ? (
          <View
            style={[
              styles.glow,
              { backgroundColor: previewTheme.colors.avatarPreviewGlow }
            ]}
          />
        ) : null}
        <View style={[styles.avatar, { width: size, height: avatarHeight }]}>
          <AvatarTryOnFigure
            avatar={avatar}
            width={size}
            height={avatarHeight}
            accessibilityLabel={props.accessibilityLabel ?? label ?? ""}
          />
        </View>
      </View>
      {label || selectedType ? (
        <View
          style={[
            styles.metaPill,
            metaTone === "light" ? styles.metaPillLight : null
          ]}
        >
          <View
            style={[
              styles.metaDot,
              { backgroundColor: previewTheme.colors.primary }
            ]}
          />
          <Text
            style={[
              styles.metaText,
              metaTone === "light" ? styles.metaTextLight : null,
              metaTone === "light"
                ? { color: previewTheme.colors.textPrimary }
                : null
            ]}
            numberOfLines={1}
          >
            {label ?? `${selectedType} selected`}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center"
  },
  stage: {
    width: "100%",
    minHeight: 286,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "visible"
  },
  glow: {
    position: "absolute",
    bottom: 30,
    width: 196,
    height: 156,
    borderRadius: 98
  },
  avatar: {
    marginBottom: -2
  },
  metaPill: {
    marginTop: uiTheme.spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)"
  },
  metaPillLight: {
    backgroundColor: "#FFFFFF",
    borderColor: "#F2DDEA"
  },
  metaDot: {
    width: 7,
    height: 7,
    borderRadius: 999
  },
  metaText: {
    maxWidth: 170,
    color: "rgba(255,255,255,0.78)",
    ...uiTheme.font.caption,
    fontWeight: "800",
    textTransform: "capitalize"
  },
  metaTextLight: {}
})
