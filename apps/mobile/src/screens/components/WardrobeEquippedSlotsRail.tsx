import Ionicons from "@expo/vector-icons/Ionicons"
import type { ImageSourcePropType } from "react-native"
import { Image, Pressable, Text, View } from "react-native"
import type {
  WardrobeCategoryId,
  WardrobeVisibleSlot
} from "../../features/avatarV2/wardrobeCategoryModel"
import { getWardrobeEquippedSlotPreviewScale } from "../../features/avatarV2/wardrobeCategoryModel"
import { hapticLight } from "../../ui/haptics"
import { uiTheme } from "../../ui/theme"
import { wardrobeV2Styles as styles } from "../wardrobeV2Styles"

const SLOT_ICONS: Record<WardrobeVisibleSlot["id"], keyof typeof Ionicons.glyphMap> = {
  hair: "cut",
  top: "shirt",
  bottom: "layers",
  shoes: "walk",
  accessory: "glasses",
  look: "sparkles"
}

const SHORT_SLOT_LABELS: Record<"en" | "tr", Record<WardrobeVisibleSlot["id"], string>> = {
  en: { hair: "Hair", top: "Top", bottom: "Bottom", shoes: "Shoes", accessory: "Extra", look: "Look" },
  tr: { hair: "Saç", top: "Üst", bottom: "Alt", shoes: "Ayakkabı", accessory: "Ekstra", look: "Kombin" }
}

interface WardrobeEquippedSlotsRailProps {
  locale: "en" | "tr"
  activeCategory: WardrobeCategoryId
  compact: boolean
  slots: WardrobeVisibleSlot[]
  getPreviewSource: (item: NonNullable<WardrobeVisibleSlot["item"]>) =>
    ImageSourcePropType | undefined
  onSelectCategory: (category: WardrobeCategoryId) => void
}

export function WardrobeEquippedSlotsRail(
  props: WardrobeEquippedSlotsRailProps
): React.ReactElement {
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={props.locale === "tr" ? "Şu an giyilenler" : "Wearing now"}
      style={[
        styles.equippedSlotsRail,
        props.compact ? styles.equippedSlotsRailCompact : null
      ]}
    >
      {props.slots.map((slot) => {
        const previewSource = slot.item
          ? props.getPreviewSource(slot.item)
          : undefined
        const active = props.activeCategory === slot.category
        return (
          <Pressable
            key={slot.id}
            testID={`wardrobe-equipped-slot-${slot.id}`}
            accessibilityRole="button"
            accessibilityLabel={props.locale === "tr"
              ? `${slot.label} bölümünü aç, ${slot.accessibilitySummary ?? slot.item?.name ?? "boş"}`
              : `Open ${slot.label}, wearing ${slot.accessibilitySummary ?? slot.item?.name ?? "nothing"}`}
            accessibilityState={{ selected: active }}
            onPress={() => {
              hapticLight()
              props.onSelectCategory(slot.category)
            }}
            style={({ pressed }) => [
              styles.equippedSlot,
              props.compact ? styles.equippedSlotCompact : null,
              active ? styles.equippedSlotActive : null,
              pressed ? styles.equippedSlotPressed : null
            ]}
          >
            <View style={styles.equippedSlotPreview}>
              {previewSource ? (
                <Image
                  source={previewSource}
                  resizeMode="contain"
                  style={[
                    styles.equippedSlotImage,
                    {
                      transform: [{
                        scale: getWardrobeEquippedSlotPreviewScale(slot.item?.type ?? "accessory")
                      }]
                    }
                  ]}
                />
              ) : (
                <Ionicons
                  name={SLOT_ICONS[slot.id]}
                  size={16}
                  color={active ? uiTheme.colors.primary : uiTheme.colors.textMuted}
                />
              )}
            </View>
            <Text
              maxFontSizeMultiplier={1.4}
              numberOfLines={1}
              style={[
                styles.equippedSlotLabel,
                active ? styles.equippedSlotLabelActive : null
              ]}
            >
              {SHORT_SLOT_LABELS[props.locale][slot.id]}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
