import type Ionicons from "@expo/vector-icons/Ionicons"
import type { AvatarItemType } from "../avatarV2.types"
import type { AvatarStudioTabId } from "../wardrobeCategoryModel"

export const AVATAR_STUDIO_COPY = {
  en: {
    title: "Wardrobe",
    done: "Save",
    headline: "A little more you.",
    tagline: "Complete your look with pieces you love.",
    doneSaving: "Saving your look",
    back: "Go back",
    zoomIn: "Zoom in on your character",
    zoomOut: "Zoom out",
    optionCount: (count: number) => (count === 1 ? "1 option" : `${count} options`),
    saveFailed: "Your look could not be saved. Try again.",
    appearance: "My Character",
    closet: "My Closet",
    body: "Base",
    face: "Face",
    eyes: "Eyes",
    nose: "Nose",
    mouth: "Mouth",
    hair: "Hair",
    top: "Tops",
    dress: "Dresses",
    bottom: "Bottoms",
    shoes: "Shoes",
    accessory: "Accessories",
    bodySwitchHint: "Switching your base refits the complete starter look.",
    wearing: "Wearing",
    pageOf: (page: number, total: number) => `Page ${page} of ${total}`,
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
    title: "Gardırop",
    done: "Kaydet",
    headline: "Biraz daha sen.",
    tagline: "Sevdiğin parçalarla kendini tamamla.",
    doneSaving: "Görünümün kaydediliyor",
    back: "Geri dön",
    zoomIn: "Karakteri yakınlaştır",
    zoomOut: "Uzaklaştır",
    optionCount: (count: number) => `${count} seçenek`,
    saveFailed: "Görünümün kaydedilemedi. Tekrar dene.",
    appearance: "Karakterim",
    closet: "Dolabım",
    body: "Baz",
    face: "Yüz",
    eyes: "Göz",
    nose: "Burun",
    mouth: "Ağız",
    hair: "Saç",
    top: "Üstler",
    dress: "Elbiseler",
    bottom: "Altlar",
    shoes: "Ayakkabı",
    accessory: "Aksesuar",
    bodySwitchHint: "Bazı değiştirince başlangıç görünümü birlikte yeniden uyarlanır.",
    wearing: "Giyiliyor",
    pageOf: (page: number, total: number) => `Sayfa ${page} / ${total}`,
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

/** Thin line icons for the four tabs of each section. */
export const WARDROBE_TAB_ICONS: Record<AvatarStudioTabId, keyof typeof Ionicons.glyphMap> = {
  top: "shirt-outline",
  bottom: "layers-outline",
  shoes: "footsteps-outline",
  accessory: "glasses-outline",
  hair: "cut-outline",
  face: "happy-outline",
  eyes: "eye-outline",
  nose: "ellipse-outline"
}

export type WardrobeStudioCopy = (typeof AVATAR_STUDIO_COPY)[keyof typeof AVATAR_STUDIO_COPY]
