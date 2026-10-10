import { memo } from "react"
import { StyleSheet, View } from "react-native"
import { Image as ExpoImage } from "expo-image"
import type { RoomV2AssetRef, RoomV2FurnitureRenderItem } from "../roomV2.types"

/**
 * The extra layers of a piece drawn from room-camera layers (room calibration only, see
 * `RoomV2FurnitureRenderItem.layered25d`): its floor shadow under every item, and its front layer right after
 * the avatar seated in it. Both sit exactly on the item's own box and never take touches.
 */
function getLayeredBoxStyle(item: RoomV2FurnitureRenderItem) {
  const offset = item.renderOffset ?? { x: 0, y: 0 }
  const left = item.x + offset.x - item.width * item.anchor.x
  const top = item.y + offset.y - item.height * item.anchor.y
  return {
    left: `${left * 100}%` as const,
    top: `${top * 100}%` as const,
    width: `${item.width * 100}%` as const,
    height: `${item.height * 100}%` as const
  }
}

function LayerImage(props: { asset: RoomV2AssetRef }) {
  return (
    <ExpoImage
      source={props.asset.source}
      contentFit="fill"
      cachePolicy="memory-disk"
      allowDownscaling={false}
      transition={0}
      style={styles.image}
    />
  )
}

export const RoomRendererLayeredFurnitureShadow = memo(function RoomRendererLayeredFurnitureShadow(
  props: { item: RoomV2FurnitureRenderItem }
) {
  const shadow = props.item.layered25d?.shadowAsset
  if (!shadow) return null
  return (
    <View pointerEvents="none" style={[styles.box, getLayeredBoxStyle(props.item)]}>
      <LayerImage asset={shadow} />
    </View>
  )
}, (previous, next) => previous.item === next.item)

/**
 * The front layer over one seated avatar, drawn right after her. In a front view it draws only above her seat's
 * cushion front edge (`frontVisibleHeight`, per seat): below it her shins and shoes stay in front of the piece (the
 * back layer under them has the same pixels, so this equals splitting her drawing at that edge). Two sitters on
 * one piece each get their own copy, drawn far to near, so the nearer one's front layer also covers the farther one.
 */
export const RoomRendererLayeredFurnitureFront = memo(function RoomRendererLayeredFurnitureFront(
  props: {
    item: RoomV2FurnitureRenderItem
    frontVisibleHeight?: number
    testID?: string
    /** A layer that sorts furniture among avatars by z-index (MiniRoom): right above the sitter it covers. */
    zIndex?: number
  }
) {
  const front = props.item.layered25d?.frontAsset
  if (!front) return null
  const visible = props.frontVisibleHeight
  return (
    <View
      pointerEvents="none"
      testID={props.testID}
      style={[styles.box, getLayeredBoxStyle(props.item), props.zIndex !== undefined ? { zIndex: props.zIndex } : null]}
    >
      <View style={[styles.crop, visible !== undefined ? { height: `${visible * 100}%` } : styles.full]}>
        <View style={[styles.full, visible !== undefined && visible > 0 ? { height: `${100 / visible}%` } : null]}>
          <LayerImage asset={front} />
        </View>
      </View>
    </View>
  )
}, (previous, next) =>
  previous.item === next.item &&
  previous.frontVisibleHeight === next.frontVisibleHeight &&
  previous.testID === next.testID &&
  previous.zIndex === next.zIndex)

const styles = StyleSheet.create({
  box: { position: "absolute" },
  crop: { position: "absolute", left: 0, top: 0, width: "100%", overflow: "hidden" },
  full: { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" },
  image: { width: "100%", height: "100%" }
})
