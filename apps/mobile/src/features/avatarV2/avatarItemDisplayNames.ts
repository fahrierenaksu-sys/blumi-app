import type { AppLocale } from "../session/appLocale"
import type { AvatarCatalogItem } from "./avatarV2.types"

/**
 * Turkish names of the pieces people can see today (the 2.5D wardrobe and the starter pieces). The catalog keeps its
 * English `name` and every ID stays as it is; this is display copy only. Each name wraps into the two lines a
 * wardrobe card has on the narrowest phone.
 */
export const AVATAR_ITEM_NAMES_TR: Readonly<Record<string, string>> = {
  // Bases and faces
  avatar_v2_body_default: "Sıcak Ten",
  avatar_v2_body_male_light: "Açık Ten",
  avatar_v2_face_default: "Bebek Yüz",
  avatar_v2_face_male_warm_friendly: "Güler Yüz",
  avatar_v2_eyes_mocha_doe: "Moka Gözler",
  avatar_v2_nose_soft_button: "Minik Burun",
  avatar_v2_mouth_peach_whisper_smile: "Şeftali Gülüş",
  // Girl
  avatar_v2_hair_ink_pageboy_star: "Yıldızlı Küt Saç",
  avatar_v2_top_coral_wave_polo: "Mercan Dalga Polo",
  avatar_v2_bottom_coral_wave_pants: "Mercan Dalga Pantolon",
  avatar_v2_shoes_mint_ribbon_court_sneakers: "Nane Sneaker",
  avatar_v2_hair_mocha_ribbon_waves: "Kurdeleli Dalgalı Saç",
  avatar_v2_shoes_white_clean_sneakers: "Beyaz Sneaker",
  hair_girl_bob: "Tokalı Bob",
  hair_girl_pigtails: "Fiyonklu Çift Kuyruk",
  avatar_v2_top_white_cute_crop_top: "Beyaz Crop Top",
  avatar_v2_top_black_cute_crop_top: "Siyah Crop Top",
  avatar_v2_bottom_black_highwaist_trousers: "Siyah Yüksek Bel Pantolon",
  top_sage_ribbon_knit_jacket: "Kurdeleli Adaçayı Hırka",
  // Boy: hair
  avatar_v2_hair_male_blue_black_curls: "Lacivert Bukleler",
  avatar_v2_hair_male_textured_twists: "Burgu Saç",
  // Boy: tops
  avatar_v2_top_male_navy_knit_polo: "Lacivert Triko Polo",
  avatar_v2_top_male_olive_overshirt: "Haki Gömlek Ceket",
  avatar_v2_top_male_forest_collar_sweater: "Yeşil Yakalı Kazak",
  avatar_v2_top_male_black_embroidered_sweatshirt: "Nakışlı Siyah Sweat",
  avatar_v2_top_male_taupe_waffle_blouson: "Vizon Bluzon",
  avatar_v2_top_male_check_flannel_white_tee: "Ekose Gömlek",
  avatar_v2_top_male_white_basic_tee: "Beyaz Tişört",
  avatar_v2_top_male_black_basic_tee: "Siyah Tişört",
  // Boy: bottoms
  avatar_v2_bottom_male_cream_pleated_trousers: "Krem Pileli Pantolon",
  avatar_v2_bottom_male_dark_straight_jeans: "Koyu Düz Kot",
  avatar_v2_bottom_male_charcoal_trousers: "Antrasit Pantolon",
  avatar_v2_bottom_male_cream_drawstring_trousers: "Krem Bağcıklı Pantolon",
  avatar_v2_bottom_male_ecru_wide_trousers: "Ekru Bol Pantolon",
  avatar_v2_bottom_male_grey_wide_jeans: "Gri Bol Kot",
  avatar_v2_bottom_male_black_straight_trousers: "Siyah Düz Pantolon",
  avatar_v2_bottom_male_black_pocket_trousers: "Siyah Cepli Pantolon",
  // Boy: shoes
  avatar_v2_shoes_male_tan_loafers: "Taba Loafer",
  avatar_v2_shoes_male_sand_desert_boots: "Bej Çöl Botu",
  avatar_v2_shoes_male_brown_loafers: "Kahve Loafer",
  avatar_v2_shoes_male_cream_chunky_sneakers: "Krem Kalın Sneaker",
  avatar_v2_shoes_male_dark_leather_sneakers: "Koyu Deri Sneaker",
  avatar_v2_shoes_male_green_skate_shoes: "Yeşil Kaykay Ayakkabısı",
  avatar_v2_shoes_male_black_clean_sneakers: "Sade Siyah Sneaker",
  avatar_v2_shoes_male_black_everyday_sneakers: "Günlük Siyah Sneaker"
}

/** The name a person reads for a piece: Turkish when the app speaks Turkish and a name exists, else the catalog's. */
export function getAvatarItemDisplayName(
  item: Pick<AvatarCatalogItem, "id" | "name">,
  locale: AppLocale
): string {
  return (locale === "tr" ? AVATAR_ITEM_NAMES_TR[item.id] : undefined) ?? item.name
}
