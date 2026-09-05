import Ionicons from "@expo/vector-icons/Ionicons"
import { memo, useMemo } from "react"
import {
  Image,
  type ImageStyle,
  Pressable,
  Text,
  View
} from "react-native"
import { AVATAR_V2_CATALOG } from "../avatarV2/avatarV2.mock"
import type { UserAvatar } from "../avatarV2/avatarV2.types"
import { ROOM_AVATAR_CATALOG } from "../avatarV2/room/avatarRoom.mock"
import { projectAvatarV2ToRoomAvatarAppearance } from "../avatarV2/room/avatarRoomProjection"
import { getRoomAvatarRenderLayers } from "../avatarV2/room/avatarRoomSelectors"
import { RoomRenderer2D } from "../roomV2/components/RoomRenderer2D"
import { resolveRoomV2Scene } from "../roomV2/roomV2Selectors"
import type { FurnitureItem } from "../roomV2/roomV2.types"
import type { AppLocale } from "../session/appLocale"
import type { ShopCatalogItem } from "./shopCatalog"
import { getShopCopy } from "./shopCopy"
import { formatCoins } from "./shopFormatters"
import type { ShopLayoutMetrics } from "./shopLayoutMetrics"
import { shopPreviewStyles as styles } from "./shopPreviewStyles"
import { uiTheme } from "../../ui/theme"

export function ShopPreviewPanel(props: {
  product: ShopCatalogItem | undefined
  previewAvatar: UserAvatar
  roomPreviewScene: ReturnType<typeof resolveRoomV2Scene>
  layoutMetrics: ShopLayoutMetrics
  isPurchasing: boolean
  locale: AppLocale
  isActionAvailable: boolean
  primaryActionLabel?: string
  primaryActionDisabled?: boolean
  canRemovePreview?: boolean
  onRemovePreview?: () => void
  onPrimaryAction: () => void
}) {
  const {
    isPurchasing,
    layoutMetrics,
    locale,
    isActionAvailable,
    product,
    primaryActionDisabled,
    primaryActionLabel,
    canRemovePreview = false,
    onRemovePreview,
    previewAvatar,
    roomPreviewScene,
    onPrimaryAction
  } = props
  if (!product) return null

  const copy = getShopCopy(locale)
  const disabled = (primaryActionDisabled ?? product.actionType === "disabled") ||
    isPurchasing ||
    !isActionAvailable
  const actionLabel = primaryActionLabel ?? product.actionLabel
  const isAvatarUnlock = product.actionType === "avatarUnlock" &&
    primaryActionLabel === undefined &&
    product.priceCoins !== null
  const avatarActionAccessibilityLabel = isAvatarUnlock
    ? `${copy.unlock}, ${formatCoins(product.priceCoins ?? 0, locale)} ${copy.coins}`
    : actionLabel
  const previewGuide =
    product.previewType === "avatar"
      ? copy.avatarPreviewGuide
      : product.previewType === "room"
        ? copy.roomPreviewGuide
        : copy.genericPreviewGuide
  const avatarPreview = product.previewType === "avatar"
  const roomPreview = product.previewType === "room"
  const stageHeight = avatarPreview
    ? layoutMetrics.preview.avatarStageHeight
    : layoutMetrics.preview.roomStageHeight

  return (
    <View
      testID="shop-selected-product-preview"
      accessibilityLabel={`${product.title}, ${product.stateLabel}`}
      style={[
        styles.previewCard,
        {
          gap: layoutMetrics.preview.cardGap,
          padding: layoutMetrics.preview.cardPadding
        }
      ]}
    >
      <View
        style={[
          styles.previewHeroBody,
          {
            gap: layoutMetrics.preview.heroGap,
            minHeight: stageHeight
          }
        ]}
      >
        <View
          style={[
            styles.previewStage,
            avatarPreview
              ? styles.previewStageAvatar
              : styles.previewStageRoom,
            { minHeight: stageHeight }
          ]}
        >
          <View style={styles.previewSparkleA}>
            <Ionicons name="sparkles" size={17} color="rgba(255, 255, 255, 0.86)" />
          </View>
          <View style={styles.previewSparkleB}>
            <Ionicons name="sparkles" size={12} color="rgba(255, 79, 152, 0.36)" />
          </View>
          {avatarPreview ? (
            <ShopAvatarLivePreview
              avatar={previewAvatar}
              avatarWidth={layoutMetrics.preview.avatarWidth}
            />
          ) : (
            <ShopRoomItemPreview item={product.roomItem} scene={roomPreviewScene} locale={locale} />
          )}
          <View
            style={[
              styles.roomHeroTopOverlay,
              {
                left: layoutMetrics.preview.overlayInset,
                right: layoutMetrics.preview.overlayInset,
                top: layoutMetrics.preview.overlayInset
              }
            ]}
          >
            <View style={[
              styles.roomHeroTitleGlass,
              avatarPreview ? styles.avatarHeroTopPanel : null
            ]}>
              <Text style={styles.roomHeroEyebrow}>{product.eyebrow}</Text>
              <Text
                style={[
                  styles.roomHeroTitle,
                  avatarPreview && canRemovePreview ? styles.avatarHeroTitleWithRemove : null
                ]}
                numberOfLines={2}
                adjustsFontSizeToFit
              >
                {product.title}
              </Text>
              {avatarPreview && canRemovePreview && onRemovePreview ? (
                <Pressable
                  testID="shop-preview-remove-preview"
                  accessibilityRole="button"
                  accessibilityLabel={copy.removePreview}
                  onPress={onRemovePreview}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.avatarPreviewRemoveButton,
                    pressed ? styles.avatarPreviewRemoveButtonPressed : null
                  ]}
                >
                  <Ionicons name="close" size={15} color={uiTheme.colors.primary} />
                </Pressable>
              ) : null}
            </View>
            <View style={[
              styles.roomHeroStatusPill,
              avatarPreview ? styles.avatarHeroTopPanel : null
            ]}>
              <Ionicons
                name={product.owned ? "checkmark-circle" : "sparkles"}
                size={14}
                color={product.owned ? uiTheme.colors.success : uiTheme.colors.primary}
              />
              <Text style={styles.roomHeroStatusText} numberOfLines={1}>
                {product.owned
                  ? product.stateLabel
                  : product.priceCoins !== null
                    ? `${formatCoins(product.priceCoins, locale)} ${copy.coins}`
                    : previewGuide}
              </Text>
            </View>
          </View>
          {roomPreview ? (
            <Pressable
              testID="shop-preview-primary-action"
              accessibilityRole="button"
              accessibilityLabel={disabled && !isActionAvailable ? copy.offline.actionUnavailable : actionLabel}
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={onPrimaryAction}
              style={({ pressed }) => [
                styles.roomHeroAction,
                {
                  right: layoutMetrics.preview.overlayInset,
                  bottom: layoutMetrics.preview.overlayInset
                },
                disabled ? styles.primaryActionDisabled : null,
                pressed && !disabled ? styles.primaryActionPressed : null
              ]}
            >
              <Text style={styles.roomHeroActionText} numberOfLines={1} adjustsFontSizeToFit>
                {isPurchasing ? copy.saving : actionLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {avatarPreview ? (
          <Pressable
            testID="shop-preview-primary-action"
            accessibilityRole="button"
            accessibilityLabel={disabled && !isActionAvailable
              ? copy.offline.actionUnavailable
              : avatarActionAccessibilityLabel}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onPrimaryAction}
            style={({ pressed }) => [
              styles.avatarHeroAction,
              disabled ? styles.primaryActionDisabled : null,
              pressed && !disabled ? styles.primaryActionPressed : null
            ]}
          >
            <View style={styles.avatarHeroActionContent}>
              <Text style={styles.avatarHeroActionText} numberOfLines={1} adjustsFontSizeToFit>
                {isPurchasing ? copy.saving : isAvatarUnlock ? copy.unlock : actionLabel}
              </Text>
              {!isPurchasing && isAvatarUnlock ? (
                <View style={styles.avatarHeroPricePill}>
                  <Ionicons name="diamond" size={14} color="#F93696" />
                  <Text style={styles.avatarHeroPriceText} numberOfLines={1}>
                    {formatCoins(product.priceCoins ?? 0, locale)}
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

function ShopAvatarLivePreview(props: { avatar: UserAvatar; avatarWidth: number }) {
  const roomAvatarLayers = useMemo(() => {
    const { appearance } = projectAvatarV2ToRoomAvatarAppearance({
      avatar: props.avatar,
      avatarCatalog: AVATAR_V2_CATALOG,
      roomAvatarCatalog: ROOM_AVATAR_CATALOG
    })
    return getRoomAvatarRenderLayers({
      appearance,
      catalog: ROOM_AVATAR_CATALOG,
      direction: "front",
      state: "idle"
    })
  }, [props.avatar])
  const avatarHeight = props.avatarWidth / (256 / 384)

  return (
    <View style={styles.shopAvatarPreview}>
      <ShopAvatarLayerStack
        avatarHeight={avatarHeight}
        avatarWidth={props.avatarWidth}
        layers={roomAvatarLayers}
      />
    </View>
  )
}

const ShopAvatarLayerStack = memo(function ShopAvatarLayerStack(props: {
  avatarHeight: number
  avatarWidth: number
  layers: ReturnType<typeof getRoomAvatarRenderLayers>
}) {
  return (
    <View
      style={[
        styles.shopAvatarFrame,
        { width: props.avatarWidth, height: props.avatarHeight }
      ]}
    >
      {props.layers.map((layer, index) => (
        <Image
          key={`${layer.type}:${layer.id}`}
          source={layer.asset.source}
          resizeMode="contain"
          fadeDuration={0}
          style={[styles.shopAvatarLayer as ImageStyle, { zIndex: index }]}
        />
      ))}
    </View>
  )
}, (previous, next) =>
  previous.avatarHeight === next.avatarHeight &&
  previous.avatarWidth === next.avatarWidth &&
  previous.layers === next.layers
)

function ShopRoomItemPreview(props: {
  item: FurnitureItem | undefined
  scene: ReturnType<typeof resolveRoomV2Scene>
  locale: AppLocale
}) {
  return (
    <View
      style={styles.shopRoomScenePreview}
      testID="shop-room-preview"
      accessibilityLabel={props.item ? `${props.item.name}, ${getShopCopy(props.locale).roomPreview}` : getShopCopy(props.locale).roomPreview}
    >
      <RoomRenderer2D
        shell={props.scene.shell}
        renderItems={props.scene.renderItems}
        style={styles.shopRoomSceneRenderer}
      />
    </View>
  )
}
