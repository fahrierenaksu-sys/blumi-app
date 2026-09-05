import { useMemo } from "react"
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native"
import { blumiEntryTheme, uiTheme } from "../../../ui/theme"
import { AVATAR_V2_CATALOG } from "../avatarV2.mock"
import { ROOM_AVATAR_CATALOG } from "../room/avatarRoom.mock"
import { projectAvatarV2ToRoomAvatarAppearance } from "../room/avatarRoomProjection"
import { getRoomAvatarRenderLayers } from "../room/avatarRoomSelectors"
import { RoomAvatarRenderer2D } from "../room/components/RoomAvatarRenderer2D"
import type {
  AvatarAnimationState,
  AvatarCatalogItem,
  AvatarItemType,
  UserAvatar
} from "../avatarV2.types"
import type {
  RoomFurnitureRotation,
  RoomV2AvatarMotionState
} from "../../roomV2/roomV2.types"

export interface AvatarPreview2DProps {
  avatar?: Partial<UserAvatar>
  catalog?: AvatarCatalogItem[]
  animationState?: AvatarAnimationState
  size?: number
  stageHeight?: number
  selectedType?: AvatarItemType
  label?: string
  metaTone?: "dark" | "light"
  themeTone?: "app" | "entry"
  showGlow?: boolean
  style?: StyleProp<ViewStyle>
}

export function AvatarPreview2D(props: AvatarPreview2DProps) {
  const {
    avatar,
    catalog = AVATAR_V2_CATALOG,
    animationState = "idle_front",
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
  const roomAvatarLayers = useMemo(() => {
    const { appearance } = projectAvatarV2ToRoomAvatarAppearance({
      avatar,
      avatarCatalog: catalog,
      roomAvatarCatalog: ROOM_AVATAR_CATALOG
    })
    const roomMotion = getRoomAvatarMotionFromPreviewState(animationState)

    return getRoomAvatarRenderLayers({
      appearance,
      catalog: ROOM_AVATAR_CATALOG,
      direction: roomMotion.direction,
      state: roomMotion.state
    })
  }, [animationState, avatar, catalog])

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
          <RoomAvatarRenderer2D layers={roomAvatarLayers} />
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

function getRoomAvatarMotionFromPreviewState(
  animationState: AvatarAnimationState
): {
  state: RoomV2AvatarMotionState
  direction: RoomFurnitureRotation
} {
  switch (animationState) {
    case "walk_front":
      return { state: "walking", direction: "front" }
    case "sit_front":
      return { state: "sitting", direction: "front" }
    case "wave_front":
      return { state: "waving", direction: "front" }
    case "idle_front":
      return { state: "idle", direction: "front" }
  }
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
  floorShadow: {
    position: "absolute",
    bottom: 14,
    width: 132,
    height: 24,
    borderRadius: 999,
    backgroundColor: "rgba(20, 8, 24, 0.36)"
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
