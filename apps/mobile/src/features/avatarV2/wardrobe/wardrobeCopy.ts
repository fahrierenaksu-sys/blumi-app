import type Ionicons from "@expo/vector-icons/Ionicons"
import type { AvatarItemType } from "../avatarV2.types"
import type { WardrobeCategoryId } from "../wardrobeCategoryModel"

export const AVATAR_STUDIO_COPY = {
  en: {
    title: "Blumi",
    subtitle: "Live Closet",
    progress: "2 / 4",
    appearance: "Avatar",
    closet: "My Closet",
    body: "Bases",
    face: "Face",
    eyes: "Eyes",
    nose: "Nose",
    mouth: "Lips",
    hair: "Hair",
    top: "Tops",
    dress: "Dresses",
    bottom: "Bottoms",
    shoes: "Shoes",
    accessory: "Extras",
    sectionA11ySuffix: "section",
    categoryA11ySuffix: "Avatar Studio category",
    bodySwitchHint: "Switching your base refits the complete starter look.",
    wearing: "Wearing",
    savingLook: "Saving your look…",
    tryOn: "Try on",
    equipped: "equipped",
    choose: "Choose",
    roomFitPending: "Room fit pending",
    switchBase: "Switch base",
    fullLook: "Full look",
    emptyTitle: "Nothing here yet",
    emptyBody: "Find a new favorite in the Shop.",
    exploreShop: "Explore Shop"
  },
  tr: {
    title: "Blumi",
    subtitle: "Canlı Gardırop",
    progress: "2 / 4",
    appearance: "Avatar",
    closet: "Dolabım",
    body: "Bazlar",
    face: "Yüz",
    eyes: "Gözler",
    nose: "Burun",
    mouth: "Ağız",
    hair: "Saç",
    top: "Üstler",
    dress: "Elbiseler",
    bottom: "Altlar",
    shoes: "Ayakkabılar",
    accessory: "Ekstralar",
    sectionA11ySuffix: "bölümünü aç",
    categoryA11ySuffix: "Avatar Stüdyosu kategorisini aç",
    bodySwitchHint: "Bazı değiştirince başlangıç görünümü birlikte yeniden uyarlanır.",
    wearing: "Giyiliyor",
    savingLook: "Görünümün kaydediliyor…",
    tryOn: "Dene",
    equipped: "giyiliyor",
    choose: "Seç",
    roomFitPending: "Oda uyumu bekleniyor",
    switchBase: "Bazı değiştir",
    fullLook: "Tam kombin",
    emptyTitle: "Bu bölüm şimdilik boş",
    emptyBody: "Yeni bir favori bulmak için Mağaza'ya göz at.",
    exploreShop: "Mağazayı keşfet"
  }
} as const

export const CATEGORY_ICONS: Record<AvatarItemType, keyof typeof Ionicons.glyphMap> = {
  body: "body",
  face: "happy",
  eyes: "eye",
  nose: "ellipse",
  mouth: "chatbubble-ellipses",
  hair: "sparkles",
  top: "shirt",
  bottom: "layers",
  shoes: "walk",
  accessory: "glasses"
}

export const WARDROBE_CATEGORY_ICONS: Record<
  WardrobeCategoryId,
  keyof typeof Ionicons.glyphMap
> = {
  body: "body",
  face: "happy",
  top: "shirt",
  dress: "sparkles",
  bottom: "layers",
  shoes: "walk",
  eyes: "eye",
  nose: "ellipse",
  mouth: "chatbubble-ellipses",
  hair: "cut",
  accessory: "glasses"
}

export type WardrobeStudioCopy = (typeof AVATAR_STUDIO_COPY)[keyof typeof AVATAR_STUDIO_COPY]
